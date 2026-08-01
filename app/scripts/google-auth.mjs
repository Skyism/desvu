#!/usr/bin/env node
/**
 * One-time Google Calendar consent, for a desktop app.
 *
 *   node scripts/google-auth.mjs
 *
 * Opens your browser, you approve, and a refresh token lands in
 * `~/.config/desvu/google-token.json` (mode 600). Nothing is typed into this process —
 * you sign in with Google directly, in your own browser, and this only ever sees the
 * one-time authorization code Google hands back.
 *
 * Loopback redirect + PKCE, which is the flow Google documents for installed apps:
 * https://developers.google.com/identity/protocols/oauth2/native-app
 *
 * The "client secret" for a desktop client is not actually a secret — it ships inside
 * every copy of an installed app, and Google says so. PKCE is what makes the exchange
 * safe, and it is why the verifier never leaves this process.
 */
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  CONFIG_DIR,
  TOKEN_FILE,
  loadClientConfig,
  writeSecret,
  SCOPES,
} from './google-config.mjs'

const base64url = (buffer) => buffer.toString('base64url')

function pkce() {
  const verifier = base64url(randomBytes(64))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/** A page the user actually sees. Plain, and it tells them they can close it. */
function donePage(message, detail) {
  return `<!doctype html><meta charset="utf-8"><title>Dès vu</title>
<style>
  body { font: 16px/1.6 -apple-system, system-ui, sans-serif; background: #FDFAF3; color: #2A2520;
         display: grid; place-items: center; height: 100vh; margin: 0; }
  div { max-width: 32rem; padding: 2rem; text-align: center; }
  h1 { font-weight: 500; font-size: 1.4rem; margin: 0 0 .5rem; }
  p { color: #6E6659; margin: 0; }
</style>
<div><h1>${message}</h1><p>${detail}</p></div>`
}

async function main() {
  const client = await loadClientConfig()
  const { verifier, challenge } = pkce()
  const state = base64url(randomBytes(24))

  // Captured in the listen callback and kept here: `server.address()` returns null once
  // the server is closed, and the callback closes it before resolving.
  let port = 0
  let timer

  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1`)
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }

      // Close and clear together, always — a stray timer keeps the process alive for five
      // minutes after a successful auth, which reads as a hang.
      const done = (page, detail, settle) => {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end(donePage(page, detail))
        clearTimeout(timer)
        server.close()
        settle()
      }

      const error = url.searchParams.get('error')
      if (error) {
        done('Not connected', `Google said: ${error}. You can close this tab.`, () =>
          reject(new Error(`Google returned "${error}"`))
        )
        return
      }

      // Without this check a malicious page could feed us someone else's code.
      if (url.searchParams.get('state') !== state) {
        done('Not connected', 'The response did not match this request.', () =>
          reject(new Error('state mismatch — the callback did not come from this request'))
        )
        return
      }

      // Deliberately does NOT say "connected": all Google has told us is that you
      // approved. Whether the token exchange succeeds is only known back in the terminal,
      // and claiming success here was a lie the first version told.
      const authCode = url.searchParams.get('code')
      done('Approved', 'You can close this tab — check the terminal for the result.', () =>
        resolve(authCode)
      )
    })

    // Port 0 lets the OS pick, so nothing collides with a dev server.
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      auth.searchParams.set('client_id', client.client_id)
      auth.searchParams.set('redirect_uri', `http://127.0.0.1:${port}/callback`)
      auth.searchParams.set('response_type', 'code')
      auth.searchParams.set('scope', SCOPES.join(' '))
      auth.searchParams.set('code_challenge', challenge)
      auth.searchParams.set('code_challenge_method', 'S256')
      auth.searchParams.set('state', state)
      // Both are required to get a refresh token back, every time.
      auth.searchParams.set('access_type', 'offline')
      auth.searchParams.set('prompt', 'consent')

      console.log('\nOpening your browser to approve calendar access…')
      console.log('If it does not open, paste this in yourself:\n')
      console.log(auth.toString(), '\n')
      spawn('open', [auth.toString()], { stdio: 'ignore', detached: true }).unref()
    })

    timer = setTimeout(() => {
      server.close()
      reject(new Error('Timed out waiting for approval (5 minutes).'))
    }, 5 * 60 * 1000)
  })

  if (!code) throw new Error('Google redirected back without an authorization code.')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: `http://127.0.0.1:${port}/callback`,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })

  const token = await res.json()
  if (!res.ok) {
    // Google's `error_description` is often just "Bad Request", which says nothing. The
    // `error` code is the part that identifies the problem, so lead with it.
    const code = token.error ?? `HTTP ${res.status}`
    const detail = token.error_description ? ` — ${token.error_description}` : ''
    const hint =
      token.error === 'invalid_grant'
        ? '\n  The authorization code was already used or has expired. Codes are ' +
          'single-use and short-lived, so just run this again.'
        : ''
    throw new Error(`Token exchange failed: ${code}${detail}${hint}`)
  }
  if (!token.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Revoke access at ' +
        'https://myaccount.google.com/permissions and run this again.'
    )
  }

  await writeSecret(TOKEN_FILE, {
    refresh_token: token.refresh_token,
    scope: token.scope,
    obtained_at: Date.now(),
  })

  console.log(`\n✓ Connected. Refresh token written to ${TOKEN_FILE} (mode 600).`)
  console.log(`  It is outside the vault and outside git, like the bot token.`)
  console.log(`\nNow run:  node scripts/refresh-calendar.mjs\n`)
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`)
  console.error(`If you have not set up credentials yet, see ${CONFIG_DIR}/README.md`)
  process.exit(1)
})

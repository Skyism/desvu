// Self-host the two brief-mandated families.
//
// Both are variable fonts, so there is exactly one file per family/style/subset —
// requesting 300/400/500 separately downloads the same bytes three times. Declaring
// the full axis also means any weight is available, not just the three the comp used.
//
// Subsets: latin + latin-ext only. The wordmark needs U+00E8 (è), which is plain
// latin; cyrillic and vietnamese are dead weight in a personal desktop app.
import { writeFile, mkdir, readdir, unlink } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const SRC = process.argv[2]
const OUT = process.argv[3]
const KEEP = new Set(['latin', 'latin-ext'])

const css = readFileSync(SRC, 'utf8')

const blocks = []
const re = /\/\* ([a-z-]+) \*\/\s*@font-face \{([^}]*)\}/g
let m
while ((m = re.exec(css))) blocks.push({ subset: m[1], body: m[2] })

const field = (body, name) => {
  const hit = body.match(new RegExp(`${name}:\\s*([^;]+);`))
  return hit ? hit[1].trim().replace(/^'|'$/g, '') : null
}

await mkdir(OUT, { recursive: true })
for (const f of await readdir(OUT)) {
  if (f.endsWith('.woff2')) await unlink(path.join(OUT, f))
}

const out = []
const manifest = []

for (const b of blocks.filter((b) => KEEP.has(b.subset))) {
  const family = field(b.body, 'font-family')
  const style = field(b.body, 'font-style')
  const weight = field(b.body, 'font-weight')
  const range = field(b.body, 'unicode-range')
  const url = b.body.match(/url\((https:[^)]+)\)/)[1]

  // Italic in this design language is always Cormorant — it marks an estimate or an
  // aside. DM Sans italic is never used and would be 117 KB of nothing. If a surface
  // ever needs it, delete this branch and re-run.
  if (family === 'DM Sans' && style === 'italic') continue

  const slug = family.toLowerCase().replace(/\s+/g, '-')
  const file = `${slug}-${style}-${b.subset}.woff2`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.subarray(0, 4).toString('latin1') !== 'wOF2') {
    throw new Error(`${file} is not a woff2 file`)
  }
  await writeFile(path.join(OUT, file), buf)

  manifest.push({ family, style, weight, subset: b.subset, file, bytes: buf.length })
  out.push(
    `/* ${b.subset} */\n@font-face {\n  font-family: '${family}';\n  font-style: ${style};\n` +
      `  font-weight: ${weight};\n  font-display: swap;\n  src: url('/fonts/${file}') format('woff2-variations');\n` +
      `  unicode-range: ${range};\n}`
  )
}

await writeFile(
  path.join(OUT, 'fonts.css'),
  `/* Self-hosted variable webfonts. Generated — see README.md. Do not hand-edit.\n` +
    `   Import once from the renderer entry, before tokens.css. */\n\n` +
    out.join('\n\n') +
    '\n',
  'utf8'
)
await writeFile(
  path.join(OUT, 'manifest.json'),
  JSON.stringify({ source: 'fonts.googleapis.com/css2', variable: true, files: manifest }, null, 2) +
    '\n'
)

const total = manifest.reduce((n, f) => n + f.bytes, 0)
console.log(`${manifest.length} files, ${(total / 1024).toFixed(1)} KB total\n`)
for (const f of manifest) {
  console.log(`  ${f.file.padEnd(36)} ${String(f.bytes).padStart(7)} B   ${f.family} ${f.weight} ${f.style}`)
}

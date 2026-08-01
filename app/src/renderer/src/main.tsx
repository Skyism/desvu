import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles/index.css'

import { App } from './App'
import { hasBridge } from './lib/bridge'
import { initUi, useUi } from './store/ui'
import { initVaultSync } from './store/vault'

// Theme and routing listeners, then the vault change subscription. Installed before the
// first render so the correct theme is on <html> before anything paints.
initUi()
initVaultSync()

// PRD C8 — the global accelerator fires in the main process and arrives here.
if (hasBridge()) {
  window.desvu.onQuickCapture(() => {
    useUi.getState().openQuickCapture()
  })
}

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)

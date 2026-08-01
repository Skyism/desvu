import type { DesvuBridge } from './index'

/**
 * `window.desvu` is the renderer's entire view of the filesystem. This augmentation is
 * what makes it typed everywhere without the renderer importing preload code at runtime.
 */
declare global {
  interface Window {
    desvu: DesvuBridge
  }
}

export {}

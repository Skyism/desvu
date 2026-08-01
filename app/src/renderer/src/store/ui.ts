import { create } from 'zustand'

import { DEFAULT_ROUTE, routeFromHash, type RouteId } from '@/lib/routes'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'desvu.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    /* private mode, or no storage — the OS preference is a fine default */
  }
  return 'system'
}

/**
 * Themes are carried entirely by `color-scheme` (see `styles/tokens.css`): absent the
 * attribute the tokens follow the OS, and the attribute is the manual override. There is
 * no class to add to every element and no re-render on switch.
 */
function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement
  if (preference === 'system') delete root.dataset['theme']
  else root.dataset['theme'] = preference
}

interface UiState {
  // -- routing -------------------------------------------------------------
  route: RouteId
  navigate: (route: RouteId) => void

  // -- theme ---------------------------------------------------------------
  theme: ThemePreference
  systemDark: boolean
  setTheme: (theme: ThemePreference) => void
  /** Flip to the opposite of whatever is showing. */
  toggleTheme: () => void
  /** light → dark → follow the OS → light. What the header control does. */
  cycleTheme: () => void

  // -- chrome --------------------------------------------------------------
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // -- quick capture (PRD C8) ----------------------------------------------
  quickCaptureOpen: boolean
  openQuickCapture: () => void
  closeQuickCapture: () => void
}

export const useUi = create<UiState>((set, get) => ({
  route: typeof window === 'undefined' ? DEFAULT_ROUTE : routeFromHash(window.location.hash),
  navigate: (route) => {
    if (window.location.hash !== `#/${route}`) window.location.hash = `#/${route}`
    set({ route })
  },

  theme: typeof window === 'undefined' ? 'system' : readStoredTheme(),
  systemDark: typeof window === 'undefined' ? false : window.matchMedia(DARK_QUERY).matches,
  setTheme: (theme) => {
    applyTheme(theme)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      /* not worth telling the user about */
    }
    set({ theme })
  },
  toggleTheme: () => {
    const { theme, systemDark, setTheme } = get()
    const showing: ResolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
    setTheme(showing === 'dark' ? 'light' : 'dark')
  },
  cycleTheme: () => {
    const { theme, setTheme } = get()
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
  },

  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  quickCaptureOpen: false,
  openQuickCapture: () => set({ quickCaptureOpen: true }),
  closeQuickCapture: () => set({ quickCaptureOpen: false }),
}))

/** What is actually on screen right now, with `system` already resolved. */
export function useResolvedTheme(): ResolvedTheme {
  const theme = useUi((state) => state.theme)
  const systemDark = useUi((state) => state.systemDark)
  if (theme !== 'system') return theme
  return systemDark ? 'dark' : 'light'
}

/**
 * Install the listeners the store cannot own itself. Called once, from `main.tsx`.
 * Returns a teardown for symmetry and for tests.
 */
export function initUi(): () => void {
  const { theme } = useUi.getState()
  applyTheme(theme)

  const onHashChange = (): void => {
    useUi.setState({ route: routeFromHash(window.location.hash) })
  }
  window.addEventListener('hashchange', onHashChange)

  const media = window.matchMedia(DARK_QUERY)
  const onSystemChange = (event: MediaQueryListEvent): void => {
    useUi.setState({ systemDark: event.matches })
  }
  media.addEventListener('change', onSystemChange)

  return () => {
    window.removeEventListener('hashchange', onHashChange)
    media.removeEventListener('change', onSystemChange)
  }
}

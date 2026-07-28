// App state = scenario + contract, persisted to the URL (shareable link) and to
// localStorage. No backend — this is the whole persistence story.

import { DEFAULT_SCENARIO, type Scenario } from './engine/scenarios'
import { DEFAULT_CONTRACT, type Contract } from './engine/bid'

export interface AppState {
  scenario: Scenario
  contract: Contract
}

export const DEFAULT_STATE: AppState = {
  scenario: DEFAULT_SCENARIO,
  contract: DEFAULT_CONTRACT,
}

const LS_KEY = 'sim-mater-ar:state'
const LS_SAVED = 'sim-mater-ar:saved'

/** Merge partial persisted state onto defaults so new fields never break old links. */
function hydrate(partial: unknown): AppState {
  const p = (partial ?? {}) as Partial<AppState>
  return {
    scenario: { ...DEFAULT_SCENARIO, ...(p.scenario ?? {}) },
    contract: { ...DEFAULT_CONTRACT, ...(p.contract ?? {}) },
  }
}

export function encodeState(state: AppState): string {
  return encodeURIComponent(JSON.stringify(state))
}

export function decodeState(raw: string | null): AppState | null {
  if (!raw) return null
  try {
    return hydrate(JSON.parse(decodeURIComponent(raw)))
  } catch {
    return null
  }
}

/** Initial state: URL (?st=) wins, then localStorage, then defaults. */
export function loadInitialState(): AppState {
  if (typeof window !== 'undefined') {
    const url = new URLSearchParams(window.location.search).get('st')
    const fromUrl = decodeState(url)
    if (fromUrl) return fromUrl
    try {
      const ls = window.localStorage.getItem(LS_KEY)
      if (ls) return hydrate(JSON.parse(ls))
    } catch {
      /* ignore */
    }
  }
  return DEFAULT_STATE
}

export function persistState(state: AppState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
  const params = new URLSearchParams(window.location.search)
  params.set('st', encodeState(state))
  const url = `${window.location.pathname}?${params.toString()}`
  window.history.replaceState(null, '', url)
}

// --- named saved scenarios ---

export interface SavedScenario {
  name: string
  state: AppState
}

export function loadSaved(): SavedScenario[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(window.localStorage.getItem(LS_SAVED) ?? '[]')
  } catch {
    return []
  }
}

export function writeSaved(list: SavedScenario[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LS_SAVED, JSON.stringify(list))
}

/** Trigger a browser download of the current state as JSON. */
export function downloadState(state: AppState, filename = 'escenario-subasta.json'): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

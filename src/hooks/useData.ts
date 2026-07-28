import { useEffect, useState } from 'react'
import type {
  CmgHistoryRow,
  CurtailmentNode,
  DemandProfile,
  Envelope,
  FetchState,
  FleetUnit,
  FxRates,
  GenerationMixRow,
  HydrologyScenarios,
  MaterResultRow,
  RenovarRow,
  ResourceProfile,
  SadiSnapshot,
  SourceRow,
} from '../types'

/**
 * Loads a JSON file from ./data/ and unwraps the {generated_at, source,
 * source_date, data} envelope produced by the Python seed script. Payloads
 * without an envelope are returned as-is. Ported from estado-del-sistema.
 */
export function useJson<T>(path: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
    meta: { generated_at: null, source: null, source_date: null },
  })

  useEffect(() => {
    let cancelled = false
    fetch(path, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${path}`)
        return r.json()
      })
      .then((raw: unknown) => {
        if (cancelled) return
        if (raw && typeof raw === 'object' && 'data' in raw && 'generated_at' in raw) {
          const env = raw as Envelope<T>
          setState({
            data: env.data,
            loading: false,
            error: null,
            meta: {
              generated_at: env.generated_at ?? null,
              source: env.source ?? null,
              source_date: env.source_date ?? null,
            },
          })
        } else {
          setState({
            data: raw as T,
            loading: false,
            error: null,
            meta: { generated_at: null, source: null, source_date: null },
          })
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err }))
      })
    return () => {
      cancelled = true
    }
  }, [path])

  return state
}

// One typed wrapper per dataset (paths are relative to base "./").
export const useFleet = () => useJson<FleetUnit[]>('./data/fleet.json')
export const useDemandProfile = () => useJson<DemandProfile>('./data/demand_profile.json')
export const useSolarProfile = () => useJson<ResourceProfile>('./data/solar_profile.json')
export const useWindProfile = () => useJson<ResourceProfile>('./data/wind_profile.json')
export const useHydrology = () => useJson<HydrologyScenarios>('./data/hydrology_scenarios.json')
export const useCmgHistory = () => useJson<CmgHistoryRow[]>('./data/marginal_cost_history.json')
export const useGenerationMix = () => useJson<GenerationMixRow[]>('./data/generation_mix.json')
export const useMaterResults = () => useJson<MaterResultRow[]>('./data/mater_results.json')
export const useRenovarPrices = () => useJson<RenovarRow[]>('./data/renovar_prices.json')
export const useCurtailmentNodes = () => useJson<CurtailmentNode[]>('./data/curtailment_nodes.json')
export const useFx = () => useJson<FxRates>('./data/fx.json')
export const useSadiSnapshot = () => useJson<SadiSnapshot>('./data/sadi_snapshot.json')
export const useSources = () => useJson<SourceRow[]>('./data/sources.json')

/** Live USD/ARS from dolarapi.com (CORS-open). null until loaded / on failure. */
export function useDolar(): FxRates | null {
  const [fx, setFx] = useState<FxRates | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('https://dolarapi.com/v1/dolares')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((arr: { casa: string; venta: number; fechaActualizacion?: string }[]) => {
        if (cancelled || !Array.isArray(arr)) return
        const by = (casa: string) => arr.find((x) => x.casa === casa)?.venta ?? 0
        setFx({
          oficial: by('oficial'),
          mayorista: by('mayorista') || by('oficial'),
          blue: by('blue'),
          mep: by('bolsa'),
          ccl: by('contadoconliqui'),
          as_of: arr[0]?.fechaActualizacion?.slice(0, 10) ?? 'en vivo',
        })
      })
      .catch(() => {}) // fallback: caller uses curated fx.json
    return () => {
      cancelled = true
    }
  }, [])
  return fx
}

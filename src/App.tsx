import { useEffect, useMemo, useState } from 'react'
import { badge, colors, space } from './theme'
import {
  useDemandProfile,
  useFleet,
  useHydrology,
  useSolarProfile,
  useWindProfile,
} from './hooks/useData'
import { simulateYear } from './engine/dispatch'
import { evaluateBid } from './engine/bid'
import type { MarketData } from './engine/types'
import type { Scenario } from './engine/scenarios'
import type { Contract } from './engine/bid'
import {
  DEFAULT_STATE,
  downloadState,
  loadInitialState,
  persistState,
  type AppState,
} from './state'
import { Loading } from './components/ui'
import { EscenarioPage } from './components/EscenarioPage'
import { OfertaPage } from './components/OfertaPage'
import { RiesgoPage } from './components/RiesgoPage'
import { DatosPage } from './components/DatosPage'
import { MetodologiaPage } from './components/MetodologiaPage'

type PageId = 'escenario' | 'oferta' | 'riesgo' | 'datos' | 'metodologia'

const NAV: { id: PageId; label: string }[] = [
  { id: 'escenario', label: 'Escenario' },
  { id: 'oferta', label: 'Simulador de oferta' },
  { id: 'riesgo', label: 'Riesgo' },
  { id: 'datos', label: 'Datos / Fuentes' },
  { id: 'metodologia', label: 'Metodología' },
]

export default function App() {
  const [page, setPage] = useState<PageId>('escenario')
  const [state, setState] = useState<AppState>(() => loadInitialState())

  useEffect(() => {
    persistState(state)
  }, [state])

  const setScenario = (patch: Partial<Scenario>) =>
    setState((s) => ({ ...s, scenario: { ...s.scenario, ...patch } }))
  const setContract = (patch: Partial<Contract>) =>
    setState((s) => ({ ...s, contract: { ...s.contract, ...patch } }))

  // Load the curated datasets.
  const fleet = useFleet()
  const demand = useDemandProfile()
  const solar = useSolarProfile()
  const wind = useWindProfile()
  const hydrology = useHydrology()

  const data: MarketData | null = useMemo(() => {
    if (!fleet.data || !demand.data || !solar.data || !wind.data || !hydrology.data) return null
    return { fleet: fleet.data, demand: demand.data, solar: solar.data, wind: wind.data, hydrology: hydrology.data }
  }, [fleet.data, demand.data, solar.data, wind.data, hydrology.data])

  const year = useMemo(() => (data ? simulateYear(data, state.scenario) : null), [data, state.scenario])
  const bid = useMemo(
    () => (data && year ? evaluateBid(data, state.scenario, year, state.contract) : null),
    [data, year, state.scenario, state.contract],
  )

  const loadError = fleet.error || demand.error || solar.error || wind.error || hydrology.error

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          borderBottom: `1px solid ${colors.border}`,
          padding: `${space.md}px ${space.xl}px`,
          display: 'flex',
          alignItems: 'center',
          gap: space.lg,
          flexWrap: 'wrap',
          background: colors.surfaceAlt,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16 }}>
          Simulador de PPA MATER · <span style={{ color: colors.accent.blue }}>SADI Argentina</span>
        </div>
        {fleet.meta.generated_at && (
          <span
            style={{ ...badge(colors.status.muted), fontWeight: 600 }}
            title={`Datos regenerados por el pipeline el ${fleet.meta.generated_at}`}
          >
            datos {fleet.meta.generated_at.slice(0, 10)}
          </span>
        )}
        <nav style={{ display: 'flex', gap: space.xs, flexWrap: 'wrap' }}>
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              style={{
                background: page === n.id ? colors.accent.blue : 'transparent',
                color: page === n.id ? '#fff' : colors.textMuted,
                border: 'none',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: space.xs }}>
          <ToolbarButton label="Compartir link" onClick={() => copyLink()} />
          <ToolbarButton label="Exportar" onClick={() => downloadState(state)} />
          <ImportButton onImport={setState} />
          <ToolbarButton label="Reset" onClick={() => setState(DEFAULT_STATE)} />
        </div>
      </header>

      <main style={{ padding: space.xl, maxWidth: 1280, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {loadError ? (
          <div style={{ color: colors.status.err }}>Error cargando datos: {loadError.message}</div>
        ) : !data || !year || !bid ? (
          <Loading what="datos del sistema" />
        ) : page === 'escenario' ? (
          <EscenarioPage data={data} scenario={state.scenario} year={year} onScenario={setScenario} />
        ) : page === 'oferta' ? (
          <OfertaPage contract={state.contract} bid={bid} avgCmg={year.avgCmg} onContract={setContract} />
        ) : page === 'riesgo' ? (
          <RiesgoPage data={data} scenario={state.scenario} contract={state.contract} />
        ) : page === 'datos' ? (
          <DatosPage />
        ) : (
          <MetodologiaPage />
        )}
      </main>
    </div>
  )
}

function ToolbarButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        color: colors.textMuted,
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        padding: '5px 10px',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function ImportButton({ onImport }: { onImport: (s: AppState) => void }) {
  return (
    <label
      style={{
        background: 'transparent',
        color: colors.textMuted,
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        padding: '5px 10px',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      Importar
      <input
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          file.text().then((t) => {
            try {
              onImport(JSON.parse(t))
            } catch {
              /* ignore malformed file */
            }
          })
        }}
      />
    </label>
  )
}

function copyLink() {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(window.location.href).catch(() => {})
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { colors, space } from '../theme'
import { Card, Field, SectionTitle, Select, Stat, StatRow } from './ui'
import { NpvHistogram, RiskVsPriceChart } from './charts'
import { DEFAULT_MC, histogram, type MCResult } from '../engine/montecarlo'
import type { MCMessage } from '../engine/montecarlo.worker'
import type { MarketData } from '../engine/types'
import type { Scenario } from '../engine/scenarios'
import type { Contract } from '../engine/bid'

const M = (n: number) => `${(n / 1e6).toFixed(1)} M`
const N_OPTIONS = [
  { value: '400', label: '400 (rápido)' },
  { value: '800', label: '800 (normal)' },
  { value: '2000', label: '2000' },
  { value: '5000', label: '5000 (alta precisión)' },
]

export function RiesgoPage({
  data,
  scenario,
  contract,
}: {
  data: MarketData
  scenario: Scenario
  contract: Contract
}) {
  const [result, setResult] = useState<MCResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [running, setRunning] = useState(false)
  const [n, setN] = useState(800)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    const w = new Worker(new URL('../engine/montecarlo.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<MCMessage>) => {
      const msg = e.data
      if (msg.type === 'progress') setProgress(msg.fraction)
      else {
        setResult(msg.result)
        setRunning(false)
        setProgress(1)
      }
    }
    workerRef.current = w
    return () => w.terminate()
  }, [])

  const run = useCallback(() => {
    if (!workerRef.current) return
    setRunning(true)
    setProgress(0)
    workerRef.current.postMessage({ data, scenario, contract, opts: { ...DEFAULT_MC, n } })
  }, [data, scenario, contract, n])

  // Auto-run on input change (debounced) so the risk view tracks the scenario.
  useEffect(() => {
    const t = setTimeout(run, 350)
    return () => clearTimeout(t)
  }, [run])

  const merchant = contract.settlement === 'merchant'
  const pLossColor = result && result.pLossPct > 25 ? colors.status.err : result && result.pLossPct > 10 ? colors.status.warn : colors.status.ok

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: space.lg, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200 }}>
            <Field label="Iteraciones Monte Carlo">
              <Select value={String(n)} options={N_OPTIONS} onChange={(v) => setN(Number(v))} />
            </Field>
          </div>
          <button
            onClick={run}
            disabled={running}
            style={{
              background: colors.accent.blue,
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              fontWeight: 700,
              fontSize: 13,
              cursor: running ? 'default' : 'pointer',
              opacity: running ? 0.6 : 1,
              marginBottom: space.md,
            }}
          >
            {running ? 'Simulando…' : 'Recalcular'}
          </button>
          <div style={{ flex: 1, minWidth: 160, marginBottom: space.md + 6 }}>
            <div style={{ height: 6, background: colors.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${progress * 100}%`, height: '100%', background: colors.accent.green, transition: 'width 0.1s' }} />
            </div>
            <div style={{ color: colors.textDim, fontSize: 11, marginTop: 4 }}>
              Muestrea hidrología (σ {DEFAULT_MC.hydroSigma}), precio de gas (σ {DEFAULT_MC.gasSigma}), demanda y <b>curtailment del nodo</b> (σ {DEFAULT_MC.curtailSigma}) alrededor del caso base.
            </div>
          </div>
        </div>
      </Card>

      {result && (
        <>
          <Card>
            <SectionTitle>Distribución de NPV a K = {contract.priceK.toFixed(1)} USD/MWh ({result.n} draws)</SectionTitle>
            <StatRow>
              <Stat label="E[NPV]" value={M(result.npvMean)} unit="USD" accent={result.npvMean > 0 ? colors.status.ok : colors.status.err} />
              <Stat label="NPV P50" value={M(result.npvP50)} unit="USD" />
              <Stat label="NPV P10 / P90" value={`${M(result.npvP10)} / ${M(result.npvP90)}`} unit="USD" hint="Percentiles 10 y 90" />
              <Stat label="VaR 95%" value={M(result.var95)} unit="USD" accent={colors.accent.orange} hint="Percentil 5 del NPV (peor 1 de 20)" />
              <Stat label="CVaR 95%" value={M(result.cvar95)} unit="USD" accent={colors.accent.orange} hint="Media del 5% peor" />
              <Stat label="P(pérdida)" value={result.pLossPct.toFixed(0)} unit="%" accent={pLossColor} />
            </StatRow>
            <div style={{ marginTop: space.md }}>
              <NpvHistogram bins={histogram(result.npvSamples)} />
            </div>
          </Card>

          {!merchant && (
            <Card>
              <SectionTitle>Riesgo vs. precio de oferta</SectionTitle>
              <RiskVsPriceChart
                kGrid={result.kGrid}
                expNpvByK={result.expNpvByK}
                pLossByK={result.pLossByK}
                currentK={contract.priceK}
                robustK={result.robustK}
              />
              <p style={{ color: colors.textSecondary, fontSize: 13, marginTop: space.sm }}>
                {result.robustK != null ? (
                  <>
                    <b style={{ color: colors.accent.orange }}>Precio robusto ≈ {result.robustK.toFixed(1)} USD/MWh</b>: por debajo, la
                    probabilidad de pérdida supera el 10%. Tu oferta actual ({contract.priceK.toFixed(1)}) tiene{' '}
                    <b style={{ color: pLossColor }}>{result.pLossPct.toFixed(0)}%</b> de probabilidad de destruir valor.
                  </>
                ) : (
                  <>Ni al precio más alto del rango la P(pérdida) baja de 10% — los supuestos de costo/capex son demasiado exigentes.</>
                )}
              </p>
            </Card>
          )}

          <Card>
            <SectionTitle>Distribución del CMg promedio anual</SectionTitle>
            <StatRow>
              <Stat label="CMg P10 (húmedo)" value={result.avgCmgP10.toFixed(1)} unit="USD/MWh" accent={colors.accent.blue} />
              <Stat label="CMg P50" value={result.avgCmgP50.toFixed(1)} unit="USD/MWh" accent={colors.accent.cyan} />
              <Stat label="CMg P90 (seco)" value={result.avgCmgP90.toFixed(1)} unit="USD/MWh" accent={colors.accent.orange} />
            </StatRow>
            <p style={{ color: colors.textMuted, fontSize: 12, marginTop: space.sm }}>
              El abanico de costo marginal resume el riesgo de mercado del escenario: el vendedor queda expuesto a esta dispersión
              en la parte no cubierta por el contrato.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}

import { colors, radius, space, techLabels } from '../theme'
import { Card, Loading, ReliabilityTag, SectionTitle } from './ui'
import { CmgHistoryChart, MonthlyGenMixChart } from './charts'
import {
  useCmgHistory,
  useCurtailmentNodes,
  useDolar,
  useFleet,
  useFx,
  useGenerationMix,
  useMaterResults,
  useRenovarPrices,
  useSadiSnapshot,
  useSources,
} from '../hooks/useData'

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 10px', color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}` }
const td: React.CSSProperties = { padding: '6px 10px', borderBottom: `1px solid ${colors.border}`, fontSize: 13 }

const num = (v: number | null, digits = 1) => (v == null ? '—' : v.toFixed(digits))

export function DatosPage() {
  const fleet = useFleet()
  const cmg = useCmgHistory()
  const mix = useGenerationMix()
  const mater = useMaterResults()
  const renovar = useRenovarPrices()
  const curtail = useCurtailmentNodes()
  const fx = useFx()
  const dolar = useDolar()
  const snap = useSadiSnapshot()
  const sources = useSources()
  const fxShown = dolar ?? fx.data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
      <div style={{ background: colors.status.warn + '18', border: `1px solid ${colors.status.warn}55`, borderRadius: radius.md, padding: space.md, fontSize: 13, color: colors.textSecondary }}>
        <b style={{ color: colors.status.warn }}>⚠ Confiabilidad de datos.</b> v1 usa datos <b>curados</b>; los overlays reales
        (CAMMESA demanda-svc, NASA POWER, FX) y el pipeline de costo marginal/MATER/curtailment (Síntesis Mensual) están en
        las Fases 4-5. El mercado AR está <b>en transición</b> (marginalista desde nov-2025, emergencia hasta 2027).
        Las cifras de curtailment y precios MATER conviene confirmarlas contra la Síntesis Mensual de CAMMESA.
      </div>

      {snap.data && (
        <Card>
          <SectionTitle>Estado actual del SADI (CAMMESA en vivo)</SectionTitle>
          <div style={{ display: 'flex', gap: space.xl, flexWrap: 'wrap', fontSize: 14, alignItems: 'baseline' }}>
            <div><span style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' }}>Demanda</span>{' '}<b style={{ color: colors.accent.blue }}>{snap.data.demand_mw.toLocaleString('es-AR')} MW</b></div>
            {(['hidraulico', 'termico', 'nuclear', 'renovable', 'importacion'] as const).map((k) => (
              <div key={k}><span style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' }}>{k}</span>{' '}<b>{snap.data!.mix_mw[k].toLocaleString('es-AR')} MW</b></div>
            ))}
            {snap.data.temp_c != null && <div style={{ color: colors.textDim }}>{snap.data.temp_c}°C</div>}
            <span style={{ color: colors.textDim, fontSize: 11 }}>{snap.meta.source}</span>
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>Parque generador SADI (base del despacho)</SectionTitle>
        {fleet.loading || !fleet.data ? (
          <Loading />
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr><th style={th}>Unidad</th><th style={th}>Tecnología</th><th style={th}>MW</th><th style={th}>Costo var. USD/MWh</th><th style={th}>Must-run</th></tr>
            </thead>
            <tbody>
              {fleet.data.map((u) => (
                <tr key={u.id}>
                  <td style={td}>{u.name}</td>
                  <td style={td}>{techLabels[u.tech] ?? u.tech}</td>
                  <td style={td}>{u.capacityMW.toLocaleString('es-AR')}</td>
                  <td style={td}>{u.heatRateMMBtuMWh ? `gas×${u.heatRateMMBtuMWh} + ${u.varCostUSDMWh}` : u.varCostUSDMWh}</td>
                  <td style={td}>{u.mustRunFraction ? `${(u.mustRunFraction * 100).toFixed(0)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Freshness ts={fleet.meta.generated_at} source={fleet.meta.source} />
      </Card>

      <Card>
        <SectionTitle>Precio monómico del MEM (mensual)</SectionTitle>
        {cmg.loading || !cmg.data ? <Loading /> : <CmgHistoryChart data={cmg.data} />}
        <p style={{ color: colors.textMuted, fontSize: 12 }}>El monómico es el costo all-in del MEM; la energía marginalista pura (que simula el motor) es menor.</p>
        <Freshness ts={cmg.meta.generated_at} source={cmg.meta.source} />
      </Card>

      <Card>
        <SectionTitle>Mix de generación por tecnología (CAMMESA)</SectionTitle>
        {mix.loading || !mix.data ? <Loading /> : <MonthlyGenMixChart data={mix.data} />}
        <Freshness ts={mix.meta.generated_at} source={mix.meta.source} />
      </Card>

      <Card>
        <SectionTitle>Rondas MATER (prioridad de despacho) <ReliabilityTag level="approx" /></SectionTitle>
        {mater.loading || !mater.data ? (
          <Loading />
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr><th style={th}>Ronda</th><th style={th}>MW asignados</th><th style={th}>Prioridad</th><th style={th}>Precio USD/MWh</th><th style={th}>Conf.</th></tr>
            </thead>
            <tbody>
              {mater.data.map((r, i) => (
                <tr key={i}>
                  <td style={td} title={r.note}>{r.round}</td>
                  <td style={td}>{num(r.awardedMW, 0)}</td>
                  <td style={td}>{r.priority}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{num(r.priceUSDMWh, 0)}</td>
                  <td style={td}><ReliabilityTag level={r.reliability} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>PPAs de precio libre (cap USD 113/MWh; típico 60-70). CAMMESA subasta la prioridad de despacho, no compra energía.</p>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.lg }}>
        <Card>
          <SectionTitle>RenovAr (referencia histórica) <ReliabilityTag level="verified" /></SectionTitle>
          {renovar.loading || !renovar.data ? (
            <Loading />
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={th}>Ronda</th><th style={th}>MW</th><th style={th}>USD/MWh</th></tr></thead>
              <tbody>
                {renovar.data.map((r, i) => (
                  <tr key={i}><td style={td} title={r.note}>{r.name}</td><td style={td}>{num(r.awardedMW, 0)}</td><td style={{ ...td, fontWeight: 700 }}>{num(r.priceUSDMWh)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>Dormido desde 2019.</p>
        </Card>

        <Card>
          <SectionTitle>Curtailment por región <ReliabilityTag level="approx" /></SectionTitle>
          {curtail.loading || !curtail.data ? (
            <Loading />
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={th}>Región</th><th style={th}>Recurso</th><th style={th}>Recorte</th></tr></thead>
              <tbody>
                {curtail.data.map((n) => (
                  <tr key={n.id}><td style={td} title={n.note}>{n.region}</td><td style={td}>{techLabels[n.tech] ?? n.tech}</td><td style={{ ...td, fontWeight: 700, color: n.curtailmentPct > 10 ? colors.accent.orange : colors.textPrimary }}>{n.curtailmentPct}%</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle>Tipo de cambio USD/ARS <ReliabilityTag level={dolar ? 'verified' : 'approx'} /></SectionTitle>
        {!fxShown ? (
          <Loading />
        ) : (
          <div style={{ display: 'flex', gap: space.xl, flexWrap: 'wrap', fontSize: 14 }}>
            {(['oficial', 'mayorista', 'blue', 'mep', 'ccl'] as const).map((k) => (
              <div key={k}>
                <span style={{ color: colors.textMuted, textTransform: 'uppercase', fontSize: 11 }}>{k}</span>{' '}
                <b>{fxShown[k].toLocaleString('es-AR')}</b>
              </div>
            ))}
            <span style={{ color: colors.textDim }}>({fxShown.as_of}; {dolar ? 'en vivo (dolarapi)' : 'referencia curada'})</span>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Fuentes</SectionTitle>
        {sources.loading || !sources.data ? (
          <Loading />
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={th}>Fuente</th><th style={th}>Acceso</th><th style={th}>Nota</th></tr></thead>
            <tbody>
              {sources.data.map((s) => (
                <tr key={s.id}>
                  <td style={td}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></td>
                  <td style={td}><span style={{ color: s.cors === 'live' ? colors.status.ok : colors.textMuted }}>{s.cors === 'live' ? 'en vivo' : 'pipeline'}</span></td>
                  <td style={{ ...td, color: colors.textMuted }}>{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

function Freshness({ ts, source }: { ts: string | null; source: string | null }) {
  if (!ts && !source) return null
  return (
    <div style={{ color: colors.textDim, fontSize: 11, marginTop: space.sm }}>
      {source && <span>Fuente: {source}. </span>}
      {ts && <span>Generado: {ts.slice(0, 10)}.</span>}
    </div>
  )
}

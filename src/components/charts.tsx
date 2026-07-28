import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { colors, techColors, techLabels } from '../theme'
import type { Tech } from '../types'

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const grid = colors.border
const axisTick = { fill: colors.textMuted, fontSize: 11 }

function ChartBox({ height = 260, children }: { height?: number; children: React.ReactElement }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

const tooltipStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  color: colors.textPrimary,
}

/** Merit-order supply curve: marginal cost vs cumulative capacity, with the
 *  hour's demand and the resulting marginal price marked. */
export function MeritOrderChart({
  blocks,
  demandMW,
  smp,
}: {
  blocks: { mw: number; cost: number; tech: Tech }[]
  demandMW: number
  smp: number
}) {
  const points: { mw: number; cost: number }[] = [{ mw: 0, cost: blocks[0]?.cost ?? 0 }]
  let cum = 0
  for (const b of blocks) {
    points.push({ mw: cum, cost: b.cost })
    cum += b.mw
    points.push({ mw: cum, cost: b.cost })
  }
  return (
    <ChartBox>
      <LineChart data={points} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="mw"
          tick={axisTick}
          stroke={grid}
          label={{ value: 'Capacidad acumulada (MW)', position: 'insideBottom', offset: -10, fill: colors.textMuted, fontSize: 11 }}
        />
        <YAxis
          tick={axisTick}
          stroke={grid}
          label={{ value: 'USD/MWh', angle: -90, position: 'insideLeft', fill: colors.textMuted, fontSize: 11 }}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number) => [`${v.toFixed(1)} USD/MWh`, 'Costo']}
          labelFormatter={(v: number) => `${Math.round(v)} MW`}
        />
        <ReferenceLine x={demandMW} stroke={colors.accent.orange} strokeDasharray="4 2" label={{ value: 'Demanda', fill: colors.accent.orange, fontSize: 11, position: 'top' }} />
        <ReferenceLine y={smp} stroke={colors.accent.green} strokeDasharray="4 2" label={{ value: `CMg ${smp.toFixed(0)}`, fill: colors.accent.green, fontSize: 11, position: 'right' }} />
        <Line type="stepAfter" dataKey="cost" stroke={colors.accent.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartBox>
  )
}

/** Marginal cost by month or by hour (USD/MWh). */
export function CmgSeriesChart({
  values,
  by,
}: {
  values: number[]
  by: 'month' | 'hour'
}) {
  const data = values.map((v, i) => ({ x: by === 'month' ? MONTH_LABELS[i] : `${i}h`, cmg: Number(v.toFixed(1)) }))
  return (
    <ChartBox height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" />
        <XAxis dataKey="x" tick={axisTick} stroke={grid} interval={by === 'hour' ? 2 : 0} />
        <YAxis tick={axisTick} stroke={grid} width={40} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} USD/MWh`, 'CMg']} />
        <Line type="monotone" dataKey="cmg" stroke={colors.accent.cyan} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartBox>
  )
}

/** Generation mix (GWh/yr) as a colored bar per technology. */
export function GenMixChart({ mix }: { mix: Record<Tech, number> }) {
  const data = (Object.entries(mix) as [Tech, number][])
    .filter(([, v]) => v > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([tech, gwh]) => ({ tech, label: techLabels[tech], gwh: Math.round(gwh) }))
  return (
    <ChartBox height={240}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} stroke={grid} />
        <YAxis tick={axisTick} stroke={grid} width={54} label={{ value: 'GWh/año', angle: -90, position: 'insideLeft', fill: colors.textMuted, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} GWh`, 'Generación']} cursor={{ fill: '#ffffff10' }} />
        <Bar dataKey="gwh" isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.tech} fill={techColors[d.tech]} />
          ))}
        </Bar>
      </BarChart>
    </ChartBox>
  )
}

/** NPV as a function of the offered price K (linear), with break-even + current K. */
export function MarginVsPriceChart({
  intercept,
  slope,
  currentK,
  breakEvenK,
  kMin = 10,
  kMax = 120,
}: {
  intercept: number
  slope: number
  currentK: number
  breakEvenK: number | null
  kMin?: number
  kMax?: number
}) {
  const data: { k: number; npv: number }[] = []
  for (let k = kMin; k <= kMax; k += 2) data.push({ k, npv: (intercept + slope * k) / 1e6 })
  return (
    <ChartBox>
      <LineChart data={data} margin={{ top: 8, right: 24, bottom: 20, left: 8 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" />
        <XAxis dataKey="k" tick={axisTick} stroke={grid} type="number" domain={[kMin, kMax]} label={{ value: 'Precio de oferta K (USD/MWh)', position: 'insideBottom', offset: -10, fill: colors.textMuted, fontSize: 11 }} />
        <YAxis tick={axisTick} stroke={grid} width={54} label={{ value: 'NPV (M USD)', angle: -90, position: 'insideLeft', fill: colors.textMuted, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)} M USD`, 'NPV']} labelFormatter={(v: number) => `K = ${v} USD/MWh`} />
        <ReferenceLine y={0} stroke={colors.textDim} />
        {breakEvenK != null && breakEvenK >= kMin && breakEvenK <= kMax && (
          <ReferenceLine x={Number(breakEvenK.toFixed(1))} stroke={colors.accent.orange} strokeDasharray="4 2" label={{ value: `break-even ${breakEvenK.toFixed(0)}`, fill: colors.accent.orange, fontSize: 11, position: 'insideTopLeft' }} />
        )}
        <ReferenceLine x={Number(currentK.toFixed(1))} stroke={colors.accent.green} label={{ value: 'K', fill: colors.accent.green, fontSize: 11, position: 'top' }} />
        <Line type="monotone" dataKey="npv" stroke={colors.accent.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartBox>
  )
}

/** Year-1 cashflow components (M USD). */
export function CashflowChart({
  contractRevenue,
  genSpotRevenue,
  genCost,
  spotSettlement,
  reliabilityRevenue,
  net,
}: {
  contractRevenue: number
  genSpotRevenue: number
  genCost: number
  spotSettlement: number
  reliabilityRevenue: number
  net: number
}) {
  const data = [
    { name: 'Ingreso contrato', v: contractRevenue / 1e6, color: colors.accent.blue },
    { name: 'Venta spot gen.', v: genSpotRevenue / 1e6, color: colors.accent.cyan },
    { name: 'Confiabilidad', v: reliabilityRevenue / 1e6, color: colors.accent.green },
    { name: 'Costo generación', v: -genCost / 1e6, color: colors.accent.red },
    { name: 'Liquidación spot', v: spotSettlement / 1e6, color: colors.accent.purple },
    { name: 'Neto anual', v: net / 1e6, color: colors.accent.orange },
  ]
  return (
    <ChartBox height={240}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ ...axisTick, fontSize: 10 }} stroke={grid} interval={0} />
        <YAxis tick={axisTick} stroke={grid} width={48} label={{ value: 'M USD/año', angle: -90, position: 'insideLeft', fill: colors.textMuted, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)} M USD`, '']} cursor={{ fill: '#ffffff10' }} />
        <ReferenceLine y={0} stroke={colors.textDim} />
        <Bar dataKey="v" isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ChartBox>
  )
}

/** NPV distribution histogram (M USD); losses in red, gains in green. */
export function NpvHistogram({ bins }: { bins: { x: number; count: number }[] }) {
  return (
    <ChartBox height={240}>
      <BarChart data={bins} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="x" tick={axisTick} stroke={grid} tickFormatter={(v: number) => v.toFixed(0)} label={{ value: 'NPV (M USD)', position: 'insideBottom', offset: -10, fill: colors.textMuted, fontSize: 11 }} />
        <YAxis tick={axisTick} stroke={grid} width={40} label={{ value: 'draws', angle: -90, position: 'insideLeft', fill: colors.textMuted, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} draws`, '']} labelFormatter={(v: number) => `NPV ≈ ${Number(v).toFixed(0)} M USD`} cursor={{ fill: '#ffffff10' }} />
        <ReferenceLine x={0} stroke={colors.textDim} />
        <Bar dataKey="count" isAnimationActive={false}>
          {bins.map((b, i) => (
            <Cell key={i} fill={b.x < 0 ? colors.status.err : colors.status.ok} />
          ))}
        </Bar>
      </BarChart>
    </ChartBox>
  )
}

/** Risk vs offered price: expected NPV (left axis) and P(loss) (right axis) vs K. */
export function RiskVsPriceChart({
  kGrid,
  expNpvByK,
  pLossByK,
  currentK,
  robustK,
}: {
  kGrid: number[]
  expNpvByK: number[]
  pLossByK: number[]
  currentK: number
  robustK: number | null
}) {
  const data = kGrid.map((k, i) => ({ k, npv: expNpvByK[i] / 1e6, pLoss: pLossByK[i] }))
  return (
    <ChartBox>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" />
        <XAxis dataKey="k" tick={axisTick} stroke={grid} type="number" domain={['dataMin', 'dataMax']} label={{ value: 'Precio de oferta K (USD/MWh)', position: 'insideBottom', offset: -10, fill: colors.textMuted, fontSize: 11 }} />
        <YAxis yAxisId="npv" tick={axisTick} stroke={grid} width={50} label={{ value: 'E[NPV] M USD', angle: -90, position: 'insideLeft', fill: colors.textMuted, fontSize: 11 }} />
        <YAxis yAxisId="loss" orientation="right" tick={axisTick} stroke={grid} width={44} domain={[0, 100]} label={{ value: 'P(pérdida) %', angle: 90, position: 'insideRight', fill: colors.textMuted, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(v: number) => `K = ${v} USD/MWh`} formatter={(val: number, name) => (name === 'npv' ? [`${val.toFixed(1)} M USD`, 'E[NPV]'] : [`${val.toFixed(0)} %`, 'P(pérdida)'])} />
        <ReferenceLine yAxisId="npv" y={0} stroke={colors.textDim} />
        <ReferenceLine yAxisId="loss" x={Number(currentK.toFixed(1))} stroke={colors.accent.green} label={{ value: 'K', fill: colors.accent.green, fontSize: 11, position: 'top' }} />
        {robustK != null && (
          <ReferenceLine yAxisId="loss" x={robustK} stroke={colors.accent.orange} strokeDasharray="4 2" label={{ value: `K robusto ${robustK.toFixed(0)}`, fill: colors.accent.orange, fontSize: 11, position: 'insideTopRight' }} />
        )}
        <Line yAxisId="npv" type="monotone" dataKey="npv" stroke={colors.accent.blue} strokeWidth={2} dot={false} isAnimationActive={false} name="npv" />
        <Line yAxisId="loss" type="monotone" dataKey="pLoss" stroke={colors.accent.red} strokeWidth={2} dot={false} isAnimationActive={false} name="pLoss" />
      </LineChart>
    </ChartBox>
  )
}

/** Monthly generation by technology (GWh), stacked — real from COES. */
export function MonthlyGenMixChart({ data }: { data: { month: string; hydro: number; nuclear: number; gas: number; wind: number; solar: number; biomass: number; other: number }[] }) {
  const seriesDefs: { key: string; label: string; color: string }[] = [
    { key: 'hydro', label: 'Hidro', color: techColors.hydro },
    { key: 'nuclear', label: 'Nuclear', color: techColors.nuclear },
    { key: 'gas', label: 'Gas', color: techColors.gas_ccgt },
    { key: 'wind', label: 'Eólica', color: techColors.wind },
    { key: 'solar', label: 'Solar', color: techColors.solar },
    { key: 'biomass', label: 'Biomasa', color: techColors.biomass },
    { key: 'other', label: 'Otros', color: colors.accent.gray },
  ]
  return (
    <ChartBox height={240}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tick={axisTick} stroke={grid} />
        <YAxis tick={axisTick} stroke={grid} width={54} label={{ value: 'GWh/mes', angle: -90, position: 'insideLeft', fill: colors.textMuted, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name) => [`${Math.round(v)} GWh`, seriesDefs.find((s) => s.key === name)?.label ?? name]} cursor={{ fill: '#ffffff10' }} />
        {seriesDefs.map((s) => (
          <Bar key={s.key} dataKey={s.key} stackId="mix" fill={s.color} isAnimationActive={false} />
        ))}
      </BarChart>
    </ChartBox>
  )
}

/** Historical monthly marginal cost (Datos page). */
export function CmgHistoryChart({ data }: { data: { month: string; cmg_usd_mwh: number }[] }) {
  return (
    <ChartBox height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={axisTick} stroke={grid} interval={11} />
        <YAxis tick={axisTick} stroke={grid} width={44} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} USD/MWh`, 'CMg']} />
        <Line type="monotone" dataKey="cmg_usd_mwh" stroke={colors.accent.orange} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartBox>
  )
}

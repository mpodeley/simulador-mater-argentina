import { useState } from 'react'
import { colors, space } from '../theme'
import { Card, Grid, SectionTitle, Slider, Stat, StatRow } from './ui'
import { CmgSeriesChart, GenMixChart, MeritOrderChart } from './charts'
import { buildStack, type YearResult } from '../engine/dispatch'
import { cellIndex, type MarketData } from '../engine/types'
import type { Scenario } from '../engine/scenarios'

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function EscenarioPage({
  data,
  scenario,
  year,
  onScenario,
}: {
  data: MarketData
  scenario: Scenario
  year: YearResult
  onScenario: (patch: Partial<Scenario>) => void
}) {
  const [m, setM] = useState(6) // July (dry season)
  const [h, setH] = useState(20) // evening peak
  const stack = buildStack(data, scenario, m, h)
  const cell = year.cells[cellIndex(m, h)]

  const nearZeroColor = year.nearZeroSharePct > 10 ? colors.accent.orange : colors.textPrimary

  return (
    <Grid cols="minmax(280px, 340px) 1fr">
      <Card>
        <SectionTitle>Assumptions del escenario</SectionTitle>
        <Slider
          label="Hidrología"
          value={scenario.hydrologyFactor}
          min={0.5}
          max={1.4}
          step={0.05}
          onChange={(v) => onScenario({ hydrologyFactor: v })}
          format={(v) => (v < 0.85 ? `seco ${v.toFixed(2)}` : v > 1.15 ? `húmedo ${v.toFixed(2)}` : `mediano ${v.toFixed(2)}`)}
        />
        <Slider label="Crecimiento de demanda" value={scenario.demandGrowth} min={0.8} max={1.4} step={0.01} onChange={(v) => onScenario({ demandGrowth: v })} format={(v) => `${((v - 1) * 100).toFixed(0)}%`} />
        <Slider label="Precio gas (Vaca Muerta)" value={scenario.gasPriceUSDMMBtu} min={1} max={8} step={0.25} onChange={(v) => onScenario({ gasPriceUSDMMBtu: v })} unit="USD/MMBtu" />
        <Slider label="Solar adicional" value={scenario.extraSolarMW} min={0} max={6000} step={100} onChange={(v) => onScenario({ extraSolarMW: v })} unit="MW" />
        <Slider label="Eólica adicional" value={scenario.extraWindMW} min={0} max={6000} step={100} onChange={(v) => onScenario({ extraWindMW: v })} unit="MW" />
        <Slider label="Térmica nueva" value={scenario.extraThermalMW} min={0} max={3000} step={100} onChange={(v) => onScenario({ extraThermalMW: v })} unit="MW" />

        <div style={{ marginTop: space.lg }}>
          <SectionTitle>Curva de mérito — celda</SectionTitle>
          <Slider label={`Mes: ${MONTHS[m]}`} value={m} min={0} max={11} step={1} onChange={setM} format={() => MONTHS[m]} />
          <Slider label={`Hora: ${h}:00`} value={h} min={0} max={23} step={1} onChange={setH} format={() => `${h}:00`} />
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
        <Card>
          <SectionTitle>Resultado del escenario (año representativo)</SectionTitle>
          <StatRow>
            <Stat label="CMg promedio" value={year.avgCmg.toFixed(1)} unit="USD/MWh" accent={colors.accent.cyan} />
            <Stat label="Horas near-zero" value={year.nearZeroSharePct.toFixed(0)} unit="%" accent={nearZeroColor} hint="Energía servida con CMg < 3 USD/MWh (sobreoferta)" />
            <Stat label="Demanda" value={(year.demandGWh / 1000).toFixed(1)} unit="TWh/año" />
            <Stat label="Escasez" value={year.scarcityHoursPct.toFixed(1)} unit="%" hint="Celdas que llegan al precio tope" accent={year.scarcityHoursPct > 1 ? colors.accent.red : colors.textPrimary} />
          </StatRow>
        </Card>

        <Card>
          <SectionTitle>
            Orden de mérito — {MONTHS[m]}, {h}:00 · demanda {Math.round(cell.demandMW)} MW · CMg {cell.smp.toFixed(1)} USD/MWh
          </SectionTitle>
          <MeritOrderChart blocks={stack} demandMW={cell.demandMW} smp={cell.smp} />
          <p style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            La unidad marginal (donde la curva cruza la demanda) fija el costo marginal del sistema.
          </p>
        </Card>

        <Grid cols="1fr 1fr">
          <Card>
            <SectionTitle>CMg por mes</SectionTitle>
            <CmgSeriesChart values={year.cmgByMonth} by="month" />
          </Card>
          <Card>
            <SectionTitle>CMg por hora del día</SectionTitle>
            <CmgSeriesChart values={year.cmgByHour} by="hour" />
          </Card>
        </Grid>

        <Card>
          <SectionTitle>Mix de generación simulado</SectionTitle>
          <GenMixChart mix={year.genMixGWh} />
        </Card>
      </div>
    </Grid>
  )
}

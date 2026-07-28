import { colors, space } from '../theme'
import { Card, Field, Grid, NumberInput, SectionTitle, Select, Slider, Stat, StatRow } from './ui'
import { CashflowChart, MarginVsPriceChart } from './charts'
import { useCurtailmentNodes, useDolar, useFx } from '../hooks/useData'
import { MATER_CAP_USDMWH } from '../engine/bid'
import type { BidResult, Contract, GenTech, Indexation, Settlement, VolumeShape } from '../engine/bid'

const SETTLEMENTS: { value: Settlement; label: string }[] = [
  { value: 'mater_ppa', label: 'PPA MATER (Gran Usuario)' },
  { value: 'spot_marginalista', label: 'Merchant al spot (Res 400/25)' },
  { value: 'renovar_ppa', label: 'RenovAr (referencia, soberano)' },
  { value: 'cfd', label: 'Contrato por diferencias (CfD)' },
  { value: 'merchant', label: 'Merchant puro (sin confiabilidad)' },
]
const GEN_TECHS: { value: GenTech; label: string }[] = [
  { value: 'wind', label: 'Eólica' },
  { value: 'solar', label: 'Solar FV' },
  { value: 'hydro', label: 'Hidro' },
  { value: 'gas_ccgt', label: 'Gas CC' },
  { value: 'nuclear', label: 'Nuclear' },
  { value: 'none', label: 'Sin generación (financiero)' },
]
const SHAPES: { value: VolumeShape; label: string }[] = [
  { value: 'flat', label: 'Bloque plano' },
  { value: 'solar', label: 'Perfil solar' },
  { value: 'wind', label: 'Perfil eólico' },
]
const INDEX: { value: Indexation; label: string }[] = [
  { value: 'none', label: 'Sin indexación (USD flat)' },
  { value: 'cpi', label: 'US CPI' },
  { value: 'gas', label: 'Gas / combustible' },
]

/** Preset side-effects when the settlement type changes. */
function settlementDefaults(s: Settlement): Partial<Contract> {
  if (s === 'mater_ppa') return { settlement: s, horizonYears: 15, indexation: 'none', priorityDispatch: true, reliabilityUSDMWMonth: 1000 }
  if (s === 'spot_marginalista') return { settlement: s, priorityDispatch: false, reliabilityUSDMWMonth: 1000 }
  if (s === 'renovar_ppa') return { settlement: s, horizonYears: 20, indexation: 'none', priorityDispatch: true, reliabilityUSDMWMonth: 0 }
  if (s === 'cfd') return { settlement: s, horizonYears: 10, priorityDispatch: false, reliabilityUSDMWMonth: 0 }
  return { settlement: s, reliabilityUSDMWMonth: 0 }
}

const M = (n: number) => `${(n / 1e6).toFixed(1)} M`

export function OfertaPage({
  contract,
  bid,
  avgCmg,
  onContract,
}: {
  contract: Contract
  bid: BidResult
  avgCmg: number
  onContract: (patch: Partial<Contract>) => void
}) {
  const nodes = useCurtailmentNodes()
  const fx = useFx()
  const dolar = useDolar()
  const noContract = contract.settlement === 'merchant' || contract.settlement === 'spot_marginalista'
  const allGenAtK = contract.settlement === 'renovar_ppa'
  const isMater = contract.settlement === 'mater_ppa'
  const profitable = bid.npv > 0
  const marginOverBE = bid.breakEvenK != null ? contract.priceK - bid.breakEvenK : null
  const overCap = isMater && contract.priceK > MATER_CAP_USDMWH
  const rate = dolar?.mayorista ?? fx.data?.mayorista ?? null
  const ars = (usd: number) => (rate ? `${((usd * rate) / 1e9).toFixed(1)}k M ARS` : '—')

  return (
    <Grid cols="minmax(300px, 380px) 1fr">
      <Card>
        <SectionTitle>Contrato de la oferta</SectionTitle>
        <Field label="Tipo de liquidación">
          <Select value={contract.settlement} options={SETTLEMENTS} onChange={(v) => onContract(settlementDefaults(v))} />
        </Field>

        {!noContract && (
          <Slider
            label={isMater ? `Precio de oferta K (cap ${MATER_CAP_USDMWH})` : 'Precio de oferta (K)'}
            value={contract.priceK}
            min={20}
            max={130}
            step={0.5}
            onChange={(v) => onContract({ priceK: v })}
            unit="USD/MWh"
          />
        )}
        {overCap && (
          <p style={{ color: colors.status.warn, fontSize: 12, marginTop: -6 }}>
            ⚠ Por encima del cap regulatorio MATER de {MATER_CAP_USDMWH} USD/MWh.
          </p>
        )}

        <SectionTitle>Generación propia</SectionTitle>
        <Field label="Tecnología">
          <Select value={contract.genTech} options={GEN_TECHS} onChange={(v) => onContract({ genTech: v, genVarCostUSDMWh: v === 'gas_ccgt' ? 28 : v === 'nuclear' ? 8 : 0 })} />
        </Field>
        <Slider label="Capacidad instalada" value={contract.genCapacityMW} min={0} max={600} step={10} onChange={(v) => onContract({ genCapacityMW: v })} unit="MW" />
        {(contract.genTech === 'gas_ccgt' || contract.genTech === 'nuclear') && (
          <Slider label="Costo variable" value={contract.genVarCostUSDMWh} min={0} max={120} step={1} onChange={(v) => onContract({ genVarCostUSDMWh: v })} unit="USD/MWh" />
        )}

        <SectionTitle>Nodo y curtailment</SectionTitle>
        <Field label="Nodo / región (preset de recorte)">
          <Select
            value={nodes.data?.find((n) => Math.abs(n.curtailmentPct - contract.curtailmentPct) < 0.01)?.id ?? ''}
            options={[
              { value: '', label: 'Personalizado' },
              ...(nodes.data ?? []).map((n) => ({ value: n.id, label: `${n.region} (${n.curtailmentPct}%)` })),
            ]}
            onChange={(id) => {
              const n = nodes.data?.find((x) => x.id === id)
              if (n) onContract({ curtailmentPct: n.curtailmentPct, genTech: n.tech as GenTech, volumeShape: n.tech as VolumeShape })
            }}
          />
        </Field>
        <Slider label="Curtailment del nodo" value={contract.curtailmentPct} min={0} max={30} step={0.5} onChange={(v) => onContract({ curtailmentPct: v })} unit="%" />
        <p style={{ color: colors.textMuted, fontSize: 12, marginTop: -4 }}>
          El recorte por congestión de transmisión es el driver dominante del precio realizado en AR.
        </p>

        {!noContract && !allGenAtK && (
          <>
            <SectionTitle>Bloque contratado</SectionTitle>
            <Slider label="Potencia contratada" value={contract.contractedMW} min={0} max={400} step={10} onChange={(v) => onContract({ contractedMW: v })} unit="MW" />
            <Field label="Perfil del bloque">
              <Select value={contract.volumeShape} options={SHAPES} onChange={(v) => onContract({ volumeShape: v })} />
            </Field>
          </>
        )}
        {allGenAtK && (
          <p style={{ color: colors.textMuted, fontSize: 12 }}>
            En RenovAr el PPA soberano liquida <b>toda</b> la generación a K con despacho prioritario: sin riesgo spot.
          </p>
        )}

        <SectionTitle>Confiabilidad y financiero</SectionTitle>
        <Slider label="Pago de confiabilidad" value={contract.reliabilityUSDMWMonth} min={0} max={9000} step={250} onChange={(v) => onContract({ reliabilityUSDMWMonth: v })} unit="USD/MW-mes" />
        <Grid cols="1fr 1fr">
          <Field label="Horizonte (años)">
            <NumberInput value={contract.horizonYears} min={1} max={25} onChange={(v) => onContract({ horizonYears: v })} />
          </Field>
          <Field label="WACC (%)">
            <NumberInput value={contract.waccPct} step={0.5} min={0} max={25} onChange={(v) => onContract({ waccPct: v })} />
          </Field>
        </Grid>
        <Field label="Indexación de K">
          <Select value={contract.indexation} options={INDEX} onChange={(v) => onContract({ indexation: v })} />
        </Field>
        {contract.indexation !== 'none' && (
          <Slider label="Tasa de indexación" value={contract.indexRatePct} min={0} max={6} step={0.25} onChange={(v) => onContract({ indexRatePct: v })} unit="%/año" />
        )}
        <Field label="Capex (USD)">
          <NumberInput value={contract.capexUSD} step={5_000_000} min={0} onChange={(v) => onContract({ capexUSD: v })} />
        </Field>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
        <Card>
          <SectionTitle>Veredicto de la oferta</SectionTitle>
          <StatRow>
            <Stat label={noContract ? 'NPV merchant' : 'NPV a K'} value={M(bid.npv)} unit="USD" accent={profitable ? colors.status.ok : colors.status.err} hint={rate ? `≈ ${ars(bid.npv)}` : undefined} />
            <Stat label="Precio de equilibrio K*" value={bid.breakEvenK != null ? bid.breakEvenK.toFixed(1) : '—'} unit="USD/MWh" accent={colors.accent.orange} hint="Precio de oferta que hace NPV = 0" />
            <Stat label="P&L anual (año 1)" value={M(bid.annualPnL)} unit="USD" />
            <Stat label="Precio captura" value={bid.captureUSDMWh.toFixed(1)} unit="USD/MWh" hint="Spot medio capturado por la generación propia" />
            <Stat label="CMg escenario" value={avgCmg.toFixed(1)} unit="USD/MWh" accent={colors.accent.cyan} />
          </StatRow>
          {!noContract && marginOverBE != null && (
            <p style={{ marginTop: space.md, color: profitable ? colors.status.ok : colors.status.err, fontSize: 13 }}>
              {profitable
                ? `Ofertar a ${contract.priceK.toFixed(1)} deja ${marginOverBE.toFixed(1)} USD/MWh de margen sobre el equilibrio (${bid.breakEvenK!.toFixed(1)}). Podrías bajar hasta ~${bid.breakEvenK!.toFixed(1)} y seguir cubriendo capital.`
                : `A ${contract.priceK.toFixed(1)} la oferta destruye valor: el equilibrio está en ${bid.breakEvenK!.toFixed(1)} USD/MWh. Subí el precio o mejorá el nodo.`}
            </p>
          )}
          {rate && <p style={{ color: colors.textDim, fontSize: 11, marginTop: 4 }}>FX mayorista {rate} ARS/USD ({dolar ? 'en vivo, dolarapi' : 'referencia'}).</p>}
        </Card>

        {!noContract && (
          <Card>
            <SectionTitle>NPV vs. precio de oferta</SectionTitle>
            <MarginVsPriceChart intercept={bid.npvIntercept} slope={bid.npvSlope} currentK={contract.priceK} breakEvenK={bid.breakEvenK} />
          </Card>
        )}

        <Card>
          <SectionTitle>Cashflow anual (año 1)</SectionTitle>
          <CashflowChart
            contractRevenue={bid.contractRevenue}
            genSpotRevenue={bid.genSpotRevenue}
            genCost={bid.genCost}
            spotSettlement={bid.spotSettlement}
            reliabilityRevenue={bid.reliabilityRevenue}
            net={bid.annualPnL}
          />
          <StatRow>
            <Stat label="Generación propia" value={bid.ownGenGWh.toFixed(0)} unit="GWh/año" hint="Ya descontado el curtailment" />
            <Stat label="Energía contratada" value={bid.contractedGWh.toFixed(0)} unit="GWh/año" />
            <Stat label="Confiabilidad" value={M(bid.reliabilityRevenue)} unit="USD/año" />
          </StatRow>
        </Card>
      </div>
    </Grid>
  )
}

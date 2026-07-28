import { colors, space } from '../theme'
import { Card, SectionTitle } from './ui'

const p: React.CSSProperties = { color: colors.textSecondary, fontSize: 14, lineHeight: 1.65, marginBottom: space.md }
const code: React.CSSProperties = { background: colors.surfaceAlt, padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 13 }

export function MetodologiaPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg, maxWidth: 820 }}>
      <Card>
        <SectionTitle>El modelo en una frase</SectionTitle>
        <p style={p}>
          Un modelo <b>fundamental de orden de mérito</b> arma, para cada hora representativa, la curva de oferta del SADI
          (renovables, nuclear e hidro de pasada a costo ~0, luego el valor del agua, luego las térmicas a gas de Vaca Muerta
          ordenadas por costo variable), la cruza con la demanda y deja que la <b>unidad marginal fije el costo marginal</b>.
          Desde nov-2025 (Res. SE 400/2025) ese precio marginalista volvió a remunerar a la generación al spot. Sobre esa
          trayectoria se evalúa qué precio de PPA conviene ofertar.
        </p>
      </Card>

      <Card>
        <SectionTitle>Granularidad</SectionTitle>
        <p style={p}>
          El año se representa con <b>12 meses × 24 horas = 288 celdas</b>, cada una ponderada por los días del mes. Captura la
          canibalización solar del mediodía y la estacionalidad hidrológica sin simular 8.760 horas. La energía anual de una
          celda es <span style={code}>MW × días_del_mes</span> MWh.
        </p>
      </Card>

      <Card>
        <SectionTitle>Curtailment: el driver dominante en Argentina</SectionTitle>
        <p style={p}>
          A diferencia de otros mercados, el precio realizado de un PPA renovable argentino lo define el <b>recorte por
          congestión de transmisión</b> (récord de 91.580 MWh en marzo-2026, con Cuyo a la cabeza). El modelo lo trata como un
          <b> factor exógeno por nodo</b>: la generación propia se reduce por <span style={code}>1 − curtailment%</span>, con
          presets por región (Cuyo alto, Patagonia medio, BA bajo). En el Monte Carlo el curtailment se muestrea como variable
          de riesgo — mueve directo el break-even. La prioridad "Referencial A" del MATER admite hasta ~8% de recorte.
        </p>
      </Card>

      <Card>
        <SectionTitle>Evaluación de la oferta</SectionTitle>
        <p style={p}>El vendedor se compromete a entregar energía a un precio fijo K y queda expuesto al spot. La P&L por hora:</p>
        <p style={{ ...p, textAlign: 'center' }}>
          <span style={code}>pnl_h = gen_h·(CMg_h − costo_var) + vol_h·(K − CMg_h)</span>
        </p>
        <p style={p}>
          donde <span style={code}>gen_h</span> ya viene curtailada. El primer término es el margen merchant; el segundo, la
          liquidación tipo contrato por diferencias. Se suma un <b>pago de confiabilidad</b> fijo (USD/MW-mes, Res. 400/2025).
          Los presets cambian cómo se asignan <span style={code}>gen</span> y <span style={code}>vol</span>:
        </p>
        <ul style={{ ...p, paddingLeft: 20 }}>
          <li><b>PPA MATER</b>: bloque contratado a un Gran Usuario (cap USD 113) + generación propia curtailada; el excedente/faltante liquida al spot.</li>
          <li><b>Merchant al spot</b>: sin contrato (vol = 0), vende al spot marginalista + confiabilidad.</li>
          <li><b>RenovAr (referencia)</b>: PPA soberano a 20 años que liquida toda la generación a K, sin riesgo spot.</li>
        </ul>
        <p style={p}>
          Como la P&L es lineal en K, el NPV y el <b>precio de equilibrio K*</b> (NPV = 0) son de forma cerrada. El break-even
          es el piso al que podrías ofertar cubriendo capital; el mercado MATER hoy clava ~60-70 USD/MWh.
        </p>
      </Card>

      <Card>
        <SectionTitle>Límites del modelo</SectionTitle>
        <p style={p}>
          Es un modelo <b>copperplate</b>: el curtailment entra <b>exógeno por nodo</b>, no por un flujo de red zonal; sin unit
          commitment ni oferta estratégica. La hidro es energía limitada por un factor de capacidad. Sirve para entender el
          driver dominante del precio y ordenar decisiones de oferta; no reemplaza el despacho de CAMMESA.
        </p>
        <p style={p}>
          El mercado está <b>en transición</b> (marginalista desde nov-2025, emergencia energética prorrogada a 2027). v1 usa
          datos <b>curados</b> + overlays reales de CAMMESA/NASA/FX; el pipeline de costo marginal, MATER y curtailment
          (Síntesis Mensual de CAMMESA) es una fase siguiente.
        </p>
      </Card>
    </div>
  )
}

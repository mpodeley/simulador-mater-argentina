#!/usr/bin/env python3
"""Build the curated seed datasets under public/data/ for the Argentine SADI/MEM.

v1 data is curated (source-anchored, from the 2026 research brief: CAMMESA /
Secretaría de Energía / MATER). Reliability flagged per dataset. Real overlays
(CAMMESA demanda-svc, NASA POWER, FX) come from the fetchers in build_data.py.

Representative year = 12 months x 24 hours = 288 cells, each weighted by
days_in_month. Keep that convention in sync with the TS engine.

Run: python scripts/build_seed_data.py   (or npm run seed)
"""

import math
import os

from _meta import write_json

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'public', 'data')

DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
MONTHS = 12
HOURS = 24


# --------------------------------------------------------------------------
# Procedural 12x24 profiles (Argentina).
# --------------------------------------------------------------------------

def solar_shape():
    """CF 0..1. Cuyo/NOA high irradiance; bell peaking ~0.85 at noon. Southern
    hemisphere: higher in the Oct-Mar summer half."""
    month_factor = [1.03, 1.02, 1.00, 0.95, 0.88, 0.83, 0.85, 0.92, 0.98, 1.02, 1.04, 1.04]
    out = []
    for m in range(MONTHS):
        row = []
        for h in range(HOURS):
            base = math.sin(math.pi * (h - 6) / 12) ** 1.1 if 6 <= h <= 18 else 0.0
            row.append(round(0.83 * base * month_factor[m], 4))
        out.append(row)
    return out


def wind_shape():
    """CF 0..1. Patagonia has world-class wind (~45-50% CF), fairly steady with a
    late-afternoon max and a windy spring/summer (Sep-Feb, southern hemisphere)."""
    month_factor = [1.10, 1.05, 1.00, 0.92, 0.85, 0.82, 0.85, 0.90, 1.02, 1.10, 1.12, 1.12]
    out = []
    for m in range(MONTHS):
        row = []
        for h in range(HOURS):
            diurnal = 0.50 + 0.16 * math.sin(math.pi * (h - 9) / 12)
            row.append(round(min(0.95, max(0.1, diurnal) * month_factor[m]), 4))
        out.append(row)
    return out


def demand_shape():
    """Fraction of SADI peak (0..1). Double seasonal peak (summer AC Jan-Feb +
    winter heating Jul); daily evening peak ~20-21h."""
    month_factor = [1.00, 0.99, 0.95, 0.88, 0.86, 0.92, 0.98, 0.95, 0.87, 0.86, 0.90, 0.97]
    out = []
    for m in range(MONTHS):
        row = []
        for h in range(HOURS):
            night = 0.46 + 0.05 * math.sin(math.pi * (h - 4) / 24)
            midday = 0.18 * math.exp(-((h - 15) ** 2) / 20)  # summer AC bump
            evening = 0.40 * math.exp(-((h - 20) ** 2) / 7)
            frac = min(1.0, night + midday + evening) * month_factor[m]
            row.append(round(frac, 4))
        out.append(row)
    return out


def annual_gwh(shape, peak_mw):
    total = sum(peak_mw * shape[m][h] * DAYS_IN_MONTH[m] for m in range(MONTHS) for h in range(HOURS))
    return round(total / 1000.0, 1)


def hydro_seasonal():
    """Monthly hydro-availability multiplier (avg ~1.0). AR hydro (Comahue snowmelt
    + Yacyretá) peaks in summer/early autumn."""
    raw = [1.15, 1.15, 1.12, 1.02, 0.92, 0.85, 0.82, 0.82, 0.88, 0.95, 1.05, 1.12]
    avg = sum(raw) / len(raw)
    return [round(x / avg, 4) for x in raw]


# --------------------------------------------------------------------------
# Datasets
# --------------------------------------------------------------------------

def build_fleet():
    """Aggregated SADI fleet (~42 GW, 2024-25). Gas units carry a heat rate so var
    cost tracks the gas-price slider (Vaca Muerta gas is cheap). Nuclear + hydro
    must-run form the low-cost base."""
    return [
        {'id': 'hydro', 'name': 'Hidroeléctrica (Comahue/Yacyretá/Salto Grande)', 'tech': 'hydro',
         'capacityMW': 10000, 'varCostUSDMWh': 4.0, 'mustRunFraction': 0.3},
        {'id': 'nuclear', 'name': 'Nuclear (Atucha I/II, Embalse)', 'tech': 'nuclear',
         'capacityMW': 1760, 'varCostUSDMWh': 8.0, 'mustRunFraction': 0.9},
        {'id': 'gas_ccgt', 'name': 'Gas ciclo combinado', 'tech': 'gas_ccgt',
         'capacityMW': 11000, 'varCostUSDMWh': 3.0, 'heatRateMMBtuMWh': 7.0},
        {'id': 'gas_ocgt', 'name': 'Gas ciclo abierto / turbovapor', 'tech': 'gas_ocgt',
         'capacityMW': 9500, 'varCostUSDMWh': 4.0, 'heatRateMMBtuMWh': 10.5},
        {'id': 'coal', 'name': 'Carbón (Río Turbio)', 'tech': 'coal',
         'capacityMW': 400, 'varCostUSDMWh': 55.0},
        {'id': 'biomass', 'name': 'Biomasa / bioenergía', 'tech': 'biomass',
         'capacityMW': 300, 'varCostUSDMWh': 45.0, 'mustRunFraction': 0.4},
        {'id': 'diesel', 'name': 'Diésel / fueloil (respaldo)', 'tech': 'diesel',
         'capacityMW': 2500, 'varCostUSDMWh': 190.0},
        {'id': 'wind', 'name': 'Eólica (Patagonia/BA)', 'tech': 'wind',
         'capacityMW': 4700, 'varCostUSDMWh': 0.0},
        {'id': 'solar', 'name': 'Solar FV (Cuyo/NOA)', 'tech': 'solar',
         'capacityMW': 1700, 'varCostUSDMWh': 0.0},
    ]


def build_cmg_history():
    """Monthly precio monómico (USD/MWh) — the all-in MEM cost. NOT the pure
    marginal-energy SMP the engine simulates (which is lower). Anchored to the
    normalization path: ~83.5 (sep-25) -> 68 (oct-25) -> 64.6 (feb-26)."""
    anchors = {2020: 62, 2021: 66, 2022: 74, 2023: 70, 2024: 72, 2025: 74, 2026: 65}
    seasonal = hydro_seasonal()
    rows = []
    for year, avg in anchors.items():
        for m in range(MONTHS):
            factor = 2.0 - seasonal[m]  # dry/winter months costlier
            val = avg * (0.9 + 0.1 * factor)
            if year == 2025 and m >= 8:  # sinceramiento spike then fall
                val = [83.5, 68, 66][min(m - 8, 2)]
            if year == 2026 and m <= 5:
                val = [63, 64.6, 66, 63, 62, 64][m]
            rows.append({'month': f'{year}-{m + 1:02d}', 'cmg_usd_mwh': round(val, 1)})
    return rows


def build_generation_mix():
    """Monthly generation by technology, GWh — fallback for the real CAMMESA
    series. Proportions ~2025 (thermal ~58%, hydro ~22%, nuclear ~9%, wind ~10%,
    solar ~3%)."""
    base = {'hydro': 2600, 'nuclear': 900, 'gas': 6300, 'wind': 1150, 'solar': 330, 'biomass': 60, 'other': 60}
    seasonal = hydro_seasonal()
    rows = []
    for m in range(MONTHS):
        f = seasonal[m]
        rows.append({
            'month': f'2025-{m + 1:02d}',
            'hydro': round(base['hydro'] * f, 1),
            'nuclear': base['nuclear'],
            'gas': round(base['gas'] * (2.0 - f), 1),
            'wind': base['wind'], 'solar': base['solar'],
            'biomass': base['biomass'], 'other': base['other'],
        })
    return rows


def build_mater_results():
    """MATER dispatch-priority allocation rounds (replaces Peru rer_auctions).
    Freely-negotiated PPAs; awarded figures are MW + priority type."""
    v, a = 'verified', 'approx'
    return [
        {'round': '2024-Q4', 'year': 2024, 'tech': 'mixto', 'awardedMW': 480, 'priority': 'Pleno/Ref-A', 'priceUSDMWh': 65, 'reliability': a},
        {'round': '2025-Q1+Q2', 'year': 2025, 'tech': 'mixto', 'awardedMW': 646, 'priority': 'Pleno/Ref-A', 'priceUSDMWh': 63, 'reliability': v},
        {'round': '2025-Q3', 'year': 2025, 'tech': 'mixto', 'awardedMW': 515, 'priority': 'Pleno/Ref-A', 'priceUSDMWh': 62, 'reliability': v},
        {'round': '2025-Q4', 'year': 2025, 'tech': 'mixto', 'awardedMW': None, 'priority': 'Ref-A (≤8% curt.)', 'priceUSDMWh': None, 'reliability': a,
         'note': 'Capacidad limitada; mayoría bajo mecanismo de hasta 8% de curtailment'},
    ]


def build_renovar_prices():
    """RenovAr awarded prices (dormant program; historical reference)."""
    return [
        {'name': 'RenovAr R1', 'year': 2016, 'awardedMW': 1142, 'periodo': '20 años', 'priceUSDMWh': 61.3, 'note': 'wind <70, solar ~76'},
        {'name': 'RenovAr R1.5', 'year': 2016, 'awardedMW': 1281, 'periodo': '20 años', 'priceUSDMWh': 54.0, 'note': '10 eólicos + 20 solares'},
        {'name': 'RenovAr R2', 'year': 2017, 'awardedMW': 2043, 'periodo': '20 años', 'priceUSDMWh': 51.5, 'note': 'solar min 40.4, eólica min 37'},
        {'name': 'RenovAr R3 (MiniRen)', 'year': 2019, 'awardedMW': 97, 'periodo': '20 años', 'priceUSDMWh': 57.6, 'note': 'min 54.2'},
    ]


def build_curtailment_nodes():
    """Curtailment presets by region/node (the dominant AR price driver). Base %
    ≈ expected annual energy reduction for a new project at that node."""
    return [
        {'id': 'cuyo', 'region': 'Cuyo (Mendoza/San Juan)', 'tech': 'solar', 'curtailmentPct': 14, 'note': 'Región más afectada 2026 (65% del recorte total)'},
        {'id': 'noa', 'region': 'NOA (Jujuy/Salta)', 'tech': 'solar', 'curtailmentPct': 10, 'note': 'Corredor NOA saturado'},
        {'id': 'patagonia', 'region': 'Patagonia (Chubut/Santa Cruz)', 'tech': 'wind', 'curtailmentPct': 8, 'note': 'Líder de recorte 2023-25; transmisión limitada'},
        {'id': 'comahue', 'region': 'Comahue (Neuquén/Río Negro)', 'tech': 'wind', 'curtailmentPct': 6, 'note': 'Nodo con hidro; congestión media'},
        {'id': 'pba', 'region': 'Buenos Aires (centro/sur)', 'tech': 'wind', 'curtailmentPct': 4, 'note': 'Más cerca de la demanda'},
        {'id': 'litoral', 'region': 'Litoral (Santa Fe/Entre Ríos)', 'tech': 'solar', 'curtailmentPct': 3, 'note': 'Buen acceso a demanda'},
    ]


def build_fx():
    """USD/ARS reference (fallback; live via dolarapi/BCRA)."""
    return {'oficial': 1350, 'mayorista': 1330, 'blue': 1400, 'mep': 1385, 'ccl': 1410, 'as_of': '2026-07'}


def build_sources():
    return [
        {'id': 'cammesa_demanda', 'name': 'CAMMESA — demanda-svc (demanda + generación por tecnología, por región)', 'url': 'https://api.cammesa.com/demanda-svc/demanda/RegionesDemanda',
         'note': 'JSON en tiempo real, CORS abierto (GET). Cableado real vía pipeline.', 'reliability': 'verified', 'cors': 'live'},
        {'id': 'cammesa_sintesis', 'name': 'CAMMESA — Síntesis / Informe Mensual', 'url': 'https://cammesaweb.cammesa.com/informes-sintesis-mensual/',
         'note': 'Costo marginal, monómico, precios, por-central, embalses (Excel/PDF/PowerBI). Sin CORS → pipeline (Fase 5).', 'reliability': 'verified', 'cors': 'preprocess'},
        {'id': 'cammesa_mater', 'name': 'CAMMESA — Resultados MATER (prioridad de despacho)', 'url': 'https://cammesaweb.cammesa.com/mater-resultado-asignacion-prioridad-despacho/',
         'note': 'MW asignados y prioridad por nodo (PDF/PowerBI). Pipeline (Fase 5).', 'reliability': 'verified', 'cors': 'preprocess'},
        {'id': 'se_renovar', 'name': 'Secretaría de Energía — Precios RenovAr', 'url': 'http://www.minem.gob.ar/www/833/25871/precios-adjudicados-del-programa-renovar',
         'note': 'Precios adjudicados R1/R1.5/R2/R3. Histórico (one-off).', 'reliability': 'verified', 'cors': 'preprocess'},
        {'id': 'cammesa_curtail', 'name': 'CAMMESA — Informe de Generación Renovable Variable (curtailment)', 'url': 'https://cammesaweb.cammesa.com/informe-sintesis-mensual/',
         'note': 'Vertimiento/recorte mensual de renovables (PDF/Excel). Pipeline (Fase 5).', 'reliability': 'verified', 'cors': 'preprocess'},
        {'id': 'dolarapi', 'name': 'dolarapi.com — USD/ARS', 'url': 'https://dolarapi.com/v1/dolares',
         'note': 'Oficial/blue/MEP/CCL/mayorista, JSON, CORS abierto. Fetch en vivo.', 'reliability': 'verified', 'cors': 'live'},
        {'id': 'bcra', 'name': 'BCRA — Estadísticas Cambiarias', 'url': 'https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD',
         'note': 'Cotización oficial/mayorista, JSON, CORS abierto.', 'reliability': 'verified', 'cors': 'live'},
        {'id': 'nasa_power', 'name': 'NASA POWER API', 'url': 'https://power.larc.nasa.gov/docs/services/api/',
         'note': 'Irradiancia/viento por punto. CORS abierto (GET). Perfiles solar/eólico.', 'reliability': 'verified', 'cors': 'live'},
        {'id': 'boletin', 'name': 'Boletín Oficial — Res. SE (PEST, monómico, Res. 400/2025)', 'url': 'https://www.boletinoficial.gob.ar',
         'note': 'Precios estacionales y reglas del MEM (PDF). Pipeline/manual.', 'reliability': 'verified', 'cors': 'preprocess'},
    ]


def main():
    write_json(os.path.join(DATA, 'fleet.json'), build_fleet(),
               source='CAMMESA / Secretaría de Energía (curado)', source_date='2025',
               reliability='approx', note='Parque SADI agregado por tecnología (~42 GW).')

    demand = demand_shape()
    peak = 29000
    write_json(os.path.join(DATA, 'demand_profile.json'),
               {'peakMW': peak, 'annualGWh': annual_gwh(demand, peak), 'shape': demand},
               source='Perfil representativo SADI (curado; calibrar con CAMMESA demanda-svc)',
               source_date='2025', reliability='approx')

    write_json(os.path.join(DATA, 'solar_profile.json'), {'shape': solar_shape()},
               source='Perfil solar representativo Cuyo/NOA (formulado; calibrar con NASA POWER)',
               source_date='2025', reliability='approx')
    write_json(os.path.join(DATA, 'wind_profile.json'), {'shape': wind_shape()},
               source='Perfil eólico representativo Patagonia (formulado; calibrar con NASA POWER)',
               source_date='2025', reliability='approx')

    seasonal = hydro_seasonal()
    write_json(os.path.join(DATA, 'hydrology_scenarios.json'), {
        'hydroBaseCF': 0.34,  # AR hydro CF ~0.34 (~30 TWh / ~10 GW)
        'scenarios': [
            {'name': 'dry', 'label': 'Año seco', 'factor': 0.8},
            {'name': 'median', 'label': 'Año mediano', 'factor': 1.0},
            {'name': 'wet', 'label': 'Año húmedo', 'factor': 1.15},
        ],
        'monthly': {
            'median': seasonal,
            'dry': [round(x * 0.8, 4) for x in seasonal],
            'wet': [round(min(1.35, x * 1.15), 4) for x in seasonal],
        },
    }, source='Estacionalidad hidrológica AR (curado)', source_date='2025', reliability='approx')

    write_json(os.path.join(DATA, 'marginal_cost_history.json'), build_cmg_history(),
               source='CAMMESA Síntesis / Sec. Energía (monómico, curado)', source_date='2026',
               reliability='approx', note='Precio monómico del MEM (no es la energía marginalista pura).')
    write_json(os.path.join(DATA, 'generation_mix.json'), build_generation_mix(),
               source='CAMMESA (curado)', source_date='2025', reliability='approx')
    write_json(os.path.join(DATA, 'mater_results.json'), build_mater_results(),
               source='CAMMESA — Prioridad de despacho MATER', source_date='2025', reliability='approx',
               note='PPAs de precio libre (cap USD 113/MWh; típico 60-70). MW asignados por ronda.')

    renovar = build_renovar_prices()
    for r in renovar:
        r['reliability'] = 'verified'
    write_json(os.path.join(DATA, 'renovar_prices.json'), renovar,
               source='Secretaría de Energía — RenovAr', source_date='2019', reliability='verified',
               note='Programa dormido desde 2019; referencia histórica.')

    write_json(os.path.join(DATA, 'curtailment_nodes.json'), build_curtailment_nodes(),
               source='CAMMESA / análisis de congestión (curado)', source_date='2026', reliability='approx',
               note='Recorte esperado por región. Confirmar con Informe de Generación Renovable Variable.')

    write_json(os.path.join(DATA, 'fx.json'), build_fx(),
               source='Referencia USD/ARS (fallback; live vía dolarapi)', source_date='2026', reliability='approx')

    write_json(os.path.join(DATA, 'sources.json'), build_sources(),
               source='Inventario de fuentes', source_date='2026', reliability='verified')

    print('Seed datasets written to', os.path.normpath(DATA))


if __name__ == '__main__':
    main()

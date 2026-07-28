#!/usr/bin/env python3
"""Fetch real solar & wind resource from NASA POWER and rebuild the 12x24
capacity-factor profiles (public/data/solar_profile.json, wind_profile.json).

NASA POWER (MERRA-2 / CERES) is free, public-domain, documented, and — unlike
COES/SENAMHI — reachable server-side with no auth. We pull one full year of
hourly data (local solar time) for a representative high-quality node per
technology and average it into a month x hour climatology.

Solar CF  = clip(GHI / 1000 W/m^2, 0, 1) x performance ratio.
Wind  CF  = turbine power curve on the 50 m wind speed extrapolated to ~100 m hub.

If the fetch fails the script exits non-zero WITHOUT touching the files, so the
pipeline falls back to the curated seed profiles. Std-lib only (urllib).
"""

import json
import sys
import urllib.request
from collections import defaultdict

from _meta import write_json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'public', 'data')

YEAR = 2023  # a representative recent full year
PERFORMANCE_RATIO = 0.83  # PV plant AC output vs. plane-of-array potential
HUB_SHEAR = (100.0 / 50.0) ** 0.143  # 1/7 power-law extrapolation 50 m -> ~100 m

# Bias-correction targets. NASA POWER (MERRA-2, ~0.5° grid) gives an excellent
# diurnal/seasonal SHAPE but under-reads the level at high-resource microsites
# (coastal wind) and on horizontal-plane solar. We rescale the shape to the
# documented Peruvian fleet-average capacity factor — the same method
# renewables.ninja uses. Shape is real; level is calibrated (reliability=approx).
TARGET_SOLAR_CF = 0.30  # AR utility PV (NOA/Cuyo, tracking, high altitude) ~0.28-0.34
TARGET_WIND_CF = 0.48  # AR utility wind (Patagonia) ~0.45-0.52

# Representative resource nodes (Argentina).
SOLAR_NODE = {'lat': -23.4, 'lon': -66.5, 'name': 'Cauchari / NOA (Jujuy, alta irradiancia)'}
WIND_NODE = {'lat': -45.9, 'lon': -67.5, 'name': 'Comodoro Rivadavia / Patagonia (mejor recurso eólico)'}

FILL = -999.0


def fetch_hourly(lat, lon, params):
    url = (
        'https://power.larc.nasa.gov/api/temporal/hourly/point'
        f'?parameters={",".join(params)}&community=RE'
        f'&longitude={lon}&latitude={lat}'
        f'&start={YEAR}0101&end={YEAR}1231&format=JSON&time-standard=LST'
    )
    req = urllib.request.Request(url, headers={'User-Agent': 'simulador-subastas-peru/1.0'})
    with urllib.request.urlopen(req, timeout=120) as r:
        payload = json.load(r)
    return payload['properties']['parameter']


def month_hour_mean(series):
    """series: {YYYYMMDDHH: value} -> 12x24 mean matrix (skipping fill values)."""
    acc = defaultdict(float)
    cnt = defaultdict(int)
    for key, val in series.items():
        if val is None or val <= FILL:
            continue
        m = int(key[4:6]) - 1
        h = int(key[8:10])
        acc[(m, h)] += val
        cnt[(m, h)] += 1
    return [[round(acc[(m, h)] / cnt[(m, h)], 4) if cnt[(m, h)] else 0.0 for h in range(24)] for m in range(12)]


def wind_cf(v_hub):
    ci, rated, cutout = 3.0, 12.0, 25.0
    if v_hub < ci or v_hub >= cutout:
        return 0.0
    if v_hub >= rated:
        return 1.0
    return (v_hub ** 3 - ci ** 3) / (rated ** 3 - ci ** 3)


def annual_cf(shape):
    days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    tot = sum(shape[m][h] * days[m] for m in range(12) for h in range(24))
    return tot / sum(days) / 24


def bias_correct(shape, target_cf):
    """Scale the (real) shape so its annual CF matches the documented target,
    clipping cells at 1.0. Returns (corrected_shape, factor_applied)."""
    raw = annual_cf(shape)
    if raw <= 0:
        return shape, 1.0
    factor = target_cf / raw
    return [[round(min(1.0, c * factor), 4) for c in row] for row in shape], round(factor, 3)


def main():
    # --- Solar ---
    ghi = fetch_hourly(SOLAR_NODE['lat'], SOLAR_NODE['lon'], ['ALLSKY_SFC_SW_DWN'])
    ghi_mh = month_hour_mean(ghi['ALLSKY_SFC_SW_DWN'])
    solar_raw = [[round(min(1.0, g / 1000.0) * PERFORMANCE_RATIO, 4) for g in row] for row in ghi_mh]
    solar_shape, solar_factor = bias_correct(solar_raw, TARGET_SOLAR_CF)

    # --- Wind ---
    ws = fetch_hourly(WIND_NODE['lat'], WIND_NODE['lon'], ['WS50M'])
    ws_mh = month_hour_mean(ws['WS50M'])
    wind_raw = [[round(wind_cf(v * HUB_SHEAR), 4) for v in row] for row in ws_mh]
    wind_shape, wind_factor = bias_correct(wind_raw, TARGET_WIND_CF)

    src = f'NASA POWER (MERRA-2/CERES), año {YEAR}'
    write_json(os.path.join(DATA, 'solar_profile.json'), {'shape': solar_shape},
               source=f'{src} — {SOLAR_NODE["name"]}', source_date=str(YEAR),
               reliability='approx', node=SOLAR_NODE, annual_cf=round(annual_cf(solar_shape), 3),
               bias_correction=solar_factor, note='Forma real NASA POWER; nivel calibrado a CF de flota.')
    write_json(os.path.join(DATA, 'wind_profile.json'), {'shape': wind_shape},
               source=f'{src} — {WIND_NODE["name"]}', source_date=str(YEAR),
               reliability='approx', node=WIND_NODE, annual_cf=round(annual_cf(wind_shape), 3),
               bias_correction=wind_factor, note='Forma real NASA POWER; nivel calibrado a CF de flota.')

    print(f'solar profile: annual CF ~{annual_cf(solar_shape):.3f} (x{solar_factor} bias) — {SOLAR_NODE["name"]}')
    print(f'wind  profile: annual CF ~{annual_cf(wind_shape):.3f} (x{wind_factor} bias) — {WIND_NODE["name"]}')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # noqa: BLE001 — pipeline must fall back to seed, not crash
        print(f'fetch_nasa_power FAILED: {e}', file=sys.stderr)
        sys.exit(1)

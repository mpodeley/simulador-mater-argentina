#!/usr/bin/env python3
"""Data pipeline orchestrator (Fase 4).

Order matters:
  1. build_seed_data — always regenerate the curated baseline so every required
     file exists (this is the fallback if a live fetch fails).
  2. best-effort real overlays that OVERWRITE specific files with real data:
       - fetch_nasa_power  -> solar_profile.json, wind_profile.json
       - fetch_coes        -> marginal_cost_history.json (+ demand/mix if available)
     A fetcher that fails (network, source down, blocked) logs a warning and
     leaves the curated file in place — the build never breaks on a bad source.
  3. validate that every required output exists and is non-empty.

Run: python scripts/build_data.py   (or npm run seed for step 1 only)
"""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'public', 'data')

REQUIRED = [
    'fleet.json', 'demand_profile.json', 'solar_profile.json', 'wind_profile.json',
    'hydrology_scenarios.json', 'marginal_cost_history.json', 'generation_mix.json',
    'mater_results.json', 'renovar_prices.json', 'curtailment_nodes.json', 'fx.json',
    'sources.json',
]

# Best-effort fetchers (script, human label). Failure is non-fatal.
FETCHERS = [
    ('fetch_nasa_power.py', 'NASA POWER (solar/eólica, nodos AR)'),
    ('fetch_cammesa_demanda.py', 'CAMMESA (snapshot SADI en vivo)'),
]


def run_optional(script, label):
    path = os.path.join(HERE, script)
    if not os.path.exists(path):
        print(f'SKIP  {label}: {script} no existe todavía')
        return False
    print(f'FETCH {label} …')
    r = subprocess.run([sys.executable, path])
    if r.returncode == 0:
        print(f'OK    {label}')
        return True
    print(f'WARN  {label} falló (rc={r.returncode}) — se mantiene el dato curado')
    return False


def main():
    # 1. curated baseline (required, in-process)
    print('SEED  datos curados (baseline) …')
    import build_seed_data
    build_seed_data.main()

    # 2. best-effort real overlays
    for script, label in FETCHERS:
        run_optional(script, label)

    # 3. validate required outputs
    missing = []
    for f in REQUIRED:
        p = os.path.join(DATA, f)
        if not os.path.exists(p) or os.path.getsize(p) < 2:
            missing.append(f)
    if missing:
        sys.exit(f'ERROR: faltan datos requeridos: {missing}')
    print(f'\nPipeline OK — {len(REQUIRED)} datasets en {os.path.normpath(DATA)}')


if __name__ == '__main__':
    main()

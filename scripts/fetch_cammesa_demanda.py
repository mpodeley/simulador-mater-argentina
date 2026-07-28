#!/usr/bin/env python3
"""Fetch the current SADI snapshot from CAMMESA's public demanda-svc API and write
public/data/sadi_snapshot.json (real demand + generation mix by source, now).

CAMMESA `demanda-svc` is CORS-open JSON but only exposes the CURRENT day (5-min
cadence), not history — so this is a live snapshot for context, not the 12x24
profile (which stays curated until the Síntesis-Mensual pipeline, Fase 5).
Endpoints (GET, id_region=1002 = Total SADI):
  /demanda-svc/demanda/ObtieneDemandaYTemperaturaRegion    -> demHoy (MW), tempHoy
  /demanda-svc/generacion/ObtieneGeneracioEnergiaPorRegion -> hidraulico/termico/
      nuclear/renovable/importacion (MW), sumTotal

Best-effort: on any failure exit 1 (the snapshot is optional). Std-lib only.
"""

import json
import os
import sys
import urllib.request

from _meta import wrap

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'public', 'data')
OUT = os.path.join(DATA, 'sadi_snapshot.json')
BASE = 'https://api.cammesa.com/demanda-svc'


def get(path):
    req = urllib.request.Request(BASE + path, headers={'User-Agent': 'sim-mater-ar/1.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    dem = get('/demanda/ObtieneDemandaYTemperaturaRegion?id_region=1002')
    gen = get('/generacion/ObtieneGeneracioEnergiaPorRegion?id_region=1002')

    # Latest point with actual (not forecast) values.
    dpt = next((r for r in reversed(dem) if r.get('demHoy')), None)
    gpt = next((r for r in reversed(gen) if r.get('sumTotal')), None)
    if not dpt or not gpt:
        print('sadi snapshot: no live values', file=sys.stderr)
        sys.exit(1)

    snapshot = {
        'as_of': gpt['fecha'],
        'demand_mw': round(dpt['demHoy']),
        'temp_c': dpt.get('tempHoy'),
        'total_mw': round(gpt['sumTotal']),
        'mix_mw': {
            'hidraulico': round(gpt.get('hidraulico', 0)),
            'termico': round(gpt.get('termico', 0)),
            'nuclear': round(gpt.get('nuclear', 0)),
            'renovable': round(gpt.get('renovable', 0)),
            'importacion': round(gpt.get('importacion', 0)),
        },
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(wrap(snapshot, source='CAMMESA demanda-svc (en vivo)', source_date=gpt['fecha'][:10],
                       reliability='verified'), f, ensure_ascii=False, indent=2)
    print(f'sadi snapshot: {snapshot["demand_mw"]} MW, mix {snapshot["mix_mw"]}')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(f'fetch_cammesa_demanda FAILED: {e}', file=sys.stderr)
        sys.exit(1)

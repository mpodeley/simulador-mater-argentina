# simulador-subastas-peru

Simulador de **precio de oferta** para subastas del mercado eléctrico peruano (SEIN).
Dado un escenario (hidrología, demanda, precio del gas, recurso solar/eólico, nueva capacidad),
modela el **costo marginal** por orden de mérito y evalúa qué precio conviene ofertar y con qué riesgo.

App estática (React + TypeScript + Vite) pensada para **GitHub Pages**. Sin backend: los datos son
JSON curados en `public/data/`, y el motor de despacho + Monte Carlo corre en el browser.

Repo hermano de `estado-del-sistema` / `gasoductos` — mismo stack y convenciones.

## Comandos

```bash
npm install
npm run dev          # servidor de desarrollo (Vite)
npm run typecheck    # tsc --noEmit
npm test             # tests del engine (vitest)
npm run build        # tsc + vite build -> dist/
npm run seed         # regenera public/data/*.json (Python)
```

## Estructura

- `src/engine/` — motor puro y testeable: `fleet`, `dispatch` (orden de mérito → CMg),
  `weather` (perfiles de recurso), `scenarios` (assumptions deterministas),
  `bid` (evaluación de oferta: contrato K vs spot → margen / NPV / break-even),
  `montecarlo` (distribución de riesgo, en Web Worker).
- `src/components/` — páginas (Escenario, Simulador de oferta, Riesgo, Datos, Metodología) y charts.
- `src/hooks/useData.ts` — `useJson<T>()` que desenvuelve el envelope `{generated_at, source, data}`.
- `scripts/build_seed_data.py` — arma los JSON curados con el envelope estándar.
- `public/data/*.json` — datasets curados (parque, CMg histórico, mix, subastas, perfiles, hidrología).

## Datos

v1 usa datos **curados** commiteados al repo. El pipeline automático (COES / SENAMHI) es Fase 4.

⚠ **Caveat**: cifras de "subastas renovables post-2016" que circulan online son poco confiables.
Solo se curan cifras verificadas (Osinergmin/ESAN/Climatescope), marcadas con su nivel de confiabilidad.

## Metodología (resumen)

Modelo *fundamental* de orden de mérito (copperplate, sin unit commitment ni red): por hora,
`residual = demanda − renovables − hidro_must_run`; se apilan las térmicas por costo variable y la
**unidad marginal fija el costo marginal (SMP)**. La oferta se evalúa con la P&L unificada por hora
`gen·(SMP − costo_var) + volumen·(K − SMP)`, con presets de liquidación
`merchant | cfd | prima_rer | firme_28832`.

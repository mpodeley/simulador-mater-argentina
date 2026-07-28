# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this repo is

Static **PPA bid-price simulator** for the Argentine wholesale electricity market (SADI/MEM), deployed to
GitHub Pages. Helps a renewable generator decide **what price to offer in a MATER PPA** to a Gran Usuario.
No backend: curated JSON in `public/data/`, and a pure-TypeScript engine (merit-order dispatch + Monte Carlo)
runs in the browser. Cloned from `simulador-subastas-peru`; sibling of `estado-del-sistema` (whose CAMMESA
fetchers this repo reuses). Same stack (Vite + React 19 + TS + Recharts, `base: "./"`). UI Spanish; code English.

Live (once deployed): https://mpodeley.github.io/simulador-mater-argentina/

## Domain (Argentina 2026)

- Operator CAMMESA runs quarterly MATER dispatch-priority auctions; Secretaría de Energía sets the rules.
- **Res. SE 400/2025 (in force 1-Nov-2025)** restored marginal-cost/spot pricing (Generación al Spot) plus
  reliability payments (USD 1,000/MW-month base; USD 9,000/MW-month for new firm capacity in critical nodes).
- **MATER** is the live arena: private USD PPAs with Grandes Usuarios, price/term freely negotiated, **cap
  USD 113/MWh, typical 60-70**. **Curtailment/congestion is THE dominant price driver** (record 91,580 MWh in
  Mar-2026; Cuyo leads). "Referencial A" priority admits up to ~8% curtailment. RenovAr is dormant (reference).
- Mix ~2025 (~42.9 GW): thermal ~59% (gas/Vaca Muerta), large hydro ~22%, nuclear ~4%, wind+solar ~15%.
  Monómico ~64.6 USD/MWh (Feb-2026).

## Architecture

- `src/engine/` — framework-free, unit-tested core (cloned from Peru):
  - `fleet.ts` — var-cost helper (gas var cost = gasPrice × heatRate).
  - `dispatch.ts` — merit order: build the hourly supply stack, marginal unit sets SMP.
  - `scenarios.ts` — deterministic scenario → per-(month,hour) SMP over a representative year (12×24).
  - `bid.ts` — evaluate a contract: unified per-hour P&L `gen·(SMP − varCost) + vol·(K − SMP)`, with
    **curtailment** (`gen ×= 1 − curtailmentPct/100`) and a **reliability payment** term; NPV + break-even K*.
    Settlement presets: `merchant | cfd | mater_ppa | spot_marginalista | renovar_ppa`.
  - `montecarlo.ts` — samples hydrology/gas/demand **+ curtailment** → NPV distribution (P50/P90/VaR/P(loss)),
    risk-vs-price curve. Runs in a Web Worker.
  - (No `weather.ts` — resource resolution is inline in `dispatch.ts`/`bid.ts`.)
- `src/hooks/useData.ts` — `useJson<T>()` unwraps the `{generated_at, source, source_date, data}` envelope.
- `scripts/_meta.py` + `scripts/build_seed_data.py` — write curated JSON. `build_data.py` orchestrates
  best-effort real overlays (fall back to curated seed on failure).

## Data

v1 = curated seed + real overlays reusing CAMMESA. Real (best-effort): CAMMESA `demanda-svc` (demand +
generation-by-technology by region, CORS-open JSON, GET only), NASA POWER (AR solar/wind nodes), FX (dolarapi).
Pipeline-only (Fase 5): costo marginal/monómico (Síntesis Mensual), MATER results, curtailment report.
Reuse `estado-del-sistema/scripts/{fetch_cammesa_ppo,fetch_cammesa,parse_cammesa,fetch_weather,fetch_megsa}.py`.

## Time granularity

Representative year = **12 months × 24 hours = 288 timesteps**, weighted by days-in-month. Energy for a
rep-hour = `MW × days_in_month` MWh/yr. Don't switch to 8760 without updating weights everywhere.

## Conventions

- UI Spanish; code English. No inline hex — `theme.ts` tokens; tech colors in `techColors`.
- Every dataset JSON carries the metadata envelope; freshness badges read `generated_at`.
- Reliability matters: keep a `reliability` flag through to the UI; several AR figures (curtailment, MATER
  prices) should be confirmed against CAMMESA's Síntesis Mensual before treating as verified.
- Keep the model as simple as the data justifies (copperplate merit-order; curtailment enters exogenously
  per node, not via network flow).

## Plan

Implementation plan: `~/.claude/plans/serene-shimmying-sundae.md`.
Phases: 0 scaffold · 1 engine (AR domain) · 2 curated data · 3 UI · 4 real overlays (CAMMESA) · 5 pipeline stretch · 6 validation.

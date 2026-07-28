// Web Worker wrapper for the Monte Carlo engine — keeps the ~800-path run off the
// UI thread. The heavy loop is embarrassingly parallel per draw; a single worker
// already keeps the interface responsive at this scale.

import { runMonteCarlo, type MCOptions, type MCResult } from './montecarlo'
import type { Contract } from './bid'
import type { Scenario } from './scenarios'
import type { MarketData } from './types'

export interface MCRequest {
  data: MarketData
  scenario: Scenario
  contract: Contract
  opts: MCOptions
}

export type MCMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'result'; result: MCResult }

const ctx = self as unknown as Worker

ctx.onmessage = (e: MessageEvent<MCRequest>) => {
  const { data, scenario, contract, opts } = e.data
  const result = runMonteCarlo(data, scenario, contract, opts, (fraction) =>
    ctx.postMessage({ type: 'progress', fraction } satisfies MCMessage),
  )
  ctx.postMessage({ type: 'result', result } satisfies MCMessage)
}

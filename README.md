# @lp-labs/simulation-engine

Deterministic, bounded **synchronous discrete-event simulation**. Original implementation,
independent of other packages; zero runtime or peer dependencies. Node >=18. Version 0.1.0.

```sh
npm install @lp-labs/simulation-engine
```

## Runnable example

```js
import { createSimulation, createRandom } from '@lp-labs/simulation-engine';

const simulation = createSimulation({ maxPending: 100, maxEventsPerRun: 1000 });
const random = createRandom(179);
const observed = [];
simulation.schedule(1, () => observed.push(random()), -1);
simulation.schedule(1, () => observed.push(random()), 0);
const result = simulation.runUntil(2);
if (result.executed !== 2 || observed.length !== 2) throw new Error('Unexpected run');
console.log(result);
```

CommonJS: `const { createSimulation } = require('@lp-labs/simulation-engine');`.
Both entry points export the same runtime API and include corresponding declarations.

## API and types

- `createSimulation(options?: SimulationOptions): Simulation`. Options: finite
  `startTime` (default 0; negative times allowed), `maxPending` (default 10,000,
  range 1–100,000), `maxEventsPerRun` (default 100,000, range 1–1,000,000).
- `Simulation.now`: current numeric time. Units are caller-defined and must be consistent.
- `schedule(time, callback, priority = 0): number`: enqueue a synchronous callback
  without a receiver at a finite absolute time >= now. Lower finite priority goes first, followed by
  monotonically increasing ID at equal time/priority. Returns the event ID.
- `cancel(id): boolean`: remove a positive safe-integer ID; false if absent or consumed.
- `pending(): EventInfo[]`: isolated ordered snapshots containing `id`, `time`, `priority`.
- `runUntil(time): RunResult`: executes events with time <= target, including events
  added by callbacks. On success advances to target and returns `executed`, `now`,
  `pending`. A newly added same-time lower-priority event precedes remaining work,
  but cannot preempt a running callback. Cancellation takes effect immediately.
- `createRandom(seed): () => number`: reproducible Mulberry32 stream for uint32 seeds,
  including zero; returns numbers in [0,1). Arithmetic uses uint32 state increments
  of `0x6d2b79f5`. No global randomness, entropy, cryptographic or statistical guarantee.
- `SimulationCallbackError extends Error`: runtime export with `name`, isolated
  `event: EventInfo`, and original `cause: unknown`. Wraps thrown callback errors,
  reentrant run attempts, and unsupported thenable returns.

Exported types: `SimulationOptions`, `EventInfo`, `RunResult`, `Simulation`.
Callbacks use `() => void`; TypeScript permits async functions for that signature,
so runtime checks explicitly reject returned promises/thenables. Returned native
promise rejections are consumed; arbitrary thenables are not invoked. Already
started asynchronous effects cannot be cancelled by this library.

## Errors, customization and limits

Invalid numeric types/nonfinite times or priorities and nonfunctions throw
`TypeError`; invalid seeds/capacities/IDs, past scheduling/backwards advancement,
pending capacity and ID exhaustion throw `RangeError`. Direct reentrant `runUntil`
throws `Error`. All input/capacity checks happen before insertion or advancement.

Execution is deliberately not transactional. A failed callback is consumed; its
time remains current, already performed effects and enqueued events remain.
`SimulationCallbackError` stops the run without advancing to the target. A run-budget
`RangeError` likewise preserves completed work and the next pending event; subsequent
runs are permitted. The per-run budget stops self-scheduling zero-time loops,
not a callback that never returns.

Customize priority, time units, budgets, and independent seeded streams. No wall clock,
workers, promises, resource queues, persistence, rollback, or full scheduler claim.
Queue storage is O(P), each event selection sorts O(P log P), giving O(E P log P)
worst-case run cost. User callback memory/time is outside these bounds. Configuration
and callbacks must be trusted; this is not an isolation boundary.

Related design context: virtual-time's explicit advancement, performance-budgets'
bounded inputs, incremental-aggregation's snapshots, unit-system's explicit units.
No code or imports are shared.

## Development

`npm run build`, `npm run typecheck`, `npm test`, `npm run format`, and
`npm run format:check`. TypeScript ^5.9.3 and Prettier ^3.6.2 are dev-only.
Strict TypeScript builds ESM/CommonJS and declarations. Tests cover seeded ordering
oracles, scheduling/cancellation races, reproducibility, failure state, and bounds.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.

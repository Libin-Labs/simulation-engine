export interface SimulationOptions {
  startTime?: number;
  maxPending?: number;
  maxEventsPerRun?: number;
}
export interface EventInfo {
  id: number;
  time: number;
  priority: number;
}
export interface RunResult {
  executed: number;
  now: number;
  pending: number;
}
export interface Simulation {
  readonly now: number;
  schedule(time: number, callback: () => void, priority?: number): number;
  cancel(id: number): boolean;
  pending(): EventInfo[];
  runUntil(time: number): RunResult;
}
export class SimulationCallbackError extends Error {
  readonly event: EventInfo;
  constructor(event: EventInfo, cause: unknown) {
    super(`Simulation callback failed at event ${event.id}.`, { cause });
    this.name = 'SimulationCallbackError';
    this.event = { id: event.id, time: event.time, priority: event.priority };
  }
}
function finite(value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError('Time and priority must be finite numbers.');
}
function capacity(value: number, ceiling: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > ceiling)
    throw new RangeError(`Capacity must be between 1 and ${ceiling}.`);
  return value;
}
export function createRandom(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff)
    throw new RangeError('Seed must be a uint32.');
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}
export function createSimulation(options: SimulationOptions = {}): Simulation {
  let now = options.startTime ?? 0;
  finite(now);
  const maxPending = capacity(options.maxPending ?? 10_000, 100_000);
  const maxEvents = capacity(options.maxEventsPerRun ?? 100_000, 1_000_000);
  const events = new Map<number, EventInfo & { callback: () => void }>();
  let sequence = 0;
  let running = false;
  const ordered = () =>
    [...events.values()].sort((a, b) => a.time - b.time || a.priority - b.priority || a.id - b.id);
  return {
    get now() {
      return now;
    },
    schedule(time, callback, priority = 0) {
      finite(time);
      finite(priority);
      if (time < now) throw new RangeError('Cannot schedule in the past.');
      if (typeof callback !== 'function') throw new TypeError('Callback must be a function.');
      if (events.size >= maxPending || sequence === Number.MAX_SAFE_INTEGER)
        throw new RangeError('Event capacity or ID range exhausted.');
      const id = ++sequence;
      events.set(id, { id, time, priority, callback });
      return id;
    },
    cancel(id) {
      if (!Number.isSafeInteger(id) || id < 1) throw new RangeError('Invalid event ID.');
      return events.delete(id);
    },
    pending() {
      return ordered().map(({ id, time, priority }) => ({ id, time, priority }));
    },
    runUntil(time) {
      finite(time);
      if (time < now) throw new RangeError('Cannot run backwards.');
      if (running) throw new Error('Reentrant simulation run is not supported.');
      running = true;
      let executed = 0;
      try {
        for (;;) {
          const event = ordered()[0];
          if (!event || event.time > time) break;
          if (executed === maxEvents) throw new RangeError('Run event budget exhausted.');
          events.delete(event.id);
          now = event.time;
          executed++;
          try {
            const callback = event.callback;
            const result: unknown = callback();
            if (result instanceof Promise) void result.catch(() => {});
            if (
              result !== null &&
              (typeof result === 'object' || typeof result === 'function') &&
              typeof (result as { then?: unknown }).then === 'function'
            )
              throw new TypeError('Callbacks must be synchronous; thenables are unsupported.');
          } catch (cause) {
            throw new SimulationCallbackError(event, cause);
          }
        }
        now = time;
        return { executed, now, pending: events.size };
      } finally {
        running = false;
      }
    },
  };
}

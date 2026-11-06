import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createRandom, createSimulation, SimulationCallbackError } from '../dist/esm/index.js';
test('bare CommonJS consumer matches ESM runtime behavior and callback errors', () => {
  const cjs = createRequire(import.meta.url)('@lp-labs/simulation-engine');
  const sim = cjs.createSimulation();
  const random = cjs.createRandom(179),
    esmRandom = createRandom(179),
    seen = [];
  sim.schedule(1, () => seen.push(random()));
  sim.runUntil(1);
  assert.deepEqual(seen, [esmRandom()]);
  sim.schedule(1, () => {
    throw new Error('CJS');
  });
  assert.throws(() => sim.runUntil(1), cjs.SimulationCallbackError);
});

test('time, priority, insertion ordering matches a seeded sorted oracle', () => {
  const random = createRandom(179),
    sim = createSimulation(),
    oracle = [],
    actual = [];
  for (let id = 1; id <= 300; id++) {
    const time = Math.floor(random() * 20),
      priority = Math.floor(random() * 5);
    oracle.push({ id, time, priority });
    assert.equal(
      sim.schedule(time, () => actual.push(id), priority),
      id,
    );
  }
  oracle.sort((a, b) => a.time - b.time || a.priority - b.priority || a.id - b.id);
  assert.deepEqual(sim.runUntil(30), { executed: 300, now: 30, pending: 0 });
  assert.deepEqual(
    actual,
    oracle.map((event) => event.id),
  );
});
test('same-time callback scheduling and cancellation have deterministic race semantics', () => {
  const sim = createSimulation(),
    seen = [];
  sim.schedule(1, () => {
    seen.push('first');
    sim.cancel(second);
    sim.schedule(1, () => seen.push('new'), -1);
  });
  const second = sim.schedule(1, () => seen.push('cancelled'));
  sim.schedule(1, () => seen.push('third'));
  sim.runUntil(1);
  assert.deepEqual(seen, ['first', 'new', 'third']);
  assert.equal(sim.cancel(second), false);
});
test('seed zero is nondegenerate, reproducible, bounded, with fixed golden values', () => {
  const a = createRandom(0),
    b = createRandom(0);
  assert.equal(a(), 0.26642920868471265);
  assert.equal(b(), 0.26642920868471265);
  for (let i = 0; i < 1000; i++) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
  assert.throws(() => createRandom(-1), RangeError);
  assert.throws(() => createRandom(2 ** 32), RangeError);
});
test('pending capacity failures do not consume IDs or remove work', () => {
  const sim = createSimulation({ maxPending: 1 });
  assert.equal(
    sim.schedule(1, () => {}),
    1,
  );
  assert.throws(() => sim.schedule(2, () => {}), RangeError);
  sim.cancel(1);
  assert.equal(
    sim.schedule(2, () => {}),
    2,
  );
});
test('run budget bounds a self-scheduling loop and retains next event', () => {
  const sim = createSimulation({ maxEventsPerRun: 3 });
  const callback = () => sim.schedule(sim.now, callback);
  sim.schedule(0, callback);
  assert.throws(() => sim.runUntil(1), RangeError);
  assert.equal(sim.now, 0);
  assert.equal(sim.pending()[0].id, 4);
  sim.cancel(4);
  assert.equal(sim.runUntil(1).executed, 0);
});
test('callback error carries cause, removes failing event, retains effects and releases run guard', () => {
  const sim = createSimulation(),
    cause = new Error('boom');
  const id = sim.schedule(4, function () {
    assert.equal(this, undefined);
    sim.schedule(5, () => {});
    throw cause;
  });
  assert.throws(
    () => sim.runUntil(9),
    (error) =>
      error instanceof SimulationCallbackError && error.cause === cause && error.event.id === id,
  );
  assert.equal(sim.now, 4);
  assert.equal(sim.runUntil(9).executed, 1);
});
test('reentrant runs are callback errors and do not advance the clock', () => {
  const sim = createSimulation();
  sim.schedule(2, () => sim.runUntil(99));
  assert.throws(() => sim.runUntil(10), SimulationCallbackError);
  assert.equal(sim.now, 2);
  assert.equal(sim.runUntil(10).executed, 0);
});
test('async and thenable callbacks are explicitly rejected without unhandled rejection', async () => {
  const sim = createSimulation();
  sim.schedule(0, async () => {
    throw new Error('async');
  });
  assert.throws(() => sim.runUntil(1), SimulationCallbackError);
  sim.schedule(0, () => ({
    then() {
      throw new Error('must not be called');
    },
  }));
  assert.throws(() => sim.runUntil(1), SimulationCallbackError);
  await new Promise((resolve) => setImmediate(resolve));
});
test('validation rejects past, nonfinite, malformed callback, bounds and IDs', () => {
  const sim = createSimulation({ startTime: 2 });
  assert.throws(() => sim.schedule(1, () => {}), RangeError);
  assert.throws(() => sim.runUntil(1), RangeError);
  assert.throws(() => sim.schedule(Infinity, () => {}), TypeError);
  assert.throws(() => sim.schedule(2, null), TypeError);
  assert.throws(() => sim.schedule(2, () => {}, NaN), TypeError);
  assert.throws(() => sim.cancel(0), RangeError);
  assert.throws(() => createSimulation({ maxPending: 100001 }), RangeError);
  assert.throws(() => createSimulation({ maxEventsPerRun: 0 }), RangeError);
});
test('pending snapshots are isolated; future events are not executed early', () => {
  const sim = createSimulation();
  sim.schedule(10, () => {});
  const snapshot = sim.pending();
  snapshot[0].time = 0;
  snapshot.length = 0;
  assert.deepEqual(sim.runUntil(5), { executed: 0, now: 5, pending: 1 });
  assert.equal(sim.pending()[0].time, 10);
});

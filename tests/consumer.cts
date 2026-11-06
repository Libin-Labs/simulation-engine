import {
  createRandom,
  createSimulation,
  SimulationCallbackError,
  type SimulationOptions,
  type EventInfo,
  type RunResult,
  type Simulation,
} from '@lp-labs/simulation-engine';
const options: SimulationOptions = { startTime: 0, maxPending: 10, maxEventsPerRun: 100 };
const simulation: Simulation = createSimulation(options);
const id: number = simulation.schedule(1, () => {}, -1);
const pending: EventInfo[] = simulation.pending();
const result: RunResult = simulation.runUntil(1);
const random: () => number = createRandom(179);
const error: SimulationCallbackError = new SimulationCallbackError(pending[0]!, 'cause');
simulation.cancel(id);
// @ts-expect-error explicit numeric time
simulation.schedule('1', () => {});
// @ts-expect-error callback is required
simulation.schedule(1);
void [result, random, error];

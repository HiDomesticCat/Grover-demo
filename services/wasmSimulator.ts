/**
 * In-browser Grover simulator (Rust → WebAssembly).
 *
 * Replaces the former Python/Qiskit `/simulate` endpoint. Same request and
 * response shape, so the rest of the app is unchanged — but no server, no
 * network, no cold start.
 *
 * Source: `wasm/src/lib.rs`. Rebuild with `npm run build:wasm`.
 */
import init, {
  simulate as wasmSimulate,
  version as wasmVersion,
} from '../wasm/pkg/grover_sim.js';

export interface SimulationRequest {
  num_qubits: number;
  target_indices: number[];
  /** `-1` ⇒ optimal ⌊(π/4)√(N/M)⌋ iterations (backend default). */
  iterations?: number;
  /** Depolarizing error probability per gate (backend default 0.005). */
  noise_value?: number;
  /** Measurement samples per step (backend used 1024). */
  shots?: number;
  /** Average exact |ψ|² instead of sampling `shots` outcomes. */
  exact?: boolean;
  /** Multiplies the calibrated depolarizing rate; 1 = as calibrated. */
  noise_scale?: number;
  /** PRNG seed; omit for a fresh run each time. */
  seed?: number;
}

export interface SimulationSuccess {
  success: true;
  history: number[][];
  optimal_iterations: number;
  shots: number;
  noise_value: number;
  noise_model: string;
  engine: string;
}

export interface SimulationFailure {
  success: false;
  error: string;
  code: 'VALIDATION_ERROR' | 'SIMULATION_ERROR';
}

export type SimulationResponse = SimulationSuccess | SimulationFailure;

let ready: Promise<void> | null = null;

/** Load and instantiate the WASM module once. Safe to call repeatedly. */
export const initSimulator = (): Promise<void> => {
  if (!ready) {
    ready = init().then(() => {
      console.info(`[grover] simulator ready: ${wasmVersion()}`);
    });
    ready.catch(() => {
      ready = null; // allow a retry after a failed load
    });
  }
  return ready;
};

export const simulatorVersion = (): string => wasmVersion();

/**
 * Run the simulation. Heavy work happens synchronously inside WASM; a 10-qubit,
 * 25-iteration, 1024-shot run takes on the order of a hundred milliseconds.
 */
export const runSimulation = async (req: SimulationRequest): Promise<SimulationResponse> => {
  await initSimulator();
  try {
    const seed =
      req.seed ?? (Math.floor(Math.random() * 0xffffffff) >>> 0);
    const result = wasmSimulate(
      req.num_qubits,
      Uint32Array.from(req.target_indices),
      req.iterations ?? -1,
      req.noise_value ?? 0.005,
      req.shots ?? 1024,
      req.exact ?? false,
      req.noise_scale ?? 1.0,
      seed,
    ) as SimulationResponse | null;
    if (!result) {
      return { success: false, error: 'Simulator returned no result', code: 'SIMULATION_ERROR' };
    }
    return result;
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'SIMULATION_ERROR',
    };
  }
};

/* tslint:disable */
/* eslint-disable */

/**
 * ⌊(π/4)·√(N/M)⌋ for the UI.
 */
export function optimal_iterations_for(num_qubits: number, num_targets: number): number;

/**
 * Run a Grover simulation. Returns a plain JS object:
 * `{ success, history: number[][], optimal_iterations, shots, noise_value, noise_model, engine }`
 * or, on invalid input, `{ success: false, error, code }` (never throws).
 *
 * * `iterations` — pass `-1` for the optimal count.
 * * `shots` — measurement samples per step (0 ⇒ 1024).
 * * `exact` — average exact |ψ|² instead of sampling.
 * * `noise_scale` — multiplies the depolarizing rate (1.0 = calibrated).
 * * `seed` — PRNG seed; identical inputs + seed ⇒ identical output.
 */
export function simulate(num_qubits: number, target_indices: Uint32Array, iterations: number, noise_value: number, shots: number, exact: boolean, noise_scale: number, seed: number): any;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly optimal_iterations_for: (a: number, b: number) => number;
    readonly simulate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => any;
    readonly version: () => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Grover's Algorithm Visualizer

<p align="center">
  <strong>Interactive visualization of quantum search — with a noisy quantum simulator that runs entirely in your browser (Rust → WebAssembly)</strong>
</p>

<p align="center">
  <a href="#overview">Overview</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick start</a> •
  <a href="#usage">Usage</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#the-simulator">The simulator</a> •
  <a href="#deployment">Deployment</a>
</p>

</div>

## Overview

This project provides an interactive visualization of Grover's Algorithm — a quantum search algorithm that provides quadratic speedup for unstructured search. The visualizer shows superposition, phase inversion and amplitude amplification step by step, and can overlay a **noisy** simulation (depolarizing errors on every gate) against the ideal mathematics.

Everything is a static site. There is no server: the noisy simulator is a small Rust crate compiled to WebAssembly (35 KB) that runs in the page. A 10-qubit, 25-iteration, 1024-shot run finishes in about half a second.

### What is Grover's Algorithm?

Grover's algorithm finds an element in an unsorted database in O(√N) time, compared to O(N) classically:

1. **Initialization** — equal superposition of all states
2. **Oracle** — mark target states by inverting their phase
3. **Diffusion** — amplify target amplitudes by reflecting about the mean
4. **Measurement** — the highest-probability states are the search targets

## Features

- 🔍 **Interactive state selection** — choose the target states to search for
- 🔄 **Step-by-step visualization** — watch amplitude amplification over iterations
- 📊 **Multiple views** — amplitude chart, probability graph, geometric representation
- 🧪 **Noisy quantum simulation, in the browser** — quantum-trajectory depolarizing noise calibrated against Qiskit Aer; toggle it on and compare with the ideal curve
- 🧮 **Optimal-iteration finder** — explore how ⌊(π/4)√(N/M)⌋ behaves for different N and M
- 📱 **Responsive design** — desktop and tablets

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

That is the whole setup. The WebAssembly simulator is pre-built and committed in `wasm/pkg/`, so you do not need Rust to run or deploy the app.

### Rebuilding the simulator (optional)

Only needed if you change `wasm/src/lib.rs`.

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
npm run test:wasm    # native unit tests
npm run build:wasm   # → wasm/pkg  (commit the result)
```

## Usage

1. **Select state count** — number of qubits (or an arbitrary state count in custom mode)
2. **Create superposition** — start from the uniform superposition
3. **Select target states** — click bars to mark them
4. **Run / Step** — continuous iterations or one at a time
5. **Noise** — enable *Use quantum simulator* to run with depolarizing noise, and drag the noise slider. The ideal (noise-free) curve is drawn alongside for comparison.

Try 8 qubits with noise 0.005: the multi-controlled gates in each iteration decompose into hundreds of CX gates, and the algorithm collapses to a uniform distribution — exactly the behaviour a real NISQ device (and Qiskit Aer) shows.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Browser                                                 │
│                                                          │
│   React / TypeScript UI ──┬──► utils/quantum.ts          │
│   (Vite, Recharts)        │    exact ideal evolution     │
│                           │                              │
│                           └──► wasm/pkg/grover_sim.wasm  │
│                                noisy trajectory sim      │
│                                (Rust, 35 KB)             │
└──────────────────────────────────────────────────────────┘
```

- **`utils/quantum.ts`** — exact state-vector Grover in TypeScript, used for the ideal visualisation.
- **`wasm/src/lib.rs`** — the noisy simulator (see below). Exposed to JS via `wasm-bindgen`; `services/wasmSimulator.ts` is the thin typed wrapper the app calls.
- **No backend.** The former Python/Qiskit service has been retired; the WASM module implements the same `/simulate` contract (`{num_qubits, target_indices, iterations, noise_value}` → `{history, optimal_iterations}`), so the rest of the app did not change.

## The simulator

`wasm/src/lib.rs` is deliberately small and readable — it is also meant as a worked example of numerical code in WebAssembly.

- **Ideal evolution** is exact: the oracle is a diagonal phase flip on the marked indices and the diffusion operator is `2|s⟩⟨s| − I`, both applied in O(2ⁿ) without gate decomposition.
- **Noise** uses the **quantum-trajectory** (Monte-Carlo wavefunction) method. Each shot is an independent state-vector trajectory; after every layer (initial Hadamards, each oracle, each diffusion) every qubit suffers a random Pauli error with probability `1 − (1 − ¾p)^g`, where `p` is the depolarizing parameter and `g` the number of noisy gates touching that qubit in the layer. `¾p` is the per-gate Pauli-error probability of Qiskit's `depolarizing_error(p)`.
- **Gate counts** follow the structure of the original Qiskit circuit (X-conjugated `mcx` oracle, `H·X·mcx·X·H` diffusion), with `mcx` CX counts approximating Qiskit's ancilla-free decompositions (1, 6, 14, 36 for 1–4 controls, ≈2ᵏ beyond). A single calibration constant was fitted against recorded Aer runs; on the reference cases P(target) agrees with Aer to within its own 1024-shot sampling error.
- **Sampling** mirrors the old backend: each step's distribution is estimated from 1024 virtual measurements (one per trajectory, non-collapsing). An `exact` flag averages |ψ|² instead.
- **Deterministic** given a seed; no JS entropy or `rand` dependency.

```ts
import { runSimulation } from './services/wasmSimulator';
const r = await runSimulation({ num_qubits: 4, target_indices: [3], noise_value: 0.02 });
// r.history[step][basisIndex] — probability after `step` Grover iterations
```

## Deployment

The site is static. `.github/workflows/pages.yml` builds with `npm run build` and publishes `dist/` to **GitHub Pages** on every push to `main` (enable *Settings → Pages → Source: GitHub Actions* once). `vite.config.ts` uses a relative `base`, so the same build works on `https://<user>.github.io/<repo>/` and on a custom domain.

## Development

```bash
npm run dev          # Vite dev server
npm run build        # production build → dist/
npm run preview      # serve dist/ locally
npm run build:wasm   # rebuild the Rust simulator → wasm/pkg
npm run test:wasm    # cargo test
npm run lint         # ESLint
npm run format       # Prettier
```

## License

MIT.

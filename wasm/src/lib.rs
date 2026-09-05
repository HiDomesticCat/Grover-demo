//! Grover's algorithm simulator compiled to WebAssembly.
//!
//! Drop-in replacement for the former FastAPI `/simulate` endpoint
//! (`backend/main.py`), so the visualizer runs entirely in the browser.
//!
//! # What it computes
//!
//! * **Ideal evolution** — an exact state-vector simulation. The oracle is a
//!   diagonal phase flip on the target indices; the diffusion operator is
//!   `2|s><s| - I`. Both are applied exactly in `O(2^n)`, so there is no
//!   gate-by-gate decomposition error.
//! * **Noise** — the *quantum-trajectory* (Monte-Carlo wavefunction) method.
//!   Every shot is an independent state-vector trajectory. After each layer
//!   (initial H layer, every oracle, every diffusion) each qubit suffers a
//!   random Pauli error (X, Y or Z, uniformly) with probability
//!   `p_layer(q) = 1 - (1 - 0.75·p)^{g_q}`, where `g_q` is the number of noisy
//!   gates that touch qubit `q` in that layer and `0.75·p` is the per-gate Pauli
//!   error probability of Qiskit's `depolarizing_error(p)` (the channel
//!   `(1-p)ρ + p·I/2` equals `(1-¾p)ρ + ¼p(XρX+YρY+ZρZ)`; for the 2-qubit
//!   channel the single-qubit marginal is also `¾p`).
//! * **Gate counts** `g_q` follow the structure of the original Qiskit circuit
//!   (X-conjugated `mcx` for the oracle, `H·X·mcx·X·H` for diffusion) with the
//!   `mcx` CX-count approximating Qiskit's ancilla-free decompositions
//!   (1, 6, 14, 36 CX for 1–4 controls; ≈2^k for k ≥ 5, gray-code). This is
//!   what makes 8–10-qubit runs collapse to uniform at p = 0.005, exactly as
//!   the Aer backend did. `noise_scale` lets you re-calibrate the model.
//! * **Sampling** — like the backend, each step's distribution is estimated
//!   from `shots` measurement outcomes (default 1024), one per trajectory,
//!   using a *virtual* measurement that does not collapse the trajectory.
//!   Pass `exact = true` to average the exact |ψ|² over trajectories instead
//!   (lower variance; for `noise = 0` a single trajectory is then sufficient).
//!
//! Bit convention: basis index `i` has qubit `k` equal to bit `k` of `i`
//! (little-endian, identical to Qiskit's integer interpretation of its
//! bitstrings and to `utils/quantum.ts`).

use serde::Serialize;
use wasm_bindgen::prelude::*;

pub const MAX_QUBITS: usize = 14;
pub const MAX_ITERATIONS: usize = 1000;
pub const MAX_SHOTS: usize = 65_536;

// ---------------------------------------------------------------------------
// PRNG — SplitMix64 seeding a xoshiro256** generator. No external crates, no
// JS entropy dependency, deterministic from `seed`.
// ---------------------------------------------------------------------------

struct Rng([u64; 4]);

impl Rng {
    fn new(seed: u64) -> Self {
        let mut s = seed;
        let mut next = || {
            s = s.wrapping_add(0x9E37_79B9_7F4A_7C15);
            let mut z = s;
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
            z ^ (z >> 31)
        };
        Rng([next(), next(), next(), next()])
    }

    #[inline]
    fn next_u64(&mut self) -> u64 {
        let s = &mut self.0;
        let result = s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = s[1] << 17;
        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = s[3].rotate_left(45);
        result
    }

    /// Uniform in [0, 1).
    #[inline]
    fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Uniform integer in 0..n.
    #[inline]
    fn below(&mut self, n: u64) -> u64 {
        // Rejection-free for our tiny n (n = 3); bias is negligible.
        self.next_u64() % n
    }
}

// ---------------------------------------------------------------------------
// State vector: split real / imaginary arrays (cache friendly, SIMD friendly).
// ---------------------------------------------------------------------------

struct State {
    n: usize,
    re: Vec<f64>,
    im: Vec<f64>,
}

impl State {
    fn dim(&self) -> usize {
        1 << self.n
    }

    /// |s> = H^{⊗n}|0…0> — uniform superposition.
    fn uniform(n: usize) -> Self {
        let dim = 1usize << n;
        let a = 1.0 / (dim as f64).sqrt();
        State {
            n,
            re: vec![a; dim],
            im: vec![0.0; dim],
        }
    }

    /// Oracle: phase flip on the marked indices.
    #[inline]
    fn apply_oracle(&mut self, targets: &[usize]) {
        for &t in targets {
            self.re[t] = -self.re[t];
            self.im[t] = -self.im[t];
        }
    }

    /// Diffusion: 2|s><s| - I  ⇒  a_i ← 2·mean(a) - a_i.
    #[inline]
    fn apply_diffusion(&mut self) {
        let inv = 1.0 / self.dim() as f64;
        let mean_re: f64 = self.re.iter().sum::<f64>() * inv;
        let mean_im: f64 = self.im.iter().sum::<f64>() * inv;
        let (mr2, mi2) = (2.0 * mean_re, 2.0 * mean_im);
        for (r, i) in self.re.iter_mut().zip(self.im.iter_mut()) {
            *r = mr2 - *r;
            *i = mi2 - *i;
        }
    }

    #[inline]
    fn apply_x(&mut self, q: usize) {
        let bit = 1usize << q;
        for i in 0..self.dim() {
            if i & bit == 0 {
                let j = i | bit;
                self.re.swap(i, j);
                self.im.swap(i, j);
            }
        }
    }

    #[inline]
    fn apply_z(&mut self, q: usize) {
        let bit = 1usize << q;
        for i in 0..self.dim() {
            if i & bit != 0 {
                self.re[i] = -self.re[i];
                self.im[i] = -self.im[i];
            }
        }
    }

    /// Y|0> = i|1>,  Y|1> = -i|0>.
    #[inline]
    fn apply_y(&mut self, q: usize) {
        let bit = 1usize << q;
        for i0 in 0..self.dim() {
            if i0 & bit == 0 {
                let i1 = i0 | bit;
                let (r0, m0) = (self.re[i0], self.im[i0]);
                let (r1, m1) = (self.re[i1], self.im[i1]);
                // new[i1] = i · old[i0]   → (r0 + i m0)·i = -m0 + i r0
                self.re[i1] = -m0;
                self.im[i1] = r0;
                // new[i0] = -i · old[i1]  → (r1 + i m1)·(-i) = m1 - i r1
                self.re[i0] = m1;
                self.im[i0] = -r1;
            }
        }
    }

    /// Per-qubit depolarizing (Pauli-twirled) errors after a layer.
    fn apply_layer_noise(&mut self, p_layer: &[f64], rng: &mut Rng) {
        for q in 0..self.n {
            let p = p_layer[q];
            if p > 0.0 && rng.next_f64() < p {
                match rng.below(3) {
                    0 => self.apply_x(q),
                    1 => self.apply_y(q),
                    _ => self.apply_z(q),
                }
            }
        }
    }

    /// Exact probabilities |ψ_i|².
    #[inline]
    fn probs_into(&self, out: &mut [f64]) {
        for i in 0..self.dim() {
            out[i] = self.re[i] * self.re[i] + self.im[i] * self.im[i];
        }
    }

    /// Virtual measurement: sample one basis index from |ψ|² without collapsing.
    #[inline]
    fn sample(&self, rng: &mut Rng) -> usize {
        let u = rng.next_f64();
        let mut acc = 0.0;
        let last = self.dim() - 1;
        for i in 0..last {
            acc += self.re[i] * self.re[i] + self.im[i] * self.im[i];
            if u < acc {
                return i;
            }
        }
        last // absorbs floating-point rounding at the top of the CDF
    }
}

// ---------------------------------------------------------------------------
// Noise model — gate-count estimate of the original Qiskit circuit.
// ---------------------------------------------------------------------------

/// Approximate CX count of Qiskit's ancilla-free `mcx` with `k` controls.
fn mcx_cx_count(k: usize) -> f64 {
    match k {
        0 => 0.0,
        1 => 1.0,
        2 => 6.0,
        3 => 14.0,
        4 => 36.0,
        k => (1u64 << k) as f64, // gray-code decomposition, ≈2^k
    }
}

/// Empirical calibration of the gate-count model against Qiskit Aer runs of the
/// original backend (3–5 qubits, p = 0.005–0.02). Without it the trajectory
/// model is ~30 % too pessimistic on shallow circuits; deep circuits (≥ 8
/// qubits) collapse to uniform either way, exactly as Aer does.
const AER_CALIBRATION: f64 = 0.7;

/// Per-qubit expected number of noisy gate "touches" for each layer type.
/// Returns (init_layer, oracle_layer, diffusion_layer), each `n` long.
fn gate_touches(n: usize, targets: &[usize]) -> (Vec<f64>, Vec<f64>, Vec<f64>) {
    let nf = n as f64;
    let k = n.saturating_sub(1); // controls of the mcx
    let cx = mcx_cx_count(k);
    // A CX touches two qubits; the decomposition also emits roughly as many
    // single-qubit rotations as CXs. Spread both evenly over the register.
    let mcx_per_qubit = AER_CALIBRATION * (2.0 * cx + cx) / nf;

    let init = vec![1.0; n]; // one H per qubit

    // Oracle: for every target, X on the zero-bits before and after, H·mcx·H on
    // the last qubit.
    let mut oracle = vec![0.0; n];
    for &t in targets {
        for q in 0..n {
            if (t >> q) & 1 == 0 {
                oracle[q] += 2.0;
            }
            oracle[q] += mcx_per_qubit;
        }
        if n >= 3 {
            oracle[n - 1] += 2.0;
        }
    }

    // Diffusion: H^n, X^n, H·mcx·H on last, X^n, H^n.
    let mut diffusion = vec![4.0 + mcx_per_qubit; n];
    if n >= 2 {
        diffusion[n - 1] += 2.0;
    }

    (init, oracle, diffusion)
}

/// Convert gate touches into a per-layer Pauli-error probability per qubit.
fn layer_probs(touches: &[f64], p_gate: f64) -> Vec<f64> {
    touches
        .iter()
        .map(|&g| 1.0 - (1.0 - p_gate).powf(g))
        .collect()
}

// ---------------------------------------------------------------------------
// Public simulation
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct SimulationResult {
    pub success: bool,
    /// `history[step][basis_index]` — probability distribution after `step`
    /// Grover iterations (`history[0]` is the uniform superposition).
    pub history: Vec<Vec<f64>>,
    pub optimal_iterations: usize,
    pub shots: usize,
    pub noise_value: f64,
    pub noise_model: &'static str,
    pub engine: &'static str,
}

#[derive(Serialize)]
struct SimulationError {
    success: bool,
    error: String,
    code: &'static str,
}

/// Grover's optimal iteration count, ⌊(π/4)·√(N/M)⌋ — same formula as the
/// former backend.
pub fn optimal_iterations(num_qubits: usize, num_targets: usize) -> usize {
    let n = (1usize << num_qubits) as f64;
    let m = num_targets.max(1) as f64;
    ((std::f64::consts::PI / 4.0) * (n / m).sqrt()).floor() as usize
}

pub struct Params<'a> {
    pub num_qubits: usize,
    pub target_indices: &'a [usize],
    /// `< 0` ⇒ use the optimal count.
    pub iterations: i64,
    pub noise_value: f64,
    pub noise_scale: f64,
    pub shots: usize,
    pub exact: bool,
    pub seed: u64,
}

pub fn run(p: &Params) -> Result<SimulationResult, String> {
    let n = p.num_qubits;
    if n == 0 || n > MAX_QUBITS {
        return Err(format!("Number of qubits must be between 1 and {MAX_QUBITS}"));
    }
    let dim = 1usize << n;
    if let Some(&bad) = p.target_indices.iter().find(|&&t| t >= dim) {
        return Err(format!("Target index {bad} out of range 0..{}", dim - 1));
    }
    if !(0.0..=1.0).contains(&p.noise_value) {
        return Err("noise_value must be within [0, 1]".into());
    }
    let shots = if p.shots == 0 { 1024 } else { p.shots.min(MAX_SHOTS) };

    let optimal = optimal_iterations(n, p.target_indices.len());
    let loops = if p.iterations < 0 {
        optimal
    } else {
        (p.iterations as usize).min(MAX_ITERATIONS)
    };
    let steps = loops + 1;

    let p_gate = (0.75 * p.noise_value * p.noise_scale).clamp(0.0, 1.0);
    let noisy = p_gate > 0.0;
    let (t_init, t_oracle, t_diff) = gate_touches(n, p.target_indices);
    let (p_init, p_oracle, p_diff) = (
        layer_probs(&t_init, p_gate),
        layer_probs(&t_oracle, p_gate),
        layer_probs(&t_diff, p_gate),
    );

    // Noise-free & exact ⇒ one trajectory is the full answer.
    let trajectories = if !noisy && p.exact { 1 } else { shots };

    let mut history = vec![vec![0.0f64; dim]; steps];
    let mut scratch = vec![0.0f64; dim];
    let mut rng = Rng::new(p.seed);

    for _ in 0..trajectories {
        let mut st = State::uniform(n);
        if noisy {
            st.apply_layer_noise(&p_init, &mut rng);
        }
        record(&st, &mut history[0], &mut scratch, p.exact, &mut rng);

        for step in 1..steps {
            st.apply_oracle(p.target_indices);
            if noisy {
                st.apply_layer_noise(&p_oracle, &mut rng);
            }
            st.apply_diffusion();
            if noisy {
                st.apply_layer_noise(&p_diff, &mut rng);
            }
            record(&st, &mut history[step], &mut scratch, p.exact, &mut rng);
        }
    }

    let norm = 1.0 / trajectories as f64;
    for row in history.iter_mut() {
        for v in row.iter_mut() {
            *v *= norm;
        }
    }

    Ok(SimulationResult {
        success: true,
        history,
        optimal_iterations: optimal,
        shots: if p.exact { trajectories } else { shots },
        noise_value: p.noise_value,
        noise_model: "quantum-trajectory depolarizing, Qiskit mcx gate-count calibrated",
        engine: concat!("grover-sim ", env!("CARGO_PKG_VERSION"), " (wasm32)"),
    })
}

#[inline]
fn record(st: &State, row: &mut [f64], scratch: &mut [f64], exact: bool, rng: &mut Rng) {
    if exact {
        st.probs_into(scratch);
        for (r, s) in row.iter_mut().zip(scratch.iter()) {
            *r += *s;
        }
    } else {
        row[st.sample(rng)] += 1.0;
    }
}

// ---------------------------------------------------------------------------
// wasm-bindgen surface
// ---------------------------------------------------------------------------

/// Run a Grover simulation. Returns a plain JS object:
/// `{ success, history: number[][], optimal_iterations, shots, noise_value, noise_model, engine }`
/// or, on invalid input, `{ success: false, error, code }` (never throws).
///
/// * `iterations` — pass `-1` for the optimal count.
/// * `shots` — measurement samples per step (0 ⇒ 1024).
/// * `exact` — average exact |ψ|² instead of sampling.
/// * `noise_scale` — multiplies the depolarizing rate (1.0 = calibrated).
/// * `seed` — PRNG seed; identical inputs + seed ⇒ identical output.
#[wasm_bindgen]
pub fn simulate(
    num_qubits: u32,
    target_indices: &[u32],
    iterations: i32,
    noise_value: f64,
    shots: u32,
    exact: bool,
    noise_scale: f64,
    seed: u32,
) -> JsValue {
    let targets: Vec<usize> = target_indices.iter().map(|&t| t as usize).collect();
    let params = Params {
        num_qubits: num_qubits as usize,
        target_indices: &targets,
        iterations: iterations as i64,
        noise_value,
        noise_scale: if noise_scale > 0.0 { noise_scale } else { 1.0 },
        shots: shots as usize,
        exact,
        seed: (seed as u64) | ((num_qubits as u64) << 40) | 0x5EED_0000_0000,
    };
    match run(&params) {
        Ok(res) => serde_wasm_bindgen::to_value(&res).unwrap_or(JsValue::NULL),
        Err(error) => serde_wasm_bindgen::to_value(&SimulationError {
            success: false,
            error,
            code: "VALIDATION_ERROR",
        })
        .unwrap_or(JsValue::NULL),
    }
}

/// ⌊(π/4)·√(N/M)⌋ for the UI.
#[wasm_bindgen]
pub fn optimal_iterations_for(num_qubits: u32, num_targets: u32) -> u32 {
    optimal_iterations(num_qubits as usize, num_targets as usize) as u32
}

#[wasm_bindgen]
pub fn version() -> String {
    format!("grover-sim {} (wasm32)", env!("CARGO_PKG_VERSION"))
}

// ---------------------------------------------------------------------------
// Tests (run natively with `cargo test`)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn exact(n: usize, targets: &[usize], iters: i64, noise: f64, shots: usize) -> SimulationResult {
        run(&Params {
            num_qubits: n,
            target_indices: targets,
            iterations: iters,
            noise_value: noise,
            noise_scale: 1.0,
            shots,
            exact: true,
            seed: 42,
        })
        .unwrap()
    }

    fn p_target(row: &[f64], targets: &[usize]) -> f64 {
        targets.iter().map(|&t| row[t]).sum()
    }

    #[test]
    fn optimal_iterations_matches_backend_formula() {
        assert_eq!(optimal_iterations(3, 1), 2);
        assert_eq!(optimal_iterations(4, 1), 3);
        assert_eq!(optimal_iterations(5, 2), 3);
        assert_eq!(optimal_iterations(8, 1), 12);
        assert_eq!(optimal_iterations(10, 1), 25);
    }

    #[test]
    fn noise_free_matches_analytic_grover() {
        // 3 qubits, 1 target: 1/8 → 25/32 → 121/128
        let r = exact(3, &[5], -1, 0.0, 1);
        assert_eq!(r.history.len(), 3);
        let p: Vec<f64> = r.history.iter().map(|h| p_target(h, &[5])).collect();
        assert!((p[0] - 0.125).abs() < 1e-12);
        assert!((p[1] - 0.78125).abs() < 1e-12);
        assert!((p[2] - 0.9453125).abs() < 1e-12);
    }

    #[test]
    fn every_step_is_normalised() {
        for (n, t, noise) in [(4usize, vec![3usize], 0.0), (5, vec![7, 20], 0.005), (8, vec![200], 0.005)] {
            let r = exact(n, &t, -1, noise, 256);
            for row in &r.history {
                let s: f64 = row.iter().sum();
                assert!((s - 1.0).abs() < 1e-9, "n={n} sum={s}");
                assert!(row.iter().all(|&v| v >= 0.0));
            }
        }
    }

    #[test]
    fn paulis_are_unitary_and_involutive() {
        let mut st = State::uniform(3);
        st.re[3] = 0.9;
        st.im[6] = -0.4; // break the symmetry
        let norm0: f64 = st.re.iter().zip(&st.im).map(|(r, i)| r * r + i * i).sum();
        let snapshot = (st.re.clone(), st.im.clone());
        for q in 0..3 {
            st.apply_x(q);
            st.apply_y(q);
            st.apply_z(q);
            let norm: f64 = st.re.iter().zip(&st.im).map(|(r, i)| r * r + i * i).sum();
            assert!((norm - norm0).abs() < 1e-12);
            // X, Y, Z each square to identity.
            st.apply_z(q);
            st.apply_y(q);
            st.apply_x(q);
        }
        assert!(st.re.iter().zip(&snapshot.0).all(|(a, b)| (a - b).abs() < 1e-12));
        assert!(st.im.iter().zip(&snapshot.1).all(|(a, b)| (a - b).abs() < 1e-12));
    }

    #[test]
    fn noise_degrades_success_and_deep_circuits_collapse_to_uniform() {
        let ideal = exact(4, &[3], -1, 0.0, 1);
        let noisy = exact(4, &[3], -1, 0.02, 2048);
        let pi = p_target(ideal.history.last().unwrap(), &[3]);
        let pn = p_target(noisy.history.last().unwrap(), &[3]);
        assert!(pi > 0.95 && pn < pi * 0.6, "ideal={pi} noisy={pn}");

        // 8 qubits at p = 0.005: hundreds of CX per iteration ⇒ ~uniform (Aer showed ≈0.005).
        let deep = exact(8, &[200], -1, 0.005, 512);
        let p_last = p_target(deep.history.last().unwrap(), &[200]);
        assert!(p_last < 0.05, "expected near-uniform, got {p_last}");
    }

    #[test]
    fn sampling_mode_is_a_proper_distribution_and_seed_reproducible() {
        let a = run(&Params {
            num_qubits: 3, target_indices: &[5], iterations: 2, noise_value: 0.005,
            noise_scale: 1.0, shots: 1024, exact: false, seed: 7,
        }).unwrap();
        let b = run(&Params {
            num_qubits: 3, target_indices: &[5], iterations: 2, noise_value: 0.005,
            noise_scale: 1.0, shots: 1024, exact: false, seed: 7,
        }).unwrap();
        assert_eq!(a.history, b.history);
        for row in &a.history {
            assert!((row.iter().sum::<f64>() - 1.0).abs() < 1e-12);
            // every entry is a multiple of 1/1024
            assert!(row.iter().all(|&v| ((v * 1024.0).round() - v * 1024.0).abs() < 1e-9));
        }
    }

    #[test]
    fn validation_errors() {
        assert!(run(&Params { num_qubits: 0, target_indices: &[], iterations: -1, noise_value: 0.0, noise_scale: 1.0, shots: 1, exact: true, seed: 1 }).is_err());
        assert!(run(&Params { num_qubits: 3, target_indices: &[8], iterations: -1, noise_value: 0.0, noise_scale: 1.0, shots: 1, exact: true, seed: 1 }).is_err());
        assert!(run(&Params { num_qubits: 3, target_indices: &[1], iterations: -1, noise_value: 1.5, noise_scale: 1.0, shots: 1, exact: true, seed: 1 }).is_err());
    }
}

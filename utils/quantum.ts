import { QuantumState } from '../types';

/**
 * Helper: Normalize state vector to ensure sum of probabilities is exactly 1
 * This prevents floating point drift over many iterations.
 */
const normalizeState = (states: QuantumState[]): QuantumState[] => {
  const totalProbability = states.reduce((sum, s) => sum + (s.amplitude * s.amplitude), 0);
  // If prob is 0 (impossible in quantum), return as is.
  if (totalProbability < 1e-15) return states;

  const normalizationFactor = 1 / Math.sqrt(totalProbability);

  return states.map(s => {
    const newAmp = s.amplitude * normalizationFactor;
    // Ensure probability is strictly non-negative
    const prob = Math.max(0, newAmp * newAmp);
    return {
      ...s,
      amplitude: newAmp,
      probability: prob,
      phase: newAmp >= 0 ? 0 : 180
    };
  });
};

/**
 * Initializes the quantum state.
 * Default is index 0.
 * For visualization of arbitrary N, we generate binary strings padded to ceil(log2(N)).
 */
export const initializeState = (numStates: number, initialIndex: number = 0): QuantumState[] => {
  const states: QuantumState[] = [];
  // Calculate bits needed for display
  const bitsNeeded = Math.ceil(Math.log2(numStates));

  for (let i = 0; i < numStates; i++) {
    const isInitial = i === initialIndex;
    states.push({
      index: i,
      binary: i.toString(2).padStart(bitsNeeded, '0'),
      amplitude: isInitial ? 1 : 0,
      probability: isInitial ? 1 : 0,
      phase: 0
    });
  }
  return states;
};

/**
 * Creates a valid uniform superposition for arbitrary N.
 * Sets every amplitude to 1/sqrt(N).
 * This replaces "Apply Hadamard" because H^n is specific to 2^n states.
 * For generalized N, we just start in the uniform state |s>.
 */
export const createSuperposition = (currentState: QuantumState[]): QuantumState[] => {
  const N = currentState.length;
  const uniformAmp = 1 / Math.sqrt(N);
  const uniformProb = uniformAmp * uniformAmp;

  // Return new array where every state has uniform amplitude
  return currentState.map(s => ({
    ...s,
    amplitude: uniformAmp,
    probability: uniformProb,
    phase: 0
  }));
};

/**
 * Applies the Oracle operator (flips phase of ALL target states)
 */
export const applyOracle = (currentState: QuantumState[], targetIndices: number[]): QuantumState[] => {
  const next = currentState.map(s => {
    if (targetIndices.includes(s.index)) {
      const newAmp = -s.amplitude;
      return {
        ...s,
        amplitude: newAmp,
        probability: Math.max(0, newAmp * newAmp),
        phase: newAmp >= 0 ? 0 : 180
      };
    }
    return s;
  });
  return normalizeState(next);
};

/**
 * Applies the Diffusion operator (Inversion about the mean)
 * 2|s><s| - I  (where |s> is uniform superposition)
 * For generalized Grover, this is Inversion about the Message (Average).
 */
export const applyDiffusion = (currentState: QuantumState[]): QuantumState[] => {
  const N = currentState.length;
  // Calculate mean amplitude
  const sumAmplitudes = currentState.reduce((sum, s) => sum + s.amplitude, 0);
  const mean = sumAmplitudes / N;

  const next = currentState.map(s => {
    // formula: 2*mean - amplitude
    const newAmp = (2 * mean) - s.amplitude;
    const prob = Math.max(0, newAmp * newAmp);
    return {
      ...s,
      amplitude: newAmp,
      probability: prob,
      phase: newAmp >= 0 ? 0 : 180
    };
  });
  return normalizeState(next);
};

/**
 * Determines the optimal number of iterations by simulating the algorithm.
 */
export const findOptimalIterations = (numStates: number, targetIndices: number[]): number => {
  if (targetIndices.length === 0) return 0;

  // Theoretical optimal: (PI/4) * sqrt(N/M)
  const theoretical = (Math.PI / 4) * Math.sqrt(numStates / targetIndices.length);
  const limit = Math.max(20, Math.ceil(theoretical * 2));

  let currentState = initializeState(numStates, 0);
  currentState = createSuperposition(currentState);

  let maxProb = 0;
  let optimalStep = 0;

  for (let step = 1; step <= limit; step++) {
    // Apply Oracle
    currentState = applyOracle(currentState, targetIndices);
    // Apply Diffusion
    currentState = applyDiffusion(currentState);

    // Calculate total probability of finding ANY target state
    const currentProb = currentState.reduce((sum, s) =>
      targetIndices.includes(s.index) ? sum + s.probability : sum, 0
    );

    if (currentProb > maxProb) {
      maxProb = currentProb;
      optimalStep = step;
    }
  }

  return optimalStep;
};

/*Find the optimal number N in range such that N choose 1 has the highest probability close to 100%*/
export const findBest_N_InRange = (min: number, max: number, numTargets: number = 1) => {
  let bestN = -1;
  let maxProbability = -1;
  let optimalSteps= 0;

  const k = Math.max(1, numTargets);

  for (let n = min; n <= max; n++) {
    // 1. 如果 N 小於等於 K，Grover 演算法無意義 (機率恆為 1 或無解)，跳過
    if (n <= k) continue;

    try {
      // 2. 計算 theta (確保數值在 domain 內)
      const ratio = k / n;
      if (ratio < 0 || ratio > 1) continue;
      
      const theta = Math.asin(Math.sqrt(ratio));
      if (theta <= 0) continue; // 避免 theta 為 0 導致下一步除以零

      // 3. 計算最佳步數
      // 公式: t = round( pi/(4*theta) - 0.5 )
      const rawSteps = (Math.PI / (4 * theta)) - 0.5;
      const steps = Math.max(1, Math.round(rawSteps)); // 至少要跑 1 步

      // 4. 計算機率
      const finalAngle = (2 * steps + 1) * theta;
      const probability = Math.pow(Math.sin(finalAngle), 2);
      
      // NaN 檢查 (以防萬一)
      if (isNaN(probability)) continue;

      if (probability > maxProbability) {
        maxProbability = probability;
        bestN = n;
        optimalSteps = steps;
      }
    } catch (e) {
      continue;
    }
  }

  // 如果找不到更佳解 (例如範圍設太小)，回傳第一個有效的 N 或 minN
  if (bestN === -1) {
      bestN = min;
      // 簡單估算
      optimalSteps = Math.round((Math.PI / 4) * Math.sqrt(min / k));
  }

  return {bestN, maxProbability, optimalSteps};
}
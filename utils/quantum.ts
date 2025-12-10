import { QuantumState } from '../types';

/**
 * Helper: Count set bits (population count) for dot product calculation
 */
const countSetBits = (n: number): number => {
  let count = 0;
  while (n > 0) {
    n &= (n - 1);
    count++;
  }
  return count;
};

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
 * Default is |0...0> (index 0), but can be set to any basis state.
 */
export const initializeState = (numQubits: number, initialIndex: number = 0): QuantumState[] => {
  const numStates = Math.pow(2, numQubits);
  const states: QuantumState[] = [];
  
  for (let i = 0; i < numStates; i++) {
    const isInitial = i === initialIndex;
    states.push({
      index: i,
      binary: i.toString(2).padStart(numQubits, '0'),
      amplitude: isInitial ? 1 : 0,
      probability: isInitial ? 1 : 0,
      phase: 0
    });
  }
  return states;
};

/**
 * Applies Hadamard transform.
 * Implements H^n |x> = (1/sqrt(N)) * sum_y (-1)^(x.y) |y>
 */
export const applyHadamard = (currentState: QuantumState[]): QuantumState[] => {
  const N = currentState.length;
  const sqrtN = Math.sqrt(N);
  
  // Create a new array to avoid mutating in place during calculation
  const transformed = currentState.map((targetState) => {
    let newAmplitude = 0;

    for (const sourceState of currentState) {
      if (Math.abs(sourceState.amplitude) < 1e-10) continue;

      const dotProduct = countSetBits(targetState.index & sourceState.index);
      const sign = dotProduct % 2 === 0 ? 1 : -1;

      newAmplitude += (sign * sourceState.amplitude);
    }

    newAmplitude /= sqrtN;
    const prob = Math.max(0, newAmplitude * newAmplitude);

    return {
      ...targetState,
      amplitude: newAmplitude,
      probability: prob,
      phase: newAmplitude >= 0 ? 0 : 180
    };
  });
  
  return normalizeState(transformed);
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
 * 2|s><s| - I
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
 * It tries at least 10 iterations (or more depending on N) and picks the one 
 * where target probability is maximized.
 */
export const findOptimalIterations = (numQubits: number, targetIndices: number[]): number => {
  if (targetIndices.length === 0) return 0;
  
  // Simulation limit: At least 10, or enough to cover the theoretical period
  const N = Math.pow(2, numQubits);
  const theoretical = (Math.PI / 4) * Math.sqrt(N / targetIndices.length);
  const limit = Math.max(10, Math.ceil(theoretical * 2)); 

  let currentState = initializeState(numQubits, 0); // Start with standard |0...0>
  currentState = applyHadamard(currentState); // H^n

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
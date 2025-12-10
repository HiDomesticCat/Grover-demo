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
    return {
      ...s,
      amplitude: newAmp,
      probability: newAmp * newAmp,
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

    return {
      ...targetState,
      amplitude: newAmplitude,
      probability: newAmplitude * newAmplitude,
      phase: newAmplitude >= 0 ? 0 : 180
    };
  });
  
  return normalizeState(transformed);
};

/**
 * Applies the Oracle operator (flips phase of target state)
 */
export const applyOracle = (currentState: QuantumState[], targetIndex: number): QuantumState[] => {
  const next = currentState.map(s => {
    if (s.index === targetIndex) {
      const newAmp = -s.amplitude;
      return {
        ...s,
        amplitude: newAmp,
        probability: newAmp * newAmp,
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
    return {
      ...s,
      amplitude: newAmp,
      probability: newAmp * newAmp, 
      phase: newAmp >= 0 ? 0 : 180
    };
  });
  return normalizeState(next);
};

/**
 * Helper to calculate optimal iterations: Floor((PI/4) * sqrt(N))
 * This ensures we don't over-rotate.
 */
export const getOptimalIterations = (numQubits: number): number => {
  const N = Math.pow(2, numQubits);
  return Math.floor((Math.PI / 4) * Math.sqrt(N));
};
import { QuantumState } from '../types';

/**
 * Helper: Normalize state vector to ensure sum of probabilities is exactly 1
 * This prevents floating point drift over many iterations.
 */
const normalizeState = (states: QuantumState[]): QuantumState[] => {
  // Calculate total probability with epsilon to avoid numerical issues
  const epsilon = 1e-15;
  const totalProbability = states.reduce((sum, s) => sum + (s.amplitude * s.amplitude), 0);
  
  // If total probability is near zero (should be impossible in valid quantum states),
  // return the state unchanged to avoid division by zero
  if (totalProbability < epsilon) {
    console.warn("Extremely low total probability detected during normalization:", totalProbability);
    return states;
  }

  const normalizationFactor = 1 / Math.sqrt(totalProbability);

  return states.map(s => {
    // Apply normalization
    const newAmp = s.amplitude * normalizationFactor;
    
    // Ensure probability is strictly non-negative (avoids -0 and floating point errors)
    const prob = Math.max(0, newAmp * newAmp);
    
    // Use consistent phase representation - either 0 or 180 degrees (0 or π radians)
    // with proper threshold to handle very small amplitudes
    const phaseEpsilon = 1e-10;
    const phaseValue = Math.abs(newAmp) > phaseEpsilon ? (newAmp >= 0 ? 0 : 180) : 0;
    
    return {
      ...s,
      amplitude: newAmp,
      probability: prob,
      phase: phaseValue
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
  // If no target indices, return state unchanged
  if (!targetIndices.length) return currentState;

  const next = currentState.map(s => {
    if (targetIndices.includes(s.index)) {
      // Flip the phase (multiply amplitude by -1)
      const newAmp = -s.amplitude;
      
      // Probability stays the same (|-α|² = |α|²), but ensure non-negative
      const newProb = Math.max(0, newAmp * newAmp);
      
      // Update phase representation consistently (0 or 180)
      const phaseEpsilon = 1e-10;
      const newPhase = Math.abs(newAmp) > phaseEpsilon ? (newAmp >= 0 ? 0 : 180) : 0;
      
      return {
        ...s,
        amplitude: newAmp,
        probability: newProb,
        phase: newPhase
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
    
    if (N === 0) return []; // Handle edge case
    
    // Calculate mean amplitude
    const sumAmplitudes = currentState.reduce((sum, s) => sum + s.amplitude, 0);
    
    // Calculate mean with protective check against empty state
    const mean = sumAmplitudes / N;

    const next = currentState.map(s => {
        // Diffusion operator formula: 2*mean - amplitude (inversion about mean)
        const newAmp = (2 * mean) - s.amplitude;
        
        // Calculate probability (non-negative)
        const prob = Math.max(0, newAmp * newAmp);
        
        // Consistent phase representation with epsilon check to handle near-zero amplitudes
        const epsilon = 1e-10;
        const phaseValue = Math.abs(newAmp) > epsilon ? (newAmp >= 0 ? 0 : 180) : 0;
        
        return {
            ...s,
            amplitude: newAmp,
            probability: prob,
            phase: phaseValue
        };
    });
    
    return normalizeState(next);
};

/**
 * Determines the optimal number of iterations by simulating the algorithm.
 * Uses a simulation-based approach to find when the target state probability peaks.
 */
export const findOptimalIterations = (numStates: number, targetIndices: number[]): number => {
    // Handle edge cases
    if (targetIndices.length === 0) return 0; // No targets -> no iterations needed
    if (targetIndices.length >= numStates) return 0; // All states are targets -> already at max
    
    // Safety check for invalid input
    if (numStates <= 0) return 0;
    
    try {
        // Theoretical optimal based on Grover's formula: (π/4) * sqrt(N/M)
        // where N is total states and M is number of target states
        const theoretical = (Math.PI / 4) * Math.sqrt(numStates / targetIndices.length);
        
        // Set reasonable bounds for simulation
        // Minimum of 1 iteration, maximum of 100 iterations (for performance)
        const limit = Math.min(100, Math.max(20, Math.ceil(theoretical * 2)));
        
        // Initialize quantum state and apply superposition
        let currentState = initializeState(numStates, 0);
        currentState = createSuperposition(currentState);
        
        // Track best result
        let maxProb = 0;
        let optimalStep = 0;
        
        // Simulation loop - run Grover's algorithm and find where probability peaks
        for (let step = 1; step <= limit; step++) {
            // Apply Oracle (phase flip on targets)
            currentState = applyOracle(currentState, targetIndices);
            
            // Apply Diffusion (inversion about mean)
            currentState = applyDiffusion(currentState);
            
            // Calculate combined probability of finding ANY target state
            const currentProb = currentState.reduce((sum, s) =>
                targetIndices.includes(s.index) ? sum + s.probability : sum, 0
            );
            
            // Update if we found a new maximum
            if (currentProb > maxProb) {
                maxProb = currentProb;
                optimalStep = step;
            }
            
            // Early termination optimization:
            // If we're well past the optimal point (5+ steps), probability won't improve
            if (step > optimalStep + 5 && step > theoretical * 1.5) {
                break;
            }
        }
        
        return optimalStep;
    } catch (error) {
        console.error("Error in findOptimalIterations:", error);
        // Fall back to theoretical approximation on error
        return Math.max(1, Math.floor((Math.PI / 4) * Math.sqrt(numStates / targetIndices.length)));
    }
};

/**
 * Find the optimal database size N where Grover's algorithm works most efficiently.
 *
 * This function analyzes a range of potential database sizes and finds the N value
 * that gives the highest probability of success when searching for K target items.
 *
 * @param min Minimum database size to consider
 * @param max Maximum database size to consider
 * @param numTargets Number of target elements to search for (default: 1)
 * @returns Best N value, maximum probability achievable, and optimal iteration count
 */
export const findBest_N_InRange = (min: number, max: number, numTargets: number = 1) => {
    // Initialize result tracking variables
    let bestN = -1;
    let maxProbability = -1;
    let optimalSteps = 0;

    // Ensure at least 1 target item (avoid division by zero)
    const k = Math.max(1, numTargets);

    // Establish safe bounds for the search
    const validMin = Math.max(1, min);
    const validMax = Math.min(1000, max); // Prevent excessive calculation
    
    // Search through all possible database sizes in range
    for (let n = validMin; n <= validMax; n++) {
        // Skip invalid cases where N ≤ K (search pointless when all items are targets)
        if (n <= k) continue;

        try {
            // Calculate the ratio of targets to total items
            const ratio = k / n;
            if (ratio < 0 || ratio > 1) continue;
            
            // Calculate theta (the rotation angle per Grover iteration)
            const theta = Math.asin(Math.sqrt(ratio));
            
            // Skip invalid angles (avoid numerical issues)
            if (theta <= 0 || isNaN(theta)) continue;

            // Calculate optimal number of iterations using the formula:
            // t = round(π/(4*theta) - 0.5)
            const rawSteps = (Math.PI / (4 * theta)) - 0.5;
            
            // Enforce safe bounds on iteration count (minimum 1, maximum 100)
            const steps = Math.max(1, Math.min(100, Math.round(rawSteps)));

            // Calculate the final probability of success
            const finalAngle = (2 * steps + 1) * theta;
            const probability = Math.pow(Math.sin(finalAngle), 2);
            
            // Skip invalid probability values
            if (isNaN(probability) || probability < 0 || probability > 1) continue;

            // Update best result if this is better than previous best
            if (probability > maxProbability) {
                maxProbability = probability;
                bestN = n;
                optimalSteps = steps;
            }
        } catch (e) {
            // Skip any calculation errors and continue with next N
            continue;
        }
    }

    // Fallback if no valid solution found (e.g., range too narrow)
    if (bestN === -1) {
        bestN = validMin;
        // Estimate optimal steps using simplified formula
        optimalSteps = Math.min(100, Math.max(1, Math.round((Math.PI / 4) * Math.sqrt(validMin / k))));
        // Set probability to theoretical maximum for this fallback
        maxProbability = 1.0;
    }

    return {bestN, maxProbability, optimalSteps};
}
export interface QuantumState {
  index: number;
  binary: string;
  amplitude: number;
  probability: number;
  phase: number; // 0 or 180 (represented as 1 or -1 roughly for visualization, strictly angle)
}

// Extended version of QuantumState with additional optional fields for comparison
export interface ComparableQuantumState extends QuantumState {
  idealAmplitude?: number | null;  // Optional field for ideal amplitude when using Qiskit
  idealProbability?: number | null; // Optional field for ideal probability when using Qiskit
}

export interface StepHistory {
  step: number;
  probTarget: number;
  probOthers: number; // Average probability of non-target states
  idealProbTarget?: number; // Ideal mathematical probability for target states
  idealProbOthers?: number; // Ideal mathematical probability for non-target states
}

export enum AlgorithmPhase {
  INIT = 'INIT',
  SUPERPOSITION = 'SUPERPOSITION',
  RUNNING = 'RUNNING',
  FINISHED = 'FINISHED'
}

export interface GroverConfig {
  numQubits: number;
  targetIndex: number | null;
}

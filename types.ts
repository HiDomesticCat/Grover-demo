export interface QuantumState {
  index: number;
  binary: string;
  amplitude: number;
  probability: number;
  phase: number; // 0 or 180 (represented as 1 or -1 roughly for visualization, strictly angle)
}

export interface StepHistory {
  step: number;
  probTarget: number;
  probOthers: number; // Average probability of non-target states
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

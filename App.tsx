import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { initSimulator, runSimulation } from './services/wasmSimulator';

// Augment the Window interface to include our global state storage
declare global {
  interface Window {
    __IDEAL_STATES_HISTORY?: any[][];
    __IDEAL_HISTORY_DATA?: any[];
  }
}
import {
  Play,
  SkipForward,
  RotateCcw,
  Target,
  Layers,
  Cpu,
  ArrowRight,
  Pause,
  Zap,
  AlertTriangle,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import StateChart from './components/StateChart';
import ProbabilityChart from './components/ProbabilityChart';
import GeometricView from './components/GeometricView';
import {
  initializeState,
  createSuperposition,
  applyOracle,
  applyDiffusion,
  findOptimalIterations,
  findBest_N_InRange
} from './utils/quantum';
import { QuantumState, AlgorithmPhase, StepHistory } from './types';

// Error boundary component for catching runtime errors
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Application error:", error, errorInfo);
    // Log error to a service here if needed
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="min-h-screen bg-quantum-900 text-gray-100 font-sans p-8 flex flex-col items-center justify-center">
          <div className="max-w-2xl w-full bg-quantum-800/80 rounded-xl p-8 border border-red-700/30 shadow-xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <AlertCircle className="w-8 h-8" />
              <h2 className="text-xl font-bold">Application Error</h2>
            </div>
            <p className="mb-4 text-gray-300">An unexpected error has occurred in the application.</p>
            
            {this.state.error && (
              <div className="bg-red-900/20 border border-red-800/30 rounded p-4 mb-6 font-mono text-sm text-red-200 overflow-auto">
                {this.state.error.message}
              </div>
            )}
            
            <button
              onClick={() => window.location.reload()}
              className="bg-quantum-700 hover:bg-quantum-600 text-white px-4 py-2 rounded-lg font-medium"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Loading fallback for Suspense
const LoadingFallback = () => (
  <div className="min-h-screen bg-quantum-900 flex items-center justify-center">
    <div className="bg-quantum-800 p-8 rounded-xl border border-quantum-700 shadow-lg flex flex-col items-center">
      <div className="animate-spin w-12 h-12 border-4 border-quantum-accent border-t-transparent rounded-full mb-4"></div>
      <h2 className="text-quantum-accent text-xl font-bold mb-2">Loading Quantum Visualizer</h2>
      <p className="text-gray-400">Initializing quantum state...</p>
    </div>
  </div>
);

const App = () => {
  // --- Config State ---
  const [configMode, setConfigMode] = useState<'QUBITS' | 'CUSTOM'>('QUBITS');
  // We use numStates as the single source of truth.
  // In QUBITS mode, this will always be a power of 2.
  // Using state with validation functions
  const [numStates, setNumStates] = useState<number>(16);
  const [targetIndices, setTargetIndices] = useState<number[]>([]);
  
  // Qiskit backend state
  const [useQiskitBackend, setUseQiskitBackend] = useState<boolean>(false);
  const [qiskitData, setQiskitData] = useState<number[][] | null>(null);
  const [isQiskitLoading, setIsQiskitLoading] = useState<boolean>(false);
  
  // Input validation with min/max constraints
  const [noiseLevel, setNoiseLevel] = useState<number>(0.005);
  
  // Global application state
  const [appError, setAppError] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);

  // --- Runtime State ---
  const [states, setStates] = useState<QuantumState[]>([]);
  const [idealStates, setIdealStates] = useState<QuantumState[]>([]);  // Added for Qiskit/Ideal comparison
  const [phase, setPhase] = useState<AlgorithmPhase>(AlgorithmPhase.INIT);
  const [stepCount, setStepCount] = useState<number>(0);
  const [subStep, setSubStep] = useState<'ORACLE' | 'DIFFUSION'>('ORACLE');
  const [history, setHistory] = useState<StepHistory[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Derived Qubits for display/logic (only relevant if power of 2, but we estimate)
  const estimatedQubits = Math.log2(numStates);
  const isPowerOfTwo = Number.isInteger(estimatedQubits);

  // Use simulation to find optimal iterations based on current selection
  const optimalIterations = findOptimalIterations(numStates, targetIndices);

  const isAtOptimal = targetIndices.length > 0 && stepCount === optimalIterations && subStep === 'ORACLE';
  const isOverRotated = targetIndices.length > 0 && stepCount > optimalIterations;

  // --- Derived Statistics ---
  // Mean Amplitude: The axis of inversion for diffusion (sum of amplitudes / N)
  // This is often what users intuitively look for when seeing "average" on an amplitude chart.
  const meanAmplitude = states.length > 0
    ? states.reduce((sum, s) => sum + s.amplitude, 0) / states.length
    : 0;

  // Total Probability of all selected targets
  const totalTargetProbability = states.reduce((sum, s) =>
    targetIndices.includes(s.index) ? sum + s.probability : sum, 0
  );

  //used to find the optimal K choose 1 within given range that having the largest prob
  const [searchMin, setSearchMin] = useState<number>(4);
  const [searchMax, setSearchMax] = useState<number>(120);

  const bestNInfo = React.useMemo(() => {
    const k = targetIndices.length > 0 ? targetIndices.length : 1;
    return findBest_N_InRange(searchMin, searchMax, k);
  }, [searchMin, searchMax, targetIndices.length]);

  // Helper function to reset simulation state to initial before a new run
  const resetSimulationState = useCallback(() => {
    setIsRunning(false); // Stop any existing loops immediately
    setQiskitData(null);
    setIdealStates([]);  // Reset ideal states
    setPhase(AlgorithmPhase.INIT);
    setStepCount(0);
    setSubStep('ORACLE');
    setHistory([{ step: 0, probTarget: 0, probOthers: 1 }]);
  }, []);

  // Initialize on load or reset
  const handleReset = useCallback(() => {
    // Use the same reset logic for a clean state
    resetSimulationState();
    
    // Also reset target indices and states for complete reset
    setTargetIndices([]);
    
    // Always start with |0...0> (or uniform zero-index start)
    const initial = initializeState(numStates, 0);
    setStates(initial);
  }, [numStates, resetSimulationState]);

  // Handle State Count Change with validation
  useEffect(() => {
    if (numStates > 0 && numStates <= 128) { // Safe bounds for visualization
      handleReset();
    }
  }, [numStates, handleReset]);
  
  // Check backend connection on load
  useEffect(() => {
    const checkBackend = async () => {
      if (useQiskitBackend) {
        try {
          // The noisy simulator now runs in-browser (Rust → WebAssembly).
          // "Connecting" just means loading the module once.
          await initSimulator();
          setBackendConnected(true);
          setAppError(null);
        } catch (error) {
          console.error('WASM simulator failed to load:', error);
          setBackendConnected(false);
          setAppError('The in-browser quantum simulator failed to load. Reload the page to try again.');
        }
      }
    };
    
    checkBackend();
  }, [useQiskitBackend]);

  // --- Actions ---

  const handleCreateSuperposition = () => {
    const newStates = createSuperposition(states);
    setStates(newStates);
    // Initialize ideal states to match initial superposition
    setIdealStates(newStates);
    setPhase(AlgorithmPhase.SUPERPOSITION);

    // Initial history
    const probT = 0;
    const probO = 1 / newStates.length;

    setHistory([{ step: 0, probTarget: probT, probOthers: probO }]);
  };

  const handleSelectTarget = (index: number) => {
    if (phase !== AlgorithmPhase.SUPERPOSITION) return;

    // Toggle logic
    let newIndices = targetIndices.includes(index)
      ? targetIndices.filter(i => i !== index)
      : [...targetIndices, index];

    setTargetIndices(newIndices);

    // Calculate new probabilities based on the selection using *current* states
    // Note: States don't change, but what we consider "Target Probability" does.
    const currentTotalTargetProb = states.reduce((sum, s) => newIndices.includes(s.index) ? sum + s.probability : sum, 0);

    // Avg prob of non-targets
    const numNonTargets = states.length - newIndices.length;
    const currentProbOthers = numNonTargets > 0
      ? (1 - currentTotalTargetProb) / numNonTargets
      : 0;

    setHistory([{ step: 0, probTarget: currentTotalTargetProb, probOthers: currentProbOthers }]);
  };

  const executeStep = useCallback(() => {
    if (targetIndices.length === 0) return;

    setStates(prevStates => {
      if (subStep === 'ORACLE') {
        return applyOracle(prevStates, targetIndices);
      } else {
        return applyDiffusion(prevStates);
      }
    });

    if (subStep === 'ORACLE') {
      setSubStep('DIFFUSION');
    } else {
      setSubStep('ORACLE');
      setStepCount(prev => prev + 1);
    }
    setPhase(AlgorithmPhase.RUNNING);
  }, [targetIndices, subStep]);

  // Effect to update history whenever states change during running phase
  useEffect(() => {
    if (phase === AlgorithmPhase.RUNNING && targetIndices.length > 0) {

      const probTarget = states.reduce((sum, s) => targetIndices.includes(s.index) ? sum + s.probability : sum, 0);
      const numNonTargets = states.length - targetIndices.length;
      const probOthers = numNonTargets > 0 ? (1 - probTarget) / numNonTargets : 0;

      setHistory(prev => {
        // Only push to history if the last entry isn't the current step count
        if (prev.length > 0 && prev[prev.length - 1].step === stepCount) return prev;
        return [...prev, { step: stepCount, probTarget, probOthers }];
      });
    }
  }, [states, stepCount, phase, targetIndices]);

  // Run Loop Manager
  useEffect(() => {
    if (!isRunning) return;

    // 1. Auto-stop conditions
    if (useQiskitBackend) {
      // Only stop when we've actually reached the end of the Qiskit data
      // This ensures we process ALL steps from the backend
      if (qiskitData && Array.isArray(qiskitData)) {
        // Check if we've reached the end of available Qiskit data
        if (stepCount >= (qiskitData.length - 1)) {
          console.log("Reached end of Qiskit data, stopping simulation");
          setIsRunning(false);
          return;
        }
      }
    } else if (stepCount >= optimalIterations && subStep === 'ORACLE') {
      // For mathematical simulation, stop at optimal iterations
      setIsRunning(false);
      return;
    }
    
    // Clear any errors that might have happened before
    if (appError) {
      setAppError(null);
    }

    // 2. Timer Loop
    const timer = setTimeout(() => {
      if (useQiskitBackend) {
        // Qiskit Mode: Iterate through pre-fetched data
        if (qiskitData && Array.isArray(qiskitData)) {
          // Calculate next step
          const nextStep = stepCount + 1;
          
          console.log(`Processing Qiskit data step ${nextStep}/${qiskitData.length-1}`);
          
          // Ensure next step is within array bounds
          if (nextStep < qiskitData.length) {
            // Update step counter first
            setStepCount(nextStep);
            
            // Get probabilities for this step from Qiskit data
            const currentStepProbs = qiskitData[nextStep];
            
            // Ensure we have valid probability data
            if (Array.isArray(currentStepProbs) && currentStepProbs.length === numStates) {
              // 1) Update state visualization with Qiskit data (Bar Chart)
              setStates(prevStates => prevStates.map((state, idx) => ({
                ...state,
                probability: idx < currentStepProbs.length ? currentStepProbs[idx] : 0,
                // Estimate amplitude from probability (√p), preserving any existing sign
                amplitude: Math.sqrt(
                  idx < currentStepProbs.length ? currentStepProbs[idx] : 0
                ) * (state.amplitude >= 0 ? 1 : -1)
              })));
              
              // 2) Use pre-calculated ideal data for perfect mathematical simulation
              if (window.__IDEAL_STATES_HISTORY && Array.isArray(window.__IDEAL_STATES_HISTORY)) {
                // Use the exact pre-calculated states from initialization
                if (nextStep < window.__IDEAL_STATES_HISTORY.length) {
                  // Deep copy to avoid reference issues - CRITICAL for consistency
                  const idealStateForStep = window.__IDEAL_STATES_HISTORY[nextStep].map(s => ({...s}));
                  setIdealStates(idealStateForStep);
                } else {
                  console.warn(`No pre-calculated ideal data for step ${nextStep}`);
                }
              } else {
                console.warn("No ideal state history available - using fallback calculation");
                // This should rarely happen but included for robustness
                let newIdealStates: QuantumState[] = [];
                
                if (idealStates.length === 0) {
                  // Start with superposition if we don't have states
                  newIdealStates = createSuperposition(
                    Array.from({length: numStates}, (_, i) => ({
                      index: i,
                      binary: i.toString(2).padStart(Math.ceil(Math.log2(numStates)), '0'),
                      amplitude: 0,
                      probability: 0,
                      phase: 0
                    }))
                  );
                } else if (targetIndices.length > 0) {
                  // Otherwise keep calculating based on existing ideal states
                  // Use correct progression of oracle/diffusion based on step number
                  if (nextStep % 2 === 1) { // Odd steps apply oracle
                    newIdealStates = applyOracle([...idealStates], targetIndices);
                  } else { // Even steps apply diffusion (except step 0)
                    newIdealStates = applyDiffusion([...idealStates]);
                  }
                }
                
                setIdealStates(newIdealStates);
              }
              
              // Calculate target probability for history chart
              const probTarget = currentStepProbs.reduce((sum: number, val: number, idx: number) =>
                targetIndices.includes(idx) ? sum + val : sum, 0
              );
              
              // Calculate average non-target probability
              const numNonTargets = numStates - targetIndices.length;
              const probOthers = numNonTargets > 0 ? (1 - probTarget) / numNonTargets : 0;
              
              // [FIXED] Calculate ideal probabilities from idealStates
              // We must use the pre-calculated data from the window object.
              // Using 'idealStates' directly is buggy because setIdealStates is async,
              // so we would be calculating based on the STALE state from the previous render.
              let idealProbTarget = undefined;
              let idealProbOthers = undefined;
              
              if (window.__IDEAL_HISTORY_DATA && Array.isArray(window.__IDEAL_HISTORY_DATA)) {
                if (nextStep < window.__IDEAL_HISTORY_DATA.length) {
                  const idealData = window.__IDEAL_HISTORY_DATA[nextStep];
                  idealProbTarget = idealData.idealProbTarget;
                  idealProbOthers = idealData.idealProbOthers;
                  
                  // Debug logging to verify correct values
                  console.log(`Step ${nextStep} using pre-calculated ideal data: targetProb=${(idealProbTarget as number * 100).toFixed(2)}%`);
                }
              }
              // Fallback only if window data is missing (rare)
              else if (idealStates.length > 0) {
                // Sum probabilities of all target indices in ideal states
                idealProbTarget = idealStates.reduce((sum, state) =>
                  targetIndices.includes(state.index) ? sum + state.probability : sum, 0);
                
                // Average probability of non-target states in ideal calculation
                idealProbOthers = numNonTargets > 0 ? (1 - idealProbTarget) / numNonTargets : 0;
                
                console.warn(`Using fallback ideal probability calculation: ${(idealProbTarget as number * 100).toFixed(2)}%`);
              }
              
              // Add to history chart (prevents duplicate entries)
              setHistory(prevHist => {
                if (prevHist.length > 0 && prevHist[prevHist.length - 1].step === nextStep) {
                  return prevHist; // Prevent duplicates
                }
                return [...prevHist, {
                  step: nextStep,
                  probTarget,
                  probOthers,
                  idealProbTarget,
                  idealProbOthers
                }];
              });
            } else {
              console.warn("Invalid probability data at step", nextStep, currentStepProbs);
            }
          } else {
            // We've processed all available Qiskit data steps
            console.log("Reached end of Qiskit data steps");
            setIsRunning(false);
          }
        } else {
          console.warn("Qiskit data unavailable or invalid format");
          // Don't stop running - data might arrive later
        }
      } else {
        // Local Simulation Mode
        executeStep();
      }
    }, 1000); // 1 second per step

    return () => clearTimeout(timer);
  }, [isRunning, stepCount, subStep, optimalIterations, executeStep, useQiskitBackend, qiskitData, targetIndices, numStates]);


  const handleStep = () => {
    // Synchronized stepping with Qiskit + Ideal comparison
    if (useQiskitBackend) {
      // Ensure we have data and aren't at the end
      if (qiskitData && Array.isArray(qiskitData) && stepCount < qiskitData.length - 1) {
        const nextStep = stepCount + 1;
        
        // 1. Update Step Count
        setStepCount(nextStep);
        
        // 2. A) Process Qiskit Real Data
        const currentStepProbs = qiskitData[nextStep];
        
        if (Array.isArray(currentStepProbs)) {
          // Update Bar Chart (States) with Qiskit data
          setStates(prevStates => prevStates.map((state, idx) => ({
            ...state,
            probability: currentStepProbs[idx],
            // Estimate amplitude sign for visual consistency (Qiskit only gives probs)
            amplitude: Math.sqrt(currentStepProbs[idx]) * (state.amplitude >= 0 ? 1 : -1)
          })));
          
          // 2. B) Simultaneously Calculate Ideal Mathematical Result
          // Create temp ideal states to apply mathematical oracle+diffusion
          let tempIdealStates = [...idealStates];
          
          // If ideal states haven't been created yet, initialize from current states
          if (tempIdealStates.length === 0 && stepCount === 0) {
            // Start with same superposition
            tempIdealStates = createSuperposition(states);
          }
          
          // Apply mathematical simulation to ideal states
          // Apply enough steps to match the current stepCount
          if (targetIndices.length > 0 && tempIdealStates.length > 0) {
            // Use the pre-calculated ideal states instead of calculating on the fly
            // This ensures consistency with the mathematical simulation
            if (window.__IDEAL_STATES_HISTORY && Array.isArray(window.__IDEAL_STATES_HISTORY)) {
              if (nextStep < window.__IDEAL_STATES_HISTORY.length) {
                // Get the pre-calculated ideal state for this step
                const idealStateForStep = window.__IDEAL_STATES_HISTORY[nextStep];
                // Deep copy to avoid reference issues
                setIdealStates(idealStateForStep.map(s => ({...s})));
              } else {
                console.warn(`Step ${nextStep} exceeds pre-calculated ideal states (length: ${window.__IDEAL_STATES_HISTORY.length})`);
              }
            } else {
              console.warn("No pre-calculated ideal state history available");
              // Only as fallback - create ideal states from scratch
              if (tempIdealStates.length === 0) {
                tempIdealStates = createSuperposition(states);
              }
              
              // [FIXED LOGIC] Apply both Oracle and Diffusion for each step
              // to maintain consistency with our pre-calculation logic
              // and match Qiskit's granularity (1 step = 1 full Grover iteration)
              tempIdealStates = applyOracle(tempIdealStates, targetIndices);
              tempIdealStates = applyDiffusion(tempIdealStates);
              
              setIdealStates(tempIdealStates);
            }
          }
          
          // 3. Update Line Chart (History)
          const probTarget = currentStepProbs.reduce((sum: number, val: number, idx: number) =>
            targetIndices.includes(idx) ? sum + val : sum, 0
          );
          
          const numNonTargets = numStates - targetIndices.length;
          const probOthers = numNonTargets > 0 ? (1 - probTarget) / numNonTargets : 0;
          
          // Calculate ideal probabilities from idealStates if available
          let idealProbTarget = undefined;
          let idealProbOthers = undefined;
          
          // Get ideal probabilities from pre-calculated data rather than calculating on-the-fly
          if (window.__IDEAL_HISTORY_DATA && Array.isArray(window.__IDEAL_HISTORY_DATA)) {
            if (nextStep < window.__IDEAL_HISTORY_DATA.length) {
              const idealData = window.__IDEAL_HISTORY_DATA[nextStep];
              idealProbTarget = idealData.idealProbTarget;
              idealProbOthers = idealData.idealProbOthers;
            }
          }
          // Fallback calculation only if needed
          else if (tempIdealStates.length > 0) {
            // CRITICAL: Ensure we're calculating probabilities consistently - always use amplitude squared
            idealProbTarget = tempIdealStates.reduce((sum, state) => {
              if (targetIndices.includes(state.index)) {
                const prob = Math.pow(state.amplitude, 2);
                console.log(`Step ${nextStep} - Ideal state ${state.index}: amplitude=${state.amplitude.toFixed(4)}, probability=${(prob*100).toFixed(2)}%`);
                return sum + prob;
              }
              return sum;
            }, 0);
            
            console.log(`Step ${nextStep} - Total ideal target probability: ${(idealProbTarget * 100).toFixed(4)}%`);
            
            // Average probability of non-target states
            idealProbOthers = numNonTargets > 0 ? (1 - idealProbTarget) / numNonTargets : 0;
          }

          setHistory(prevHist => {
            // Avoid duplicate entries
            if (prevHist.length > 0 && prevHist[prevHist.length - 1].step === nextStep) return prevHist;
            return [...prevHist, {
              step: nextStep,
              probTarget,
              probOthers,
              idealProbTarget,
              idealProbOthers
            }];
          });
        }
      }
    } else {
      // Default: Local mathematical simulation
      executeStep();
    }
  };

  // Handle the run button click
  const handleRun = async () => {
    // Validate inputs before running
    if (targetIndices.length === 0) {
      setAppError("Please select at least one target state before running");
      return;
    }
    
    // Clear any previous errors
    setAppError(null);
    
    // Ensure clean state before starting a new simulation
    resetSimulationState();
    
    // If Qiskit backend is enabled, we'll get the data from the backend
    // Otherwise, we use the existing states and apply superposition
    if (useQiskitBackend) {
      // Calculate number of qubits needed
      const calculatedNumQubits = Math.ceil(Math.log2(numStates));
      await fetchQiskitSimulation(calculatedNumQubits, targetIndices, noiseLevel);
    } else {
      try {
        // For local simulation, apply superposition to current states
        const newStates = createSuperposition(states);
        setStates(newStates);
        setPhase(AlgorithmPhase.SUPERPOSITION);
        setIsRunning(true);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setAppError(`Local simulation error: ${errorMessage}`);
        setIsRunning(false);
      }
    }
  };

  // Separate function to fetch Qiskit simulation data
  const fetchQiskitSimulation = async (numQubits: number, targetIndices: number[], noiseLevel: number) => {
    setIsQiskitLoading(true);
    setAppError(null);
    
    try {
      // Validate number of qubits (backend has limit of 10)
      if (numQubits > 10) {
        throw new Error(`Number of qubits (${numQubits}) exceeds maximum limit (10)`);
      }
        
      // Run the noisy simulation in-browser (Rust → WebAssembly). Same
      // request/response contract as the former Python /simulate endpoint.
      const data = await runSimulation({
        num_qubits: numQubits,
        target_indices: targetIndices,
        noise_value: noiseLevel,
        iterations: optimalIterations, // -1 ⇒ simulator picks ⌊(π/4)√(N/M)⌋
        shots: 1024,
      });
      
      if (data.success) {
        // Store the history data - backend always returns data.history as number[][]
        if (data.history) {
          // 1. Store raw Qiskit simulation results
          setQiskitData(data.history);
          
          // 2. Pre-calculate ideal states for all steps
          // We need to pre-calculate the entire ideal history in one go
          try {
            console.log("Pre-calculating ideal mathematical states...");
            
            // Create the initial superposition state
            const initial = initializeState(numStates, 0);
            const initialSuperposition = createSuperposition(initial);
            
            // Set the initial state both for display and our calculations
            setIdealStates(initialSuperposition);
            
            // Create an array to store all intermediate ideal states (for each step)
            // This becomes our lookup table during the animation loop
            const idealStatesHistory: QuantumState[][] = [];
            
            // IMPORTANT: We need to simulate using a consistent approach between modes
            // For Qiskit integration, each step = 1 full Grover iteration (Oracle + Diffusion)
            
            // Step 0: Initial state is superposition
            idealStatesHistory.push([...initialSuperposition]);
            
            // Initialize current state with a deep copy to avoid reference issues
            let currentState: QuantumState[] = initialSuperposition.map(s => ({...s}));

            // Get the exact number of iterations from Qiskit data
            const maxSteps = data.history ? data.history.length - 1 : 0;
            console.log(`Pre-calculating ${maxSteps} steps of ideal mathematical state (1 step = 1 full Grover iteration)...`);

            // [FIXED LOGIC]
            // Qiskit returns 1 step = Oracle + Diffusion. We must match this granularity.
            // We no longer toggle between sub-steps.
            for (let step = 0; step < maxSteps; step++) {
              
              // 1. Apply Oracle
              currentState = applyOracle(currentState, targetIndices);
              
              // 2. Apply Diffusion
              currentState = applyDiffusion(currentState);
              
              // Create a deep copy of the current state to avoid reference issues
              const stateCopy = currentState.map(state => ({...state}));
              
              // Store this FULL step's state
              idealStatesHistory.push(stateCopy);
              
              // Verify amplitudes are correct (for debugging)
              const sum = stateCopy.reduce((acc, s) => acc + Math.pow(s.amplitude, 2), 0);
              if (Math.abs(sum - 1) > 0.001) {
                console.warn(`Step ${step} has invalid sum of probabilities: ${sum}`);
              }
            }
            
            // Store this history in a global ref for access during animation
            // We'll use this to sync with Qiskit data at each step
            window.__IDEAL_STATES_HISTORY = idealStatesHistory;
            
            console.log(`Ideal states pre-calculation complete! Generated ${idealStatesHistory.length} step states.`);
            
            // Also calculate and store ideal probabilities for history chart
            const idealHistoryData = idealStatesHistory.map((states, stepIndex) => {
              // Calculate probability of target states in this step
              // CRITICAL: Ensure we use amplitude^2 for consistent probability calculation
              const idealProbTarget = states.reduce((sum, state) => {
                if (targetIndices.includes(state.index)) {
                  // IMPORTANT: Always recalculate probability from amplitude to ensure consistency
                  // This is critical to get 99.96% success rate for optimal iterations
                  const prob = Math.pow(state.amplitude, 2);
                  console.log(`Ideal target state ${state.index} has probability: ${(prob * 100).toFixed(2)}%`);
                  return sum + prob;
                }
                return sum;
              }, 0);
              
              // Log the total ideal probability for debugging
              console.log(`Step ${stepIndex}: Total ideal target probability: ${(idealProbTarget * 100).toFixed(2)}%`);
              
              // Calculate average non-target probability
              const numNonTargets = numStates - targetIndices.length;
              const idealProbOthers = numNonTargets > 0 ? (1 - idealProbTarget) / numNonTargets : 0;
              
              return {
                step: stepIndex,
                idealProbTarget,
                idealProbOthers
              };
            });
            
            // Store ideal history data for chart access
            window.__IDEAL_HISTORY_DATA = idealHistoryData;
            
          } catch (error) {
            console.error("Failed to pre-calculate ideal states:", error);
            // Still continue with Qiskit data, even if ideal calculation fails
          }
        }
        
        // Store and use backend-calculated optimal iterations
        const backendOptimalIterations = data.optimal_iterations;
        if (backendOptimalIterations !== undefined && !isNaN(backendOptimalIterations)) {
          console.log(`Backend optimal iterations: ${backendOptimalIterations}, Frontend calculated: ${optimalIterations}`);
          // Override local calculation with backend value for consistency
          // This is crucial since backend uses different formula with more precise physics calculation
          const backendIters = Number(backendOptimalIterations);
          if (backendIters > 0) {
            // Create an effect to update optimalIterations after render
            setTimeout(() => {
              console.log(`Using backend's optimal iterations: ${backendIters}`);
              // We can't directly modify optimalIterations (derived value),
              // but we can show the correct value in the UI
              document.getElementById('optimal-iterations-count')?.setAttribute('data-backend-value', String(backendIters));
            }, 100);
          }
        }
        
        // We also need superposition states for initial display
        const initial = initializeState(numStates, 0);
        const newStates = createSuperposition(initial);
        setStates(newStates);
        setPhase(AlgorithmPhase.SUPERPOSITION);
        
        // Set phase to RUNNING
        setTimeout(() => {
          setPhase(AlgorithmPhase.RUNNING);
          setIsRunning(true);
        }, 0);
      } else {
        // Handle specific backend error codes
        if (data.code === 'VALIDATION_ERROR') {
          setAppError(`Backend validation error: ${data.error}`);
        } else if (data.code === 'SIMULATION_ERROR') {
          setAppError(`Quantum simulation failed: ${data.error}`);
        } else {
          setAppError(data.error || "Unknown error during quantum simulation");
        }
        
        console.error('Simulation failed:', data.error);
        setQiskitData(null);
        setIsRunning(false);
        
        // Display a user-friendly error with specific troubleshooting tips
        setAppError(
          data.code === 'VALIDATION_ERROR'
            ? `Input validation failed: ${data.error}. Check the number of qubits and target indices.`
            : `Quantum simulation error: ${data.error}. Try reducing the noise level or number of qubits.`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Simulator error:', error);
      
      // More detailed error message with troubleshooting steps
      if (errorMessage.includes('WebAssembly') || errorMessage.includes('wasm')) {
        setAppError(`The in-browser simulator (WebAssembly) failed to load: ${errorMessage}. Reload the page; if it persists, your browser may block WebAssembly.`);
      } else {
        setAppError(`Simulation error: ${errorMessage}`);
      }
      
      setQiskitData(null);
      setIsRunning(false);
    } finally {
      setIsQiskitLoading(false);
    }
  };
  
  // Developer Note: the noisy simulator is wasm/src/lib.rs (Rust → WebAssembly).
  // Rebuild with `npm run build:wasm` after editing it.
  
  // Pause the running simulation
 const handlePause = () => {
   setIsRunning(false);
 };
 
 // Resume the paused simulation
 const handleResume = () => {
   if (isRunning) return;
   if (targetIndices.length === 0) {
     setAppError("Please select at least one target state before running");
     return;
   }
   setIsRunning(true);
 };

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
        <div className="min-h-screen bg-quantum-900 text-gray-100 font-sans selection:bg-quantum-accent selection:text-black">

      {/* Header */}
      <header className="border-b border-quantum-800 bg-quantum-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-quantum-500 rounded-lg shadow-lg shadow-quantum-500/20">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Grover's Visualizer</h1>
              <p className="text-xs text-quantum-400 font-mono">Quantum Search Algorithm</p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-xs text-gray-500">Current Phase</div>
            <div className="flex items-center gap-2 justify-end">
              <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></span>
              <div className="text-sm font-mono text-quantum-accent font-bold">
                {phase === AlgorithmPhase.RUNNING ? `${phase} (${subStep})` : phase}
              </div>
            </div>
          </div>
        </div>
      </header>

        {/* Global Error Alert */}
        {appError && (
          <div className="fixed top-0 left-0 w-full bg-red-800/90 text-white py-3 px-4 z-50 shadow-md backdrop-blur-sm">
            <div className="max-w-7xl mx-auto flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5 text-red-200" />
              <div className="flex-1">
                <p className="font-medium text-red-100">{appError}</p>
                
                {/* Troubleshooting tips based on error type */}
                {typeof appError === 'string' && (
                  <>
                    {(appError.includes('WebAssembly') || appError.includes('simulator')) ? (
                      <div className="mt-2 p-2 bg-red-900/50 border border-red-700/50 rounded text-xs text-red-200">
                        <strong className="block mb-1">Troubleshooting:</strong>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Reload the page so the WebAssembly simulator is fetched again</li>
                          <li>Make sure your browser allows WebAssembly (all modern browsers do)</li>
                          <li>Try with fewer qubits if the device is very slow</li>
                        </ul>
                      </div>
                    ) : appError.includes('simulation') ? (
                      <div className="mt-2 p-2 bg-red-900/50 border border-red-700/50 rounded text-xs text-red-200">
                        <strong className="block mb-1">Suggestions:</strong>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Try reducing the noise level</li>
                          <li>Use fewer qubits (currently limited to 10 max)</li>
                          <li>Select different target states</li>
                        </ul>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <button
                onClick={() => setAppError(null)}
                className="bg-red-700 hover:bg-red-600 p-1 rounded"
                aria-label="Dismiss error"
              >
                &times;
              </button>
            </div>
          </div>
        )}
        
        <main className="max-w-[1600px] mx-auto px-4 py-8 space-y-6">

        {/* --- Top Row: Config | Amplitude | Geometry --- */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

          {/* 1. Configuration (Top Left, Compact) */}
          <div className="xl:col-span-3">
            <div className="bg-quantum-800 border border-quantum-700 rounded-xl p-6 shadow-xl sticky top-24">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-quantum-success" />
                Algorithm Control
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {phase === AlgorithmPhase.INIT ? (
                  <button
                    onClick={handleCreateSuperposition}
                    className="col-span-2 bg-quantum-500 hover:bg-quantum-400 text-white py-3 rounded-lg font-semibold transition-all shadow-lg shadow-quantum-500/20 active:scale-95 flex items-center justify-center gap-2"
                  >
                    Create Superposition <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    {!isRunning ? (
                      <button
                        onClick={handleRun}
                        disabled={targetIndices.length === 0 || isQiskitLoading}
                        className="bg-quantum-success/90 hover:bg-quantum-success text-white py-2 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        aria-label="Run quantum simulation"
                      >
                        <Play className="w-4 h-4" /> Run
                      </button>
                    ) : (
                      <button
                        onClick={handlePause}
                        className="bg-yellow-600 hover:bg-yellow-500 text-white py-2 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
                        aria-label="Pause quantum simulation"
                      >
                        <Pause className="w-4 h-4" /> Pause
                      </button>
                    )}
                    <button
                      onClick={handleStep}
                      disabled={targetIndices.length === 0 || isRunning || isQiskitLoading}
                      className={`bg-quantum-700 hover:bg-quantum-600 text-white py-2 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isQiskitLoading ? 'cursor-wait opacity-70' : ''}`}
                    >
                      <SkipForward className="w-4 h-4" /> Step
                    </button>
                  </>
                )}
                <button
                  onClick={handleReset}
                  className="col-span-2 mt-2 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 border border-gray-600"
                >
                  <RotateCcw className="w-4 h-4" /> Reset
                </button>
              </div>

              <div className="mt-6 p-4 bg-black/30 rounded border border-quantum-700 font-mono text-xs text-gray-400 space-y-2">
                <div className="flex justify-between border-b border-gray-800 pb-1">
                  <span className="text-gray-500">Iterations:</span>
                  <span className={isOverRotated ? 'text-red-400 font-bold' : 'text-white'}>
                    {stepCount} <span className="text-gray-600">/ <span id="optimal-iterations-count" data-backend-value={optimalIterations}>
                      {useQiskitBackend && qiskitData ? `${qiskitData.length-1}` : optimalIterations}
                    </span></span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Status:</span>
                  {targetIndices.length > 0 ? (
                    isAtOptimal ? (
                      <span className="text-quantum-success font-bold flex items-center gap-1">Optimal Reached</span>
                    ) : isOverRotated ? (
                      <span className="text-red-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Over-rotating
                      </span>
                    ) : (
                      <span className="text-quantum-accent flex items-center gap-1">
                        {subStep === 'ORACLE' ? 'Next: Oracle' : 'Next: Diffusion'}
                      </span>
                    )
                  ) : (
                    <span className="text-gray-500">Select target states</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Amplitude Chart (Center, Wider) */}
          <div className="xl:col-span-5 space-y-2">
            <div className="h-[420px]">
              <StateChart
                data={states}
                targetIndices={targetIndices}
                selectable={phase === AlgorithmPhase.SUPERPOSITION}
                onBarClick={handleSelectTarget}
                meanAmplitude={meanAmplitude}
                showMean={subStep === 'ORACLE' || subStep === 'DIFFUSION'}
                qiskitData={
                  useQiskitBackend && qiskitData && Array.isArray(qiskitData) && stepCount < qiskitData.length
                    ? qiskitData[stepCount]  // This is already correctly typed as number[]
                    : null
                }
                idealData={useQiskitBackend ? idealStates : undefined} // Pass ideal data for comparison
                isLoading={isQiskitLoading} // Pass loading state to show skeletons
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 px-2">
              <span>Amplitude vs State Index</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-quantum-400 rounded-sm inline-block"></span> +
                <span className="w-2 h-2 bg-pink-400 rounded-sm inline-block ml-1"></span> -
              </div>
            </div>
          </div>

          {/* 3. Geometric View (Right) */}
          <div className="xl:col-span-4 h-[420px]">
            <GeometricView states={useQiskitBackend ? idealStates : states} targetIndices={targetIndices} />
          </div>
        </div>

        {/* --- Bottom Row: Controls & Logic --- */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

          {/* Controls (Left) */}
          <div className="xl:col-span-3">
            <div className="bg-quantum-800 border border-quantum-700 rounded-xl p-5 shadow-xl h-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-md font-semibold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-quantum-purple" />
                  Config
                </h2>
                {/* Mode Toggle */}
                <div className="flex bg-quantum-900 rounded p-1 border border-quantum-700">
                  <button
                    onClick={() => {
                      setConfigMode('QUBITS');
                      const currentN = numStates;
                      const nearestPow2 = Math.pow(2, Math.round(Math.log2(currentN)));
                      const clamped = Math.max(4, Math.min(64, nearestPow2));
                      setNumStates(clamped);
                    }}
                    disabled={phase !== AlgorithmPhase.INIT}
                    className={`text-[10px] px-2 py-1 rounded transition-colors ${configMode === 'QUBITS' ? 'bg-quantum-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                  >
                    Qubits
                  </button>
                  <button
                    onClick={() => setConfigMode('CUSTOM')}
                    disabled={phase !== AlgorithmPhase.INIT}
                    className={`text-[10px] px-2 py-1 rounded transition-colors ${configMode === 'CUSTOM' ? 'bg-quantum-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {/* Mode-Dependent Input */}
                {configMode === 'QUBITS' ? (
                  <div>
                    <label className="block text-xs text-gray-400 mb-2">Number of Qubits (N)</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="2"
                        max="6"
                        step="1"
                        value={Math.round(Math.log2(numStates))}
                        onChange={(e) => setNumStates(Math.pow(2, parseInt(e.target.value)))}
                        disabled={phase !== AlgorithmPhase.INIT}
                        className="w-full h-2 bg-quantum-900 rounded-lg appearance-none cursor-pointer accent-quantum-accent disabled:opacity-50"
                      />
                      <span className="font-mono text-lg w-6 text-center">{Math.round(Math.log2(numStates))}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">Total States: {numStates}</p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-gray-400 mb-2">Total Number of States</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="4"
                        max="128"
                        value={numStates}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 4 && val <= 128) setNumStates(val);
                        }}
                        disabled={phase !== AlgorithmPhase.INIT}
                        className="w-full bg-quantum-900 border border-quantum-700 text-white p-1.5 text-sm rounded focus:ring-quantum-accent focus:border-quantum-accent disabled:opacity-50"
                      />
                    </div>
                  </div>
                )}

                {/* Target Info */}
                <div className="pt-4 border-t border-quantum-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400">Target States</span>
                    <div className="flex flex-wrap gap-1">
                      {targetIndices.length > 0 ? (
                        targetIndices.map(idx => (
                          <span key={idx} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-quantum-purple/20 text-quantum-purple border border-quantum-purple/30">
                            |{configMode === 'QUBITS' ? idx.toString(2).padStart(Math.round(Math.log2(numStates)), '0') : idx}⟩
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] font-mono px-2 py-1 rounded bg-gray-800 text-gray-500">None</span>
                      )}
                    </div>
                  </div>
                  {phase === AlgorithmPhase.SUPERPOSITION && (
                    <p className={`text-[10px] mt-1 ${targetIndices.length === 0 ? 'text-quantum-accent animate-pulse' : 'text-gray-500'}`}>
                      {targetIndices.length === 0
                        ? 'Select bars in chart.'
                        : 'Click again to deselect.'}
                    </p>
                  )}
                </div>
                {/*Setting panel for optimal K with N*/}
                <div className="pt-4 border-t border-quantum-700 mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-yellow-400" />
                      Best K in Range
                    </h3>
                    
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="text-gray-600 mr-1">Range:</span>
                      <input 
                        type="number" 
                        value={searchMin} 
                        onChange={(e) => setSearchMin(Math.max(4, parseInt(e.target.value) || 4))}
                        className="w-14 bg-black/40 border border-quantum-600 rounded px-1 text-center text-gray-300 focus:text-white focus:border-quantum-400 outline-none transition-all"
                      />
                      <span className="text-gray-500">-</span>
                      <input 
                        type="number" 
                        value={searchMax} 
                        onChange={(e) => setSearchMax(Math.max(searchMin, parseInt(e.target.value) || 120))}
                        className="w-14 bg-black/40 border border-quantum-600 rounded px-1 text-center text-gray-300 focus:text-white focus:border-quantum-400 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="bg-quantum-900/50 rounded p-3 text-xs text-gray-400 border border-quantum-700/50">
                    <p className="mb-2 flex justify-between">
                      <span>Best K with Probability:</span>
                      <span className={`${isNaN(bestNInfo.maxProbability) ? 'text-gray-500' : 'text-green-400'} font-mono`}>
                        {(bestNInfo.maxProbability * 100).toFixed(3)}%
                      </span>
                    </p>
                    <div className="flex items-center justify-between bg-quantum-800 rounded p-2 border border-quantum-700">
                      <div className="flex flex-col gap-0.5">
                         <span className="text-quantum-accent font-mono font-bold text-sm">K = {bestNInfo.bestN}</span>
                         <span className="text-[12px] text-gray-500">
                           Iterations: {bestNInfo.optimalSteps || '?'}
                         </span>
                      </div>
                      
                      <button 
                        onClick={() => {
                          if (bestNInfo.bestN > 0) {
                            setNumStates(bestNInfo.bestN);
                            setConfigMode('CUSTOM'); 
                            handleReset();
                          }
                        }}
                        disabled={phase !== AlgorithmPhase.INIT || isRunning || bestNInfo.bestN === -1}
                        className="text-[10px] bg-quantum-600 hover:bg-quantum-500 text-white px-3 py-1.5 rounded border border-quantum-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                      >
                        Apply K
                      </button>
                    </div>
                  </div>
                  
                  {/* Qiskit Backend Toggle */}
                  <div className="pt-4 border-t border-quantum-700">
                    <div className="flex flex-col">
                      <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useQiskitBackend}
                          onChange={(e) => {
                            // If currently running, stop the algorithm before changing backend
                            if (isRunning) {
                              setIsRunning(false);
                            }
                            setUseQiskitBackend(e.target.checked);
                          }}
                          className="rounded bg-quantum-900 border-quantum-700 text-quantum-accent focus:ring-quantum-accent"
                          aria-label="Use noisy quantum simulator (WebAssembly)"
                        />
                        <span>Use Noisy Quantum Simulator (WASM)</span>
                      </label>
                      
                      {/* Backend Status Indicator */}
                      {useQiskitBackend && (
                        <div className="flex flex-col gap-2 mt-2 ml-5">
                          <div className="flex items-center gap-2 text-[10px]">
                            <div className={`w-2 h-2 rounded-full ${
                              backendConnected === null ? 'bg-gray-500' :
                              backendConnected ? 'bg-green-500' : 'bg-red-500'
                            }`}></div>
                            <span className={
                              backendConnected === null ? 'text-gray-500' :
                              backendConnected ? 'text-green-500' : 'text-red-500'
                            }>
                              {backendConnected === null ? 'Loading simulator...' :
                               backendConnected ? 'WASM simulator ready' : 'Simulator unavailable'}
                            </span>
                          </div>
                          
                          {/* Add explanation about the Qiskit simulation */}
                          {useQiskitBackend && (
                            <div className="text-[10px] text-amber-400 bg-gray-900/50 p-2 rounded border border-amber-900/50">
                              <p className="mb-1">In the chart:</p>
                              <ul className="list-disc list-inside space-y-1">
                                <li><span className="text-teal-400">Dashed lines</span> = Ideal mathematical results</li>
                                <li><span className="text-purple-400">Solid bars</span> = Noisy quantum simulation</li>
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {useQiskitBackend && (
                        <div className="mt-2 p-2 bg-quantum-900/50 rounded border border-quantum-700/50 text-[10px] text-quantum-accent">
                          <p>Runs in your browser: Rust → WebAssembly quantum-trajectory simulator with per-gate depolarizing noise (calibrated against Qiskit Aer). No server involved.</p>
                        </div>
                      )}
                    </div>
                    {useQiskitBackend && (
                      <div className="mt-4 space-y-2">
                        <label className="block text-xs text-gray-400">Noise Level (Error Rate)</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="0.000"
                            max="0.1"
                            step="0.001"
                            value={noiseLevel}
                            onChange={(e) => setNoiseLevel(parseFloat(e.target.value))}
                            className="w-full h-2 bg-quantum-900 rounded-lg appearance-none cursor-pointer accent-quantum-accent"
                          />
                          <span className="font-mono text-sm w-12 text-right">{noiseLevel.toFixed(3)}</span>
                        </div>
                        <p className="text-[10px] text-gray-500">Adjust simulation noise (0.000 = Perfect, 0.1 = High Noise)</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Logic & Stats (Right) */}
          <div className="xl:col-span-9 space-y-6">
            <ProbabilityChart
              history={history}
              optimalSteps={optimalIterations}
              useQiskitBackend={useQiskitBackend}
            />

            <div className="bg-quantum-800/30 border border-quantum-700 rounded-xl p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Algorithm Logic
                  </h3>
                  <div className="text-sm text-gray-400 space-y-2">
                    <p className={subStep === 'ORACLE' && phase === AlgorithmPhase.RUNNING ? 'text-gray-600 transition-colors' : 'text-gray-300'}>
                      <strong className="text-quantum-accent">Oracle (Phase Flip):</strong>
                      Identifies target states ({targetIndices.length}) and flips their phases.
                    </p>
                    <p className={subStep === 'DIFFUSION' && phase === AlgorithmPhase.RUNNING ? 'text-gray-600 transition-colors' : 'text-gray-300'}>
                      <strong className="text-quantum-accent">Diffusion (Amp. Amp.):</strong>
                      Reflects all amplitudes around the Mean Amplitude.
                    </p>
                    {isAtOptimal && (
                      <p className="pt-2 text-quantum-success border-t border-gray-700 mt-2">
                        <strong>Optimal Iterations Reached!</strong>
                      </p>
                    )}
                    {isOverRotated && (
                      <p className="pt-2 text-red-400 border-t border-gray-700 mt-2">
                        <strong>Over-rotating!</strong> Probability is decreasing.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-black/20 rounded border border-quantum-800">
                    <div className="col-span-2">
                      <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider block">Mean Amplitude</span>
                      <span className="font-mono text-amber-400 text-sm">{meanAmplitude.toFixed(4)}</span>
                    </div>
                  </div>
                  <div className="p-2 bg-yellow-900/20 border border-yellow-700/50 rounded text-xs text-yellow-200">
                    <strong>Note:</strong> Chart shows <em>Amplitude</em> (can be negative). Probability = Amplitude².
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
          </main>
        </div>
      </Suspense>
    </ErrorBoundary>
  );
};

export default App;
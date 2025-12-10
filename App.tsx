import React, { useState, useEffect, useCallback } from 'react';
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
  AlertTriangle
} from 'lucide-react';
import StateChart from './components/StateChart';
import ProbabilityChart from './components/ProbabilityChart';
import { 
  initializeState, 
  applyHadamard, 
  applyOracle, 
  applyDiffusion, 
  findOptimalIterations 
} from './utils/quantum';
import { QuantumState, AlgorithmPhase, StepHistory } from './types';

const App: React.FC = () => {
  // --- Config State ---
  const [numQubits, setNumQubits] = useState<number>(4);
  const [initialStateIndex, setInitialStateIndex] = useState<number>(0);
  const [targetIndices, setTargetIndices] = useState<number[]>([]);
  
  // --- Runtime State ---
  const [states, setStates] = useState<QuantumState[]>([]);
  const [phase, setPhase] = useState<AlgorithmPhase>(AlgorithmPhase.INIT);
  const [stepCount, setStepCount] = useState<number>(0);
  const [subStep, setSubStep] = useState<'ORACLE' | 'DIFFUSION'>('ORACLE');
  const [history, setHistory] = useState<StepHistory[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Use simulation to find optimal iterations based on current selection
  const optimalIterations = findOptimalIterations(numQubits, targetIndices);

  const isAtOptimal = stepCount === optimalIterations && subStep === 'ORACLE';
  const isOverRotated = stepCount > optimalIterations;

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

  // Initialize on load or reset
  const handleReset = useCallback(() => {
    setIsRunning(false); // Stop running immediately
    
    // Validate initial index against current qubit count
    let safeInitialIndex = initialStateIndex;
    if (safeInitialIndex >= Math.pow(2, numQubits)) {
      safeInitialIndex = 0;
      setInitialStateIndex(0);
    }

    const initial = initializeState(numQubits, safeInitialIndex);
    setStates(initial);
    setPhase(AlgorithmPhase.INIT);
    setStepCount(0);
    setSubStep('ORACLE');
    
    setHistory([{ step: 0, probTarget: 0, probOthers: 1 }]); 
    setTargetIndices([]);
  }, [numQubits, initialStateIndex]);

  // Handle Qubit or Initial State Change
  useEffect(() => {
    handleReset();
  }, [numQubits, initialStateIndex, handleReset]);

  // --- Actions ---

  const handleApplyHadamard = () => {
    const newStates = applyHadamard(states);
    setStates(newStates);
    setPhase(AlgorithmPhase.SUPERPOSITION);
    
    // Initial history after Hadamard
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

    // Auto-stop condition: Stop exactly at optimal iterations
    if (stepCount >= optimalIterations && subStep === 'ORACLE') {
      setIsRunning(false);
      return;
    }

    const timer = setTimeout(() => {
      executeStep();
    }, 1000);

    return () => clearTimeout(timer);
  }, [isRunning, stepCount, subStep, optimalIterations, executeStep]);


  const handleStep = () => {
    executeStep();
  };

  const handleRun = () => {
    if (targetIndices.length === 0) return;
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  return (
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

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Controls & Info */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Configuration Card */}
          <div className="bg-quantum-800 border border-quantum-700 rounded-xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-quantum-purple" />
              Configuration
            </h2>
            
            <div className="space-y-4">
              {/* Qubit Count */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Number of Qubits (N)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="2" 
                    max="6" 
                    value={numQubits} 
                    onChange={(e) => setNumQubits(parseInt(e.target.value))}
                    disabled={phase !== AlgorithmPhase.INIT}
                    className="w-full h-2 bg-quantum-900 rounded-lg appearance-none cursor-pointer accent-quantum-accent disabled:opacity-50"
                  />
                  <span className="font-mono text-xl w-8 text-center">{numQubits}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Total States: {Math.pow(2, numQubits)}</p>
              </div>

              {/* Initial State Selector */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Initial State (Pre-Hadamard)</label>
                <select 
                  value={initialStateIndex}
                  onChange={(e) => setInitialStateIndex(parseInt(e.target.value))}
                  disabled={phase !== AlgorithmPhase.INIT}
                  className="w-full bg-quantum-900 border border-quantum-700 text-white text-sm rounded-lg p-2.5 focus:ring-quantum-accent focus:border-quantum-accent font-mono disabled:opacity-50"
                >
                  {Array.from({ length: Math.pow(2, numQubits) }).map((_, idx) => (
                    <option key={idx} value={idx}>
                      |{idx.toString(2).padStart(numQubits, '0')}⟩
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Standard Grover's starts with |0...0⟩.
                </p>
              </div>

              {/* Target State Info */}
              <div className="pt-4 border-t border-quantum-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Target States</span>
                  <div className="flex flex-wrap gap-1">
                      {targetIndices.length > 0 ? (
                          targetIndices.map(idx => (
                            <span key={idx} className="text-xs font-mono px-2 py-1 rounded bg-quantum-purple/20 text-quantum-purple border border-quantum-purple/30">
                                |{idx.toString(2).padStart(numQubits, '0')}⟩
                            </span>
                          ))
                      ) : (
                        <span className="text-xs font-mono px-2 py-1 rounded bg-gray-800 text-gray-500">None Selected</span>
                      )}
                  </div>
                </div>
                {phase === AlgorithmPhase.SUPERPOSITION && (
                  <p className={`text-xs mt-2 ${targetIndices.length === 0 ? 'text-quantum-accent animate-pulse' : 'text-gray-500'}`}>
                    {targetIndices.length === 0 
                        ? 'Click a bar in the chart to select a target' 
                        : 'Click other bars to select multiple, or click again to deselect.'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Controls Card */}
          <div className="bg-quantum-800 border border-quantum-700 rounded-xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-quantum-success" />
              Algorithm Control
            </h2>

            <div className="grid grid-cols-2 gap-3">
              {phase === AlgorithmPhase.INIT ? (
                 <button 
                  onClick={handleApplyHadamard}
                  className="col-span-2 bg-quantum-500 hover:bg-quantum-400 text-white py-3 rounded-lg font-semibold transition-all shadow-lg shadow-quantum-500/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  Apply Hadamard <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <>
                  {!isRunning ? (
                     <button 
                      onClick={handleRun}
                      // Run is disabled if over-rotated or at optimal, forcing user to use "Step" to go beyond or Reset
                      disabled={targetIndices.length === 0 || isOverRotated || isAtOptimal}
                      className="bg-quantum-success/90 hover:bg-quantum-success text-white py-2 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4" /> Run
                    </button>
                  ) : (
                    <button 
                      onClick={handlePause}
                      className="bg-yellow-600 hover:bg-yellow-500 text-white py-2 rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
                    >
                      <Pause className="w-4 h-4" /> Pause
                    </button>
                  )}
                 
                  <button 
                    onClick={handleStep}
                    disabled={targetIndices.length === 0 || isRunning}
                    className="bg-quantum-700 hover:bg-quantum-600 text-white py-2 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                  {stepCount} <span className="text-gray-600">/ {optimalIterations}</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Status:</span>
                {isAtOptimal ? (
                   <span className="text-quantum-success font-bold flex items-center gap-1">Optimal Reached</span>
                ) : isOverRotated ? (
                   <span className="text-red-400 font-bold flex items-center gap-1">
                     <AlertTriangle className="w-3 h-3" /> Over-rotating
                   </span>
                ) : (
                    <span className="text-quantum-accent flex items-center gap-1">
                        {subStep === 'ORACLE' ? 'Next: Oracle' : 'Next: Diffusion'}
                    </span>
                )}
              </div>
            </div>
          </div>
          
        </div>

        {/* Right Column: Visualization */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Main Visualizer */}
          <div className="space-y-2">
            <StateChart 
              data={states} 
              targetIndices={targetIndices}
              selectable={phase === AlgorithmPhase.SUPERPOSITION}
              onBarClick={handleSelectTarget}
              meanAmplitude={meanAmplitude}
              showMean={subStep === 'ORACLE' || subStep === 'DIFFUSION'}
            />
             <div className="flex justify-between text-xs text-gray-500 px-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-quantum-400 rounded-sm inline-block"></span> Positive Phase
                <span className="w-3 h-3 bg-pink-400 rounded-sm inline-block ml-2"></span> Negative Phase
              </div>
              <div>
                {subStep === 'DIFFUSION' && phase === AlgorithmPhase.RUNNING 
                    ? <span className="text-pink-400 animate-pulse">Oracle applied. Target phases flipped. Ready for Diffusion.</span> 
                    : "Amplitude Visualization"
                }
              </div>
            </div>
          </div>

          {/* Probability Trend */}
          <div>
            <ProbabilityChart history={history} optimalSteps={optimalIterations} />
          </div>

          {/* Explanation Area */}
          <div className="bg-quantum-800/30 border border-quantum-700 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Algorithm Logic
            </h3>
            
            {/* Stats Panel */}
            <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-black/20 rounded border border-quantum-800">
               <div className="col-span-2">
                 <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider block">Mean Amplitude</span>
                 <span className="font-mono text-amber-400 text-sm">{meanAmplitude.toFixed(4)}</span>
               </div>
            </div>

            <div className="text-sm text-gray-400 space-y-2">
              <p className={subStep === 'ORACLE' && phase === AlgorithmPhase.RUNNING ? 'text-gray-600 transition-colors' : 'text-gray-300'}>
                <strong className="text-quantum-accent">Oracle (Phase Flip):</strong> 
                Identifies target states ({targetIndices.length}) and flips their phases. Amplitudes become negative but probability magnitude remains unchanged.
              </p>
              <p className={subStep === 'DIFFUSION' && phase === AlgorithmPhase.RUNNING ? 'text-gray-600 transition-colors' : 'text-gray-300'}>
                <strong className="text-quantum-accent">Diffusion (Amplitude Amplification):</strong> 
                Reflects all amplitudes around the Mean Amplitude. This operation boosts the amplitude of target states (which are currently negative) while diminishing non-target states.
              </p>
              
               <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-700/50 rounded text-xs text-yellow-200">
                  <strong>Note:</strong> The bars in the chart represent <em>Amplitude</em>, which can be negative (Phase). Probability is Amplitude squared (always positive).
               </div>

              {isAtOptimal && (
                  <p className="pt-2 text-quantum-success border-t border-gray-700 mt-2">
                      <strong>Optimal Iterations Reached!</strong> The total target probability is at its peak based on simulation.
                  </p>
              )}
               {isOverRotated && (
                  <p className="pt-2 text-red-400 border-t border-gray-700 mt-2">
                      <strong>Over-rotation Detected:</strong> You have exceeded the optimal iterations. The probability amplitude is rotating away from the target states.
                  </p>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;
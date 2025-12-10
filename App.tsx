import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Play, 
  SkipForward, 
  RotateCcw, 
  Target, 
  Layers,
  Cpu,
  ArrowRight,
  Pause,
  Zap
} from 'lucide-react';
import StateChart from './components/StateChart';
import ProbabilityChart from './components/ProbabilityChart';
import AIHelper from './components/AIHelper';
import { 
  initializeState, 
  applyHadamard, 
  applyOracle, 
  applyDiffusion, 
  getOptimalIterations 
} from './utils/quantum';
import { QuantumState, AlgorithmPhase, StepHistory } from './types';

const App: React.FC = () => {
  // --- Config State ---
  const [numQubits, setNumQubits] = useState<number>(4);
  const [initialStateIndex, setInitialStateIndex] = useState<number>(0);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  
  // --- Runtime State ---
  const [states, setStates] = useState<QuantumState[]>([]);
  const [phase, setPhase] = useState<AlgorithmPhase>(AlgorithmPhase.INIT);
  const [stepCount, setStepCount] = useState<number>(0);
  const [subStep, setSubStep] = useState<'ORACLE' | 'DIFFUSION'>('ORACLE');
  const [history, setHistory] = useState<StepHistory[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const optimalIterations = getOptimalIterations(numQubits);
  const isFinished = stepCount >= optimalIterations && subStep === 'ORACLE';

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
    setTargetIndex(null);
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
    
    // Recalculate history based on current target (if any)
    const probT = targetIndex !== null ? newStates[targetIndex].probability : 0;
    const probO = targetIndex !== null 
      ? (1 - probT) / (newStates.length - 1) 
      : 1 / newStates.length;
      
    setHistory([{ step: 0, probTarget: probT, probOthers: probO }]);
  };

  const handleSelectTarget = (index: number) => {
    if (phase !== AlgorithmPhase.SUPERPOSITION) return;
    setTargetIndex(index);
    
    const currentProb = states[index].probability;
    const othersProb = (1 - currentProb) / (states.length - 1);
    
    setHistory([{ step: 0, probTarget: currentProb, probOthers: othersProb }]);
  };

  const executeStep = useCallback(() => {
    if (targetIndex === null) return;
    
    // Prevent execution if we have reached optimal iterations
    // We check stepCount >= optimalIterations. 
    // If subStep is ORACLE, it means we are at the start of a new iteration loop (which we shouldn't start).
    if (stepCount >= optimalIterations && subStep === 'ORACLE') return;

    setStates(prevStates => {
      if (subStep === 'ORACLE') {
        return applyOracle(prevStates, targetIndex);
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
  }, [targetIndex, subStep, stepCount, optimalIterations]);

  // Effect to update history whenever states change during running phase
  // Note: We only update history when a full iteration completes (stepCount increases)
  // because probability only changes significantly after Diffusion.
  useEffect(() => {
    if (phase === AlgorithmPhase.RUNNING && targetIndex !== null) {
      const probTarget = states[targetIndex].probability;
      const probOthers = (1 - probTarget) / (states.length - 1);

      setHistory(prev => {
        // If stepCount matches the last entry, we are likely in the middle of an iteration (Post-Oracle)
        // or just updated. We only want one entry per Iteration index.
        if (prev.length > 0 && prev[prev.length - 1].step === stepCount) return prev;
        return [...prev, { step: stepCount, probTarget, probOthers }];
      });
    }
  }, [states, stepCount, phase, targetIndex]);

  // Run Loop Manager
  useEffect(() => {
    if (!isRunning) return;

    // Stop condition: strictly stop at optimal iterations
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
    if (targetIndex === null) return;
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
                  <span className="text-sm text-gray-400">Target State</span>
                  <span className={`text-xs font-mono px-2 py-1 rounded ${targetIndex !== null ? 'bg-quantum-purple/20 text-quantum-purple' : 'bg-gray-800 text-gray-500'}`}>
                    {targetIndex !== null ? `|${targetIndex.toString(2).padStart(numQubits, '0')}⟩` : 'None Selected'}
                  </span>
                </div>
                {phase === AlgorithmPhase.SUPERPOSITION && (
                  <p className={`text-xs mt-2 ${targetIndex === null ? 'text-quantum-accent animate-pulse' : 'text-gray-500'}`}>
                    {targetIndex === null ? 'Click a bar in the chart to select the target' : 'Click another bar to change target'}
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
                      disabled={targetIndex === null || isFinished}
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
                    disabled={targetIndex === null || isRunning || isFinished}
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
                <span className="text-white">{stepCount} <span className="text-gray-600">/ {optimalIterations}</span></span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Next Action:</span>
                {isFinished ? (
                   <span className="text-quantum-success font-bold">FINISHED</span>
                ) : (
                    <span className="text-quantum-accent flex items-center gap-1">
                        {subStep === 'ORACLE' ? 'Phase Flip (Oracle)' : 'Diffusion'}
                        <ArrowRight className="w-3 h-3" />
                    </span>
                )}
              </div>
            </div>
          </div>
          
          {targetIndex !== null && (
            <AIHelper 
              stepIndex={stepCount}
              numQubits={numQubits}
              targetIndex={targetIndex}
              currentProbability={states[targetIndex].probability}
              history={history}
            />
          )}

        </div>

        {/* Right Column: Visualization */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Main Visualizer */}
          <div className="space-y-2">
            <StateChart 
              data={states} 
              targetIndex={targetIndex}
              selectable={phase === AlgorithmPhase.SUPERPOSITION}
              onBarClick={handleSelectTarget}
            />
             <div className="flex justify-between text-xs text-gray-500 px-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-quantum-400 rounded-sm inline-block"></span> Positive Phase
                <span className="w-3 h-3 bg-pink-400 rounded-sm inline-block ml-2"></span> Negative Phase
              </div>
              <div>
                {subStep === 'DIFFUSION' && phase === AlgorithmPhase.RUNNING 
                    ? <span className="text-pink-400 animate-pulse">Oracle applied. Target phase flipped. Ready for Diffusion.</span> 
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
            <div className="text-sm text-gray-400 space-y-2">
              <p className={subStep === 'ORACLE' && phase === AlgorithmPhase.RUNNING ? 'text-gray-600 transition-colors' : 'text-gray-300'}>
                <strong className="text-quantum-accent">Oracle (Phase Flip):</strong> 
                Identifies target state |w⟩ and flips its phase. Amplitudes become negative but probability magnitude remains unchanged.
              </p>
              <p className={subStep === 'DIFFUSION' && phase === AlgorithmPhase.RUNNING ? 'text-gray-600 transition-colors' : 'text-gray-300'}>
                <strong className="text-quantum-accent">Diffusion (Inversion about Mean):</strong> 
                Amplifies the state with negative phase (target) while suppressing others. Probability flows into target.
              </p>
              {isFinished && (
                  <p className="pt-2 text-quantum-success border-t border-gray-700 mt-2">
                      <strong>Optimal Iterations Reached!</strong> The target probability should now be near maximal. Further iterations would over-rotate and reduce accuracy.
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
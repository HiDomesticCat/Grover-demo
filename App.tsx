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
  AlertTriangle,
  Sparkles
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

const App: React.FC = () => {
  // --- Config State ---
  const [configMode, setConfigMode] = useState<'QUBITS' | 'CUSTOM'>('QUBITS');
  // We use numStates as the single source of truth. 
  // In QUBITS mode, this will always be a power of 2.
  const [numStates, setNumStates] = useState<number>(16);
  const [targetIndices, setTargetIndices] = useState<number[]>([]);

  // --- Runtime State ---
  const [states, setStates] = useState<QuantumState[]>([]);
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

  //used to find the optimal K choose 1 within given range that having the largest prob
  const [searchMin, setSearchMin] = useState<number>(4);
  const [searchMax, setSearchMax] = useState<number>(120);

  const bestNInfo = React.useMemo(() => {
    const k = targetIndices.length > 0 ? targetIndices.length : 1;
    return findBest_N_InRange(searchMin, searchMax, k);
  }, [searchMin, searchMax, targetIndices.length]);

  // Initialize on load or reset
  const handleReset = useCallback(() => {
    setIsRunning(false); // Stop running immediately

    // Always start with |0...0> (or uniform zero-index start)
    const initial = initializeState(numStates, 0);
    setStates(initial);
    setPhase(AlgorithmPhase.INIT);
    setStepCount(0);
    setSubStep('ORACLE');

    setHistory([{ step: 0, probTarget: 0, probOthers: 1 }]);
    setTargetIndices([]);
  }, [numStates]);

  // Handle State Count Change
  useEffect(() => {
    handleReset();
  }, [numStates, handleReset]);

  // --- Actions ---

  const handleCreateSuperposition = () => {
    const newStates = createSuperposition(states);
    setStates(newStates);
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
            <GeometricView states={states} targetIndices={targetIndices} />
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
                          if (!isNaN(val) && val >= 4 && val <= 1024) setNumStates(val);
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
                </div>
              </div>
            </div>
          </div>

          {/* Logic & Stats (Right) */}
          <div className="xl:col-span-9 space-y-6">
            <ProbabilityChart history={history} optimalSteps={optimalIterations} />

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
  );
};

export default App;
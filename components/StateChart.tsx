import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Label
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { QuantumState, ComparableQuantumState } from '../types';

// Constants for performance optimization
const VIRTUALIZATION_THRESHOLD = 32; // Number of states above which we'll use virtualization
const VIRTUAL_CHUNK_SIZE = 16; // Number of states to show in each chunk when virtualized

// Extended QuantumState type with additional properties for virtualization and comparison
interface ExtendedQuantumState extends ComparableQuantumState {
  qiskitProbability?: number | null;
  idealProbability?: number | null;
  actualIndex?: number;
}

interface StateChartProps {
  data: QuantumState[];
  targetIndices: number[];
  onBarClick?: (index: number) => void;
  selectable: boolean;
  meanAmplitude?: number;
  showMean?: boolean;
  qiskitData: number[] | null; // Strict typing
  idealData?: QuantumState[]; // Added: ideal mathematical simulation data for comparison
  stepCount?: number;
  isLoading?: boolean; // Add loading state prop
}

const CustomBackground = (props: any) => {
  const { x, y, width, height, index, onBarClick, selectable } = props;
  
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill="transparent" // Invisible by default
      className={selectable ? "cursor-pointer hover:fill-white/10 transition-colors" : ""}
      onClick={() => {
        if (selectable && onBarClick) {
          onBarClick(index);
        }
      }}
    />
  );
};

/**
 * StateChart component visualizes quantum state amplitudes and probabilities
 * with support for state selection, virtualization for large state spaces,
 * and comparison between ideal math and noisy simulation
 */
const StateChart: React.FC<StateChartProps> = ({
  data,
  targetIndices,
  onBarClick,
  selectable,
  meanAmplitude,
  showMean,
  qiskitData,
  idealData,
  isLoading = false
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  // For virtualized rendering with many states
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, Math.min(VIRTUAL_CHUNK_SIZE, data.length)]);
  
  // Track virtualization status
  const isVirtualized = data.length > VIRTUALIZATION_THRESHOLD;
  
  // Responsive width calculations
  const minWidth = 40; // Minimum width per bar
  const yAxisWidth = 60;
  
  // Calculate width - either full width or virtualized width
  const calculatedWidth = isVirtualized
    ? (VIRTUAL_CHUNK_SIZE * minWidth) + yAxisWidth
    : (data.length * minWidth) + yAxisWidth;
  
  // Reset visible range when data length changes
  useEffect(() => {
    if (isVirtualized) {
      setVisibleRange([0, Math.min(VIRTUAL_CHUNK_SIZE, data.length)]);
    }
  }, [data.length, isVirtualized]);
  
  // Handle navigation for virtualized view
  const handlePrevChunk = () => {
    if (visibleRange[0] > 0) {
      const newStart = Math.max(0, visibleRange[0] - VIRTUAL_CHUNK_SIZE);
      setVisibleRange([newStart, newStart + VIRTUAL_CHUNK_SIZE]);
    }
  };
  
  const handleNextChunk = () => {
    if (visibleRange[1] < data.length) {
      const newStart = Math.min(data.length - VIRTUAL_CHUNK_SIZE, visibleRange[1]);
      setVisibleRange([newStart, Math.min(data.length, newStart + VIRTUAL_CHUNK_SIZE)]);
    }
  };
  
  // Get currently visible data
  const visibleData = useMemo((): ExtendedQuantumState[] => {
    if (!isVirtualized) {
      return data.map((item, index) => ({
        ...item,
        actualIndex: index
      }));
    }
    return data.slice(visibleRange[0], visibleRange[1]).map((item, index) => ({
      ...item,
      actualIndex: index + visibleRange[0]
    }));
  }, [data, visibleRange, isVirtualized]);

  // Custom tooltip to show detailed info
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const stateData = payload[0].payload as ExtendedQuantumState;
      const isTarget = targetIndices.includes(stateData.index);
      
      // Get various probability values
      const qiskitProb = stateData.qiskitProbability !== undefined && stateData.qiskitProbability !== null
        ? stateData.qiskitProbability : null;
      
      // Get ideal probability - either from idealData or from the state's own probability
      const idealProb = stateData.idealProbability !== undefined 
        ? stateData.idealProbability 
        : stateData.probability;
        
      // Determine primary display probability based on what's available
      const displayProbability = qiskitProb !== null ? qiskitProb : idealProb;
      
      return (
        <div
          className="bg-quantum-800 border border-quantum-500 p-3 rounded shadow-xl text-xs z-50 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation(); // Prevent event from bubbling to BarChart
            if (selectable && onBarClick) {
              onBarClick(stateData.index);
            }
          }}
        >
          <p className="font-bold text-white mb-1">State |{stateData.binary}⟩ {isTarget && <span className="text-quantum-purple ml-2">(Target)</span>}</p>
          <div className="space-y-1">
            {/* Show different content depending on available data */}
            {qiskitProb !== null && idealProb !== null ? (
              <>
                <p className="text-gray-300 flex justify-between gap-4">
                  <span>Qiskit Simulation:</span>
                  <span className="font-mono text-quantum-accent">{(qiskitProb * 100).toFixed(2)}%</span>
                </p>
                <p className="text-gray-300 flex justify-between gap-4">
                  <span>Ideal Probability:</span>
                  <span className="font-mono text-teal-400">{(idealProb * 100).toFixed(2)}%</span>
                </p>
                <p className="text-gray-300 flex justify-between gap-4">
                  <span>Difference:</span>
                  <span className={`font-mono ${Math.abs(qiskitProb - idealProb) > 0.05 ? 'text-red-400' : 'text-gray-400'}`}>
                    {(Math.abs(qiskitProb - idealProb) * 100).toFixed(2)}%
                  </span>
                </p>
              </>
            ) : (
              <>
                <p className="text-gray-300 flex justify-between gap-4">
                  <span>Amplitude:</span>
                  <span className={`font-mono ${stateData.amplitude < 0 ? 'text-pink-400' : 'text-quantum-accent'}`}>
                    {stateData.amplitude.toFixed(4)}
                  </span>
                </p>
                <p className="text-gray-300 flex justify-between gap-4">
                  <span>Probability:</span>
                  <span className="font-mono text-quantum-purple">{(stateData.probability * 100).toFixed(2)}%</span>
                </p>
                <p className="text-gray-300 flex justify-between gap-4">
                  <span>Phase:</span>
                  <span className="font-mono text-gray-400">{stateData.amplitude < 0 ? '180° (π)' : '0°'}</span>
                </p>
              </>
            )}
          </div>
          {selectable && (
            <div className="mt-2 pt-2 border-t border-quantum-700 text-center text-quantum-accent text-[10px] font-bold">
              {isTarget ? 'CLICK TO DESELECT' : 'CLICK TO SELECT'}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-64 md:h-80 bg-quantum-800/50 rounded-lg p-4 border border-quantum-700 flex flex-col">
      <div className="flex justify-between items-start mb-2 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Amplitude Phase Graph
        </h3>
        {selectable && (
          <span className="text-xs text-quantum-accent animate-pulse bg-quantum-900/50 px-2 py-1 rounded border border-quantum-500/30">
            {targetIndices.length === 0 ? 'Select Target State(s)' : 'Click to Toggle Selection'}
          </span>
        )}
      </div>
      
      {/* Hint for selection */}
      {selectable && targetIndices.length === 0 && (
        <div className="text-[10px] text-quantum-accent mb-1 text-center animate-pulse">
          ← Click on bars to select target states
        </div>
      )}
      
      {/* Loading State */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center text-quantum-accent">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">Loading quantum state data...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Virtualization Navigation (only show if virtualized) */}
          {isVirtualized && (
            <div className="flex justify-between items-center mb-2 text-xs">
              <button
                onClick={handlePrevChunk}
                disabled={visibleRange[0] === 0}
                className="px-2 py-1 bg-quantum-700 rounded disabled:opacity-50"
                aria-label="View previous states"
              >
                ← Prev
              </button>
              <span className="text-gray-400">
                Showing states {visibleRange[0]+1}-{visibleRange[1]} of {data.length}
              </span>
              <button
                onClick={handleNextChunk}
                disabled={visibleRange[1] >= data.length}
                className="px-2 py-1 bg-quantum-700 rounded disabled:opacity-50"
                aria-label="View next states"
              >
                Next →
              </button>
            </div>
          )}

          {/*Scrolling Component Container*/}
          <div className="flex-1 w-full min-h-0 overflow-x-auto overflow-y-hidden relative custom-scrollbar">
            <div style={{ minWidth: '100%', width: Math.max(100, calculatedWidth) + 'px', height: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={visibleData.map((item, index) => {
                    // Adjust index to account for virtualization when needed
                    const actualIndex = isVirtualized ? item.actualIndex ?? index : index;
                    
                    // Initialize with two types of data
                    let qiskitProbability: number | null = null;
                    let idealProbability: number | null = null;
                    
                    // 1. Get Qiskit data if available
                    if (qiskitData !== null && Array.isArray(qiskitData)) {
                      qiskitProbability = actualIndex < qiskitData.length ? qiskitData[actualIndex] : null;
                    }
                    
                    // 2. Get ideal data if available from separate source
                    if (idealData && Array.isArray(idealData)) {
                      // Find matching state by index - this is critical for accuracy
                      // We need to match the state indices exactly, not their position in the array
                      const matchingIdealState = idealData.find(state => state.index === item.index);
                      if (matchingIdealState) {
                        idealProbability = matchingIdealState.probability;
                      }
                    }
                    
                    return {
                      ...item,
                      qiskitProbability,
                      idealProbability
                    };
                  })}
                  margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                  barCategoryGap={1}
                  onMouseMove={(state: any) => {
                    if (state?.activePayload?.[0]) {
                      setHoveredIndex(state.activePayload[0].payload.index);
                    }
                  }}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis
                    dataKey="binary"
                    interval={0}
                    tick={{
                      fill: '#94a3b8',
                      fontSize: 10,
                      fontFamily: 'monospace',
                      textAnchor: 'end'
                    }}
                    //Rotate labels for better readability
                    angle={-45}
                    height={50}
                    dy={10}
                  >
                    <Label value="Quantum States (Basis Vectors)" offset={-10} position="insideBottom" fill="#64748b" style={{ fontSize: '10px' }} />
                  </XAxis>
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    domain={qiskitData ? [0, 1] : [-1, 1]} // For amplitude visualization, show full range [-1, 1]
                    width={40}
                  >
                    <Label
                      value="Probability"
                      angle={-90}
                      position="insideLeft"
                      fill="#94a3b8"
                      style={{ fontSize: '11px', fontWeight: 'bold' }}
                      offset={10}
                    />
                  </YAxis>
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
                  <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
                  {/* Mean Amplitude Line */}
                  {showMean && meanAmplitude !== undefined && (
                    <ReferenceLine
                      y={meanAmplitude}
                      stroke="#bd933aff"
                      strokeDasharray="3 3"
                      label={{
                        position: 'insideLeft',
                        value: 'Mean',
                        fill: '#bd933aff',
                        fontSize: 10,
                        offset: 10,
                        dy: -10,
                      }}
                    />
                  )}
                  
                  {/* Ideal Data - Dashed Ghost Bars */}
                  {qiskitData && idealData && (
                    <Bar
                      dataKey="idealProbability"
                      fill="none"
                      stroke="#22d3ee"  // Cyan for ideal data
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Ideal (Math)"
                      // Custom label to show values for ideal data
                      label={{
                        position: 'top',
                        formatter: (val: number) => val > 0.1 ? (val * 100).toFixed(0) + '%' : '',
                        fill: '#22d3ee',
                        fontSize: 10
                      }}
                      isAnimationActive={false}
                    />
                  )}
                  {/* Real/Qiskit Data - Solid Bars */}
                  <Bar
                    dataKey={qiskitData ? "qiskitProbability" : "amplitude"}
                    fill="#8B5CF6"  // Purple for actual data
                    isAnimationActive={!qiskitData}
                    cursor={selectable ? "pointer" : "default"}
                    name="Real (Qiskit)"
                    // Custom label to show values for debugging
                    label={qiskitData ? {
                      position: 'top',
                      formatter: (val: number) => val > 0.05 ? val.toFixed(2) : '',
                      fill: '#fff',
                      fontSize: 10
                    } : false}
                    onClick={(data) => {
                      if (selectable && onBarClick) {
                        const clickIndex = data.payload?.index;
                        if (typeof clickIndex === 'number') {
                          onBarClick(clickIndex);
                        }
                      }
                    }}
                    background={
                      <CustomBackground
                        onBarClick={onBarClick}
                        selectable={selectable}
                      />
                    }
                  >
                    {visibleData.map((entry, index) => {
                      // Check if state is a target
                      const isTarget = targetIndices.includes(entry.index);
                      // When using Qiskit data, we show probabilities (0-1), otherwise amplitudes (-1 to 1)
                      // For non-target states, use blue for positive and red for negative amplitudes
                      const fill = isTarget
                        ? '#8b5cf6'  // Purple for target states
                        : entry.amplitude >= 0
                          ? '#3b82f6'  // Blue for positive non-target amplitudes
                          : '#ef4444'; // Red for negative non-target amplitudes
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={fill}
                          stroke={isTarget ? '#fff' : '#cbd5e1'}
                          strokeWidth={isTarget ? 2 : 1}
                          className="transition-all duration-300 hover:opacity-80 cursor-pointer"
                        />
                      );
                    })}
                  </Bar>
                  
                  {/* Removed duplicate Bar component for ideal data since we now render it before the real data */}
                </BarChart>
              </ResponsiveContainer>
              
              {/* Enhanced Legend for Comparison */}
              {qiskitData && (
                <div className="absolute top-2 right-2 bg-quantum-900/80 backdrop-blur-sm p-2 rounded border border-quantum-700 text-xs text-gray-300 z-10">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-3 border-t-2 border-dashed border-teal-400"></div>
                      <span className="text-teal-400">Ideal (Mathematical)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-3 bg-purple-500"></div>
                      <span className="text-purple-400">Real (Qiskit)</span>
                    </div>
                    <div className="pt-1 text-[10px] text-gray-500">
                      Difference shows noise impact
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Use React.memo to prevent unnecessary re-renders
export default React.memo(StateChart);
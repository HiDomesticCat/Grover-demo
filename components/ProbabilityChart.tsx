import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts';
import { StepHistory } from '../types';

interface ProbabilityChartProps {
  history: StepHistory[];
  optimalSteps: number;
  useQiskitBackend?: boolean;
}

const ProbabilityChart: React.FC<ProbabilityChartProps> = ({ history, optimalSteps, useQiskitBackend = false }) => {

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as StepHistory;
      const probTarget = data.probTarget;
      // Calculate total probability of all other states (1 - P(target))
      const probRest = 1 - probTarget;

      // Get ideal probabilities if available
      const hasIdealData = data.idealProbTarget !== undefined;
      const idealProbTarget: number | null = hasIdealData && data.idealProbTarget !== undefined ? data.idealProbTarget : null;
      const idealProbRest = idealProbTarget !== null ? (1 - idealProbTarget) : null;

      // Calculate difference between real and ideal if both are available
      const probDiff = idealProbTarget !== null
        ? Math.abs(probTarget - idealProbTarget)
        : null;

      return (
        <div className="bg-quantum-800 border border-quantum-500 p-3 rounded shadow-xl text-xs">
          <p className="font-bold text-gray-400 mb-2">Iteration {label}</p>
          
          {/* Show comparison if ideal data exists */}
          {hasIdealData ? (
            <div className="space-y-3">
              <div className="border-b border-gray-700 pb-2">
                <h4 className="text-[10px] text-gray-500 uppercase font-bold mb-1">Real (Qiskit)</h4>
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-quantum-purple"></span>
                  <span className="text-gray-300">Target State:</span>
                  <span className="text-quantum-accent font-mono font-bold">{(probTarget * 100).toFixed(2)}%</span>
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                  <span className="text-gray-300">Other States:</span>
                  <span className="text-gray-400 font-mono font-bold">{(probRest * 100).toFixed(2)}%</span>
                </p>
              </div>
              
              <div className="border-b border-gray-700 pb-2">
                <h4 className="text-[10px] text-gray-500 uppercase font-bold mb-1">Ideal (Mathematical)</h4>
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                  <span className="text-gray-300">Target State:</span>
                  <span className="text-teal-400 font-mono font-bold text-base">{idealProbTarget !== null ? (idealProbTarget * 100).toFixed(2) : 'N/A'}%</span>
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-900"></span>
                  <span className="text-gray-300">Other States:</span>
                  <span className="text-teal-200 font-mono font-bold">{idealProbRest !== null ? (idealProbRest * 100).toFixed(2) : 'N/A'}%</span>
                </p>
              </div>
              
              {/* Difference section */}
              {probDiff !== null && (
                <div className="pt-1">
                  <p className="flex justify-between">
                    <span className="text-gray-400">Difference:</span>
                    <span className={`font-mono ${probDiff > 0.1 ? 'text-red-400' : 'text-gray-400'}`}>
                      {(probDiff * 100).toFixed(2)}%
                    </span>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-quantum-purple"></span>
                <span className="text-gray-300">Target State:</span>
                <span className="text-quantum-accent font-mono font-bold">{(probTarget * 100).toFixed(2)}%</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                <span className="text-gray-300">Other States:</span>
                <span className="text-gray-400 font-mono font-bold">{(probRest * 100).toFixed(2)}%</span>
              </p>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Check if we have ideal data in the history
  const hasIdealData = React.useMemo(() => {
    return history.some(item => item.idealProbTarget !== undefined);
  }, [history]);

  // Ensure we force display of ideal data legend items when using Qiskit
  const showIdealLines = hasIdealData || useQiskitBackend;

  // Find the last data point with ideal probability (should be ~99.96% at optimal step)
  const finalIdealProb = React.useMemo(() => {
    if (!history.length) return null;
    
    // Find the last entry with idealProbTarget defined
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].idealProbTarget !== undefined) {
        return {
          step: history[i].step,
          value: history[i].idealProbTarget as number // Force TypeScript to treat as number
        };
      }
    }
    return null;
  }, [history]);
  
  return (
    <div className="w-full h-48 bg-quantum-800/50 rounded-lg p-4 border border-quantum-700">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Probability Evolution
        </h3>
        {finalIdealProb && typeof finalIdealProb.value === 'number' && finalIdealProb.value > 0.9 && (
          <div className="bg-black/30 rounded px-2 py-0.5">
            <span className="text-xs text-gray-400">Final Ideal: </span>
            <span className="text-teal-400 font-mono text-xs font-bold">
              {(finalIdealProb.value * 100).toFixed(2)}%
            </span>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={history} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="step"
            type="number"
            domain={[0, 'auto']}
            allowDecimals={false}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            label={{ value: 'Iterations', position: 'insideBottomRight', fill: '#94a3b8', fontSize: 10, offset: -5 }}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }} />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '5px' }} />
          <ReferenceLine x={optimalSteps} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Optimal', fill: '#ef4444', fontSize: 10 }} />
          
          {/* Real (Qiskit) Data Lines */}
          <Line
            type="monotone"
            dataKey="probTarget"
            stroke="#8b5cf6"
            strokeWidth={3}
            dot={{ r: 3, fill: '#8b5cf6' }}
            activeDot={{ r: 6 }}
            name="P(target) - Real"
            animationDuration={300}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="probOthers"
            stroke="#64748b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="P(others) - Real"
            animationDuration={300}
            isAnimationActive={false}
          />

          {/* Show ideal lines when we have data or using Qiskit backend */}
          {showIdealLines && (
            <>
              {/* Ideal Mathematical Data Lines */}
              <Line
                type="monotone"
                dataKey="idealProbTarget"
                stroke="#22d3ee"  // Cyan color for ideal data
                strokeWidth={4}
                strokeDasharray="5 5"  // Dashed line
                dot={{ r: 3, strokeWidth: 2, fill: '#0f172a', stroke: '#22d3ee' }}
                activeDot={{ r: 6, strokeWidth: 3, fill: '#22d3ee' }}
                name="P(target) - Ideal"
                label={{
                  position: 'top',
                  formatter: (val: number) => (val > 0.9 ? `${(val * 100).toFixed(2)}%` : ''),
                  fill: '#22d3ee',
                  fontSize: 10
                }}
                animationDuration={300}
                isAnimationActive={false}
                connectNulls={true}  // Connect points even if there are null values
              />
              <Line
                type="monotone"
                dataKey="idealProbOthers"
                stroke="#0f766e"  // Darker teal for ideal others
                strokeWidth={2}
                strokeDasharray="3 3"
                dot={false}
                name="P(others) - Ideal"
                animationDuration={300}
                isAnimationActive={false}
                connectNulls={true}  // Connect points even if there are null values
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProbabilityChart;
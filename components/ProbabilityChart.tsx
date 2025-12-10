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
}

const ProbabilityChart: React.FC<ProbabilityChartProps> = ({ history, optimalSteps }) => {
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as StepHistory;
      const probTarget = data.probTarget;
      // Calculate total probability of all other states (1 - P(target))
      const probRest = 1 - probTarget;

      return (
        <div className="bg-quantum-800 border border-quantum-500 p-3 rounded shadow-xl text-xs">
          <p className="font-bold text-gray-400 mb-2">Iteration {label}</p>
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
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-48 bg-quantum-800/50 rounded-lg p-4 border border-quantum-700">
      <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider">
        Probability Evolution
      </h3>
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
          <Line 
            type="monotone" 
            dataKey="probTarget" 
            stroke="#8b5cf6" 
            strokeWidth={3} 
            dot={{ r: 3, fill: '#8b5cf6' }}
            activeDot={{ r: 6 }}
            name="P(target)"
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
            name="P(others - avg)"
            animationDuration={300}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProbabilityChart;
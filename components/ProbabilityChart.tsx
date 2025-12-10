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
            domain={[0, optimalSteps > 0 ? optimalSteps : 'auto']}
            allowDecimals={false}
            tick={{ fill: '#94a3b8', fontSize: 10 }} 
            label={{ value: 'Iterations', position: 'insideBottomRight', fill: '#94a3b8', fontSize: 10, offset: -5 }}
          />
          <YAxis 
            domain={[0, 1]} 
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
            itemStyle={{ color: '#22d3ee' }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, '']}
          />
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
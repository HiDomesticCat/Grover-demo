import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  ReferenceLine
} from 'recharts';
import { QuantumState } from '../types';

interface StateChartProps {
  data: QuantumState[];
  targetIndex: number | null;
  onBarClick?: (index: number) => void;
  selectable: boolean;
}

const StateChart: React.FC<StateChartProps> = ({ data, targetIndex, onBarClick, selectable }) => {
  // Custom tooltip to show detailed info
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const stateData = payload[0].payload as QuantumState;
      return (
        <div className="bg-quantum-800 border border-quantum-500 p-3 rounded shadow-xl text-xs">
          <p className="font-bold text-white mb-1">State |{stateData.binary}⟩</p>
          <p className="text-gray-300">Amplitude: <span className="text-quantum-accent">{stateData.amplitude.toFixed(4)}</span></p>
          <p className="text-gray-300">Probability: <span className="text-quantum-purple">{(stateData.probability * 100).toFixed(2)}%</span></p>
          <p className="text-gray-300">Phase: {stateData.amplitude < 0 ? 'π (180°)' : '0 (0°)'}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-64 md:h-80 bg-quantum-800/50 rounded-lg p-4 border border-quantum-700">
      <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider flex justify-between items-center">
        <span>Amplitude Phase Graph</span>
        {selectable && (
          <span className="text-xs text-quantum-accent animate-pulse">
            {targetIndex === null ? 'Select a target state below' : 'Click to change target'}
          </span>
        )}
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis 
            dataKey="binary" 
            tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }} 
            interval={0} // Show all if possible, might need adjustment for high qubit counts
          />
          <YAxis 
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            domain={[-1, 1]}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
          <ReferenceLine y={0} stroke="#475569" />
          <Bar 
            dataKey="amplitude" 
            cursor={selectable ? "pointer" : "default"}
            onClick={(data) => {
              if (selectable && onBarClick) onBarClick(data.index);
            }}
          >
            {data.map((entry, index) => {
              // Color logic: 
              // Target state gets a special highlight
              // Negative amplitude gets red/pink, Positive gets blue/cyan
              const isTarget = index === targetIndex;
              const isNegative = entry.amplitude < 0;
              
              let fill = isNegative ? '#f472b6' : '#22d3ee'; // Pink for neg, Cyan for pos
              if (isTarget) fill = '#8b5cf6'; // Purple for target
              
              return (
                <Cell 
                  key={`cell-${index}`} 
                  fill={fill} 
                  stroke={isTarget ? '#fff' : 'none'}
                  strokeWidth={isTarget ? 2 : 0}
                  className="transition-all duration-300 hover:opacity-80"
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StateChart;
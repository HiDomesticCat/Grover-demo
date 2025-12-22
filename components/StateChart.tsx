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
  ReferenceLine,
  Label
} from 'recharts';
import { QuantumState } from '../types';

interface StateChartProps {
  data: QuantumState[];
  targetIndices: number[];
  onBarClick?: (index: number) => void;
  selectable: boolean;
  meanAmplitude?: number;
  showMean?: boolean;
}

const StateChart: React.FC<StateChartProps> = ({
  data,
  targetIndices,
  onBarClick,
  selectable,
  meanAmplitude,
  showMean
}) => {

  const minWidth = 40; 

  const yAxisWidth = 60;
  
  //Calculated width if the number of states are too many
  const calculatedWidth = (data.length * minWidth) + yAxisWidth;

  // Custom tooltip to show detailed info
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const stateData = payload[0].payload as QuantumState;
      const isTarget = targetIndices.includes(stateData.index);

      return (
        <div className="bg-quantum-800 border border-quantum-500 p-3 rounded shadow-xl text-xs z-50">
          <p className="font-bold text-white mb-1">State |{stateData.binary}⟩ {isTarget && <span className="text-quantum-purple ml-2">(Target)</span>}</p>
          <div className="space-y-1">
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
          </div>
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

      {/*Scrolling Component Container*/}
      <div className="flex-1 w-full min-h-0 overflow-x-auto overflow-y-hidden relative custom-scrollbar">
        <div style={{ minWidth: '100%', width: Math.max(100, calculatedWidth) + 'px', height: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
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
                domain={[-1, 1]}
                width={40}
              >
                <Label
                  value="Amplitude (ψ)"
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
              <Bar
                dataKey="amplitude"
                cursor={selectable ? "pointer" : "default"}
                onClick={(data) => {
                  if (selectable && onBarClick) onBarClick(data.index);
                }}
              >
                {data.map((entry, index) => {
                  const isTarget = targetIndices.includes(index);
                  const isNegative = entry.amplitude < 0;
                  let fill = isNegative ? '#f472b6' : '#22d3ee';
                  if (isTarget) fill = '#8b5cf6';
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
      </div>
    </div>
  );
};

export default StateChart;
import React from 'react';
import { QuantumState } from '../types';

interface GeometricViewProps {
    states: QuantumState[];
    targetIndices: number[];
}

const GeometricView: React.FC<GeometricViewProps> = ({ states, targetIndices }) => {
    const width = 300;
    const height = 300;
    const cx = width / 2;
    const cy = height / 2;
    const radius = 100;
    const axisLength = 130;

    // Calculate vector components
    // Axis |s'> (Non-target superposition) -> X
    // Axis |w> (Target superposition) -> Y

    // 1. Get representative amplitudes
    // In Grover's, all non-targets have same amp, all targets have same amp.
    const n = states.length;
    const m = targetIndices.length;

    // If no target selected, we are just at start state
    if (m === 0) {
        // Just draw initial state vector pointing close to X axis
        // Actually if no target, conceptually |w> doesn't exist well, 
        // but we can assume a hypothetical target or just show generic state.
        // For UI stability, let's just show |s> aligned with "s" axis and |w> orthogonal?
        // Better: If no target, simple static view.
        return (
            <div className="w-full h-full bg-quantum-800/50 rounded-lg p-4 border border-quantum-700 flex flex-col items-center justify-center text-gray-400 text-sm">
                <p>Select target states to visualize geometry</p>
            </div>
        );
    }

    const nonTargetIndex = states.findIndex(s => !targetIndices.includes(s.index));
    const targetIndex = states.findIndex(s => targetIndices.includes(s.index));

    // Amplitudes
    const ampNonTarget = nonTargetIndex >= 0 ? states[nonTargetIndex].amplitude : 0;
    const ampTarget = targetIndex >= 0 ? states[targetIndex].amplitude : 0;

    // Projected coordinates (normalized to circle radius)
    // X = amp_non_target * sqrt(N - M)
    // Y = amp_target * sqrt(M)
    const xVal = ampNonTarget * Math.sqrt(n - m);
    const yVal = ampTarget * Math.sqrt(m);

    // SVG Coordinates (Y is down in SVG, so subtract from cy for positive Y)
    const vectorX = cx + (xVal * radius);
    const vectorY = cy - (yVal * radius);

    // Initial State |s> coordinates
    // |s> = cos(theta/2)|s'> + sin(theta/2)|w>
    // sin(theta/2) = sqrt(M/N)
    const sinThetaDiv2 = Math.sqrt(m / n);
    const cosThetaDiv2 = Math.sqrt((n - m) / n);
    const startX = cx + (cosThetaDiv2 * radius);
    const startY = cy - (sinThetaDiv2 * radius);
	
	//the following code is for showing the arc with degree in this components
	//[start]
	const angleRadian = Math.atan2(yVal, xVal);
	const angleDegree = (angleRadian * 180) / Math.PI;
	const finalAngle = Math.abs(angleDegree);
	
	const initAngleRadius = Math.atan2(sinThetaDiv2, cosThetaDiv2);
	const arcRadius = 30;
	
	const getAnglePath = (angleRad: number, arcR: number) =>{
		//starting point for arc
		const startXArc = cx + arcR;
		const startYArc = cy;
		//ending point for arc
		const endXArc = cx + arcR * Math.cos(angleRad);
		const endYArc = cy - arcR * Math.sin(angleRad); //for SVG if Y is negative
		
		const overFLAGArc = 0;
		const sweepFlag = angleRad >= 0 ? 0 : 1;
		
		/* inherit from Line 159: {`M ${cx + 30} ${cy} A 30 30 0 0 0 ${cx + 30 * Math.cos(-0.1)} ${cy + 30 * Math.sin(-0.1)}`}*/
		return `M ${startXArc} ${startYArc} A ${arcR} ${arcR} 0 ${overFLAGArc} ${sweepFlag} ${endXArc} ${endYArc}`;
		
	}
	//calculate the arc path
	const initArcPath = getAnglePath(initAngleRadius, arcRadius);//for not running first stage
	const currentArcPath = getAnglePath(angleRadian, arcRadius);//for running or in interation

    return (
        <div className="w-full bg-quantum-800/50 rounded-lg p-4 border border-quantum-700 flex flex-col">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Geometric Interpretation
            </h3>
            <div className="flex-1 w-full flex items-center justify-center">
                <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                    {/* Background Grid/Circle */}
                    <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#334155" strokeDasharray="3 3" />

                    {/* Axis Lines */}
                    <line x1={cx - axisLength} y1={cy} x2={cx + axisLength} y2={cy} stroke="#475569" strokeWidth="1" />
                    <line x1={cx} y1={cy + axisLength} x2={cx} y2={cy - axisLength} stroke="#475569" strokeWidth="1" />

                    {/* Labels */}
                    <text x={cx + axisLength + 10} y={cy + 4} fill="#94a3b8" fontSize="12" fontFamily="monospace">|s'⟩ (Non-Target)</text>
                    <text x={cx} y={cy - axisLength - 10} textAnchor="middle" fill="#a855f7" fontSize="12" fontFamily="monospace">|w⟩ (Target)</text>
					
					{/*showing angle next to the  target label*/}
					<text 
						x={cx + 50} 
						y={cy - axisLength - 10} 
						textAnchor="start" 
						fill="#22d3ee"
						fontSize="12" 
						fontFamily="monospace"
					>
					{`(${finalAngle.toFixed(2)}°)`}
					</text>

                    {/* Initial State Vector (Ghost) */}
                    <line
                        x1={cx} y1={cy}
                        x2={startX} y2={startY}
                        stroke="#475569"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                    />
                    <text x={startX + 5} y={startY - 5} fill="#64748b" fontSize="10" fontFamily="monospace">|s⟩</text>
					
					{/*showing first stage arc path*/}
					<path
                        d={initArcPath}
                        fill="none"
                        stroke="#475569"
                        strokeWidth="1"
                        opacity="0.5"
                    />

                    {/* Main State Vector */}
                    <line
                        x1={cx} y1={cy}
                        x2={vectorX} y2={vectorY}
                        stroke="#22d3ee"
                        strokeWidth="3"
                        markerEnd="url(#arrowhead)"
                    />

                    {/* Vector Head Definition */}
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#22d3ee" />
                        </marker>
                    </defs>

                    {/* Angle Indicator (approximate) */}
					{/* [Modified] showing dynamic arc changing stage*/}
                    <path
						/*
                        d={`M ${cx + 30} ${cy} A 30 30 0 0 0 ${cx + 30 * Math.cos(-0.1)} ${cy + 30 * Math.sin(-0.1)}`} // Just a visual hint, tricky to make dynamic perfectly without complex math
						
						*[preserved]*
						*/
						d={currentArcPath}
                        fill="none"
                        stroke="#22d3ee"
                        opacity="1"
                    />

                    {/* Info Text */}
                    <text x={cx} y={height - 10} textAnchor="middle" fill="#94a3b8" fontSize="11">
                        Vector rotates towards |w⟩
                    </text>
                </svg>
            </div>
        </div>
    );
};

export default GeometricView;

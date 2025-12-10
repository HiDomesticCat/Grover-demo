import React, { useState } from 'react';
import { explainQuantumState } from '../services/geminiService';
import { StepHistory } from '../types';
import { Sparkles, Loader2 } from 'lucide-react';

interface AIHelperProps {
  stepIndex: number;
  numQubits: number;
  targetIndices: number[];
  currentProbability: number;
  history: StepHistory[];
}

const AIHelper: React.FC<AIHelperProps> = ({ 
  stepIndex, 
  numQubits, 
  targetIndices, 
  currentProbability, 
  history 
}) => {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAskAI = async () => {
    setLoading(true);
    try {
      const text = await explainQuantumState(stepIndex, numQubits, targetIndices, currentProbability, history);
      setExplanation(text);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-quantum-800 to-quantum-900 border border-quantum-700 rounded-lg p-4 mt-4 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-quantum-accent font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          AI Quantum Tutor
        </h3>
        <button
          onClick={handleAskAI}
          disabled={loading}
          className="text-xs bg-quantum-700 hover:bg-quantum-600 text-white px-3 py-1 rounded-full transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Explain State'}
        </button>
      </div>
      
      {explanation ? (
        <p className="text-sm text-gray-300 leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-500">
          {explanation}
        </p>
      ) : (
        <p className="text-xs text-gray-500 italic">
          Click "Explain State" to get a Gemini-powered analysis of the current quantum interference pattern.
        </p>
      )}
    </div>
  );
};

export default AIHelper;
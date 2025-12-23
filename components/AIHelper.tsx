import React, { useState, useEffect, useCallback } from 'react';
import { explainQuantumState } from '../services/geminiService';
import { StepHistory } from '../types';
import { Sparkles, Loader2, RotateCcw, AlertCircle, RefreshCcw } from 'lucide-react';

interface AIHelperProps {
  stepIndex: number;
  numQubits: number;
  targetIndices: number[];
  currentProbability: number;
  history: StepHistory[];
  /** Whether to automatically request explanation when props change */
  autoExplain?: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Enhanced error boundary component with reset capability
class AIHelperErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('AIHelper Error:', error, errorInfo);
    // Log the error to an error reporting service here if available
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="bg-gradient-to-br from-red-900/30 to-red-950/30 border border-red-700/50 rounded-lg p-4 mt-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-red-400 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              AI Quantum Tutor Error
            </h3>
            <button
              onClick={this.resetErrorBoundary}
              className="text-xs bg-red-800 hover:bg-red-700 text-white px-2 py-1 rounded flex items-center gap-1"
              aria-label="Retry AI explanation"
            >
              <RefreshCcw className="w-3 h-3" /> Reset
            </button>
          </div>
          <p className="text-sm text-red-200">
            {this.state.error?.message || "Error loading AI explanation. Please check your connection and configuration."}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * AIHelper component that provides AI-powered explanations of quantum states
 */
const AIHelper: React.FC<AIHelperProps> = ({
  stepIndex,
  numQubits,
  targetIndices,
  currentProbability,
  history,
  autoExplain = false
}) => {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastExplainedStep, setLastExplainedStep] = useState<number | null>(null);

  // Memoized function to request AI explanation
  const handleAskAI = useCallback(async () => {
    if (targetIndices.length === 0) {
      setError('Please select at least one target state first');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const text = await explainQuantumState(
        stepIndex,
        numQubits,
        targetIndices,
        currentProbability,
        history,
        retryCount // Pass retry count to the service
      );
      
      setExplanation(text);
      setLastExplainedStep(stepIndex);
      
      // Check for API key issues in the response
      if (text.includes('API Key not configured') || text.includes('API key')) {
        setError('API key not configured properly. Check server environment variables.');
      }
    } catch (err) {
      console.error("AI explanation error:", err);
      setError(err instanceof Error ? err.message : 'Failed to get AI explanation');
      setExplanation(null);
    } finally {
      setLoading(false);
    }
  }, [stepIndex, numQubits, targetIndices, currentProbability, history, retryCount]);

  // Auto-explain when props change if enabled
  useEffect(() => {
    if (autoExplain &&
        targetIndices.length > 0 &&
        stepIndex !== lastExplainedStep &&
        !loading) {
      handleAskAI();
    }
  }, [autoExplain, stepIndex, targetIndices, lastExplainedStep, loading, handleAskAI]);

  // Handle retry with exponential backoff
  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    handleAskAI();
  };
  
  // Reset error boundary and state
  const handleReset = () => {
    setError(null);
    setExplanation(null);
    setRetryCount(0);
  };

  // Custom error fallback component
  const ErrorFallback = (
    <div className="bg-gradient-to-br from-red-900/30 to-red-950/30 border border-red-700/50 rounded-lg p-4 mt-4 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-red-400 font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          AI Quantum Tutor Error
        </h3>
        <button
          onClick={handleReset}
          className="text-xs bg-red-800 hover:bg-red-700 text-white px-2 py-1 rounded flex items-center gap-1"
          aria-label="Reset AI component"
        >
          <RefreshCcw className="w-3 h-3" /> Reset
        </button>
      </div>
      <p className="text-sm text-red-200">
        Component crashed. Please try again or reload the page.
      </p>
    </div>
  );

  return (
    <AIHelperErrorBoundary onReset={handleReset} fallback={ErrorFallback}>
      <div className="bg-gradient-to-br from-quantum-800 to-quantum-900 border border-quantum-700 rounded-lg p-4 mt-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-quantum-accent font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            AI Quantum Tutor
          </h3>
          <button
            onClick={handleAskAI}
            disabled={loading || targetIndices.length === 0}
            aria-label="Get AI explanation of current quantum state"
            className="text-xs bg-quantum-700 hover:bg-quantum-600 text-white px-3 py-1 rounded-full transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Explain State'}
          </button>
        </div>
        
        {/* Error display */}
        {error && (
          <div className="mb-3 p-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Error:</p>
              <p>{error}</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleRetry}
                  className="text-xs bg-red-700 hover:bg-red-600 text-white px-2 py-0.5 rounded flex items-center gap-1"
                  aria-label="Retry AI explanation"
                >
                  <RotateCcw className="w-3 h-3" /> Retry
                </button>
                <button
                  onClick={handleReset}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-0.5 rounded flex items-center gap-1"
                  aria-label="Reset AI component state"
                >
                  <RefreshCcw className="w-3 h-3" /> Reset
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Loading skeleton */}
        {loading && !explanation && (
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-quantum-700/50 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-quantum-700/50 rounded w-full"></div>
            <div className="h-4 bg-quantum-700/50 rounded w-5/6"></div>
          </div>
        )}
        
        {/* Explanation display */}
        {explanation && !error && (
          <div className="text-sm text-gray-300 leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-500">
            <p>{explanation}</p>
            
            {/* Show step being explained */}
            {lastExplainedStep !== null && (
              <div className="mt-2 text-xs text-gray-500">
                <span>Explaining step: {lastExplainedStep}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Empty state */}
        {!explanation && !loading && !error && (
          <p className="text-xs text-gray-500 italic">
            Click "Explain State" to get a Gemini-powered analysis of the current quantum interference pattern.
            {targetIndices.length === 0 && (
              <span className="block mt-1 text-amber-500">Select target states before requesting an explanation.</span>
            )}
          </p>
        )}
      </div>
    </AIHelperErrorBoundary>
  );
};

// Apply memo to prevent unnecessary re-renders

export default React.memo(AIHelper);
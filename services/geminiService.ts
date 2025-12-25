import { StepHistory } from "../types";

// Define a proper return type for better type safety
interface ExplanationResponse {
  explanation: string;
  error?: string;
}

// Maximum number of retry attempts for API calls
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

/**
 * Requests an AI explanation of the current quantum state from the backend
 *
 * @param stepIndex Current step in the algorithm
 * @param numQubits Number of qubits in the system
 * @param targetIndices Indices of target states
 * @param currentProbability Current probability of target states
 * @param history History of probabilities through algorithm steps
 * @returns Promise containing explanation text
 */
export const explainQuantumState = async (
  stepIndex: number,
  numQubits: number,
  targetIndices: number[],
  currentProbability: number,
  history: StepHistory[],
  retryCount = 0
): Promise<string> => {
  // Check if backend URL is available
  // In Vite apps, environment variables should be accessed through (import.meta as any).env
  const backendUrl = (import.meta as any).env.VITE_BACKEND_URL;
  
  if (!backendUrl) {
    console.warn("Backend URL not configured. Please set VITE_BACKEND_URL in your environment.");
    return "Backend URL not configured. Please check your environment settings.";
  }

  try {
    const response = await fetch(`${backendUrl}/explain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stepIndex,
        numQubits,
        targetIndices,
        currentProbability,
        history
      })
    });

    // Handle HTTP errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    // Parse response
    const data = await response.json() as ExplanationResponse;
    
    // Check for API key issues in the response
    if (data.explanation?.includes('API Key not configured') || data.explanation?.includes('API key')) {
      return "The AI service requires configuration on the backend. Please check the backend server logs and ensure the GEMINI_API_KEY environment variable is set.";
    }
    
    return data.explanation || "No explanation available.";
  } catch (error) {
    // Implement retry logic for transient errors
    if (retryCount < MAX_RETRIES) {
      console.warn(`AI explanation request failed, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return explainQuantumState(stepIndex, numQubits, targetIndices, currentProbability, history, retryCount + 1);
    }
    
    console.error("AI explanation API Error:", error);
    return "Unable to fetch AI explanation. Please check your backend connection or try again later.";
  }
};
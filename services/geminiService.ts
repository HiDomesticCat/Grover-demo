import { GoogleGenAI } from "@google/genai";
import { StepHistory } from "../types";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY not found in environment");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const explainQuantumState = async (
  stepIndex: number,
  numQubits: number,
  targetIndices: number[],
  currentProbability: number,
  history: StepHistory[]
): Promise<string> => {
  const client = getClient();
  if (!client) return "API Key unavailable. Please configure your environment.";

  const targetsFormatted = targetIndices
    .map(idx => `${idx} (|${idx.toString(2).padStart(numQubits, '0')}⟩)`)
    .join(', ');

  const prompt = `
    You are a Quantum Computing Tutor.
    Explain the current status of a Grover's Algorithm simulation.
    
    Context:
    - Number of Qubits: ${numQubits} (Total states: ${Math.pow(2, numQubits)})
    - Target State Indices: ${targetsFormatted}
    - Current Step: ${stepIndex}
    - Combined Probability of Target States: ${(currentProbability * 100).toFixed(2)}%
    - Iteration History (Target Probs): ${history.map(h => `${h.step}:${(h.probTarget*100).toFixed(1)}%`).join(', ')}

    Task:
    Provide a concise (max 3 sentences) explanation of what is happening mathematically (Constructive interference? Amplitude amplification?).
    Mention if searching for multiple solutions affects the speed of convergence.
    Do not use markdown formatting like bold or italics, just plain text.
  `;

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "No explanation available.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Unable to fetch AI explanation at this time.";
  }
};
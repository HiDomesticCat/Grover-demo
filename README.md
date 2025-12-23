<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Grover's Algorithm Visualizer

<p align="center">
  <strong>Interactive visualization of quantum search with real quantum simulation capabilities</strong>
</p>

<p align="center">
  <a href="#overview">Overview</a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#troubleshooting">Troubleshooting</a>
</p>

</div>

## Overview

This project provides an interactive visualization of Grover's Algorithm - a quantum search algorithm that provides quadratic speedup for unstructured database searches. The visualizer helps understand the quantum principles behind the algorithm, including superposition, phase shifts, and amplitude amplification.

### What is Grover's Algorithm?

Grover's algorithm is a quantum search algorithm that can find an element in an unsorted database in O(√N) time, compared to O(N) time required by classical algorithms. The key steps are:

1. **Initialization**: Create equal superposition of all states
2. **Oracle**: Mark target states by inverting their phase
3. **Diffusion**: Amplify amplitude of target states through reflection about average
4. **Measurement**: Highest probability states are the search targets

Our visualizer shows each step in the process and explains the quantum mechanics in an accessible way.

## Features

- 🔍 **Interactive State Selection**: Choose target states to search for
- 🔄 **Step-by-Step Visualization**: Watch amplitude amplification over iterations
- 📊 **Multiple Views**: Amplitude chart, probability graph, and geometric representation
- 🧠 **AI-powered Explanations**: Quantum state analysis from Gemini AI
- 🧪 **Real Quantum Simulation**: Connect to Qiskit backend for true quantum noise simulation
- 📱 **Responsive Design**: Works on desktop and tablets

## Installation

### Prerequisites
- Node.js (for frontend)
- Python 3.8+ (for backend)
- Access to Qiskit (for quantum simulation)

### Getting Your Gemini API Key (Optional)

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create an account or sign in
3. Create a new API key for the Gemini API
4. Copy the API key for use in the environment setup

### 1. Frontend Setup

1. Install frontend dependencies:
   `npm install`
2. Create environment file:
   ```bash
   cp .env .env.local
   ```
3. Edit `.env.local` and add your Gemini API key:
   ```
   VITE_GEMINI_API_KEY=your_actual_api_key_here
   VITE_BACKEND_URL=http://localhost:8000
   ```
4. Run the frontend app:
   ```bash
   npm run dev
   ```
   
5. Visit `http://localhost:5173` in your browser to access the application

### 2. Python Backend Setup (Optional - for Real Quantum Simulation)

To use the real Qiskit backend for quantum simulation:

1. Navigate to the backend directory and create a Python virtual environment:
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set up environment variables:
   ```bash
   # Copy the template
   cp ../.env .env
   
   # Edit the .env file to add your API key and other settings
   # GEMINI_API_KEY=your_actual_api_key_here
   # CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://127.0.0.1:3000
   # ALLOW_ALL_ORIGINS=true  # For development only, set to false in production
   ```

4. Run the backend server:
   ```bash
   python main.py
   ```
   
   Alternatively, you can use the npm script from the main directory:
   ```bash
   npm run backend
   ```

5. In the frontend, enable "Use Real Qiskit Backend (Python)" toggle to use the real quantum simulation

### One-Command Setup

To run both frontend and backend together:

```bash
# Install all dependencies
npm install
npm run backend:install

# Run both services
npm run start
```

## Usage

### Basic Usage

1. **Select State Count**: Choose the number of qubits (or states if in custom mode)
2. **Create Superposition**: Start with an equal superposition of all states
3. **Select Target States**: Click on the bars to select states you want to search for
4. **Run Algorithm**: Use "Run" to see continuous iterations or "Step" for individual steps
5. **Analyze Results**: See how probability concentrates in the target states over iterations
6. **AI Explanation**: Request AI analysis of the current quantum state

### Advanced Features

- **Qiskit Backend**: Enable real quantum simulation with hardware noise models
- **Optimal Iteration Finder**: Tool to find optimal iterations for different problem sizes
- **Custom State Count**: Use non-power-of-2 state counts to explore generalized Grover search

## Architecture

### System Architecture

```
┌────────────────────┐       ┌───────────────────────┐
│   React Frontend   │◄─────►│    FastAPI Backend    │
│   (TypeScript)     │       │    (Python/Qiskit)    │
└────────────────────┘       └─────────────┬─────────┘
         ▲                                 │
         │                                 ▼
┌────────┴────────┐           ┌───────────────────────┐
│    Browser      │           │      Qiskit Aer       │
│  Visualization  │           │  Quantum Simulator    │
└─────────────────┘           └───────────────────────┘
```

### Components

- **Frontend**:
  - React with TypeScript for UI components
  - Recharts for data visualization
  - Custom SVG rendering for geometric representation
  - React Error Boundaries for fault tolerance

- **Backend**:
  - FastAPI for REST API endpoints
  - Qiskit for quantum circuit simulation
  - Pydantic for request validation
  - Gemini API integration for AI explanations

- **Integration**:
  - Environment variables for configuration
  - JSON data exchange between frontend and backend
  - CORS security for API access control

## Troubleshooting

### Common Issues

#### Backend Connection Problems

- **Symptom**: "Failed to connect to backend" error in the UI
- **Check**:
  1. Is backend server running? Run `npm run backend`
  2. Is backend URL correct in `.env`? Default: `http://localhost:8000`
  3. Are CORS origins set correctly? Make sure frontend URL is in `CORS_ORIGINS`
  4. For local development, set `ALLOW_ALL_ORIGINS=true` in the backend .env file
  5. Restart the backend after changing CORS settings
  6. Check the backend console for Python errors or 400 Bad Request messages
  7. If you're accessing via IP address, ensure that IP is included in CORS_ORIGINS

#### API Key Issues

- **Symptom**: "API key not configured" when using AI features
- **Check**:
  1. Have you obtained a Gemini API key from [AI Studio](https://aistudio.google.com/)?
  2. Is the API key correctly set in backend `.env` as `GEMINI_API_KEY=your_key`?
  3. Check backend logs for API-related errors

#### Qiskit Installation Problems

- **Symptom**: Backend fails to start or quantum simulation errors
- **Solutions**:
  1. Use a Python virtual environment: `python -m venv venv && source venv/bin/activate`
  2. Ensure Python version 3.8+ is used: `python --version`
  3. Install dependencies with: `pip install -r requirements.txt`
  4. For missing wheel errors, install development tools: `sudo apt-get install python3-dev`
  5. Check if Qiskit is properly installed: `python -c "import qiskit; print(qiskit.__version__)"`
  6. Ensure your version matches the requirements.txt specification

#### React/Frontend Issues

- **Symptom**: "White screen" or application doesn't load
- **Solutions**:
  1. Check browser console for JavaScript errors
  2. Verify React version compatibility in package.json (using v18.2.0)
  3. Run `npm install` to reinstall dependencies after package updates
  4. Clear browser cache or try in incognito mode
  5. Check network tab for failed API requests

#### Iteration Calculation Discrepancy

- **Symptom**: Backend and frontend calculate different "optimal iterations" values
- **Explanation**: This is expected behavior. The backend and frontend use slightly different formulas:
  - Frontend (TypeScript): Uses simulation to find peak probability with some heuristics
  - Backend (Python): Uses the more precise formula `round(π/(4*theta) - 0.5)` where `theta = asin(sqrt(M/N))`
- **Solutions**:
  - Both calculations are mathematically valid - the backend is more precise
  - The application will show the backend's calculation when using Qiskit
  - For consistent results, always use the "Use Real Qiskit Backend" option

#### Qiskit Backend Iteration Issues

- **Symptom**: Simulation stops prematurely or doesn't run all iterations
- **Solutions**:
  1. Ensure the `iterations` parameter is being passed correctly (-1 for auto-calculate)
  2. Check backend console for any error messages during simulation
  3. Try reducing the number of qubits if system is resource-constrained
  4. Verify the noise level is not too high (try 0.001-0.01 range)
  5. Ensure CORS is properly configured if you get connection errors

#### Browser Compatibility

- **Symptom**: Visualization not rendering correctly
- **Solutions**:
  1. Use a modern browser (Chrome, Firefox, Edge, Safari)
  2. Enable JavaScript and allow browser to render SVG content
  3. Clear browser cache if issues persist

### Getting Help

If you encounter problems not covered here:

1. Check the browser console for JavaScript errors
2. Look at backend logs for Python errors
3. Verify your environment configuration
4. Ensure all dependencies are correctly installed

## Development

### Available Scripts

```bash
# Frontend Development
npm run dev          # Start Vite development server
npm run build        # Build for production
npm run preview      # Preview production build

# Backend Development
npm run backend      # Start Python backend server
npm run backend:install # Install backend dependencies

# Combined Commands
npm run start        # Run both frontend and backend
npm run clean        # Remove build directories

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix linting issues
npm run format       # Run Prettier formatter
npm run typecheck    # Check TypeScript types

# Testing
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
```

## License

This project is open source and available under the MIT License.

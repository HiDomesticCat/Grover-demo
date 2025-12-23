from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import numpy as np
import math
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator
from qiskit_aer.noise import NoiseModel, depolarizing_error
import json

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

class SimulationRequest(BaseModel):
    num_qubits: int
    target_indices: List[int]
    iterations: int = -1
    noise_value: float = 0.005

def create_oracle(num_qubits: int, target_indices: List[int]) -> QuantumCircuit:
    """Create a diagonal oracle that flips the phase of target states."""
    # Create oracle circuit
    oracle = QuantumCircuit(num_qubits)
    
    # For each target index, flip the phase using multi-controlled Z gate
    for target_idx in target_indices:
        # Convert target index to binary representation (MSB at left)
        target_bits = format(target_idx, f'0{num_qubits}b')
        
        # Apply X gates to invert qubits that should be 0 in the target
        for i, bit in enumerate(target_bits):
            if bit == '0':
                # [FIX] Map string index (Left=MSB) to Qiskit index (Right=0, LSB)
                oracle.x(num_qubits - 1 - i)
        
        # Apply multi-controlled Z gate (using H-CX-H trick)
        if num_qubits == 1:
            oracle.z(0)
        elif num_qubits == 2:
            oracle.cz(0, 1)
        else:
            # For more than 2 qubits, use mcx with H-Z-H trick
            oracle.h(num_qubits - 1)
            if num_qubits == 3:
                oracle.mcx([0, 1], 2)
            else:
                oracle.mcx(list(range(num_qubits - 1)), num_qubits - 1)
            oracle.h(num_qubits - 1)
        
        # Apply X gates again to revert the inversion
        for i, bit in enumerate(target_bits):
            if bit == '0':
                # [FIX] Map string index (Left=MSB) to Qiskit index (Right=0, LSB)
                oracle.x(num_qubits - 1 - i)
    
    return oracle

def create_diffusion_operator(num_qubits: int) -> QuantumCircuit:
    """Create the Grover diffusion operator."""
    diffusion = QuantumCircuit(num_qubits)
    
    # Apply H to all qubits
    diffusion.h(range(num_qubits))
    
    # Apply X to all qubits
    diffusion.x(range(num_qubits))
    
    # Apply multi-controlled Z (using H-CX-H trick for CZ)
    if num_qubits > 1:
        # For multi-controlled Z, we use ancilla-free implementation
        # Apply H to last qubit, then multi-controlled CX, then H again
        diffusion.h(num_qubits - 1)
        
        # Create multi-controlled X gate
        diffusion.mcx(list(range(num_qubits - 1)), num_qubits - 1)
        
        diffusion.h(num_qubits - 1)
    
    # Apply X to all qubits again
    diffusion.x(range(num_qubits))
    
    # Apply H to all qubits again
    diffusion.h(range(num_qubits))
    
    return diffusion

@app.post("/simulate")
async def simulate_quantum(request: SimulationRequest):
    try:
        num_qubits = request.num_qubits
        target_indices = request.target_indices
        iterations = request.iterations
        
        # Validate inputs
        if num_qubits <= 0 or num_qubits > 10:  # Limiting to 10 qubits for performance
            return {"error": "Number of qubits must be between 1 and 10"}
        
        dim = 2 ** num_qubits
        if any(idx < 0 or idx >= dim for idx in target_indices):
            return {"error": f"Target indices must be between 0 and {dim-1}"}
        
        # Calculate optimal iterations using Grover's formula: (π/4) * √(N/M)
        M = len(target_indices) if target_indices else 1  # Number of target states
        N = dim  # Total number of states
        optimal_iterations = math.floor((math.pi / 4) * math.sqrt(N / M))
        
        # Determine loop count: use provided iterations if >= 0, otherwise use optimal
        loop_count = iterations if iterations >= 0 else optimal_iterations
        
        # Initialize quantum circuit
        qc_base = QuantumCircuit(num_qubits)
        
        # Apply Hadamard gates to all qubits (create superposition)
        qc_base.h(range(num_qubits))
        
        # Construct Oracle
        oracle = create_oracle(num_qubits, target_indices)
        
        # Construct Diffusion operator
        diffusion = create_diffusion_operator(num_qubits)
        
        # Create noise model
        noise_model = NoiseModel()
        # Use variable noise level from request
        error_1q = depolarizing_error(request.noise_value, 1)
        # Use variable noise level from request
        error_2q = depolarizing_error(request.noise_value, 2)
        
        noise_model.add_all_qubit_quantum_error(error_1q, ['u1', 'u2', 'u3'])
        noise_model.add_all_qubit_quantum_error(error_2q, ['cx'])
        
        # Use AerSimulator with noise model
        simulator = AerSimulator(noise_model=noise_model)
        
        # Store probability history
        history = []
        
        # Get initial state probabilities (after superposition)
        qc_init = qc_base.copy()
        qc_init.measure_all()
        transpiled_init = transpile(qc_init, simulator)
        result_init = simulator.run(transpiled_init, shots=1024).result()
        counts_init = result_init.get_counts()
        
        # Convert counts to probability distribution
        total_shots_init = sum(counts_init.values())
        probabilities_init = {}
        
        # Initialize all states with 0 probability
        for i in range(dim):
            probabilities_init[i] = 0.0
        
        # Fill in measured probabilities
        for state, count in counts_init.items():
            # Qiskit returns bitstrings, e.g., '001' which matches int('001', 2) = 1
            # [FIX] Do NOT reverse the string.
            state_int = int(state, 2)
            probabilities_init[state_int] = count / total_shots_init
        
        # Add initial probabilities to history
        probability_list_init = [probabilities_init[i] for i in range(dim)]
        history.append(probability_list_init)
        
        # Loop implementation: Apply oracle and diffusion operators for the specified number of iterations
        qc = qc_base.copy()
        for i in range(loop_count):
            qc.append(oracle, range(num_qubits))
            qc.append(diffusion, range(num_qubits))
            
            # Get probabilities at this step
            qc_step = qc.copy()
            qc_step.measure_all()
            transpiled_step = transpile(qc_step, simulator)
            result_step = simulator.run(transpiled_step, shots=1024).result()
            counts_step = result_step.get_counts()
            
            # Convert counts to probability distribution
            total_shots_step = sum(counts_step.values())
            probabilities_step = {}
            
            # Initialize all states with 0 probability
            for j in range(dim):
                probabilities_step[j] = 0.0
            
            # Fill in measured probabilities
            for state, count in counts_step.items():
                # [FIX] Do NOT reverse the string.
                state_int = int(state, 2)
                probabilities_step[state_int] = count / total_shots_step
            
            # Add step probabilities to history
            probability_list_step = [probabilities_step[j] for j in range(dim)]
            history.append(probability_list_step)
        
        return {
            "success": True,
            "history": history,
            "optimal_iterations": optimal_iterations
        }
        
    except Exception as e:
        return {"error": f"Simulation failed: {str(e)}"}

@app.get("/")
async def root():
    return {"message": "Quantum Grover Simulator Backend"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
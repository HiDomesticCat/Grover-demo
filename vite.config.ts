import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE: Do not inject the Gemini API key into the client bundle. The key is a
// backend-only secret; the frontend talks to the Python backend, which holds it.
// Any value exposed here (or via a VITE_-prefixed env var) ships to every visitor.
export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: [
      'grover.hicat0x0.uk'
      ],
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});

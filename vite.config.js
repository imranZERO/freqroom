import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js', './test/setup-dom.js'],
  },
});

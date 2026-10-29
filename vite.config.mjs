import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api': 'http://127.0.0.1:8000', '/results': 'http://127.0.0.1:8000' };
const allowedHosts = ['atreyus.mobilemonero.com', 'localhost', '127.0.0.1'];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    allowedHosts,
    proxy,
    watch: { ignored: ['**/backend_ai/**', '**/dogfood-evidence/**', '**/deliverables/**', '**/benchmarks/**', '**/docs/**', '**/*.md'] },
  },
  // The hosted walkthrough serves a fixed build; generated artifacts cannot trigger HMR reloads.
  preview: { port: 5174, host: true, strictPort: true, allowedHosts, proxy },
});

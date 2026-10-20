import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE: '/' para domínio próprio; '/app/' para subpasta; './' para prévia e app mobile (Capacitor).
// Em desenvolvimento, /api e /uploads são encaminhados para a API local (npm run dev na pasta api).
const API = process.env.API_PROXY || 'http://localhost:3333';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
  server: {
    proxy: { '/api': API, '/uploads': API },
  },
  preview: {
    proxy: { '/api': API, '/uploads': API },
  },
});

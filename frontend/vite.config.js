import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El proxy evita problemas de CORS en desarrollo: /api -> Laravel (php artisan serve)
export default defineConfig({
  // Rutas relativas en la versión estática: funciona en https://usuario.github.io/<repositorio>/
  base: process.env.VITE_STATIC === '1' ? './' : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
});

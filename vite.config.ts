import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: false
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        game: 'index.html',
        speedometer: 'speedometer-preview.html',
        postOffice: 'post-office-preview.html',
        paz: 'paz-preview.html'
      }
    }
  }
});

import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import relayPlugin from './server/relay-plugin.js';

export default defineConfig({
  plugins: [relayPlugin()],
  server: { host: true, port: 5173 },
  build: {
    rollupOptions: {
      input: {
        host: resolve(__dirname, 'index.html'),
        tv: resolve(__dirname, 'tv.html'),
        phone: resolve(__dirname, 'phone.html'),
      },
    },
  },
});

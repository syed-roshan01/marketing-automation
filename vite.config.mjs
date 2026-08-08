import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: 'renderer',
    plugins: [react()],
    build: {
        outDir: path.resolve(__dirname, 'public'),
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            '/api':      { target: 'http://localhost:3000', changeOrigin: true },
            '/socket.io':{ target: 'http://localhost:3000', ws: true, changeOrigin: true },
            '/data':     { target: 'http://localhost:3000', changeOrigin: true },
        },
    },
});

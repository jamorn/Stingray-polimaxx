import { defineConfig } from 'vite';

export default defineConfig({
    // relative base → ใช้ได้ทั้ง file://, nginx, Vercel, GitHub Pages
    base: './',
    server: {
        host: true,
        port: 5173,
    },
    preview: {
        host: true,
        port: 4173,
    },
    build: {
        outDir: 'dist',
        target: 'es2020',
        sourcemap: false,
        // three.js alone is ~500 kB minified — that warning is noise for this app
        chunkSizeWarningLimit: 800,
        rollupOptions: {
            output: {
                manualChunks: {
                    three: ['three'],
                    gui: ['lil-gui'],
                },
            },
        },
    },
    optimizeDeps: {
        include: ['three', 'lil-gui'],
    },
});


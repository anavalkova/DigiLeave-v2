import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      // Only measure coverage for the extracted utility modules.
      // Excludes: React components, API client, constants (data-only),
      // entry point, and the test files themselves.
      include: ['src/utils/**'],
      exclude: [
        'src/utils/**/__tests__/**',
      ],
    },
  },
})
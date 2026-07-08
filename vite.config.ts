import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['**/node_modules/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/ai/**/*.ts',
        'src/analyzer/**/*.ts',
        'src/engine/**/*.ts',
        'src/github/**/*.ts',
        'src/react/**/*.ts',
        'src/review/**/*.ts',
      ],
      exclude: ['**/__tests__/**', '**/*.test.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
})

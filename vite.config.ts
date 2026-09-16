import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['**/node_modules/**', 'e2e/**', 'package-tests/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/ai/**/*.ts',
        'src/application/**/*.ts',
        'src/cli/**/*.ts',
        'src/ci/**/*.ts',
        'src/config/**/*.ts',
        'src/domain/**/*.ts',
        'src/analyzer/**/*.ts',
        'src/engine/**/*.ts',
        'src/evaluation/**/*.ts',
        'src/github/**/*.ts',
        'src/mfe/**/*.ts',
        'src/plugins/**/*.ts',
        'src/react/**/*.ts',
        'src/review/**/*.ts',
      ],
      exclude: ['**/__tests__/**', '**/*.test.ts'],
      thresholds: {
        branches: 80,
        lines: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
})

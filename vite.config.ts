import path from 'path';
import { defineConfig } from 'vitest/config';
import eslintPlugin from '@nabla/vite-plugin-eslint';
import dts from 'vite-plugin-dts';
import pkg from './package.json';

const shouldTestProviders = process.env.MW_TEST_PROVIDERS === 'true';
let tests = ['src/__test__/standard/**/*.test.ts'];
if (shouldTestProviders) tests = ['src/__test__/providers/**/*.test.ts'];

export default defineConfig((env) => ({
  plugins: [
    env.mode !== 'test' && eslintPlugin(),
    dts({
      rollupTypes: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    minify: false,
    rollupOptions: {
      external: [
        // External dependencies from package.json
        ...Object.keys(pkg.dependencies || {}),
        // Node.js built-ins that might be used
        'fs',
        'path',
        'os',
        'util',
        'events',
        'http',
        'https',
        'stream',
        'url',
        // Add fs/promises explicitly
        'fs/promises',
        'child_process',
        // External dependencies that might be causing issues
        '@puppeteer/browsers',
        'puppeteer',
        'puppeteer-core',
        'extract-zip',
        // Explicitly exclude fsevents
        'fsevents',
        // Add a pattern to handle any potential internal references
        /^\.\.\/pkg/,
      ],
      output: {
        globals: Object.fromEntries(Object.keys(pkg.dependencies || {}).map((v) => [v, v])),
      },
    },
    outDir: 'lib',
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'index',
      fileName: 'index',
      formats: ['cjs'], // Only using CommonJS for Node.js compatibility
    },
    // Disable watching - not needed for library builds
    watch: null,
    // Ensure Node.js compatibility
    target: 'node16',
  },
  test: {
    include: tests,
  },
}));

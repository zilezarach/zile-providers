// esbuild.config.js
import * as esbuild from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';

esbuild
  .build({
    entryPoints: ['src/index.ts'],
    outdir: 'lib',
    bundle: true,
    platform: 'node',
    target: 'node23',
    format: 'esm',
    outExtension: { '.js': '.js' },
    sourcemap: true,
    plugins: [
      nodeExternalsPlugin({
        // Keep crypto-js in the bundle to resolve path issues
        allowList: ['crypto-js', 'crypto-js/*'],
      }),
    ],
    external: [
      // Node.js built-ins
      'fs',
      'fs/promises',
      'path',
      'os',
      'util',
      'events',
      'http',
      'https',
      'stream',
      'url',
      'child_process',
      'crypto',
      'zlib',
      'react-native',
      'react-native/*',
      // Don't mark crypto-js as external since we want to bundle it
      // 'crypto-js',
    ],
    // Add resolver for proper import paths
    resolveExtensions: ['.ts', '.js', '.json'],
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

// @ts-check
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

/** @type {import('rollup').RollupOptions} */
export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'es',
    sourcemap: false,
  },
  onwarn(warning, warn) {
    // known harmless warnings from bundled TypeScript-compiled dependencies
    const ids = [warning.id, ...(warning.ids || [])];
    const fromDependency = ids.some((id) => Boolean(id && id.includes('node_modules')));
    const harmless = warning.code === 'THIS_IS_UNDEFINED' || warning.code === 'CIRCULAR_DEPENDENCY';
    if (!harmless || !fromDependency) warn(warning);
  },
  plugins: [
    typescript({ noEmit: false, include: ['src/**/*.ts'], exclude: ['test/**'] }),
    nodeResolve({ preferBuiltins: true, exportConditions: ['node'] }),
    commonjs(),
    json(),
  ],
};

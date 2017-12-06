import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import babel from 'rollup-plugin-babel';
import cli from 'rollup-plugin-cli';

const commands = [
  {
    input: 'src/generate.js',
    dest: 'dist/generate.js',
  },
  {
    input: 'src/parse.js',
    dest: 'dist/parse.js',
  },
];

const configs = commands.map(({input, dest}) => ({
  input,
  format: 'cjs',
  dest,
  plugins: [
    resolve(),
    commonjs({
      include: 'node_modules/**'
    }),
    babel({
      runtimeHelpers: true,
      exclude: 'node_modules/**',
    }),
    cli(),
  ],
}));

export default configs;

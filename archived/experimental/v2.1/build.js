// build.js
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['bundle.js'],
  bundle: true,
  outfile: 'dist/bundle.min.js',
  format: 'esm',
  minify: true,
  sourcemap: true,
}).catch(() => process.exit(1));

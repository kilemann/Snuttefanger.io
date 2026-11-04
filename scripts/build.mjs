import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const define = { __APP_VERSION__: JSON.stringify(version) };
rmSync('dist', { recursive: true, force: true });

const nodePaths = process.env.SNUTT_NODE_PATH ? [process.env.SNUTT_NODE_PATH] : [];
const node = { nodePaths, bundle: true, platform: 'node', target: 'node22', format: 'cjs', sourcemap: true, define, external: ['electron'] };
await build({ ...node, entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.js' });
await build({ ...node, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.js' });
await build({ ...node, entryPoints: ['tests/unit.test.ts', 'tests/integration.test.ts'], outdir: 'dist/tests' });
await build({
  bundle: true, platform: 'browser', target: 'chrome130', format: 'iife', minify: true, define,
  jsx: 'automatic', nodePaths, entryPoints: ['src/renderer/main.tsx'], outfile: 'dist/renderer/renderer.js',
});
mkdirSync('dist/renderer', { recursive: true });
cpSync('src/renderer/index.html', 'dist/renderer/index.html');
cpSync('src/renderer/styles.css', 'dist/renderer/styles.css');
console.log(`Bygd Snuttefanger ${version}`);

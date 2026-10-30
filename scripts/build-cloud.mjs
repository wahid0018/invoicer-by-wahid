import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const url = process.env.SUPABASE_URL?.trim() || '';
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim() || '';
const requireConfig = process.argv.includes('--require-config');

if (requireConfig && (!url || !anonKey)) {
  throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) in the build environment before building the web app.');
}

await mkdir('outputs', { recursive: true });
await build({
  entryPoints: ['outputs/cloud-client.mjs'],
  outfile: 'outputs/cloud-client.bundle.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: false,
  legalComments: 'none'
});

const config = `window.INVOICER_CLOUD_CONFIG = Object.freeze(${JSON.stringify({ url, anonKey })});\n`;
await writeFile('outputs/cloud-config.js', config, 'utf8');
console.log(url ? 'Built Supabase client and project configuration.' : 'Built Supabase client; cloud is disabled until project configuration is supplied.');

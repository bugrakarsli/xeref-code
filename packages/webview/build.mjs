import { build } from 'vite';
import { fileURLToPath } from 'node:url';

const watch = process.argv.includes('--watch');
const configFile = fileURLToPath(new URL('./vite.config.ts', import.meta.url));

for (const target of ['agent-panel', 'agent-manager']) {
  process.env.TARGET = target;
  await build({ configFile, build: { watch: watch ? {} : undefined } });
}

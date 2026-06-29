import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Two independent webview bundles (AgentPanel, Agent Manager) — kept
 * structurally separate per the isolation requirement. Select which one to
 * build via the TARGET env var; see build.mjs, which builds both into
 * ../extension/dist/webview/<target>/ with fixed `index.js`/`index.css`
 * names (AgentPanelView/AgentManagerView reference those exact paths).
 */
const target = process.env.TARGET ?? 'agent-panel';
const validTargets = ['agent-panel', 'agent-manager'];
if (!validTargets.includes(target)) {
  throw new Error(`Unknown webview TARGET: ${target}`);
}

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, '../extension/dist/webview', target),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, `src/${target}/main.tsx`),
      output: {
        entryFileNames: 'index.js',
        assetFileNames: 'index[extname]',
      },
    },
  },
});

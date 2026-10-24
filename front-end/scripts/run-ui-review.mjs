import { preview } from 'vite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await preview({ root, preview: { host: '127.0.0.1', port: 5185, strictPort: true } });
try {
  const config = process.argv.includes('--video') ? 'playback-review.config.ts' : 'ui-review.config.ts';
  const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', config], { cwd: root, stdio: 'inherit' });
  process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
} finally {
  server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve));
}

import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../', import.meta.url));
const health = async () => {
  try { return (await fetch('http://127.0.0.1:5101/api/health', { signal: AbortSignal.timeout(1000) })).ok; }
  catch { return false; }
};
let fixture;
let server;
const previousApi = process.env.VITE_API_URL;
try {
  if (!(await health())) {
    // The bridge calls the fixture's existing graceful shutdown handler. It
    // avoids a Windows shell process tree and makes no backend source changes.
    fixture = spawn(process.execPath, ['-e', "require('./back-end/test/browser-server.js'); process.stdin.setEncoding('utf8'); process.stdin.on('data', text => { if (text.trim() === 'stop-fixture') process.emit('SIGTERM'); });"], { cwd: repo, stdio: ['pipe', 'inherit', 'inherit'] });
    const deadline = Date.now() + 90000;
    while (!(await health())) {
      if (fixture.exitCode !== null || Date.now() > deadline) throw new Error('Disposable API did not start');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  process.env.VITE_API_URL = 'http://127.0.0.1:5101/api';
  server = await createServer({ root, server: { host: '127.0.0.1', port: 5186, strictPort: true } });
  await server.listen();
  const config = process.argv.includes('--capture') ? 'capture-review.config.ts' : process.argv.includes('--legal') ? 'legal-review.config.ts' : 'regression-review.config.ts';
  const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', config], { cwd: root, stdio: 'inherit' });
  process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
} finally {
  await server?.close();
  if (previousApi === undefined) delete process.env.VITE_API_URL;
  else process.env.VITE_API_URL = previousApi;
  if (fixture && fixture.exitCode === null) {
    fixture.stdin.end('stop-fixture\n');
    await new Promise(resolve => fixture.on('exit', resolve));
  }
}

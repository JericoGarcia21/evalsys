// Read-only visual sweep against the disposable browser-test API. Never point
// this script at a live API: the isolated fixture is fixed at loopback :5101.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { preview } from 'vite';
import { chromium } from '@playwright/test';

const api = 'http://127.0.0.1:5101';
assert((await fetch(api + '/api/health')).ok, 'Start the isolated browser QA API first');
const server = await preview({ preview: { host: '127.0.0.1', port: 5184, strictPort: true } });
let browser;
const records = [];
const suppressedWrites = [];
try {
  browser = await chromium.launch({ channel: 'chrome' });
  await mkdir('test-results/workspace-review', { recursive: true });
  for (const [username, routes] of [
    ['qa-instructor', ['/dashboard', '/subjects', '/sections', '/groups', '/users', '/assign-panels', '/rubrics', '/registration-links', '/results', '/ai-insights', '/chat', '/account-security']],
    ['qa-super', ['/dashboard', '/analytics', '/subjects', '/users', '/subscription', '/operations', '/security', '/system-control', '/legacy-data']],
    ['qa-panel-a', ['/dashboard', '/grade', '/chat', '/account-security']],
    ['qa-temp', ['/change-password']],
  ]) {
    const response = await fetch(api + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: username, password: 'QaPassword!2026' }) });
    assert(response.ok, `Fixture login failed: ${username}`);
    const session = await response.json();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(token => { localStorage.setItem('token', token); localStorage.setItem('evalsys_tutorial_disabled', 'true'); }, session.token);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== 'GET') {
        // Opening a chat can automatically acknowledge read messages. Keep this
        // screenshot sweep read-only; workflow tests validate that behavior.
        suppressedWrites.push({ method: request.method(), path: url.pathname });
        return route.fulfill({ json: {} });
      }
      const response = await route.fetch({ url: api + url.pathname + url.search });
      await route.fulfill({ response });
    });
    for (const route of routes) {
      await page.goto('http://127.0.0.1:5184' + route);
      await page.getByRole('main').first().waitFor();
      await page.waitForLoadState('networkidle');
      const later = page.getByRole('button', { name: 'Maybe later', exact: true });
      if (await later.isVisible()) await later.click();
      assert.equal(new URL(page.url()).pathname, route, `Unexpected redirect from ${route}`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Desktop overflow: ${route}`);
      const index = records.length;
      const image = `page-${String(index).padStart(2, '0')}.png`;
      await page.screenshot({ path: 'test-results/workspace-review/' + image });
      records.push({ role: username, route, image, viewport: '1440x1000' });
    }
    if (username !== 'qa-temp') {
      for (const route of ['/dashboard', '/account-security', username === 'qa-panel-a' ? '/grade' : '/subjects']) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('http://127.0.0.1:5184' + route);
        await page.waitForLoadState('networkidle');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Mobile overflow: ${route}`);
        await page.screenshot({ path: `test-results/workspace-review/mobile-${username}-${route.slice(1)}.png`, fullPage: true });
      }
    }
    assert.deepEqual(errors, [], `Page errors for ${username}`);
    await context.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: api + url.pathname + url.search }) });
  });
  await page.goto('http://127.0.0.1:5184/register?token=qa-browser-registration');
  await page.locator('[data-tutorial="registration-form"][data-ready="true"]').waitFor();
  await page.screenshot({ path: 'test-results/workspace-review/registration-mobile.png', fullPage: true });
  await writeFile('test-results/workspace-review/manifest.json', JSON.stringify({ screens: records, suppressedWrites }, null, 2));
  console.log(`PASS: ${records.length} authorized desktop routes, 9 mobile workspace screens, registration, and no page errors. Read-only fixture sweep.`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve));
}

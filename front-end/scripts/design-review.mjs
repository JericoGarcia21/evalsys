import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { preview } from 'vite';
import { chromium } from '@playwright/test';

const server = await preview({ preview: { host: '127.0.0.1', port: 5183, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.route('**/api/settings/public?*', route => route.fulfill({ json: { isMaintenanceMode: false } }));
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok' } }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('test-results/design-review', { recursive: true });
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 800], [768, 1024]]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:5183/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Landing overflow at ${width}`);
    const video = page.getByLabel('EvalSys product overview', { exact: true });
    assert(await video.evaluate(el => !!el.closest('.landing-hero')), 'Video belongs in hero');
    assert.equal(await video.getAttribute('preload'), 'none');
    assert(await video.evaluate(el => el.paused), 'No autoplay');
    assert.equal(await page.locator('.landing-hero .landing-button').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(37, 99, 235)', 'Project primary blue');
    if (width === 1440) { const box = await video.boundingBox(); assert(box.y + box.height < height, 'Hero video fits desktop first screen'); }
    await page.screenshot({ path: `test-results/design-review/landing-${width}.png`, fullPage: true });
    await page.goto('http://127.0.0.1:5183/login');
    await page.getByLabel('Email or username', { exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Login overflow at ${width}`);
    await page.getByLabel('Password', { exact: true }).fill('SyntheticPassword!2026');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'text');
    await page.getByRole('button', { name: 'Hide password', exact: true }).click();
    await page.screenshot({ path: `test-results/design-review/login-${width}.png`, fullPage: true });
  }
  await page.goto('http://127.0.0.1:5183/');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const registration = page.getByRole('button', { name: 'Start here', exact: true });
  await registration.click();
  const dialog = page.getByRole('dialog', { name: 'Student Group Registration' });
  await dialog.waitFor({ state: 'visible' });
  assert(await dialog.evaluate(el => el.contains(document.activeElement)), 'Dialog receives focus');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert(await registration.evaluate(el => el === document.activeElement), 'Focus returns to opener');
  await page.getByRole('button', { name: 'Need an account? Request access' }).click();
  await page.getByRole('dialog', { name: 'Portal Access Request' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const faq = page.locator('summary').first();
  await faq.focus();
  await page.keyboard.press('Enter');
  assert(await faq.evaluate(el => el.parentElement.open), 'FAQ keyboard toggle');
  await page.getByRole('button', { name: 'Play chapter: Install EvalSys as an app', exact: true }).click();
  await page.waitForFunction(() => { const video = document.querySelector('video'); return video.currentTime >= 61 && !video.paused; });
  await page.getByRole('button', { name: 'Play chapter: Panels grade assigned groups', exact: true }).click();
  const video = page.getByLabel('EvalSys product overview', { exact: true });
  await video.evaluate(el => { el.pause(); el.textTracks[0].mode = 'showing'; el.currentTime = 35; });
  await page.waitForFunction(() => document.querySelector('video').textTracks[0].activeCues?.[0]?.text.includes('earned points'));
  assert.equal(await video.evaluate(el => el.error), null);
  await page.getByRole('link', { name: 'Installable PWA', exact: false }).click();
  assert((await page.locator('#install-app').innerText()).includes('internet connection is required'));
  await page.getByRole('link', { name: 'Open portal', exact: false }).first().click();
  await page.waitForURL('**/login');
  assert.deepEqual(errors, [], 'No page errors');
  console.log('PASS: landing/login at 4 widths, primary blue, hero video, no autoplay, password visibility, dialog focus/Escape, keyboard FAQ, chapters/captions, install guide, portal navigation.');
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve));
}

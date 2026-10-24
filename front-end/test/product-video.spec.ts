import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/settings/public?*', route => route.fulfill({ json: { isMaintenanceMode: false } }));
});

test('product video stays unloaded until keyboard playback and plays to the end', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const mediaRequests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('evalsys-overview.mp4')) mediaRequests.push(request.url()); });
  await page.goto('/');
  await page.getByRole('link', { name: 'Watch EvalSys in action' }).click();
  const video = page.getByLabel('EvalSys product overview', { exact: true });
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('preload', 'none');
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  expect(mediaRequests).toHaveLength(0);
  await video.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused)).toBe(true);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.videoWidth)).toBe(1920);
  expect(await video.evaluate((element: HTMLVideoElement) => element.duration)).toBeCloseTo(77, 0);
  await video.evaluate((element: HTMLVideoElement) => { element.textTracks[0].mode = 'hidden'; });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.textTracks[0].cues?.length)).toBe(7);
  for (const second of [2, 8, 20, 38, 55, 67, 75]) {
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 20000 }).toBeGreaterThanOrEqual(second);
    await video.screenshot({ path: test.info().outputPath(`playback-${second}.png`) });
  }
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.ended), { timeout: 15000 }).toBe(true);
  expect(await video.evaluate((element: HTMLVideoElement) => element.error)).toBeNull();
  expect(await video.evaluate((element: HTMLVideoElement) => element.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(2000);
});

test('mobile product video fits the page and supports captions and seeking', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('link', { name: 'Watch EvalSys in action' }).click();
  const video = page.getByLabel('EvalSys product overview', { exact: true });
  await expect(video).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await video.evaluate(async (element: HTMLVideoElement) => {
    await element.play();
    element.pause();
    element.textTracks[0].mode = 'showing';
    element.currentTime = 35;
  });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.seeking)).toBe(false);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.textTracks[0].activeCues?.[0]?.text)).toContain('earned points');
  await video.screenshot({ path: test.info().outputPath('mobile-player.png') });
  const source = await video.locator('source').getAttribute('src');
  expect(new URL(source!, 'http://localhost').pathname).toBe('/media/evalsys-overview.mp4');
  expect(new URL(source!, 'http://localhost').searchParams.get('v')).toBeTruthy();
  await expect(page.getByRole('link', { name: 'Download video', exact: true })).toHaveAttribute('href', source!);
});

test('chapters start an unloaded video and PWA install instructions are visible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play chapter: Install EvalSys as an app', exact: true }).click();
  const video = page.getByLabel('EvalSys product overview', { exact: true });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(61);
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeLessThan(65);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
  await page.getByRole('link', { name: 'Installable PWA · How to install' }).click();
  await expect(page.getByRole('heading', { name: 'Keep EvalSys one tap away.' })).toBeInViewport();
  const guide = page.locator('#install-app');
  await expect(guide).toContainText('Add to Home Screen');
  await expect(guide).toContainText('internet connection is required');
});

test('production PWA offers installation and passes Chrome installability checks', async ({ playwright, baseURL }) => {
  // Normal temporary profile: private/incognito contexts cannot install PWAs.
  const context = await playwright.chromium.launchPersistentContext(test.info().outputPath('pwa-profile'), {
    channel: process.env.CI ? undefined : 'chrome', baseURL,
  });
  try {
    const page = await context.newPage();
    await page.route('**/api/settings/public?*', route => route.fulfill({ json: { isMaintenanceMode: false } }));
    await page.goto('/');
    await expect(page.getByText('Install EvalSys', { exact: true })).toBeVisible();
    const session = await context.newCDPSession(page);
    const result = await session.send('Page.getInstallabilityErrors');
    expect(result.installabilityErrors).toEqual([]);
    const manifest = await (await page.request.get('/manifest.webmanifest')).json();
    expect(manifest.display).toBe('standalone');
    await session.detach();
  } finally {
    await context.close();
  }
});

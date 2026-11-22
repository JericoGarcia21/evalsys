import { test, expect } from '@playwright/test';
import { CURRENT_VERSION, RELEASES, latestReleaseForRole } from '../src/data/whatsNew';

test('Every account gets the current public version even for role-focused releases', () => {
  const current = RELEASES[0];
  const audience = current.audience;
  try {
    current.audience = ['admin'];
    for (const role of ['admin', 'panel', 'superadmin']) {
      expect(latestReleaseForRole(role)?.version).toBe(CURRENT_VERSION);
    }
    current.audience = [];
    expect(latestReleaseForRole('panel')).not.toBe(current);
    expect(latestReleaseForRole(undefined)).toBeNull();
  } finally {
    current.audience = audience;
  }
});

for (const role of ['admin', 'panel', 'superadmin']) {
  test(`What's New gives ${role} a readable, keyboard-contained update on desktop and mobile`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('token', 'isolated-release-ui-test'));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'release-reader', role, name: 'Release Reader', assignedSubjects: [] } });
      if (path.endsWith('/settings') || path.endsWith('/settings/public') || path.endsWith('/settings/notices')) {
        return route.fulfill({ json: { isMaintenanceMode: false, announcement: { isActive: false } } });
      }
      return route.fulfill({ json: [] });
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    const reopen = page.getByRole('button', { name: /What's new/ });
    await reopen.click();
    const release = latestReleaseForRole(role)!;
    const dialog = page.getByRole('dialog', { name: release.title });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Version ${CURRENT_VERSION} · ${release.date}`, { exact: true })).toBeVisible();
    await expect(reopen).toContainText(CURRENT_VERSION);
    for (const item of release.items) await expect(dialog.getByText(item, { exact: true })).toBeVisible();
    const desktopBounds = await dialog.boundingBox();
    expect(desktopBounds!.width).toBeGreaterThan(700);
    await expect(dialog.getByRole('button', { name: 'Got it', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: "Close what's new" })).toBeFocused();
    await page.screenshot({ path: test.info().outputPath(`whats-new-${role}-desktop.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileBounds = await dialog.boundingBox();
    expect(mobileBounds!.width).toBeLessThanOrEqual(390);
    expect(mobileBounds!.height).toBeLessThanOrEqual(844);
    await expect(dialog.getByRole('button', { name: 'Got it', exact: true })).toBeVisible();
    await dialog.getByText(release.items[release.items.length - 1], { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`whats-new-${role}-mobile.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('evalsys_whats_new_seen_release-reader'))).toBe(release.version);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await reopen.click();
    await expect(dialog).toBeVisible();
  });
}

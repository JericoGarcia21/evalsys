import { test, expect } from '@playwright/test';

for (const role of ['admin', 'panel']) {
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
    const dialog = page.getByRole('dialog', { name: 'Better teamwork. Clearer assignments.' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/For instructors:/)).toBeVisible();
    await expect(dialog.getByText(/For panel judges:/)).toBeVisible();
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
    await dialog.getByText(/A bigger, more readable/).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`whats-new-${role}-mobile.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('evalsys_whats_new_seen_release-reader'))).toBe('1.6.5');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await reopen.click();
    await expect(dialog).toBeVisible();
  });
}

import { test, expect } from '@playwright/test';

test('activity and backups render without waiting for the storage scan', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'operations-loading-test'));
  let releaseScan = () => {};
  const scan = new Promise<void>(resolve => { releaseScan = resolve; });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { _id: 'super', name: 'Super', role: 'superadmin' } });
    if (path.endsWith('/settings/public') || path.endsWith('/settings/notices')) return route.fulfill({ json: { isMaintenanceMode: false } });
    if (path.endsWith('/operations/activity')) return route.fulfill({ json: { latestLogins: [], failedLogins: [], recentActions: [], latestSubmissions: [] } });
    if (path.endsWith('/operations/proposal-orphans')) {
      await scan;
      return route.fulfill({ json: { totalFiles: 0, linkedFiles: 0, orphanFiles: 0, orphans: [] } });
    }
    return route.fulfill({ json: [] });
  });
  try {
    const started = Date.now();
    await page.goto('/operations');
    await expect(page.getByRole('heading', { name: 'Activity Monitor', exact: true })).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole('heading', { name: 'Backup Center', exact: true })).toBeVisible();
    await expect(page.getByText('No instructors found.', { exact: true })).toBeVisible();
    console.log(`Operations ready panels: ${Date.now() - started}ms while storage response is withheld`);
    await expect(page.getByRole('status', { name: 'Loading proposal cleanup' })).toBeVisible();
    releaseScan();
    await expect(page.getByRole('button', { name: 'No Orphan Files to Clean' })).toBeDisabled();
  } finally { releaseScan(); }
});

test('a failed storage scan does not discard activity and offers retry', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'operations-loading-test'));
  let fail = true;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { _id: 'super', name: 'Super', role: 'superadmin' } });
    if (path.endsWith('/settings/public') || path.endsWith('/settings/notices')) return route.fulfill({ json: { isMaintenanceMode: false } });
    if (path.endsWith('/operations/activity')) return route.fulfill({ json: { latestLogins: [], failedLogins: [], recentActions: [], latestSubmissions: [] } });
    if (path.endsWith('/operations/proposal-orphans')) return route.fulfill(fail ? { status: 500, json: { message: 'Storage scan unavailable' } } : { json: { totalFiles: 0, linkedFiles: 0, orphanFiles: 0, orphans: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/operations');
  await expect(page.getByRole('heading', { name: 'Activity Monitor', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Storage scan unavailable');
  await expect(page.getByRole('button', { name: 'No Orphan Files to Clean' })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Retry proposal cleanup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'No Orphan Files to Clean' })).toBeDisabled();
});

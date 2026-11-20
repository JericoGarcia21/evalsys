import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const login = async (page: Page, username = 'qa-super') => {
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('QaPassword!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
};

test('superadmin filters, paginates and downloads all matching audit records', async ({ page }) => {
  await login(page);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const headers = { Authorization: `Bearer ${token}` };
  const accounts = await page.request.get('http://127.0.0.1:5101/api/users', { headers });
  expect(accounts.ok()).toBeTruthy();
  const instructor = (await accounts.json()).find((account: { role: string }) => account.role === 'admin');
  // Reapply the existing limit to generate real audit events without changing policy.
  for (let index = 0; index < 27; index++) {
    const response = await page.request.patch(`http://127.0.0.1:5101/api/users/${instructor._id}/subject-limit`, { headers, data: { subjectLimit: instructor.subjectLimit } });
    expect(response.ok()).toBeTruthy();
  }
  await page.goto('/operations?view=audit');
  await page.getByLabel('Actor name or email').fill('QA Super');
  await page.getByLabel('Action (exact)').fill('instructor.subject_limit.update');
  await page.getByLabel('Status', { exact: true }).selectOption('success');
  await page.getByLabel('From date (UTC)').fill('2020-01-01');
  await page.getByLabel('To date (UTC)').fill('2099-12-31');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByText('27 records · Page 1 of 2', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('27 records · Page 2 of 2', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export filtered CSV', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^evalsys_audit_.*\.csv$/);
  const content = await readFile((await download.path())!, 'utf8');
  expect(content.trim().split('\r\n')).toHaveLength(28);
  expect(content).toContain('instructor.subject_limit.update');
  await page.getByLabel('Action (exact)').fill('not.an.action');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByText('No audit records match the applied filters.')).toBeVisible();
  await expect(page.getByText('0 records · Page 1 of 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByLabel('Action (exact)')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Export filtered CSV', exact: true })).toBeEnabled();
});

test('audit loading, failure/retry and export rejection are visible and recoverable', async ({ page }) => {
  await login(page);
  let failList = true;
  await page.route(/\/api\/operations\/audit-logs(?:\?|$)/, async route => {
    if (failList) {
      await route.fulfill({ status: 500, json: { message: 'QA audit unavailable' } });
    } else await route.continue();
  });
  await page.goto('/operations?view=audit');
  await expect(page.getByRole('alert')).toHaveText('QA audit unavailable');
  await expect(page.getByRole('button', { name: 'Export filtered CSV', exact: true })).toBeDisabled();
  failList = false;
  await page.getByRole('button', { name: 'Retry audit log', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export filtered CSV', exact: true })).toBeEnabled();
  await page.route('**/api/operations/audit-logs/export?*', route => route.fulfill({ status: 413, json: { message: 'Export exceeds 10,000 records. Narrow the filters and try again.' } }));
  await page.getByRole('button', { name: 'Export filtered CSV', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Narrow the filters');
  await page.unroute('**/api/operations/audit-logs/export?*');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export filtered CSV', exact: true }).click();
  await downloadPromise;
  await expect(page.getByText(/CSV downloaded for the applied filters/)).toBeVisible();
});

test('stale audit responses cannot replace newly applied filters', async ({ page }) => {
  await login(page);
  let releaseOld: () => void = () => {};
  let markStarted: () => void = () => {};
  const oldStarted = new Promise<void>(resolve => { markStarted = resolve; });
  const oldRelease = new Promise<void>(resolve => { releaseOld = resolve; });
  await page.route(/\/api\/operations\/audit-logs(?:\?|$)/, async route => {
    if (!new URL(route.request().url()).searchParams.get('action')) {
      markStarted();
      await oldRelease;
      await route.fulfill({ json: { items: [], pagination: { page: 1, total: 999, totalPages: 40, hasPreviousPage: false, hasNextPage: true } } }).catch(() => {});
    } else await route.fulfill({ json: { items: [], pagination: { page: 1, total: 0, totalPages: 1, hasPreviousPage: false, hasNextPage: false } } });
  });
  await page.goto('/operations?view=audit');
  await oldStarted;
  await expect(page.getByText('Loading audit logs...', { exact: true })).toBeVisible();
  await page.getByLabel('Action (exact)').fill('new.filter');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByText('0 records · Page 1 of 1', { exact: true })).toBeVisible();
  releaseOld();
  await expect(page.getByText('999 records · Page 1 of 40', { exact: true })).toHaveCount(0);
});

test('permission reference and audit controls work on a narrow screen with keyboard access', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/operations?view=permissions');
  const grading = page.getByRole('row', { name: /Change grading locks/ });
  await expect(grading.getByRole('cell').nth(0)).toHaveText('Denied');
  await expect(grading.getByRole('cell').nth(1)).toHaveText('Own workspace only');
  await expect(page.getByRole('row', { name: /Restore archived results/ })).toContainText('Not implemented');
  await page.getByRole('region', { name: 'Role permission matrix' }).focus();
  await expect(page.getByRole('region', { name: 'Role permission matrix' })).toBeFocused();
  await page.getByRole('button', { name: 'Audit Log', exact: true }).click();
  await expect(page).toHaveURL(/view=audit/);
  await page.getByLabel('Actor name or email').focus();
  await page.keyboard.type('no-matching-actor');
  await page.keyboard.press('Enter');
  await expect(page.getByText('No audit records match the applied filters.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Backup Center', exact: true })).toBeVisible();
});

test('instructor cannot navigate to Operations', async ({ page }) => {
  await login(page, 'qa-instructor');
  await page.goto('/operations?view=audit');
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('heading', { name: 'Audit log', exact: true })).toHaveCount(0);
});

import { test, expect, type Page } from '@playwright/test';

const base = 'http://127.0.0.1:5101/api';
const defaultPassword = 'QaControl!2026';
const login = async (page: Page, username = 'qa-super', password = 'QaPassword!2026') => {
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard|change-password/);
};
const headers = async (page: Page) => ({ Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('token'))}` });
const createInstructor = async (page: Page, suffix: string) => {
  const response = await page.request.post(base + '/users', { headers: await headers(page), data: { name: `QA Control ${suffix}`, email: `qa-control-${suffix.toLowerCase()}`, password: defaultPassword, role: 'admin' } });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return { _id: body.id as string, name: `QA Control ${suffix}`, email: `qa-control-${suffix.toLowerCase()}@evalsys.com` };
};
const apiLogin = async (page: Page, email: string, password = defaultPassword) => {
  const response = await page.request.post(base + '/auth/login', { data: { email, password } });
  expect(response.status()).toBe(200);
  return (await response.json()).token as string;
};

test('superadmin revokes sessions and completes non-destructive lifecycle checks', async ({ page }) => {
  await login(page);
  const account = await createInstructor(page, 'Lifecycle');
  const first = await apiLogin(page, account.email), second = await apiLogin(page, account.email);
  await page.goto('/operations?view=accounts');
  await page.getByLabel('Account to inspect').selectOption(account._id);
  await expect(page.getByText('2 active sessions', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out session', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Force Sign-out', exact: true }).click();
  await expect(page.getByText('1 active sessions', { exact: true })).toBeVisible();
  const statuses = await Promise.all([first, second].map(async token => (await page.request.get(base + '/auth/me', { headers: { Authorization: `Bearer ${token}` } })).status()));
  expect(statuses.sort()).toEqual([200, 401]);
  await page.getByRole('button', { name: 'Sign out all sessions', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Force Sign-out', exact: true }).click();
  await expect(page.getByText('No active sessions for this account.')).toBeVisible();
  await page.getByRole('button', { name: 'Deactivate instructor', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate Instructor', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Activate instructor', exact: true })).toBeVisible();
  await expect(page.getByText('Instructor deactivated', { exact: false }).filter({ hasText: 'Complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Record archive review', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Record Archive Review', exact: true }).click();
  await expect(page.getByText('Complete · Retained archive reviewed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activate instructor', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Activate Instructor', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Deactivate instructor', exact: true })).toBeVisible();
  for (const token of [first, second]) expect((await page.request.get(base + '/auth/me', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
});

test('bulk reset shows private credentials once and handles a failed attempt without losing selection', async ({ page }) => {
  await login(page);
  const first = await createInstructor(page, 'ResetOne'), second = await createInstructor(page, 'ResetTwo');
  await page.goto('/operations?view=accounts');
  await page.getByRole('button', { name: 'Bulk password reset', exact: true }).click();
  for (const user of [first, second]) await page.getByRole('checkbox', { name: `${user.name} (${user.email})`, exact: true }).check();
  await page.route('**/api/account-control/password-resets', route => route.fulfill({ status: 503, json: { message: 'QA transaction unavailable' } }));
  await page.getByRole('button', { name: 'Reset 2 instructor passwords', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset Passwords', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('QA transaction unavailable');
  await page.unroute('**/api/account-control/password-resets');
  await page.getByRole('button', { name: 'Reset 2 instructor passwords', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset Passwords', exact: true }).click();
  const input = page.getByLabel(`Temporary password for ${first.name}`, { exact: true });
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute('type', 'password');
  const temporaryPassword = await input.inputValue();
  expect(temporaryPassword.length).toBeGreaterThanOrEqual(20);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(temporaryPassword);
  await apiLogin(page, first.email, temporaryPassword);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }));
  await page.getByRole('button', { name: `Copy password for ${first.name}`, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Clipboard unavailable. Show and copy the password manually.');
  await page.getByRole('button', { name: 'Show passwords', exact: true }).click();
  await expect(input).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Dismiss passwords', exact: true }).click();
  await expect(input).toHaveCount(0);
  await page.getByRole('button', { name: 'Sessions & lifecycle', exact: true }).click();
  await page.getByRole('button', { name: 'Bulk password reset', exact: true }).click();
  await expect(page.getByText('Temporary passwords — deliver privately', { exact: true })).toHaveCount(0);
});

test('whole-subject transfer previews dependencies and preserves blocks and groups', async ({ page }) => {
  await login(page);
  const source = await createInstructor(page, 'TransferSource'), target = await createInstructor(page, 'TransferTarget');
  const temporary = await apiLogin(page, source.email);
  const rotated = await page.request.patch(base + '/auth/change-password', { headers: { Authorization: `Bearer ${temporary}` }, data: { newPassword: 'QaTransferNew!2026' } });
  expect(rotated.status()).toBe(200);
  const sourceHeaders = { Authorization: `Bearer ${(await rotated.json()).token}` };
  const subjectResponse = await page.request.post(base + '/subjects', { headers: sourceHeaders, data: { code: 'CONTROL101', title: 'Control Transfer' } });
  expect(subjectResponse.status()).toBe(201);
  const subject = await subjectResponse.json();
  const scopedHeaders = { ...sourceHeaders, 'x-subject-id': subject._id };
  const blockResponse = await page.request.post(base + '/sections', { headers: scopedHeaders, data: { name: 'Control Block', block: 'CONTROL-A' } });
  expect(blockResponse.status()).toBe(201);
  const block = await blockResponse.json();
  const groupResponse = await page.request.post(base + '/groups', { headers: scopedHeaders, data: { name: 'Control Transfer Group', section: block._id, members: ['Preserved Student'] } });
  expect(groupResponse.status()).toBe(201);
  const group = await groupResponse.json();
  const adminHeaders = await headers(page);
  expect((await page.request.patch(base + `/account-control/instructors/${source._id}/status`, { headers: adminHeaders, data: { isActive: false, confirmText: 'DEACTIVATE' } })).status()).toBe(200);
  expect((await page.request.patch(base + '/settings/system-controls', { headers: adminHeaders, data: { isMaintenanceMode: true, maintenanceDelayMinutes: 0 } })).status()).toBe(200);
  try {
    await page.goto('/operations?view=accounts');
    await page.getByRole('button', { name: 'Ownership transfer', exact: true }).click();
    await page.getByLabel('Source instructor (inactive)').selectOption(source._id);
    await page.getByLabel('Destination instructor (active)').selectOption(target._id);
    await page.getByRole('checkbox', { name: 'CONTROL101 — Control Transfer', exact: true }).check();
    await page.getByRole('button', { name: 'Preview transfer', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Transfer preview: ${source.name} → ${target.name}`, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm ownership transfer', exact: true })).toBeDisabled();
    await page.getByLabel('Type TRANSFER to confirm').fill('TRANSFER');
    await page.getByRole('button', { name: 'Confirm ownership transfer', exact: true }).click();
    await expect(page.getByText(/Subject workspaces transferred/)).toBeVisible();
    const groups = await page.request.get(base + '/groups', { headers: { ...adminHeaders, 'x-subject-id': subject._id, 'x-instructor-id': target._id } });
    expect(groups.status()).toBe(200);
    expect((await groups.json()).some((item: { _id: string }) => item._id === group._id)).toBe(true);
  } finally {
    await page.request.patch(base + '/settings/system-controls', { headers: adminHeaders, data: { isMaintenanceMode: false } });
  }
});

test('replacement token keeps password rotation signed in and sign-out revokes it server-side', async ({ page }) => {
  await login(page);
  const account = await createInstructor(page, 'OwnPassword');
  await page.evaluate(() => localStorage.clear());
  await login(page, account.email, defaultPassword);
  await expect(page).toHaveURL(/change-password/);
  // PasswordField inputs are password controls; use their explicit labels.
  await page.getByLabel('New Password', { exact: true }).fill('QaOwnChanged!2026');
  await page.getByLabel('Confirm New Password', { exact: true }).fill('QaOwnChanged!2026');
  await page.getByRole('button', { name: /Save.*Password|Change Password|Update Password/i }).click();
  await expect(page).toHaveURL(/dashboard/);
  const rotatedToken = await page.evaluate(() => localStorage.getItem('token'));
  await page.reload();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto('/account-security');
  await page.getByLabel('Current Password', { exact: true }).fill('QaOwnChanged!2026');
  await page.getByLabel('New Password', { exact: true }).fill('QaOwnSecond!2026');
  await page.getByLabel('Confirm New Password', { exact: true }).fill('QaOwnSecond!2026');
  await page.getByRole('button', { name: 'Update Password', exact: true }).click();
  await expect(page.getByText('Password updated successfully', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).not.toBe(rotatedToken);
  expect((await page.request.get(base + '/auth/me', { headers: { Authorization: `Bearer ${rotatedToken}` } })).status()).toBe(401);
  const logoutResponse = page.waitForResponse(response => response.url().endsWith('/auth/logout'));
  await page.locator('aside').getByRole('button', { name: 'Sign out', exact: true }).click();
  expect((await logoutResponse).status()).toBe(200);
  await expect(page).toHaveURL(/login/);
  expect((await page.request.get(base + '/auth/me', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
});

test('account controls fit a narrow screen and session errors offer refresh', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.route('**/api/account-control/accounts/*/sessions', route => route.fulfill({ status: 500, json: { message: 'QA session list unavailable' } }));
  await page.goto('/operations?view=accounts');
  await expect(page.getByRole('alert')).toHaveText('QA session list unavailable');
  await page.unroute('**/api/account-control/accounts/*/sessions');
  await page.getByRole('button', { name: 'Refresh sessions', exact: true }).click();
  await expect(page.getByText(/active sessions/, { exact: false }).filter({ hasText: /^\d+ active sessions/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Ownership transfer', exact: true }).click();
  await expect(page.getByLabel('Source instructor (inactive)')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

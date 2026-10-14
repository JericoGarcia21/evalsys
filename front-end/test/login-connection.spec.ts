import { test, expect, type Page } from '@playwright/test';

const user = { id: 'login-test-panel', _id: 'login-test-panel', name: 'Login Tester', role: 'panel', mustChangePassword: false };
async function stubApp(page: Page) {
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/settings/public')) return route.fulfill({ json: { isMaintenanceMode: false } });
    if (url.pathname.endsWith('/chat/rooms')) return route.fulfill({ json: { rooms: [] } });
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: user });
    return route.fulfill({ json: [] });
  });
}
async function fillLogin(page: Page) {
  await page.getByLabel('Email or username', { exact: true }).fill('login-tester');
  await page.getByLabel('Password', { exact: true }).fill('SyntheticPassword!2026');
}

test('sign-in waits for startup readiness instead of racing a pending health check', async ({ page }) => {
  await stubApp(page);
  let healthy = false;
  let release: () => void = () => {};
  const ready = new Promise<void>(resolve => { release = resolve; });
  let healthRequests = 0, loginRequests = 0;
  await page.route('**/api/health', async route => {
    healthRequests += 1;
    if (healthRequests === 1) return route.fulfill({ status: 502, json: { message: 'Starting' } });
    await ready;
    healthy = true;
    return route.fulfill({ json: { status: 'ok' } });
  });
  await page.route('**/api/auth/login', route => {
    loginRequests += 1;
    expect(healthy).toBe(true);
    return route.fulfill({ json: { token: 'synthetic-token', user } });
  });
  await page.goto('/login');
  await fillLogin(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connecting…', exact: true })).toBeDisabled();
  expect(loginRequests).toBe(0);
  release();
  await expect(page).toHaveURL(/dashboard$/);
  expect(loginRequests).toBe(1);
});

test('one transport failure retries sign-in automatically after checking readiness again', async ({ page }) => {
  await stubApp(page);
  let loginRequests = 0, healthRequests = 0;
  await page.route('**/api/health', route => { healthRequests += 1; return route.fulfill({ json: { status: 'ok' } }); });
  await page.route('**/api/auth/login', route => {
    loginRequests += 1;
    if (loginRequests === 1) return route.abort('connectionrefused');
    return route.fulfill({ json: { token: 'synthetic-token', user } });
  });
  await page.goto('/login');
  await fillLogin(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
  expect(loginRequests).toBe(2);
  expect(healthRequests).toBeGreaterThanOrEqual(2);
});

test('wrong passwords are not automatically retried and entered details are preserved', async ({ page }) => {
  await stubApp(page);
  let loginRequests = 0;
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/auth/login', route => {
    loginRequests += 1;
    return route.fulfill({ status: 401, json: { message: 'Invalid credentials' } });
  });
  await page.goto('/login');
  await fillLogin(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid credentials');
  expect(loginRequests).toBe(1);
  await expect(page.getByLabel('Email or username', { exact: true })).toHaveValue('login-tester');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('SyntheticPassword!2026');
});

test('maintenance responses do not trigger another credential request', async ({ page }) => {
  await stubApp(page);
  let loginRequests = 0;
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/auth/login', route => {
    loginRequests += 1;
    return route.fulfill({ status: 503, json: { maintenanceMode: true, message: 'Scheduled maintenance is active.' } });
  });
  await page.goto('/login');
  await fillLogin(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'EvalSys is temporarily paused' })).toBeVisible();
  expect(loginRequests).toBe(1);
});

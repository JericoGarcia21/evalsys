import { test, expect, type Page } from '@playwright/test';

const login = async (page: Page, username: string) => {
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('QaPassword!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard|change-password/);
};
const selectSubject = async (page: Page, code: string) => {
  const selector = page.locator('aside nav').getByRole('button').first();
  if (!(await selector.innerText()).startsWith(code)) {
    await selector.click();
    await page.getByRole('button', { name: code === 'QA101' ? 'QA101 - Browser QA' : 'QA202 - Second Browser Subject', exact: true }).click();
  }
  await expect(selector).toContainText(code);
};
const openGroup = async (page: Page, name: string) => {
  await page.goto('/grade');
  await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'QA101 - Browser QA' });
  await page.getByRole('button', { name: /QA-A/ }).click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByRole('spinbutton')).toBeVisible();
};

test('login failure is shown and valid instructor sees working navigation', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill('qa-instructor');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(/Invalid.*credentials|Incorrect.*password|Invalid email or password/i)).toBeVisible();
  await login(page, 'qa-instructor');
  await expect(page.locator('aside').getByRole('link', { name: 'Results', exact: true })).toBeVisible();
  await expect(page.locator('aside').getByRole('link', { name: 'AI Insights', exact: true })).toBeVisible();
});
test('instructor can switch subjects without showing groups from the previous subject', async ({ page }) => {
  await login(page, 'qa-instructor');
  await selectSubject(page, 'QA101');
  await page.goto('/groups');
  await expect(page.getByText('QA Grade Group', { exact: true })).toBeVisible();
  await expect(page.getByText('QA Other Subject Group', { exact: true })).toHaveCount(0);
  await selectSubject(page, 'QA202');
  await expect(page.getByText('QA Other Subject Group', { exact: true })).toBeVisible();
  await expect(page.getByText('QA Grade Group', { exact: true })).toHaveCount(0);
});
test('panel can submit and update scores through the confirmation modal', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await login(page, 'qa-panel-a');
  await openGroup(page, 'QA Grade Group');
  await page.getByRole('spinbutton').fill('8');
  await page.locator('textarea').fill('QA feedback');
  await page.getByRole('button', { name: 'Submit Scores & Feedback', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Scores', exact: true }).click();
  await expect(page.getByText('Scores and feedback submitted successfully.', { exact: true })).toBeVisible();
  await page.getByRole('spinbutton').fill('9');
  await page.getByRole('button', { name: 'Update Scores & Feedback', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Scores', exact: true }).click();
  await expect(page.getByText('Scores and feedback submitted successfully.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('panel draft survives a reload and an offline submission preserves it', async ({ page, context }) => {
  await login(page, 'qa-panel-b');
  await openGroup(page, 'QA Draft Group');
  await page.getByRole('spinbutton').fill('7');
  await page.locator('textarea').fill('Offline draft');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.includes('draft') && (localStorage.getItem(key) || '').includes('Offline draft')))).toBe(true);
  await page.reload();
  await expect(page.getByRole('spinbutton')).toHaveValue('7');
  await expect(page.locator('textarea')).toHaveValue('Offline draft');
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Submit Scores & Feedback', exact: true })).toBeDisabled();
  await expect(page.getByRole('spinbutton')).toHaveValue('7');
  await expect(page.getByText(/You are offline/)).toBeVisible();
  await context.setOffline(false);
});
test('results remain pending until both panels submit, then average correctly', async ({ page }) => {
  for (const [username, score] of [['qa-panel-a', '9'], ['qa-panel-b', '7']]) {
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await login(page, username);
    await openGroup(page, 'QA Grade Group');
    await page.getByRole('spinbutton').fill(score);
    await page.getByRole('button', { name: /^(Submit|Update) Scores & Feedback$/ }).click();
    await page.getByRole('button', { name: 'Submit Scores', exact: true }).click();
    await expect(page.getByText('Scores and feedback submitted successfully.', { exact: true })).toBeVisible();
    await page.evaluate(() => localStorage.clear());
    await login(page, 'qa-instructor');
    await selectSubject(page, 'QA101');
    await page.goto('/results');
    await page.getByRole('button', { name: /QA-A/ }).click();
    const row = page.getByRole('row').filter({ hasText: 'QA Grade Group' });
    await expect(row).toBeVisible();
    if (username === 'qa-panel-a') await expect(row).toContainText(/Pending|Incomplete/i);
    else { await expect(row).toContainText('8'); await expect(row).not.toContainText(/Pending|Incomplete/i); }
  }
});
test('temporary-password panel is redirected to password change', async ({ page }) => {
  await login(page, 'qa-temp');
  await expect(page).toHaveURL(/change-password/);
  await expect(page.getByRole('heading', { name: /Change.*Password/i })).toBeVisible();
});
test('expired session clears authentication and redirects to login', async ({ page }) => {
  await login(page, 'qa-instructor');
  await page.evaluate(() => localStorage.setItem('token', 'invalid-token'));
  await page.locator('aside').getByRole('link', { name: 'Groups', exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBeNull();
});
test('public registration rejects a missing link and submits a valid registration', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByText(/Registration is closed/).first()).toBeVisible();
  await page.goto('/register/qa-browser-registration');
  await expect(page.getByRole('heading', { name: /Register|Registration/i }).first()).toBeVisible();
  await page.getByPlaceholder('e.g. Group Omega or Juan Dela Cruz').fill('QA Browser Registered');
  await page.getByRole('combobox').nth(1).selectOption({ label: 'QA-A' });
  await page.getByPlaceholder('Garcia', { exact: true }).fill('Student');
  await page.getByPlaceholder('Jerico', { exact: true }).fill('Browser');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Complete Registration', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Registration', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registration Successful!', exact: true })).toBeVisible();
});
test('superadmin opens platform controls and announcements without browser errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await login(page, 'qa-super');
  await page.goto('/system-control');
  await expect(page.getByRole('heading', { name: 'System Control', exact: true })).toBeVisible();
  await expect(page.getByText(/Maintenance/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile login remains usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'qa-panel-a');
  await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('panel assigned groups are separated by subject on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'qa-panel-a');
  await page.goto('/grade');
  const subjectSelector = page.getByLabel('Subject', { exact: true });
  await subjectSelector.selectOption({ label: 'QA101 - Browser QA' });
  await expect(page.getByRole('button', { name: /QA-A/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /QA-B/ })).toHaveCount(0);
  await page.getByRole('button', { name: /QA Draft Group/ }).click();
  await expect(page.getByRole('spinbutton')).toBeVisible();
  await page.getByRole('spinbutton').fill('7');
  await subjectSelector.selectOption({ label: 'QA202 - Second Browser Subject' });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: /QA-B/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /QA-A/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /QA Draft Group/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /QA Other Subject Group/ })).toBeVisible();
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  await page.getByRole('button', { name: /QA Other Subject Group/ }).click();
  await expect(page.getByRole('spinbutton')).toBeVisible();
  await subjectSelector.selectOption({ label: 'QA101 - Browser QA' });
  await page.getByRole('button', { name: /QA Draft Group/ }).click();
  await expect(page.getByRole('spinbutton')).toHaveValue('7');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

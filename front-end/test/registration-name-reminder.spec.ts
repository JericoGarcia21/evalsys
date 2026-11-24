import { test, expect } from '@playwright/test';

test('successful link creation reminds instructors about exported member names, but failure does not', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill('qa-instructor');
  await page.getByLabel('Password', { exact: true }).fill('QaPassword!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto('/registration-links');
  const message = page.getByRole('dialog', { name: 'Link created — remind students to check their names' });
  await expect(message).toHaveCount(0);
  let fail = true;
  await page.route('**/api/registration-links', route => {
    if (route.request().method() === 'POST' && fail) return route.fulfill({ status: 500, json: { message: 'Link creation unavailable' } });
    return route.continue();
  });
  const create = page.getByRole('button', { name: 'Generate Registration Link', exact: true });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByText('Link creation unavailable', { exact: true })).toBeVisible();
  await expect(message).toHaveCount(0);
  fail = false;
  await create.click();
  await expect(message).toBeVisible();
  await expect(message).toContainText('complete first name, last name, and middle name');
  await expect(message).toContainText('member-score CSV opened in Excel');
  await expect(message).toContainText('If they have no middle name, leave that field blank');
  await expect(message.getByRole('button', { name: 'Understood', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(message.getByRole('button', { name: 'Understood', exact: true })).toBeFocused();
  await message.getByRole('button', { name: 'Understood', exact: true }).click();
  await expect(message).not.toBeVisible();
  await expect(create).toBeFocused();
  await create.click();
  await expect(message).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(message).not.toBeVisible();
  await expect(create).toBeFocused();
});

test('students see the export name guidance beside their member fields', async ({ page }) => {
  await page.goto('/register/qa-browser-registration');
  const members = page.locator('[data-tutorial="registration-members"]');
  await expect(members).toContainText('Use your exact name as recorded in STEPS.');
  await expect(page.getByLabel('Middle name (optional)', { exact: true })).not.toHaveAttribute('required');
});

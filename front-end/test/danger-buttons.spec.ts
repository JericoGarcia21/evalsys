import { test, expect } from '@playwright/test';

for (const [username, route] of [['qa-instructor', '/groups'], ['qa-super', '/users']]) {
  test(`${username} destructive action hover keeps white text on red`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email or username', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill('QaPassword!2026');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto(route);
    const button = page.locator('button.evl-btn-ghost.text-danger').first();
    await expect(button).toBeEnabled();
    await button.hover();
    await expect(button).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(button).toHaveCSS('background-color', 'rgb(185, 28, 28)');
    if (username === 'qa-instructor') {
      await button.click();
      const dialog = page.getByRole('dialog', { name: 'Delete Group?', exact: true });
      const confirm = dialog.getByRole('button', { name: 'Delete Group', exact: true });
      await expect(confirm).toHaveCSS('color', 'rgb(255, 255, 255)');
      await expect(confirm).toHaveCSS('background-color', 'rgb(185, 28, 28)');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    // Never confirm deletion: these checks leave the test account and group intact.
  });
}

import { test, expect } from '@playwright/test';

for (const [username, role] of [['qa-super', 'Super Admin'], ['qa-instructor', 'Instructor'], ['qa-panel-a', 'Panel']]) {
  test(role + ' sidebar remains reachable on narrow and short screens', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const user = { _id: username, name: role, role: role === 'Super Admin' ? 'superadmin' : role === 'Instructor' ? 'admin' : 'panel' };
    await page.addInitScript(() => localStorage.setItem('token', 'mock-sidebar-session'));
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const json = path.endsWith('/auth/me') ? user
        : path.endsWith('/users') ? [{ _id: 'instructor', name: 'Instructor with a very long name for mobile testing', role: 'admin', isActive: true }]
        : path.endsWith('/subjects') ? Array.from({ length: 12 }, (_, index) => ({ _id: 'subject-' + index, code: 'TEST' + index, title: 'Long subject title for responsive mobile selection' }))
        : [];
      return route.fulfill({ json });
    });
    await page.goto('/account-security');
    const later = page.getByRole('button', { name: 'Maybe later', exact: true });
    if (await later.isVisible()) await later.click();
    const drawer = page.getByRole('complementary', { name: 'Workspace sidebar' });
    for (const size of [{ width: 320, height: 568 }, { width: 667, height: 375 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(size);
      await page.getByRole('button', { name: 'Toggle navigation menu' }).click();
      await expect(drawer).toBeVisible();
      await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(0);
      const bounds = await drawer.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.width).toBeLessThanOrEqual(size.width);
      expect(bounds!.height).toBeLessThanOrEqual(size.height);
      if (role === 'Super Admin') {
        await drawer.getByLabel('Instructor', { exact: true }).scrollIntoViewIfNeeded();
        await expect(drawer.getByLabel('Instructor', { exact: true })).toBeInViewport();
      }
      if (role !== 'Panel') {
        const subject = drawer.locator('[data-tutorial="subject-switcher"]');
        await subject.scrollIntoViewIfNeeded();
        await subject.click();
        const option = drawer.locator('#sidebar-subjects button').last();
        await option.scrollIntoViewIfNeeded();
        await expect(option).toBeInViewport();
        await option.click();
      }
      for (const link of await drawer.locator('nav a').all()) {
        await link.scrollIntoViewIfNeeded();
        await expect(link).toBeInViewport();
      }
      await expect(drawer.getByRole('button', { name: 'Sign out', exact: true })).toBeInViewport();
      await drawer.getByRole('button', { name: 'Close navigation menu' }).click();
      await expect(drawer).toBeHidden();
    }
  });
}


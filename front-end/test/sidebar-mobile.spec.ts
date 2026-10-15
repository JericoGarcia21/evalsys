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


test('mobile Resources and Subjects expose update, unlock and edit actions', async ({ page }) => {
  const instructor = { _id: 'teacher', name: 'Mobile Instructor', email: 'teacher@example.test', role: 'admin', isActive: true, assignedSubjects: ['subject'], subjectLimit: 1, csvExportLocked: true, gradingLockedSubjects: ['subject'] };
  const subject = { _id: 'subject', code: 'TEST', title: 'Mobile subject', isActive: true, createdAt: '2026-01-01' };
  const writes: { path: string; body: unknown }[] = [];
  await page.addInitScript(() => localStorage.setItem('token', 'mock-mobile-session'));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON();
      writes.push({ path, body });
      return route.fulfill({ json: { ...body, gradingLockedSubjects: [] } });
    }
    return route.fulfill({ json: path.endsWith('/auth/me') ? { _id: 'super', name: 'Super', role: 'superadmin' } : path.endsWith('/users') ? [instructor] : path.endsWith('/subjects') ? [subject] : null });
  });
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/subscription');
    const selector = page.getByLabel('Grading Subject', { exact: true });
    await expect(selector).toBeVisible();
    await selector.scrollIntoViewIfNeeded();
    expect((await selector.boundingBox())!.x + (await selector.boundingBox())!.width).toBeLessThanOrEqual(width);
    const limit = page.getByRole('spinbutton', { name: 'Paid limit for Mobile Instructor' });
    await limit.fill('2');
    for (const name of ['Update Limit', 'Unlock CSV', 'Unlock Grading']) {
      const button = page.getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
      const bounds = (await button.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await button.click();
    }
    await page.goto('/subjects');
    for (const name of ['Edit', 'Delete', 'Assign Instructors']) {
      const button = page.getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
      const bounds = (await button.boundingBox())!;
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toBeInViewport();
  }
  expect(writes).toHaveLength(12);
  expect(writes[0].body).toEqual({ subjectLimit: 2 });
  expect(writes[1].body).toEqual({ csvExportLocked: false });
  expect(writes[2].body).toEqual({ subject: 'subject', gradingLocked: false });
});

import { test, expect, type Page } from '@playwright/test';
test.use({ timezoneId: 'Asia/Manila' });

const mockControls = async (page: Page) => {
  let settings = {
    isMaintenanceMode: false, maintenanceStartsAt: null, maintenanceEndsAt: null,
    maintenanceMessage: 'We are updating EvalSys. Your saved evaluations are safe. Access will resume after maintenance.',
    announcement: { isActive: false, title: 'Final evaluation schedule', message: 'Please finish your assigned evaluations before Friday. Save your work before the scheduled maintenance window.', roles: ['admin', 'panel'], subjectIds: [], startsAt: null, endsAt: null },
  };
  const writes: Record<string, unknown>[] = [];
  await page.addInitScript(() => localStorage.setItem('token', 'isolated-system-ui-test'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'system-ui-user', name: 'System Admin', role: 'superadmin' } });
    if (path.endsWith('/settings/public')) return route.fulfill({ json: { isMaintenanceMode: false, announcement: { isActive: false } } });
    if (path.endsWith('/settings/system-controls')) {
      const body = route.request().postDataJSON();
      writes.push(body);
      settings = { ...settings, ...body };
      return route.fulfill({ json: settings });
    }
    if (path.endsWith('/settings')) return route.fulfill({ json: settings });
    if (path.endsWith('/subjects')) return route.fulfill({ json: [{ _id: 'subject-a', code: 'ITEPC03-2', title: 'Object-oriented programming' }] });
    return route.fulfill({ json: [] });
  });
  return writes;
};

test('System Control separates tasks, previews drafts and preserves edits when switching views', async ({ page }) => {
  const writes = await mockControls(page);
  await page.goto('/system-control');
  await expect(page.getByRole('region', { name: 'Announcement controls', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Maintenance controls', exact: true })).toBeHidden();
  await page.getByLabel('Title', { exact: true }).fill('A draft, not a live notice');
  await page.getByRole('checkbox', { name: 'Publish announcement', exact: true }).check();
  await expect(page.getByRole('complementary', { name: 'Announcement preview', exact: true })).toContainText('A draft, not a live notice');
  await expect(page.getByText('No live notice', { exact: true })).toBeVisible();
  await expect(page.getByText('Unsaved changes · preview is not published', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Maintenance', exact: true }).click();
  await expect(page).toHaveURL(/view=maintenance/);
  await page.getByLabel('Start date and time', { exact: true }).fill('2099-06-15T09:00');
  await page.getByLabel('Maintenance message', { exact: true }).fill('Keep this unsaved maintenance message.');
  await page.getByRole('button', { name: 'Announcements', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('A draft, not a live notice');
  await page.getByRole('button', { name: 'Maintenance', exact: true }).click();
  await expect(page.getByLabel('Start date and time', { exact: true })).toHaveValue('2099-06-15T09:00');
  await expect(page.getByLabel('Maintenance message', { exact: true })).toHaveValue('Keep this unsaved maintenance message.');
  expect(writes).toEqual([]);
});

test('System Control confirmation contains keyboard focus, cancels on Escape, and updates saved status only on save', async ({ page }) => {
  const writes = await mockControls(page);
  await page.goto('/system-control');
  await page.getByRole('checkbox', { name: 'Publish announcement', exact: true }).check();
  const save = page.getByRole('button', { name: 'Save Announcement', exact: true });
  await save.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Publish Announcement', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(save).toBeFocused();
  expect(writes).toEqual([]);
  await save.click();
  await dialog.getByRole('button', { name: 'Publish Announcement', exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  expect(writes).toHaveLength(1);
  await expect(page.getByText('Notice is live', { exact: true })).toBeVisible();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
});

test('System Control forms and previews fit desktop and mobile with realistic long messages', async ({ page }) => {
  await mockControls(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/system-control');
  await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
  await page.getByLabel('Message', { exact: true }).fill('Please save your work and complete your assigned evaluations before the deadline. '.repeat(5));
  for (const [view, label] of [['announcements', 'Announcements'], ['maintenance', 'Maintenance']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`system-control-${view}-desktop.png`), fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [view, label] of [['announcements', 'Announcements'], ['maintenance', 'Maintenance']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`system-control-${view}-mobile.png`), fullPage: true, animations: 'disabled' });
  }
});

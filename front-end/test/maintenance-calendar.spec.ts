import { test, expect, type Page } from '@playwright/test';
test.use({ timezoneId: 'Asia/Manila' });

async function mockControls(page: Page, initial: Record<string, unknown> = {}, role = 'superadmin') {
  let settings: Record<string, unknown> = {
    isMaintenanceMode: false, maintenanceStartsAt: null, maintenanceEndsAt: null,
    maintenanceMessage: 'Scheduled maintenance update.',
    announcement: { isActive: false, title: '', message: '' }, ...initial,
  };
  const writes: Record<string, unknown>[] = [];
  await page.addInitScript(() => localStorage.setItem('token', 'maintenance-browser-test'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { _id: 'superadmin-test', id: 'superadmin-test', name: 'Test User', role } });
    if (url.pathname.endsWith('/system-controls')) {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (body.isMaintenanceMode === false) settings = { ...settings, isMaintenanceMode: false, maintenanceStartsAt: null, maintenanceEndsAt: null };
      else if (body.isMaintenanceMode === true) {
        const start = body.maintenanceStartsAt || new Date(Date.now() + (body.maintenanceDelayMinutes || 0) * 60000).toISOString();
        settings = { ...settings, ...body, maintenanceStartsAt: start, isMaintenanceMode: !body.maintenanceStartsAt && !body.maintenanceDelayMinutes };
      } else settings = { ...settings, ...body };
      return route.fulfill({ json: settings });
    }
    if (url.pathname.endsWith('/settings') || url.pathname.endsWith('/settings/public')) return route.fulfill({ json: settings });
    return route.fulfill({ json: [] });
  });
  return writes;
}

test('calendar maintenance saves Manila timezone dates and can be rescheduled or cancelled', async ({ page }) => {
  const writes = await mockControls(page);
  await page.goto('/system-control');
  await expect(page.getByText('Asia/Manila', { exact: true })).toBeVisible();
  await page.getByLabel('Start date and time', { exact: true }).fill('2099-06-15T09:00');
  await page.getByLabel('End date and time (optional)').fill('2099-06-15T10:00');
  await page.getByRole('button', { name: 'Schedule Maintenance', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Access automatically resumes');
  await dialog.getByRole('button', { name: 'Save Schedule' }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Update Schedule' })).toBeVisible();
  expect(writes[0].maintenanceStartsAt).toBe('2099-06-15T01:00:00.000Z');
  expect(writes[0].maintenanceEndsAt).toBe('2099-06-15T02:00:00.000Z');
  await page.getByLabel('Start date and time', { exact: true }).fill('2099-06-15T09:30');
  await page.getByRole('button', { name: 'Update Schedule' }).click();
  await dialog.getByRole('button', { name: 'Save Schedule' }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].maintenanceStartsAt).toBe('2099-06-15T01:30:00.000Z');
  await page.getByRole('button', { name: 'Cancel Schedule', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel Schedule', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Schedule Maintenance', exact: true })).toBeVisible();
  expect(writes[2]).toEqual({ isMaintenanceMode: false });
});

test('invalid calendar windows cannot be submitted and maintenance UI fits mobile', async ({ page }) => {
  const writes = await mockControls(page);
  await page.goto('/system-control');
  await page.getByRole('button', { name: 'Schedule Maintenance', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Choose a future');
  await page.getByLabel('Start date and time', { exact: true }).fill('2099-06-15T10:00');
  await page.getByLabel('End date and time (optional)').fill('2099-06-15T09:00');
  await page.getByRole('button', { name: 'Schedule Maintenance', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('end must be after the start');
  expect(writes).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});

test('active maintenance supports message edits and manual ending', async ({ page }) => {
  const writes = await mockControls(page, { isMaintenanceMode: true, maintenanceStartsAt: new Date(Date.now() - 60000).toISOString() });
  await page.goto('/system-control');
  await expect(page.getByText('Maintenance is active.', { exact: false })).toBeVisible();
  await page.getByLabel('Maintenance message', { exact: true }).fill('Finishing server updates.');
  await page.getByRole('button', { name: 'Save Message' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save Message' }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({ maintenanceMessage: 'Finishing server updates.' });
  await page.getByRole('button', { name: 'End Maintenance', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End Maintenance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Schedule Maintenance', exact: true })).toBeVisible();
});

test('expired maintenance window shows restored access rather than active maintenance', async ({ page }) => {
  await mockControls(page, {
    isMaintenanceMode: true,
    maintenanceStartsAt: new Date(Date.now() - 60000).toISOString(),
    maintenanceEndsAt: new Date(Date.now() - 1000).toISOString(),
  });
  await page.goto('/system-control');
  await expect(page.getByText('Access has resumed.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'End Maintenance', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Schedule Maintenance', exact: true })).toBeVisible();
});


test('quick immediate maintenance remains available without an end date', async ({ page }) => {
  const writes = await mockControls(page);
  await page.goto('/system-control');
  await page.getByLabel('Start maintenance', { exact: true }).selectOption('quick');
  await page.getByLabel('Start delay', { exact: true }).selectOption('0');
  await page.getByRole('button', { name: 'Start Maintenance Now', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start Now', exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End Maintenance', exact: true })).toBeVisible();
  expect(writes[0].maintenanceDelayMinutes).toBe(0);
  expect(writes[0].maintenanceEndsAt).toBeNull();
  expect(writes[0].maintenanceStartsAt).toBeUndefined();
});

test('panel maintenance overlay disappears automatically at the end time', async ({ page }) => {
  await mockControls(page, {
    isMaintenanceMode: true,
    maintenanceStartsAt: new Date(Date.now() - 60000).toISOString(),
    maintenanceEndsAt: new Date(Date.now() + 7000).toISOString(),
  }, 'panel');
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'EvalSys is temporarily paused' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'EvalSys is temporarily paused' })).toHaveCount(0, { timeout: 10000 });
});


test('upcoming maintenance and announcements stack without overlapping on mobile', async ({ page }) => {
  await mockControls(page, {
    maintenanceStartsAt: '2099-06-15T01:00:00.000Z',
    maintenanceEndsAt: '2099-06-15T02:00:00.000Z',
    announcement: { isActive: true, title: 'Grading reminder', message: 'Finish your evaluations before the deadline.' },
  }, 'panel');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  const maintenance = page.getByText('Scheduled Maintenance', { exact: true }).locator('..');
  const announcement = page.getByText('Grading reminder', { exact: true }).locator('..');
  await expect(maintenance).toBeVisible();
  await expect(announcement).toBeVisible();
  const first = await maintenance.boundingBox();
  const second = await announcement.boundingBox();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
});

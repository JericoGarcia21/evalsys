import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test.use({ timezoneId: 'Asia/Manila' });
const base = 'http://127.0.0.1:5101/api';
const login = async (page: Page, username = 'qa-super') => {
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('QaPassword!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
};
const authHeaders = async (page: Page) => ({ Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('token'))}` });
const download = async (page: Page, button: string) => {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const file = await pending;
  return { filename: file.suggestedFilename(), text: await readFile((await file.path())!, 'utf8') };
};

test('announcement editor saves role/subject targeting and timezone schedules without public disclosure', async ({ page }) => {
  await login(page);
  await page.goto('/system-control');
  await page.getByRole('checkbox', { name: 'Publish announcement', exact: true }).check();
  await page.getByPlaceholder('e.g. Final grading reminder').fill('Phase 3 scheduled reminder');
  await page.getByPlaceholder('Write the notice instructors and panels should see.').fill('A subject-specific reminder.');
  await page.getByRole('checkbox', { name: 'Instructors', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Limit announcement to selected subjects', exact: true }).check();
  await page.getByLabel('Announcement subjects', { exact: true }).selectOption({ label: 'QA101 — Browser QA' });
  await page.getByLabel('Announcement start (optional)').fill('2099-06-15T09:00');
  await page.getByLabel('Announcement end (optional)').fill('2099-06-15T10:00');
  await page.getByRole('button', { name: 'Save Announcement', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('selected subjects');
  await page.getByRole('dialog').getByRole('button', { name: 'Publish Announcement', exact: true }).click();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  const headers = await authHeaders(page);
  try {
    const saved = await page.request.get(base + '/settings', { headers });
    const notice = (await saved.json()).announcement;
    expect(notice.roles).toEqual(['panel']);
    expect(notice.subjectIds).toHaveLength(1);
    expect(notice.startsAt).toBe('2099-06-15T01:00:00.000Z');
    expect(notice.endsAt).toBe('2099-06-15T02:00:00.000Z');
    expect((await (await page.request.get(base + '/settings/public')).json()).announcement.title).toBeUndefined();
    await expect(page.getByText('Scheduled', { exact: true })).toBeVisible();
  } finally {
    await page.request.patch(base + '/settings/system-controls', { headers, data: { announcement: { isActive: false, title: '', message: '' } } });
  }
});

test('authenticated notices render plain text for matching roles and disappear at their end time', async ({ page }) => {
  await login(page);
  const headers = await authHeaders(page);
  const response = await page.request.patch(base + '/settings/system-controls', { headers, data: { announcement: { isActive: true, title: 'Phase 3 live notice', message: '<b>Plain text only</b>', roles: ['panel'], subjectIds: [], startsAt: null, endsAt: new Date(Date.now() + 8000).toISOString() } } });
  expect(response.status()).toBe(200);
  try {
    await page.evaluate(() => localStorage.clear());
    await login(page, 'qa-panel-a');
    await expect(page.getByText('Phase 3 live notice', { exact: true })).toBeVisible();
    await expect(page.getByText('<b>Plain text only</b>', { exact: true })).toBeVisible();
    await expect(page.getByText('Phase 3 live notice', { exact: true })).toHaveCount(0, { timeout: 12000 });
  } finally {
    await page.request.patch(base + '/settings/system-controls', { headers, data: { announcement: { isActive: false, title: '', message: '' } } });
  }
});

test('maintenance presets save/load without starting downtime and retain duration at confirmation', async ({ page }) => {
  await login(page);
  const headers = await authHeaders(page);
  await page.goto('/system-control?view=maintenance');
  await page.getByLabel('Maintenance message', { exact: true }).fill('Phase 3 reusable maintenance.');
  await page.getByText('Save a reusable preset', { exact: true }).click();
  await page.getByLabel('Preset name', { exact: true }).fill('Phase 3 routine');
  await page.getByLabel('Preset start delay', { exact: true }).selectOption('5');
  await page.getByLabel('Preset duration (minutes)', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Save maintenance preset', exact: true }).click();
  await expect(page.getByText('Preset saved. Maintenance has not been changed.')).toBeVisible();
  await page.getByLabel('Saved preset', { exact: true }).selectOption({ label: 'Phase 3 routine' });
  await page.getByRole('button', { name: 'Load preset into form', exact: true }).click();
  await expect(page.getByLabel('Start delay', { exact: true })).toHaveValue('5');
  expect((await (await page.request.get(base + '/settings', { headers })).json()).isMaintenanceMode).toBe(false);
  try {
    await page.getByRole('button', { name: 'Schedule Maintenance', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('45 minutes after the actual start');
    await page.getByRole('dialog').getByRole('button', { name: 'Save Schedule', exact: true }).click();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    const saved = await (await page.request.get(base + '/settings', { headers })).json();
    expect(new Date(saved.maintenanceEndsAt).getTime() - new Date(saved.maintenanceStartsAt).getTime()).toBe(45 * 60000);
    await page.getByRole('button', { name: 'Delete preset', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete Preset', exact: true }).click();
    await expect(page.getByText('Preset deleted. Running schedules are unchanged.')).toBeVisible();
    expect((await (await page.request.get(base + '/settings', { headers })).json()).maintenanceStartsAt).toBe(saved.maintenanceStartsAt);
  } finally {
    await page.request.patch(base + '/settings/system-controls', { headers, data: { isMaintenanceMode: false } });
  }
});

test('archive search paginates retained snapshots and exports all matching pages without changing grades', async ({ page }) => {
  await login(page);
  const superHeaders = await authHeaders(page);
  const initialPassword = 'QaPhase3Archive!2026';
  const createInstructor = await page.request.post(base + '/users', { headers: superHeaders, data: { name: 'Phase3 Archive Instructor', email: 'qa-phase3-archive-instructor', password: initialPassword, role: 'admin' } });
  expect(createInstructor.status()).toBe(201);
  const instructorLogin = await page.request.post(base + '/auth/login', { data: { email: 'qa-phase3-archive-instructor', password: initialPassword } });
  const rotated = await page.request.patch(base + '/auth/change-password', { headers: { Authorization: `Bearer ${(await instructorLogin.json()).token}` }, data: { newPassword: 'QaPhase3ArchiveNew!2026' } });
  expect(rotated.status()).toBe(200);
  const instructorToken = (await rotated.json()).token;
  const instructorAuth = { Authorization: `Bearer ${instructorToken}` };
  const createdSubject = await page.request.post(base + '/subjects', { headers: instructorAuth, data: { code: 'PHASE3ONLY', title: 'Isolated archive fixtures' } });
  expect(createdSubject.status()).toBe(201);
  const subject = await createdSubject.json();
  const headers = { ...instructorAuth, 'x-subject-id': subject._id };
  const createdPanel = await page.request.post(base + '/users', { headers, data: { name: 'Phase3 Archive Panel', email: 'qa-phase3-archive-panel', password: initialPassword, role: 'panel' } });
  expect(createdPanel.status()).toBe(201);
  const panel = await createdPanel.json();
  const panelLogin = await page.request.post(base + '/auth/login', { data: { email: 'qa-phase3-archive-panel', password: initialPassword } });
  const panelRotated = await page.request.patch(base + '/auth/change-password', { headers: { Authorization: `Bearer ${(await panelLogin.json()).token}` }, data: { newPassword: 'QaPhase3PanelNew!2026' } });
  expect(panelRotated.status()).toBe(200);
  const panelAuth = { Authorization: `Bearer ${(await panelRotated.json()).token}`, 'x-subject-id': subject._id };
  const sectionResponse = await page.request.post(base + '/sections', { headers, data: { name: 'Phase3 archive', block: 'PHASE3-ARCHIVE', assignedPanels: [panel.id] } });
  expect(sectionResponse.status()).toBe(201);
  const section = await sectionResponse.json();
  const rubricResponse = await page.request.post(base + '/rubrics', { headers, data: { title: 'Phase3 archive rubric', criteria: [{ key: 'quality', label: 'Quality', maxScore: 10, levels: [{ label: 'Score', minScore: 0, maxScore: 10 }] }] } });
  expect(rubricResponse.status()).toBe(201);
  const rubric = await rubricResponse.json();
  for (let index = 0; index < 27; index++) {
    const response = await page.request.post(base + '/groups', { headers, data: { name: `Phase3 Archived ${String(index).padStart(2, '0')}`, section: section._id, members: ['Preserved student'] } });
    expect(response.status()).toBe(201);
    const group = await response.json();
    expect((await page.request.post(base + `/evaluations/group/${group._id}`, { headers: panelAuth, data: { rubricId: rubric._id, scores: { quality: 8 }, comments: ' =SUM(1,2)' } })).status()).toBe(200);
    expect((await page.request.delete(base + `/groups/${group._id}`, { headers })).status()).toBe(200);
  }
  await page.goto('/legacy-data');
  await page.getByLabel('Archive subject', { exact: true }).fill('PHASE3ONLY');
  await page.getByLabel('Archive block', { exact: true }).fill('PHASE3-ARCHIVE');
  await page.getByLabel('Archive group', { exact: true }).fill('Phase3 Archived');
  await page.getByRole('button', { name: 'Search archive', exact: true }).click();
  await expect(page.getByText('27 matching results · Page 1 of 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next archive page', exact: true }).click();
  await expect(page.getByText('27 matching results · Page 2 of 2', { exact: true })).toBeVisible();
  const csv = await download(page, 'Download Archived Results CSV');
  expect(csv.text.trim().split('\r\n')).toHaveLength(28);
  expect(csv.text).toContain("' =SUM(1,2)");
  expect(csv.text).toContain('Preserved student');
  await page.getByLabel('Archive group', { exact: true }).fill('no-such-archived-group');
  await page.getByRole('button', { name: 'Search archive', exact: true }).click();
  await expect(page.getByText('No archived results match the applied filters.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete All Archived Results', exact: true })).toBeVisible();
});

test('analytics reports download registration periods and current snapshots with export retry', async ({ page }) => {
  await login(page);
  await page.goto('/analytics');
  await page.getByLabel('Registration period', { exact: true }).selectOption('7');
  await expect(page.getByText('7 calendar days · UTC daily totals', { exact: true })).toBeVisible();
  const registrations = await download(page, 'Export registrations CSV');
  expect(registrations.filename).toMatch(/^evalsys_registrations_/);
  expect(registrations.text.trim().split('\r\n')).toHaveLength(8);
  const grading = await download(page, 'Export grading progress CSV');
  expect(grading.text).toContain('"Platform","All subjects"');
  await page.route('**/api/operations/analytics/export?*', route => route.fulfill({ status: 503, json: { message: 'QA report temporarily unavailable' } }));
  await page.getByRole('button', { name: 'Export proposal coverage CSV', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('QA report temporarily unavailable');
  await page.unroute('**/api/operations/analytics/export?*');
  const proposals = await download(page, 'Export proposal coverage CSV');
  expect(proposals.text).toContain('"Coverage (%)","Storage bytes"');
  expect(proposals.text).not.toContain('qa-instructor@evalsys.com');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('archive request errors offer retry and filters remain usable on mobile', async ({ page }) => {
  await login(page);
  let fail = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/legacy-data');
  await expect(page.getByRole('button', { name: 'Download Archived Results CSV', exact: true })).toBeEnabled();
  await page.route('**/api/legacy-data/results?*', async route => {
    if (fail) await route.fulfill({ status: 500, json: { message: 'QA archive temporarily unavailable' } });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Search archive', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('QA archive temporarily unavailable');
  fail = false;
  await page.getByRole('button', { name: 'Retry archive search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download Archived Results CSV', exact: true })).toBeEnabled();
  await page.getByLabel('Archive group', { exact: true }).fill('missing');
  await page.getByRole('button', { name: 'Search archive', exact: true }).click();
  await expect(page.getByText('No archived results match the applied filters.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

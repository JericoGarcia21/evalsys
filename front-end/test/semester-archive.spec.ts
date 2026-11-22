import { test, expect, type Page } from '@playwright/test';

async function mockArchive(page: Page) {
  const subject = { _id: 'subject-a', code: 'QA101', title: 'Semester QA', isActive: true };
  const state = { archived: false, fail: false, writes: [] as unknown[] };
  await page.addInitScript(() => {
    localStorage.setItem('token', 'semester-ui-qa');
    localStorage.setItem('evalsys_current_subject_id', 'subject-a');
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'instructor-a', name: 'Semester Instructor', role: 'admin', assignedSubjects: [subject] } });
    if (path.endsWith('/settings/public')) return route.fulfill({ json: { isMaintenanceMode: false } });
    if (path.endsWith('/settings')) return route.fulfill({ json: {} });
    if (path.endsWith('/subjects')) return route.fulfill({ json: [subject] });
    if (path.endsWith('/archive-semester')) {
      if (state.fail) return route.fulfill({ status: 503, json: { message: 'Archive unavailable. No changes were applied.' } });
      expect(route.request().headers()['x-subject-id']).toBe('subject-a');
      state.writes.push(route.request().postDataJSON());
      state.archived = true;
      return route.fulfill({ json: { message: 'Semester archived successfully.' } });
    }
    if (path.endsWith('/my-archive')) return route.fulfill({ json: {
      items: state.archived ? [{ _id: 'archive-a', semester: 'First Semester 2026', archivedAt: '2026-11-22T00:00:00Z', snapshot: {
        subject, group: { name: 'Historical Team', members: [{ firstName: 'Test', lastName: 'Student' }] }, block: 'QA-A',
        status: 'Complete', finalTotal: 0, missingPanels: [], evaluations: [{ panel: { name: 'Original Judge' }, total: 0,
          scores: { quality: 0 }, comments: 'Original feedback', isSubmitted: true,
          rubric: { title: 'Original Rubric', criteria: [{ key: 'quality', label: 'Quality', maxScore: 10 }] } }],
      } }] : [], pagination: { total: state.archived ? 1 : 0, page: 1, hasNextPage: false, hasPreviousPage: false },
    } });
    return route.fulfill({ json: [] });
  });
  return state;
}

test('instructor archives with confirmation, recovers from failure and views immutable score details', async ({ page }) => {
  const state = await mockArchive(page);
  await page.goto('/my-archive');
  await expect(page.getByText('No archived semesters yet')).toBeVisible();
  await page.getByRole('link', { name: 'Manage subjects', exact: true }).click();
  await page.getByRole('button', { name: 'Archive Semester', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Archive & Start New Semester', exact: true });
  const submit = dialog.getByRole('button', { name: 'Archive & Start New Semester', exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Semester being archived').fill('First Semester 2026');
  await dialog.getByLabel('Type QA101 to confirm').fill('QA101');
  state.fail = true;
  await submit.click();
  await expect(page.getByText('Archive unavailable. No changes were applied.')).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(dialog.getByLabel('Semester being archived')).toHaveValue('First Semester 2026');
  expect(state.writes).toEqual([]);
  state.fail = false;
  await submit.click();
  await expect(page.getByText('Semester archived successfully.')).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes).toEqual([{ confirmText: 'ARCHIVE QA101', semester: 'First Semester 2026' }]);
  await page.goto('/my-archive');
  await expect(page.getByText('Final score: 0', { exact: true })).toBeVisible();
  await page.getByText('View members and score breakdown', { exact: true }).click();
  await expect(page.getByText('Members: Test Student', { exact: true })).toBeVisible();
  await expect(page.getByText('Original Rubric', { exact: true })).toBeVisible();
  await expect(page.getByText('0 / 10', { exact: true })).toBeVisible();
  await expect(page.getByText('Feedback: Original feedback', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Delete|Clear|Edit/ })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('my-archive-mobile.png'), fullPage: true, animations: 'disabled' });
});

test('subject action controls are neutral and stay in one row on desktop', async ({ page }) => {
  await mockArchive(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/subjects');
  const buttons = page.locator('td.col-actions button');
  await expect(buttons).toHaveCount(2);
  const styles = await buttons.evaluateAll(elements => elements.map(element => ({ top: element.getBoundingClientRect().top, background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color })));
  expect(styles[0]).toEqual(styles[1]);
  await page.screenshot({ path: test.info().outputPath('subject-neutral-actions.png'), fullPage: true, animations: 'disabled' });
});

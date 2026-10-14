import { test, expect, type Page } from '@playwright/test';

async function mockAnalytics(page: Page, role = 'superadmin', initialFailure = false) {
  let fail = initialFailure;
  const requests: number[] = [];
  await page.addInitScript(() => localStorage.setItem('token', 'analytics-browser-test'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { _id: 'analytics-user', id: 'analytics-user', name: 'Analytics User', role } });
    if (url.pathname.endsWith('/settings/public')) return route.fulfill({ json: { isMaintenanceMode: false, announcement: { isActive: false } } });
    if (url.pathname.endsWith('/operations/analytics')) {
      const days = Number(url.searchParams.get('days') || 30);
      requests.push(days);
      if (fail) return route.fulfill({ status: 500, json: { message: 'Analytics temporarily unavailable' } });
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      const registrations = Array.from({ length: days }, (_, index) => {
        const date = new Date(today); date.setUTCDate(date.getUTCDate() - days + index + 1);
        return { date: date.toISOString().slice(0, 10), groups: index === days - 1 ? 3 : 0, students: index === days - 1 ? 6 : 0 };
      });
      return route.fulfill({ json: {
        scope: 'platform', generatedAt: new Date().toISOString(), days, timezone: 'UTC',
        totals: {
          students: 20, groups: 10, blocks: 3,
          instructors: { total: 2, active: 1, inactive: 1 }, panels: { total: 4, active: 4, inactive: 0 }, subjects: { total: 2, active: 2, inactive: 0 },
          proposals: { uploaded: 7, missing: 3, storageMb: 2.5 },
          grading: { complete: 4, inProgress: 2, pending: 3, unassigned: 1, submittedEvaluations: 12 },
          registrationLinks: { total: 3, open: 2 }, archivedEvaluations: 5,
        },
        period: { groups: 3, students: 6 }, registrations,
        bySubject: [{ subjectId: 'subject-test', code: 'IT101', title: 'Programming', groups: 10, students: 20, complete: 4, proposals: 7 }],
      } });
    }
    return route.fulfill({ json: [] });
  });
  return { requests, recover: () => { fail = false; } };
}

test('analytics lives in its own tab and does not add metrics to the dashboard', async ({ page }) => {
  await mockAnalytics(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Welcome back, Analytics User' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Platform analytics' })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Registered students', exact: true })).toHaveCount(0);
  await page.locator('aside').getByRole('link', { name: 'Analytics', exact: true }).click();
  await expect(page).toHaveURL(/analytics$/);
  const analytics = page.getByRole('region', { name: 'Platform analytics' });
  await expect(analytics.getByRole('article', { name: 'Registered students', exact: true })).toContainText('20');
  await expect(analytics.getByRole('article', { name: 'Instructors', exact: true })).toContainText('2');
  await expect(page.getByRole('region', { name: 'Subject breakdown' })).toContainText('IT101');
});

test('analytics period filters, chart metric and refresh work on desktop and mobile', async ({ page }) => {
  const state = await mockAnalytics(page);
  await page.goto('/analytics');
  await expect(page.getByRole('region', { name: 'Registration trends' })).toBeVisible();
  await page.getByLabel('Registration period').selectOption('7');
  await expect(page.getByText('7 calendar days · UTC daily totals', { exact: true })).toBeVisible();
  expect(state.requests).toContain(7);
  await expect(page.getByRole('region', { name: 'Platform analytics' }).locator('.evl-card')).toHaveCount(0);
  await page.getByRole('slider', { name: 'Inspect registration day' }).focus();
  await page.getByRole('slider', { name: 'Inspect registration day' }).press('Home');
  await expect(page.getByRole('slider', { name: 'Inspect registration day' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Student entries', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Daily student entries in newly registered groups over the last 7 days' })).toBeVisible();
  const before = state.requests.length;
  await page.getByRole('button', { name: 'Refresh analytics', exact: true }).click();
  await expect.poll(() => state.requests.length).toBeGreaterThan(before);
  await expect(page.getByRole('article', { name: 'Registered students', exact: true })).toContainText('20');
  await page.screenshot({ path: test.info().outputPath('analytics-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('analytics-mobile.png'), fullPage: true, animations: 'disabled' });
});

test('analytics failures show retry instead of misleading zero totals', async ({ page }) => {
  const state = await mockAnalytics(page, 'superadmin', true);
  await page.goto('/analytics');
  await expect(page.getByRole('alert')).toContainText('Analytics temporarily unavailable');
  await expect(page.getByRole('article', { name: 'Registered students', exact: true })).toHaveCount(0);
  state.recover();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Registered students', exact: true })).toContainText('20');
});

test('instructors cannot open the platform analytics page or see its sidebar link', async ({ page }) => {
  await mockAnalytics(page, 'admin');
  await page.goto('/analytics');
  await expect(page).toHaveURL(/dashboard$/);
  await expect(page.locator('aside').getByRole('link', { name: 'Analytics', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Platform analytics' })).toHaveCount(0);
});

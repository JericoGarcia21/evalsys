import { test, expect, type Page } from '@playwright/test';

const subjectA = { _id: 'subject-a', code: 'IT101', title: 'Object Oriented Programming' };
const subjectB = { _id: 'subject-b', code: 'IT202', title: 'Database Systems' };
const sectionA = { _id: 'block-a', name: 'A', block: 'Block 1', subject: subjectA };
const sectionB = { _id: 'block-b', name: 'B', block: 'Block 1', subject: subjectB };
const groups = [
  { _id: 'group-a', name: 'Programming Team', section: sectionA, members: [{ firstName: 'Test', lastName: 'Student' }], isGraded: false },
  { _id: 'group-b', name: 'Database Team', section: sectionB, members: [], isGraded: true },
];

async function mockPanel(page: Page, fail = false) {
  await page.addInitScript(() => localStorage.setItem('token', 'panel-browser-test'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: {
      _id: 'panel-test', id: 'panel-test', name: 'Panel Tester', role: 'panel',
      gradingLockedSubjects: ['subject-b'],
    } });
    if (url.pathname.endsWith('/sections')) {
      return fail ? route.fulfill({ status: 500, json: { message: 'Assignments temporarily unavailable' } })
        : route.fulfill({ json: [sectionA, sectionB] });
    }
    if (url.pathname.endsWith('/groups')) return route.fulfill({ json: groups });
    if (url.pathname.endsWith('/rubrics/active')) return route.fulfill({ json: null });
    if (url.pathname.includes('/evaluations/')) return route.fulfill({ json: null });
    if (url.pathname.endsWith('/proposal-url')) {
      if (url.searchParams.get('format') === 'content') return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4 preview test' });
      return route.fulfill({ json: { originalName: 'proposal.pdf', groupName: 'Programming Team', block: 'Block 1', subject: subjectA } });
    }
    return route.fulfill({ json: {} });
  });
}

test('panel dashboard separates subjects with identical blocks and filters progress', async ({ page }) => {
  await mockPanel(page);
  await page.goto('/dashboard');
  const subjects = page.getByRole('region', { name: 'Assigned subjects' });
  await expect(subjects.getByRole('button', { name: /IT101/ })).toBeVisible();
  await expect(subjects.getByRole('button', { name: /IT202/ })).toContainText('Grading locked');
  await expect(page.getByRole('link', { name: /Programming Team/ })).toContainText('Object Oriented Programming');
  await expect(page.getByRole('link', { name: /Database Team/ })).toContainText('Database Systems');
  await subjects.getByRole('button', { name: /IT202/ }).click();
  await expect(page.getByRole('link', { name: /Programming Team/ })).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByRole('link', { name: /Database Team/ })).toContainText('Review group');
  await page.getByLabel('Search groups or students').fill('missing student');
  await expect(page.getByText('No groups or students match your search.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('link', { name: /Database Team/ })).toBeVisible();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator('main').first().evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
});

test('panel load failures are shown as errors rather than missing assignments', async ({ page }) => {
  await mockPanel(page, true);
  await page.goto('/dashboard');
  await expect(page.getByRole('alert')).toContainText('Assignments temporarily unavailable');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByText('No assignments yet', { exact: true })).toHaveCount(0);
});

test('proposal viewer identifies the group and returns to its grading page', async ({ page }) => {
  await mockPanel(page);
  await page.goto('/proposal/group-a');
  await expect(page.getByText('Programming Team · IT101 - Object Oriented Programming · Block: Block 1')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to grading' })).toHaveAttribute('href', '/grade?groupId=group-a');
  await expect(page.locator('iframe[title="Proposal PDF preview"]')).toBeVisible();
  const bounds = await page.locator('iframe[title="Proposal PDF preview"]').boundingBox();
  expect(bounds!.height).toBeGreaterThan(250);
});


test('dashboard group opens the matching subject in the grading workspace', async ({ page }) => {
  await mockPanel(page);
  await page.goto('/dashboard');
  await page.getByRole('link', { name: /Database Team/ }).click();
  await expect(page).toHaveURL(/grade\?groupId=group-b/);
  await expect(page.locator('[data-tutorial="panel-workspace"]')).toHaveAttribute('data-selected-group', 'group-b');
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('subject-b');
});


test('dashboard member names are hidden until Show members and can be collapsed', async ({ page }) => {
  await mockPanel(page);
  await page.goto('/dashboard');
  await expect(page.getByText('Test Student', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show members for Programming Team', exact: true }).click();
  await expect(page.getByText('Test Student', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide members for Programming Team', exact: true }).click();
  await expect(page.getByText('Test Student', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/dashboard$/);
});

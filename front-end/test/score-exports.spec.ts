import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import databaseRubric from '../src/data/databaseRubric.json' with { type: 'json' };

const login = async (page: Page, username: string) => {
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('QaPassword!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const offer = page.getByRole('region', { name: 'Tutorial invitation' });
  if (await offer.isVisible()) await offer.getByRole('button', { name: 'Maybe later', exact: true }).click();
};
const downloadedRows = async (page: Page, label: string) => {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const download = await waiting;
  const file = await download.path();
  const csv = await readFile(file!, 'utf8');
  return csv.trim().split(/\r?\n/).map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match => match[1].replaceAll('""', '"')));
};

test('results overview fits sixteen criteria behind accessible group breakdowns', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const members = [
    { firstName: 'Juan Ricardo', lastName: 'Sicat Garcia' },
    { firstName: 'Francis Thomas', lastName: 'Cruz Solis' },
    { firstName: 'JanRave', lastName: 'Amores Permison' },
    { firstName: 'Johnley', lastName: 'Torio Jugo' },
    { firstName: 'Christian Dabin', lastName: 'Valdez' },
  ];
  await page.route('**/api/evaluations/section/*/results', route => route.fulfill({ status: 200, json: [
    { group: { _id: 'wide-rubric', name: 'Copy Paste Ninjas', members }, rubricCriteria: databaseRubric.criteria,
      finalTotal: null, averaged: null, isIncomplete: true, evaluatedBy: [], missingPanels: ['Panel A', 'Panel B', 'Panel C'] },
    { group: { _id: 'completed', name: 'Nonchalants', members: [] }, rubricCriteria: databaseRubric.criteria,
      finalTotal: 90, averaged: Object.fromEntries(databaseRubric.criteria.map(c => [c.key, c.maxScore * 0.9])), isIncomplete: false,
      evaluatedBy: ['Panel A', 'Panel B', 'Panel C'], missingPanels: [], comments: [{ panel: 'Panel A', text: 'Clear demonstration.' }],
      evaluationRecords: [{ _id: 'evaluation-1', panelId: 'panel-1', panelName: 'Panel A' }] },
    { group: { _id: 'partial', name: 'The New Avengers', members: [] }, rubricCriteria: databaseRubric.criteria,
      finalTotal: 30, averaged: {}, isIncomplete: true, evaluatedBy: ['Panel A'], missingPanels: ['Panel B', 'Panel C'] },
  ] }));
  await login(page, 'qa-instructor');
  const subjectMenu = page.locator('aside nav').getByRole('button').first();
  if (!(await subjectMenu.innerText()).startsWith('QA101')) {
    await subjectMenu.click();
    await page.getByRole('button', { name: 'QA101 - Browser QA', exact: true }).click();
  }
  await page.goto('/results');
  await page.getByRole('button', { name: /QA-A/ }).click();
  const table = page.getByRole('table', { name: 'Group results overview' });
  const row = table.getByRole('row').filter({ hasText: 'Copy Paste Ninjas' });
  await expect(row).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveCount(4);
  await expect(row.getByText('Pending', { exact: true })).toBeInViewport();
  await expect(row.getByText('Not evaluated yet: Panel A, Panel B, Panel C', { exact: true })).toBeVisible();
  await expect(table.getByRole('row').filter({ hasText: 'Nonchalants' })).toContainText('90');
  await expect(page.getByText('3 groups / 1 complete / 2 awaiting scores')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Score breakdown for Copy Paste Ninjas' })).toHaveCount(0);
  expect((await row.boundingBox())!.height).toBeLessThan(160);
  expect(await table.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('results-overview-desktop.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'View breakdown for Copy Paste Ninjas', exact: true }).focus();
  await page.keyboard.press('Enter');
  const breakdown = page.getByRole('region', { name: 'Score breakdown for Copy Paste Ninjas', exact: true });
  await expect(breakdown.getByRole('region', { name: 'Project Requirements', exact: true })).toBeVisible();
  await expect(breakdown.locator('dt')).toHaveCount(16);
  const memberNames = breakdown.getByText('Juan Ricardo Sicat Garcia', { exact: false });
  await expect(memberNames).not.toBeVisible();
  await breakdown.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(memberNames).toBeVisible();
  await page.getByRole('button', { name: 'Hide breakdown for Copy Paste Ninjas', exact: true }).click();
  await expect(breakdown).toHaveCount(0);
  await page.getByRole('button', { name: 'View breakdown for Nonchalants', exact: true }).click();
  const complete = page.getByRole('region', { name: 'Score breakdown for Nonchalants', exact: true });
  await expect(complete.getByRole('region', { name: 'Project Documentation', exact: true })).toBeVisible();
  await expect(complete.getByText('10.8', { exact: false }).first()).toBeVisible();
  await complete.getByRole('button', { name: 'View 1 Comments', exact: true }).click();
  await expect(page.getByText('Clear demonstration.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await complete.getByRole('button', { name: 'Clear Score', exact: true }).click();
  await expect(page.getByText('Clear Panel Score', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('results-breakdown-desktop.png'), animations: 'disabled' });
  const csv = await downloadedRows(page, 'Download Member Grades CSV');
  expect(csv).toHaveLength(6);
  expect(csv.flat().join(' ')).toContain('Sicat Garcia');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Hide breakdown for Nonchalants', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Hide breakdown for Nonchalants', exact: true }).click();
  await page.getByRole('heading', { name: 'Results', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('results-overview-mobile.png'), animations: 'disabled' });
  await page.route('**/api/auth/me', async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), csvExportLocked: true } });
  });
  await page.reload();
  await page.getByRole('button', { name: /QA-A/ }).click();
  await expect(page.getByText('Export locked', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Download Group Summary CSV', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download Member Grades CSV', exact: true })).toBeDisabled();
});

test('downloaded group summaries and member scores are alphabetized without altering scores', async ({ page }) => {
  await page.route('**/api/evaluations/section/*/results', route => route.fulfill({ status: 200, json: [
    { group: { _id: 'zeta', name: 'Zeta', members: [{ lastName: 'Zulu', firstName: 'Ana' }, { lastName: 'garcia', firstName: 'Zara' }] }, finalTotal: 9, averaged: { quality: 9 }, isIncomplete: false },
    { group: { _id: 'beta', name: 'beta', members: [{ lastName: 'Garcia', firstName: 'Ada', middleName: 'Zoe' }, { lastName: 'Garcia', firstName: 'Ada', middleName: 'Ana' }] }, finalTotal: null, averaged: null, isIncomplete: true },
    { group: { _id: 'alpha', name: 'Álpha', members: [{ lastName: 'Ábel', firstName: 'Zed' }, 'Old Name'] }, finalTotal: 7, averaged: { quality: 7 }, isIncomplete: false },
  ] }));
  await login(page, 'qa-instructor');
  const subjectMenu = page.locator('aside nav').getByRole('button').first();
  if (!(await subjectMenu.innerText()).startsWith('QA101')) {
    await subjectMenu.click();
    await page.getByRole('button', { name: 'QA101 - Browser QA', exact: true }).click();
  }
  await expect(subjectMenu).toContainText('QA101');
  await page.goto('/results');
  await page.getByRole('button', { name: /QA-A/ }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Zeta' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Zeta' })).not.toContainText('/ 0');
  const summary = await downloadedRows(page, 'Download Group Summary CSV');
  expect(summary.slice(1).map(row => row[1])).toEqual(['Álpha', 'beta', 'Zeta']);
  expect(summary.slice(1).map(row => row[3])).toEqual(['7.00', 'Pending Complete Evaluation', '9.00']);
  expect(summary[3][2]).toEqual('Zara garcia; Ana Zulu');
  const members = await downloadedRows(page, 'Download Member Grades CSV');
  expect(members.slice(1).map(row => row.slice(2, 5))).toEqual([
    ['Ábel', 'Zed', ''], ['Garcia', 'Ada', 'Ana'], ['Garcia', 'Ada', 'Zoe'], ['garcia', 'Zara', ''], ['Old Name', '', ''], ['Zulu', 'Ana', ''],
  ]);
  expect(members.slice(1).map(row => row[5])).toEqual(['7.00', 'Pending Complete Evaluation', 'Pending Complete Evaluation', '9.00', '7.00', '9.00']);
  // Export sorting must not mutate the visible result list or saved member arrays.
  const rows = page.getByRole('row').filter({ hasText: /Zeta|beta|Álpha/ });
  expect((await rows.allTextContents())[0]).toContain('Zeta');
});

test('downloaded archived results are ordered by group A-Z with scores preserved', async ({ page }) => {
  await page.route('**/api/legacy-data', route => route.fulfill({ status: 200, json: { sections: [], groups: [], panels: [], results: [
    { _id: 'z', total: 9, scores: { quality: 9 }, updatedAt: '2026-01-01', legacySnapshot: { groupName: 'Zulu', panelName: 'Panel A' } },
    { _id: 'b', total: 8, scores: { quality: 8 }, updatedAt: '2026-01-01', legacySnapshot: { groupName: 'beta', panelName: 'Panel A' } },
    { _id: 'a2', total: 6, scores: { quality: 6 }, updatedAt: '2026-01-01', legacySnapshot: { groupName: 'Alpha', panelName: 'Panel Z' } },
    { _id: 'a1', total: 7, scores: { quality: 7 }, updatedAt: '2026-01-01', legacySnapshot: { groupName: 'Alpha', panelName: 'Panel A' } },
  ] } }));
  await login(page, 'qa-super');
  await page.goto('/legacy-data');
  await expect(page.getByText('Zulu', { exact: true })).toBeVisible();
  const rows = await downloadedRows(page, 'Download Archived Results CSV');
  expect(rows.slice(1).map(row => row[3])).toEqual(['Alpha', 'Alpha', 'beta', 'Zulu']);
  expect(rows.slice(1).map(row => row[8])).toEqual(['7', '6', '8', '9']);
});

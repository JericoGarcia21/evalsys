import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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

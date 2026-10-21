import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';

const subjectA = { _id: 'subject-a', code: 'IT101', title: 'Object Oriented Programming' };
const subjectB = { _id: 'subject-b', code: 'IT202', title: 'Database Systems' };
const sectionA = { _id: 'block-a', name: 'A', block: 'Block 1', subject: subjectA };
const sectionB = { _id: 'block-b', name: 'B', block: 'Block 1', subject: subjectB };
const groups = [
  { _id: 'group-a', name: 'Programming Team', section: sectionA, members: [{ firstName: 'Test', lastName: 'Student' }], isGraded: false },
  { _id: 'group-b', name: 'Database Team', section: sectionB, members: [], isGraded: true },
];

async function mockPanel(page: Page, fail = false, proposal?: { name: string; body: Buffer; contentType: string }) {
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
      if (url.searchParams.get('format') === 'content') return route.fulfill({ contentType: proposal?.contentType || 'application/pdf', body: proposal?.body || '%PDF-1.4 preview test' });
      return route.fulfill({ json: { originalName: proposal?.name || 'proposal.pdf', groupName: 'Programming Team', block: 'Block 1', subject: subjectA } });
    }
    return route.fulfill({ json: {} });
  });
}

async function wordProposal() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>Project proposal first page</w:t></w:r></w:p><w:p><w:hyperlink r:id="rId1"><w:r><w:t>Reference link</w:t></w:r></w:hyperlink></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Project proposal second page</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/></Relationships>');
  return { name: 'project-proposal.docx', body: await zip.generateAsync({ type: 'nodebuffer' }), contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
}

test('Word viewer fits mobile pages, zooms, expands, and preserves its sandbox', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockPanel(page, false, await wordProposal());
  await page.goto('/proposal/group-a');
  const iframe = page.locator('iframe[title="Proposal Word preview"]');
  const frame = page.frameLocator('iframe[title="Proposal Word preview"]');
  await expect(iframe).toBeVisible();
  await expect(page.getByText('2 pages', { exact: true })).toBeVisible();
  await expect(iframe).toHaveAttribute('sandbox', '');
  await expect(frame.locator('a')).not.toHaveAttribute('href');
  await expect(page.getByRole('button', { name: 'Fit width', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await expect(page.getByLabel('Document zoom')).toHaveText('100%');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByLabel('Document zoom')).toHaveText('110%');
  await page.getByRole('button', { name: 'Zoom out', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Document zoom')).toHaveText('100%');
  await page.getByRole('button', { name: 'Expand view', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exit expanded view', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: 'Exit expanded view', exact: true }).click();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  await page.getByRole('button', { name: 'Fit width', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => Number((await page.getByLabel('Document zoom').innerText()).replace('%', ''))).toBeLessThan(50);
  const paper = frame.locator('section.docx').first();
  await expect(paper).toBeVisible();
  expect((await paper.boundingBox())!.width).toBeLessThanOrEqual((await iframe.boundingBox())!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('proposal-mobile.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(async () => Number((await page.getByLabel('Document zoom').innerText()).replace('%', ''))).toBeGreaterThan(100);
  await page.screenshot({ path: test.info().outputPath('proposal-desktop.png'), animations: 'disabled' });
});

test('Word viewer handles unavailable full screen and damaged documents', async ({ page }) => {
  await mockPanel(page, false, await wordProposal());
  await page.goto('/proposal/group-a');
  await expect(page.locator('iframe[title="Proposal Word preview"]')).toBeVisible();
  await page.evaluate(() => { HTMLElement.prototype.requestFullscreen = () => Promise.reject(new Error('QA unavailable')); });
  await page.getByRole('button', { name: 'Expand view', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your browser could not expand the viewer' })).toBeVisible();
  await page.route('**/proposal-url?format=content', route => route.fulfill({ body: 'not a DOCX file' }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Proposal Unavailable', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to grading' })).toHaveAttribute('href', '/grade?groupId=group-a');
});

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

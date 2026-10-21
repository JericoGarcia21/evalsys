import { test, expect, type Page } from '@playwright/test';
import databaseRubric from '../src/data/databaseRubric.json' with { type: 'json' };

const login = async (page: Page, username = 'qa-instructor') => {
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('QaPassword!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const offer = page.getByRole('region', { name: 'Tutorial invitation' });
  if (await offer.isVisible()) await offer.getByRole('button', { name: 'Maybe later', exact: true }).click();
};

const startTemplate = async (page: Page) => {
  await login(page);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const subjects = await (await page.request.get('http://127.0.0.1:5101/api/subjects', { headers: { Authorization: `Bearer ${token}` } })).json();
  const subject = subjects.find((item: { code: string }) => item.code === 'QA101');
  await page.evaluate(id => localStorage.setItem('evalsys_current_subject_id', id), subject._id);
  await page.goto('/rubrics');
  await page.getByRole('button', { name: '+ New Rubric', exact: true }).click();
  await page.getByRole('button', { name: 'Use Database Final Project Template', exact: true }).click();
};

test('template handles failed save, persists sections, and preserves criterion keys when renamed', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await startTemplate(page);
  await expect(page.getByPlaceholder('e.g. Project Defense Rubric')).toHaveValue('Database Final Project');
  await expect(page.getByLabel(/^Scoring/)).toHaveCount(16);
  await expect(page.getByLabel('Section', { exact: true }).first()).toHaveValue('Project Requirements');
  await expect(page.getByText('Project Requirements: 40 pts', { exact: true })).toBeVisible();
  await expect(page.getByText('Project Documentation: 30 pts', { exact: true })).toBeVisible();
  await expect(page.getByText('Project Presentation: 30 pts', { exact: true })).toBeVisible();
  await page.route('**/api/rubrics', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 503, json: { message: 'QA temporary save failure' } });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Create and Save Rubric', exact: true }).click();
  await expect(page.getByText('QA temporary save failure', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('e.g. Project Defense Rubric')).toHaveValue('Database Final Project');
  await page.unroute('**/api/rubrics');
  const creating = page.waitForResponse(response => response.url().endsWith('/api/rubrics') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create and Save Rubric', exact: true }).click();
  const created = await (await creating).json();
  expect(created.criteria).toHaveLength(16);
  expect(created.criteria).toMatchObject(databaseRubric.criteria);
  expect(created.instructions).toBe(databaseRubric.instructions);
  const documentRatings = [
    { label: 'Excellent', percentage: 100, description: 'Complete, accurate, well-executed, and meets all requirements.' },
    { label: 'Very Good', percentage: 90, description: 'Meets requirements with only minor errors or omissions.' },
    { label: 'Good', percentage: 80, description: 'Meets most basic requirements but has some errors or omissions.' },
    { label: 'Needs Improvement', percentage: 70, description: 'Partially complete or contains significant errors.' },
    { label: 'Not Submitted / Not Demonstrated', percentage: 0, description: 'Required output is missing or cannot be evaluated.' },
  ];
  for (const criterion of created.criteria) {
    expect(criterion.levels).toEqual(documentRatings.map(rating => ({ ...rating,
      minScore: Math.round(criterion.maxScore * rating.percentage) / 100,
      maxScore: Math.round(criterion.maxScore * rating.percentage) / 100,
    })));
  }
  await page.reload();
  const card = page.locator('.evl-card').filter({ has: page.getByText('Database Final Project', { exact: true }) });
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  const name = page.getByPlaceholder('e.g. System Functionality').first();
  await expect(name).toHaveValue('Conceptual Design');
  await name.fill('Revised Conceptual Design');
  const updating = page.waitForRequest(request => request.method() === 'PUT' && request.url().includes('/api/rubrics/'));
  await page.getByRole('button', { name: 'Update and Save Rubric', exact: true }).click();
  const payload = (await updating).postDataJSON();
  expect(payload.criteria[0].key).toEqual(created.criteria[0].key);
  expect(payload.criteria[0].description).toContain('entities');
  expect(errors).toEqual([]);
});

test('mobile template supports keyboard rating edits, recalculates points, and avoids overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startTemplate(page);
  const rating = page.getByRole('spinbutton', { name: 'Logical Design Very Good percentage', exact: true });
  await rating.fill('85');
  await rating.press('Tab');
  await expect(rating).not.toBeFocused();
  await expect(page.getByText('10.2 pts', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('rubrics-mobile.png'), animations: 'disabled' });
});

test('manual percentage criteria remain unique after removal and reject duplicate names within a section', async ({ page }) => {
  await startTemplate(page);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: '+ New Rubric', exact: true }).click();
  await page.getByPlaceholder('e.g. Project Defense Rubric').fill('QA Manual Percentage Rubric');
  const fillCriterion = async (index: number, section: string, weight: string) => {
    await page.getByPlaceholder('e.g. System Functionality').nth(index).fill('Design');
    await page.getByLabel('Section', { exact: true }).nth(index).fill(section);
    await page.getByLabel(/^Scoring/).nth(index).selectOption('percentage');
    await page.locator('form .rounded-2xl.overflow-hidden').nth(index).locator('input[type=number]').first().fill(weight);
  };
  await fillCriterion(0, 'Requirements', '12');
  await page.getByRole('button', { name: '+ Add New Evaluation Criteria', exact: true }).click();
  await fillCriterion(1, 'Requirements', '8');
  await page.getByRole('button', { name: 'Create and Save Rubric', exact: true }).click();
  await expect(page.getByText('Design: criteria name is duplicated.', { exact: true })).toBeVisible();
  await page.getByLabel('Section', { exact: true }).nth(1).fill('Documentation');
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click();
  await page.getByRole('button', { name: '+ Add New Evaluation Criteria', exact: true }).click();
  await fillCriterion(1, 'Presentation', '6');
  const creating = page.waitForResponse(response => response.url().endsWith('/api/rubrics') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create and Save Rubric', exact: true }).click();
  const response = await creating;
  expect(response.status()).toBe(201);
  const rubric = await response.json();
  expect(new Set(rubric.criteria.map((criterion: { key: string }) => criterion.key)).size).toBe(2);
  expect(rubric.criteria[0].levels[1].minScore).toBe(7.2);
  expect(rubric.criteria[1].levels[1].minScore).toBe(5.4);
});

test('percentage rating buttons preserve decimal scores and drafts through submission and reload', async ({ page }) => {
  await startTemplate(page);
  const creating = page.waitForResponse(response => response.url().endsWith('/api/rubrics') && response.request().method() === 'POST');
  await page.getByPlaceholder('e.g. Project Defense Rubric').fill('QA Percentage Grading');
  await page.getByRole('button', { name: 'Create and Save Rubric', exact: true }).click();
  const created = await (await creating).json();
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const subject = created.subject;
  const headers = { Authorization: `Bearer ${token}`, 'x-subject-id': subject };
  const sections = await (await page.request.get('http://127.0.0.1:5101/api/sections', { headers })).json();
  const section = sections.find((item: { block: string }) => item.block === 'QA-A');
  const groupResponse = await page.request.post('http://127.0.0.1:5101/api/groups', { headers, data: {
    name: 'QA Percentage Group', section: section._id, members: [{ firstName: 'Rubric', lastName: 'Regression' }],
  } });
  expect(groupResponse.status()).toBe(201);
  const group = await groupResponse.json();
  expect((await page.request.patch(`http://127.0.0.1:5101/api/rubrics/${created._id}/activate`, { headers })).status()).toBe(200);
  try {
    await page.evaluate(() => localStorage.clear());
    await login(page, 'qa-panel-a');
    await page.goto('/grade');
    await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'QA101 - Browser QA' });
    await page.getByRole('button', { name: /QA-A/ }).click();
    await page.getByRole('button', { name: /QA Percentage Group/ }).click();
    await expect(page.getByRole('spinbutton')).toHaveCount(16);
    await expect(page.getByRole('region', { name: 'Project Requirements grading criteria', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Project Documentation grading criteria', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Project Presentation grading criteria', exact: true })).toBeVisible();
    const descriptionText = 'Includes entity and attribute lists, relationships, cardinalities, and a clearly labeled conceptual ERD.';
    const description = page.locator('[data-tutorial="panel-scores"]').getByText(descriptionText, { exact: true });
    await expect(description).toBeVisible();
    const typography = await description.evaluate(element => {
      const style = getComputedStyle(element);
      const foreground = style.color.match(/[\d.]+/g)!.map(Number);
      const background = getComputedStyle(element.closest('.evl-card')!).backgroundColor.match(/[\d.]+/g)!.map(Number);
      const alpha = foreground[3] ?? 1;
      const composed = foreground.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
      const luminance = (channels: number[]) => channels.slice(0, 3).reduce((sum, channel, index) => {
        const value = channel / 255;
        return sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
      }, 0);
      const first = luminance(composed), second = luminance(background);
      return { fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), overflow: element.scrollWidth > element.clientWidth,
        color: style.color, background: background.slice(0, 3), contrast: (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05) };
    });
    expect(typography.fontSize).toBeGreaterThanOrEqual(16);
    expect(typography.lineHeight).toBeGreaterThanOrEqual(24);
    expect(typography.overflow).toBe(false);
    expect(typography.contrast).toBeGreaterThanOrEqual(4.5);
    await test.info().attach('criterion-readability', { body: JSON.stringify(typography), contentType: 'application/json' });
    const criterion = page.locator('.evl-card').filter({ has: page.getByRole('heading', { name: 'Conceptual Design Documentation', exact: true }) });
    await expect(criterion.getByRole('group')).toHaveAccessibleDescription(descriptionText);
    await description.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('criterion-description-desktop.png'), animations: 'disabled' });
    const logical = page.locator('.evl-card').filter({ has: page.getByText('Logical Design', { exact: true }) });
    await logical.getByRole('button', { name: 'Very Good', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(logical.getByRole('spinbutton')).toHaveValue('10.8');
    await expect(logical.getByRole('button', { name: 'Very Good', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(logical.getByRole('button', { name: 'Excellent', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(logical.getByRole('spinbutton')).toHaveAttribute('readonly', '');
    await page.reload();
    await expect(logical.getByRole('spinbutton')).toHaveValue('10.8');
    for (const button of await page.getByRole('button', { name: 'Very Good', exact: true }).all()) await button.click();
    await expect(page.getByLabel('Current grading total', { exact: true })).toContainText('90');
    await expect(page.getByText('16 of 16 criteria rated', { exact: true })).toBeVisible();
    await logical.scrollIntoViewIfNeeded();
    await expect(page.getByLabel('Current grading total', { exact: true })).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath('grading-desktop.png'), animations: 'disabled' });
    const submission = page.waitForResponse(response => response.url().includes('/api/evaluations/group/') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Submit Scores & Feedback', exact: true }).click();
    await page.getByRole('button', { name: 'Submit Scores', exact: true }).click();
    const saved = await (await submission).json();
    expect(saved.scores.section0criterion2).toBe(10.8);
    expect(saved.total).toBe(90);
    await expect(page.getByText('Scores and feedback submitted successfully.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(logical.getByRole('spinbutton')).toHaveValue('10.8');
    await page.setViewportSize({ width: 390, height: 844 });
    await description.scrollIntoViewIfNeeded();
    await expect(description).toBeVisible();
    expect(await description.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('criterion-description-mobile.png'), animations: 'disabled' });
    await logical.scrollIntoViewIfNeeded();
    await expect(page.getByLabel('Current grading total', { exact: true })).toBeInViewport();
    await expect(logical.getByRole('button', { name: 'Very Good', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: test.info().outputPath('grading-mobile.png'), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await page.request.delete(`http://127.0.0.1:5101/api/groups/${group._id}`, { headers });
    await page.request.delete(`http://127.0.0.1:5101/api/rubrics/${created._id}`, { headers });
    const rubrics = await (await page.request.get('http://127.0.0.1:5101/api/rubrics', { headers })).json();
    const original = rubrics.find((rubric: { title: string }) => rubric.title === 'QA Rubric');
    await page.request.patch(`http://127.0.0.1:5101/api/rubrics/${original._id}/activate`, { headers });
  }
});

import { test, expect } from '@playwright/test';

test('focus grading hides navigation while keeping scoring guidance, proposal, chat and drafts', async ({ page }) => {
  const user = { id: 'focus-panel', _id: 'focus-panel', name: 'Focus Panel', role: 'panel', mustChangePassword: false };
  const subject = { _id: 'focus-subject', code: 'DEMO', title: 'Focus Subject' };
  const section = { _id: 'focus-section', name: 'Focus Block', block: 'DEMO-A', subject };
  const group = { _id: 'focus-group', name: 'Focus Project', section, members: [{ firstName: 'Demo', lastName: 'Student' }], proposalFile: { path: 'synthetic-proposal.pdf' } };
  const guidance = 'Check the completeness and correctness of the project against these criteria.';
  const rubric = { _id: 'focus-rubric', title: 'Focus Rubric', isActive: true, subject: subject._id, criteria: [{ key: 'quality', label: 'Quality', description: guidance, maxScore: 10, levels: [{ label: 'Score', minScore: 0, maxScore: 10, description: 'Consider both completeness and correctness.' }] }] };
  await page.addInitScript(() => localStorage.setItem('token', 'synthetic-focus-session'));
  const writes: string[] = [];
  await page.route('**/api/**', route => {
    const request = route.request();
    if (request.method() !== 'GET') writes.push(request.url());
    const path = new URL(request.url()).pathname;
    const json = path.endsWith('/auth/me') ? user : path.endsWith('/settings/public') ? { isMaintenanceMode: false }
      : path.endsWith('/sections') ? [section] : path.endsWith('/groups') ? [group]
      : path.endsWith('/rubrics/active') ? rubric : path.endsWith('/mine') ? null
      : path.endsWith('/chat/rooms') ? { rooms: [] } : [];
    return route.fulfill({ json });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/grade');
  await expect(page.getByRole('button', { name: 'Focus grading', exact: true })).toBeDisabled();
  const groupButton = page.locator('[data-tutorial="panel-groups"]').getByRole('button', { name: /Focus Project/ });
  await expect(groupButton.getByText('Demo Student')).toBeHidden();
  await page.getByRole('button', { name: 'Show list details', exact: true }).click();
  await expect(groupButton.getByText('Demo Student')).toBeVisible();
  await page.getByRole('button', { name: 'Hide list details', exact: true }).click();
  await groupButton.click();
  const score = page.getByRole('spinbutton', { name: 'Quality score', exact: true });
  await score.fill('7');
  await page.locator('#grading-feedback textarea').fill('Keep this feedback when changing the view.');
  await page.getByRole('button', { name: 'Focus grading', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Workspace sidebar' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Assigned Groups', exact: true })).toBeHidden();
  await expect(page.getByText(guidance, { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Performance rating for Quality', exact: true })).toHaveAccessibleDescription(guidance);
  await expect(page.getByText('Score. Consider both completeness and correctness.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View Proposal', exact: true })).toBeVisible();
  await expect(score).toHaveValue('7');
  await expect(page.locator('#grading-feedback textarea')).toHaveValue('Keep this feedback when changing the view.');
  await page.screenshot({ path: test.info().outputPath('focus-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Open panel chat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Minimize panel chat', exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Minimize panel chat', exact: true }).last().click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByText(guidance, { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`focus-mobile-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Exit focus view', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Assigned Groups', exact: true })).toBeVisible();
  await expect(score).toHaveValue('7');
  await page.reload();
  await expect(score).toHaveValue('7');
  await expect(page.locator('#grading-feedback textarea')).toHaveValue('Keep this feedback when changing the view.');
  expect(writes).toEqual([]);
});

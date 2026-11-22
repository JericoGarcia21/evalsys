import { test, expect, type Page } from '@playwright/test';

const mockAssignments = async (page: Page, shared = true) => {
  const subject = { _id: 'subject-a', code: 'ITEPC03', title: 'Object-oriented programming' };
  const panels = [
    { _id: 'panel-a', name: 'Maria Santos', email: 'maria.santos@example.com', role: 'panel', isActive: true, createdBy: { _id: 'instructor-a', name: 'Jerico Reyes' } },
    { _id: 'panel-b', name: 'Alexandra Victoria Dela Cruz', email: 'alexandra.victoria.delacruz@example.com', role: 'panel', isActive: true, createdBy: { _id: 'instructor-b', name: 'Professor Emmanuel Bautista' } },
  ];
  const state = { failSave: false, failLoad: false, writes: [] as Record<string, unknown>[] };
  const sections = [
    { _id: 'block-a', name: 'BSIT 3-A', block: 'BSIT 3-A', subject, assignedPanels: [panels[0]] },
    { _id: 'block-b', name: 'BSIT 3-B — afternoon presentation', block: 'BSIT 3-B — afternoon presentation', subject, assignedPanels: [] as typeof panels },
  ];
  await page.addInitScript(() => {
    localStorage.setItem('token', 'isolated-assignment-ui-test');
    localStorage.setItem('evalsys_current_subject_id', 'subject-a');
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'instructor-a', name: 'Jerico Reyes', role: 'admin', assignedSubjects: [subject] } });
    if (path.endsWith('/settings/public')) return route.fulfill({ json: { isMaintenanceMode: false } });
    if (path.endsWith('/settings')) return route.fulfill({ json: { sharedPanelsEnabled: shared, announcement: { isActive: false } } });
    if (path.endsWith('/subjects')) return route.fulfill({ json: [subject] });
    if (path.endsWith('/users/assignable-panels')) return state.failLoad
      ? route.fulfill({ status: 500, json: { message: 'Directory is temporarily unavailable.' } })
      : route.fulfill({ json: shared ? panels : [panels[0]] });
    if (path.endsWith('/sections/assign-blocks')) {
      if (state.failSave) return route.fulfill({ status: 400, json: { message: 'Sharing was disabled. Your changes were not saved.' } });
      const payload = route.request().postDataJSON();
      state.writes.push(payload);
      const selected = panels.find(panel => panel._id === payload.panelId)!;
      for (const section of sections) {
        section.assignedPanels = section.assignedPanels.filter(panel => panel._id !== selected._id);
        if (payload.sectionIds.includes(section._id)) section.assignedPanels.push(selected);
      }
      return route.fulfill({ json: { message: 'Saved' } });
    }
    if (path.endsWith('/sections')) return route.fulfill({ json: sections });
    return route.fulfill({ json: [] });
  });
  return state;
};

test('assignment changes are explicit, survive errors, and persist only after saving', async ({ page }) => {
  const state = await mockAssignments(page);
  await page.goto('/assign-panels');
  await page.getByRole('button', { name: /Maria Santos/ }).click();
  await expect(page.getByRole('button', { name: 'Save assignments', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: /BSIT 3-B/ }).check();
  await expect(page.getByText('1 to assign · 0 to unassign')).toBeVisible();
  await expect(page.getByRole('button', { name: /Other Instructors/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByRole('checkbox', { name: /BSIT 3-B/ })).not.toBeChecked();
  await page.getByRole('button', { name: /Other Instructors/ }).click();
  await page.getByLabel('Find a judge').fill('Bautista');
  await page.getByRole('button', { name: /Alexandra Victoria/ }).click();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  state.failSave = true;
  await page.getByRole('button', { name: 'Save assignments', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sharing was disabled');
  await expect(page.getByRole('checkbox', { name: /BSIT 3-A/ })).toBeChecked();
  expect(state.writes).toEqual([]);
  state.failSave = false;
  await page.getByRole('button', { name: 'Save assignments', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('assigned to 2 blocks');
  expect(state.writes).toEqual([{ panelId: 'panel-b', sectionIds: ['block-a', 'block-b'] }]);
  await expect(page.getByText('2 of 2 blocks selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save assignments', exact: true })).toBeDisabled();
});

test('saved shared assignments reload correctly and clearing them preserves other judges', async ({ page }) => {
  const state = await mockAssignments(page);
  const selectSharedPanel = async () => {
    await page.getByRole('button', { name: /Other Instructors/ }).click();
    await page.getByRole('button', { name: /Alexandra Victoria/ }).click();
  };
  await page.goto('/assign-panels');
  await selectSharedPanel();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'Save assignments', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('assigned to 2 blocks');
  await page.reload();
  await selectSharedPanel();
  await expect(page.getByRole('checkbox', { name: /BSIT 3-A/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /BSIT 3-B/ })).toBeChecked();
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await page.getByRole('button', { name: 'Save assignments', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('assigned to 0 blocks');
  await page.reload();
  await selectSharedPanel();
  await expect(page.getByRole('checkbox', { name: /BSIT 3-A/ })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /BSIT 3-B/ })).not.toBeChecked();
  await page.getByRole('button', { name: /My Panels/ }).click();
  await page.getByRole('button', { name: /Maria Santos/ }).click();
  await expect(page.getByRole('checkbox', { name: /BSIT 3-A/ })).toBeChecked();
  expect(state.writes).toEqual([
    { panelId: 'panel-b', sectionIds: ['block-a', 'block-b'] },
    { panelId: 'panel-b', sectionIds: [] },
  ]);
});

test('owner-only directory handles failed loads and no search results', async ({ page }) => {
  const state = await mockAssignments(page, false);
  state.failLoad = true;
  await page.goto('/assign-panels');
  await expect(page.getByRole('alert')).toContainText('Directory is temporarily unavailable');
  state.failLoad = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('button', { name: /My Panels/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Other Instructors/ })).toHaveCount(0);
  await page.getByLabel('Find a judge').fill('unknown judge');
  await expect(page.getByText('No matching judges')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('button', { name: /Maria Santos/ })).toBeVisible();
});

test('assignment workspace fits desktop and mobile and supports keyboard block selection', async ({ page }) => {
  await mockAssignments(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/assign-panels');
  await page.getByRole('button', { name: /Other Instructors/ }).click();
  await page.getByRole('button', { name: /Alexandra Victoria/ }).click();
  const checkbox = page.getByRole('checkbox', { name: /BSIT 3-A/ });
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  await page.screenshot({ path: test.info().outputPath('assign-panels-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Save assignments', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Save assignments', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('assign-panels-mobile.png'), fullPage: true });
});

import { test, expect, type Page } from '@playwright/test';
import { tutorials } from '../src/tutorial/tours';

const login = async (page: Page, username: string) => {
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('QaPassword!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
};
const popover = (page: Page) => page.locator('.driver-popover.evalsys-tour');
const next = async (page: Page) => { await popover(page).getByRole('button', { name: 'Next', exact: true }).click(); };
const title = async (page: Page, text: string) => { await expect(popover(page).locator('.driver-popover-title')).toHaveText(text, { timeout: 15000 }); };

test('instructor tour crosses actual pages, remembers completion and replays', async ({ page }) => {
  test.setTimeout(90000);
  await login(page, 'qa-instructor');
  const invitation = page.getByRole('region', { name: 'Tutorial invitation' });
  await expect(invitation).toContainText('Instructor');
  await invitation.getByRole('button', { name: 'Start tutorial', exact: true }).click();
  for (let index = 0; index < tutorials.instructor.steps.length; index++) {
    const step = tutorials.instructor.steps[index];
    await title(page, step.title);
    await expect(popover(page)).toContainText('Step ' + (index + 1) + ' of 10');
    if (step.route) await expect(page).toHaveURL(new RegExp(step.route + '$'));
    if (index === 1) {
      await popover(page).getByRole('button', { name: 'Back', exact: true }).click();
      await title(page, tutorials.instructor.steps[0].title);
      await next(page);
      await title(page, step.title);
    }
    if (index === tutorials.instructor.steps.length - 1) await popover(page).getByRole('button', { name: 'Finish', exact: true }).click();
    else await next(page);
  }
  await expect(popover(page)).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(invitation).toHaveCount(0);
  expect(await page.evaluate(() => Object.entries(localStorage).some(([key, value]) => key.startsWith('evalsys_tutorial_v1:instructor:') && JSON.parse(value).completed))).toBe(true);
  await page.locator('[data-tutorial="launcher"]').click();
  await title(page, 'Your instructor workspace');
  await popover(page).getByRole('button', { name: 'Skip tutorial', exact: true }).click();
  await expect(popover(page)).toHaveCount(0);
  expect(await page.evaluate(() => Object.entries(localStorage).some(([key, value]) => key.startsWith('evalsys_tutorial_v1:instructor:') && JSON.parse(value).completed))).toBe(true);
  await page.evaluate(() => localStorage.removeItem('token'));
  await login(page, 'qa-panel-a');
  await expect(page.getByRole('region', { name: 'Tutorial invitation' })).toContainText('Panel');
});

test('panel tutorial uses panel controls and never submits trial scores', async ({ page }) => {
  test.setTimeout(90000);
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && (request.url().includes('/evaluations/group/') || /\/chat\/rooms\/[^/]+\/messages/.test(request.url()))) writes.push(request.url()); });
  await login(page, 'qa-panel-b');
  await page.getByRole('region', { name: 'Tutorial invitation' }).getByRole('button', { name: 'Start tutorial', exact: true }).click();
  for (let index = 0; index < tutorials.panel.steps.length; index++) {
    const step = tutorials.panel.steps[index];
    await title(page, step.title);
    if (step.title === 'View group members') {
      const toggle = page.locator('[data-tutorial="panel-dashboard-members"]').first();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await toggle.click();
    }
    if (step.title === 'Talk with your panel team') {
      await page.getByLabel('Message', { exact: true }).fill('Unsent tutorial chat draft');
      await page.getByLabel('Message', { exact: true }).press('Enter');
      await expect(page.getByLabel('Message', { exact: true })).toHaveValue('Unsent tutorial chat draft');
    }
    if (step.title === 'Choose a subject') await page.locator('[data-tutorial="panel-subject"]').selectOption({ label: 'QA101 - Browser QA' });
    if (step.title === 'Open a group') {
      await expect(popover(page).getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
      await page.locator('[data-tutorial="panel-groups"]').getByRole('button', { name: /QA Draft Group/ }).click();
      await expect(popover(page).getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
    }
    if (step.title === 'Scores and rubric') {
      await page.locator('[data-tutorial="panel-scores"]').getByRole('spinbutton').fill('6');
      await page.locator('[data-tutorial="panel-scores"]').getByRole('spinbutton').press('Enter');
      await expect(page.getByRole('dialog', { name: 'Submit Scores?' })).toHaveCount(0);
    }
    if (index === tutorials.panel.steps.length - 1) await popover(page).getByRole('button', { name: 'Finish', exact: true }).click();
    else await next(page);
  }
  expect(writes).toEqual([]);
  await expect(page.getByRole('spinbutton')).toHaveValue('6');
  await expect(page.getByRole('button', { name: 'Submit Scores & Feedback', exact: true })).toBeEnabled();
});

test('registration tutorial is action-based, preserves entries and requires explicit confirmation', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/register')) writes.push(request.url()); });
  await page.goto('/register/qa-browser-registration');
  await page.getByRole('region', { name: 'Tutorial invitation' }).getByRole('button', { name: 'Start tutorial', exact: true }).click();
  for (let index = 0; index < tutorials.registration.steps.length; index++) {
    await title(page, tutorials.registration.steps[index].title);
    if (index === 1) {
      await expect(popover(page).getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
      await page.locator('[data-tutorial="registration-name"]').fill('Tutorial Unsaved Group');
      await page.locator('[data-tutorial="registration-name"]').press('Enter');
    }
    if (index === 3) await page.locator('[data-tutorial="registration-block"]').selectOption({ label: 'QA-A' });
    if (index === 4) {
      await expect(popover(page).getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
      const members = page.locator('[data-tutorial="registration-members"]');
      await members.getByPlaceholder('Garcia', { exact: true }).fill('Tutorial');
      await members.getByPlaceholder('Jerico', { exact: true }).fill('Student');
      await members.getByRole('button', { name: '+ Add Member', exact: true }).click();
      await expect(popover(page).getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
      await members.getByPlaceholder('Garcia', { exact: true }).nth(1).fill('Second');
      await members.getByPlaceholder('Jerico', { exact: true }).nth(1).fill('Student');
    }
    if (index === 6) {
      await expect(popover(page).getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
      await page.locator('[data-tutorial="registration-consent"]').getByRole('checkbox').check();
      await page.locator('[data-tutorial="registration-form"]').evaluate(form => (form as HTMLFormElement).requestSubmit());
      await expect(page.getByRole('dialog', { name: 'Submit Registration?' })).toHaveCount(0);
    }
    if (index === tutorials.registration.steps.length - 1) await popover(page).getByRole('button', { name: 'Finish', exact: true }).click();
    else await next(page);
  }
  expect(writes).toEqual([]);
  await expect(page.locator('[data-tutorial="registration-name"]')).toHaveValue('Tutorial Unsaved Group');
  await page.getByRole('button', { name: 'Complete Registration', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Submit Registration?' })).toBeVisible();
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Submit Registration?' })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('mobile tutorial supports reduced motion, keyboard navigation and skipping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, 'qa-panel-a');
  await page.getByRole('region', { name: 'Tutorial invitation' }).getByRole('button', { name: 'Start tutorial', exact: true }).click();
  await title(page, 'Your panel dashboard');
  await expect(popover(page)).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('ArrowRight');
  await title(page, 'View group members');
  await page.keyboard.press('ArrowRight');
  await title(page, 'Panel navigation');
  await expect(page.locator('[data-tutorial="mobile-menu"]')).toHaveClass(/driver-active-element/);
  const bounds = await popover(page).boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.driver-popover')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(popover(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Tutorial invitation' })).toHaveCount(0);
});

test('registration guide is absent for invalid links and superadmin gets no instructor guide', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Registration Closed', exact: true })).toBeVisible();
  await expect(page.locator('[data-tutorial="launcher"]')).toHaveCount(0);
  await login(page, 'qa-super');
  await expect(page.getByRole('region', { name: 'Tutorial invitation' })).toHaveCount(0);
  await expect(page.locator('[data-tutorial="launcher"]')).toHaveCount(0);
});


test('first instructor invitation waits until the temporary password is changed', async ({ page }) => {
  // Mock only the first-login flag and password response; keep the actual UI/auth flow.
  // This never changes even the isolated instructor account's password.
  await page.route('**/api/auth/login', async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, user: { ...body.user, mustChangePassword: true } } });
  });
  await page.route('**/api/auth/change-password', route => route.fulfill({ status: 200, json: { message: 'Synthetic password change accepted' } }));
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill('qa-instructor');
  await page.getByLabel('Password', { exact: true }).fill('QaPassword!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/change-password/);
  await expect(page.getByRole('region', { name: 'Tutorial invitation' })).toHaveCount(0);
  await expect(page.locator('[data-tutorial="launcher"]')).toHaveCount(0);
  await page.getByLabel('New Password', { exact: true }).fill('SyntheticNew!2026');
  await page.getByLabel('Confirm New Password', { exact: true }).fill('SyntheticNew!2026');
  await page.getByRole('button', { name: 'Change Password', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('region', { name: 'Tutorial invitation' })).toContainText('Instructor');
  await page.getByRole('region', { name: 'Tutorial invitation' }).getByRole('button', { name: 'Maybe later', exact: true }).click();
  await expect(page.locator('[data-tutorial="launcher"]')).toBeVisible();
});


test('missing panel assignments provide guidance without trapping users', async ({ page }) => {
  test.setTimeout(60000);
  await page.route('**/api/groups', route => route.fulfill({ status: 200, json: [] }));
  await page.route('**/api/sections', route => route.fulfill({ status: 200, json: [] }));
  await login(page, 'qa-panel-a');
  await page.getByRole('region', { name: 'Tutorial invitation' }).getByRole('button', { name: 'Start tutorial', exact: true }).click();
  await title(page, 'Your panel dashboard');
  await next(page);
  await title(page, 'View group members');
  await expect(popover(page)).toContainText('No assigned groups are available yet');
  await next(page);
  await title(page, 'Panel navigation');
  await next(page);
  await title(page, 'Talk with your panel team');
  await next(page);
  await title(page, 'Choose a subject');
  await expect(popover(page)).toContainText('No assigned subjects are available yet');
  await expect(popover(page).getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await popover(page).getByRole('button', { name: 'Skip tutorial', exact: true }).click();
  await expect(popover(page)).toHaveCount(0);
});

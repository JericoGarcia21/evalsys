import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import databaseRubric from '../src/data/databaseRubric.json' with { type: 'json' };

const raw = path.resolve('../product-video/.hyperframes/raw');
const captures: { id: string; path: string; seconds: number; markers?: Record<string, number>; members?: string[][]; cursorClicks?: { x: number; y: number }[] }[] = [];
const viewport = { width: 1440, height: 800 };
const hold = (page: Page, ms = 800) => page.waitForTimeout(ms); // Deliberate video reading time.

async function click(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('Capture target is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
  await target.click();
  await hold(page, 500);
}
async function type(page: Page, target: Locator, value: string) {
  await click(page, target);
  await target.pressSequentially(value, { delay: 45 });
}
async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('QaPassword!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.getByRole('region', { name: 'Tutorial invitation' }).getByRole('button', { name: 'Maybe later', exact: true }).click();
}
async function recorder(browser: Browser, session?: BrowserContext) {
  const context = await browser.newContext({ viewport, storageState: session ? await session.storageState() : undefined,
    recordVideo: { dir: raw, size: viewport } });
  const page = await context.newPage();
  // Visible pointer follows actual mouse events; it never triggers app actions.
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const cursor = document.createElement('div');
      cursor.style.cssText = 'position:fixed;left:40px;top:40px;width:42px;height:52px;pointer-events:none;z-index:2147483647;filter:drop-shadow(0 2px 3px #0009)';
      cursor.innerHTML = '<div data-click-halo style="position:absolute;left:-17px;top:-17px;width:48px;height:48px;border:3px solid #60a5fa;background:#2563eb18;border-radius:50%"></div><svg style="position:relative" viewBox="0 0 26 32"><path d="M2 2 L2 26 L9 20 L14 30 L19 27 L14 17 L24 17 Z" fill="#2563eb" stroke="white" stroke-width="2"/></svg>';
      document.body.append(cursor);
      const clicks: { x: number; y: number }[] = [];
      Object.assign(window, { __captureClicks: clicks });
      document.addEventListener('mousemove', event => {
        cursor.style.left = event.clientX - 3.2 + 'px';
        cursor.style.top = event.clientY - 3.2 + 'px';
        const arrow = cursor.querySelector('svg')!;
        arrow.style.transformOrigin = '3.2px 3.2px';
        arrow.style.transform = event.clientY > innerHeight - 64 ? (event.clientX > innerWidth - 64 ? 'rotate(180deg)' : 'rotate(-90deg)') : event.clientX > innerWidth - 64 ? 'rotate(90deg)' : 'none';
      });
      document.addEventListener('mousedown', event => {
        clicks.push({ x: event.clientX, y: event.clientY });
        cursor.querySelector('[data-click-halo]')!.animate([{ transform: 'scale(.7)', opacity: 1 }, { transform: 'scale(2)', opacity: 0 }], { duration: 450 });
      });
    });
  });
  return { context, page };
}
async function finish(id: string, context: BrowserContext, page: Page, started: number, markers?: Record<string, number>, members?: string[][]) {
  await hold(page, 1200);
  const seconds = (Date.now() - started) / 1000;
  const video = page.video()!;
  const cursorClicks = await page.evaluate(() => (window as unknown as { __captureClicks: { x: number; y: number }[] }).__captureClicks || []);
  for (const point of cursorClicks) {
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThan(viewport.width);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThan(viewport.height);
  }
  await context.close();
  captures.push({ id, path: await video.path(), seconds, markers, members, cursorClicks });
}

test('record real user interactions using only disposable synthetic data', async ({ browser }) => {
  test.setTimeout(360000);
  await mkdir(raw, { recursive: true });
  const instructor = await browser.newContext({ viewport });
  const auth = await instructor.newPage();
  await login(auth, 'qa-instructor');
  const subject = auth.locator('aside nav').getByRole('button').first();
  if (!(await subject.innerText()).startsWith('QA101')) {
    await subject.click();
    await auth.getByRole('button', { name: 'QA101 - Browser QA', exact: true }).click();
  }
  // Configure the project's existing preset using its actual instructor UI.
  // The generic browser-test rubric is never presented as the product rubric.
  await auth.goto('/rubrics');
  await auth.getByRole('button', { name: '+ New Rubric', exact: true }).click();
  await auth.getByRole('button', { name: 'Use Database Final Project Template', exact: true }).click();
  await expect(auth.getByLabel('Section totals')).toContainText('Project Requirements: 40 pts');
  await expect(auth.getByLabel('Section totals')).toContainText('Project Documentation: 30 pts');
  await expect(auth.getByLabel('Section totals')).toContainText('Project Presentation: 30 pts');
  await auth.getByRole('button', { name: 'Create and Save Rubric', exact: true }).click();
  const actualRubric = auth.locator('.evl-card').filter({ has: auth.getByText('Database Final Project', { exact: true }) });
  await actualRubric.getByRole('button', { name: 'Use This Rubric', exact: true }).click();
  await expect(actualRubric.getByText('Active', { exact: true })).toBeVisible();
  const setup = await recorder(browser, instructor);
  await setup.page.goto('/rubrics');
  const rubric = setup.page.locator('.evl-card').filter({ has: setup.page.getByText('Database Final Project', { exact: true }) });
  await expect(rubric.getByText('Active', { exact: true })).toBeVisible();
  let started = Date.now();
  await hold(setup.page);
  await click(setup.page, rubric.getByRole('button', { name: 'View', exact: true }));
  await setup.page.getByText('Project Requirements: 40 pts', { exact: true }).scrollIntoViewIfNeeded();
  await expect(setup.page.getByText('Conceptual Design', { exact: true })).toBeVisible();
  await hold(setup.page, 1800);
  await finish('setup', setup.context, setup.page, started);

  const student = await recorder(browser);
  await student.page.goto('/register/qa-browser-registration');
  await student.page.getByRole('region', { name: 'Tutorial invitation' }).getByRole('button', { name: 'Maybe later', exact: true }).click();
  started = Date.now();
  const markers: Record<string, number> = {};
  const mark = (name: string) => { markers[name] = (Date.now() - started) / 1000; };
  await type(student.page, student.page.locator('[data-tutorial="registration-name"]'), 'Project Atlas');
  await click(student.page, student.page.locator('[data-tutorial="registration-block"]'));
  await student.page.locator('[data-tutorial="registration-block"]').selectOption({ label: 'QA-A' });
  mark('firstStart');
  await type(student.page, student.page.getByPlaceholder('Garcia', { exact: true }), 'Demo');
  await type(student.page, student.page.getByPlaceholder('Jerico', { exact: true }), 'Alex');
  await type(student.page, student.page.getByPlaceholder('Bautista', { exact: true }), 'Rivera');
  mark('member0');
  await hold(student.page, 1200);
  const members = [['Demo', 'Alex', 'Rivera'], ['Chen', 'Sam', 'Jordan'], ['Reyes', 'Jamie', 'Santos'], ['Cruz', 'Taylor', 'Morgan']];
  for (const [index, [last, first, middle]] of members.slice(1).entries()) {
    await click(student.page, student.page.getByRole('button', { name: '+ Add Member', exact: true }));
    await type(student.page, student.page.getByPlaceholder('Garcia', { exact: true }).last(), last);
    await type(student.page, student.page.getByPlaceholder('Jerico', { exact: true }).last(), first);
    await type(student.page, student.page.getByPlaceholder('Bautista', { exact: true }).last(), middle);
    mark(`member${index + 1}`);
    await hold(student.page, 1200);
  }
  for (const [index, [last, first, middle]] of members.entries()) {
    await expect(student.page.getByPlaceholder('Garcia', { exact: true }).nth(index)).toHaveValue(last);
    await expect(student.page.getByPlaceholder('Jerico', { exact: true }).nth(index)).toHaveValue(first);
    await expect(student.page.getByPlaceholder('Bautista', { exact: true }).nth(index)).toHaveValue(middle);
  }
  mark('confirmStart');
  await click(student.page, student.page.getByRole('checkbox'));
  await click(student.page, student.page.getByRole('button', { name: 'Complete Registration', exact: true }));
  await click(student.page, student.page.getByRole('button', { name: 'Submit Registration', exact: true }));
  await expect(student.page.getByRole('heading', { name: 'Registration Successful!' })).toBeVisible();
  await finish('registration', student.context, student.page, started, markers, members);

  for (const [username, rating, total] of [['qa-panel-a', 'Very Good', '90'], ['qa-panel-b', 'Good', '80']]) {
    const session = await browser.newContext({ viewport });
    await login(await session.newPage(), username);
    const panel = await recorder(browser, session);
    const page = panel.page;
    await page.goto('/grade');
    await expect(page.getByLabel('Subject', { exact: true })).toBeVisible();
    started = Date.now();
    await click(page, page.getByLabel('Subject', { exact: true }));
    await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'QA101 - Browser QA' });
    await click(page, page.getByRole('button', { name: /QA-A/ }));
    await click(page, page.getByRole('button', { name: /Project Atlas/ }));
    await click(page, page.getByRole('button', { name: 'Focus grading', exact: true }));
    await expect(page.getByRole('button', { name: 'Exit focus view', exact: true })).toBeVisible();
    for (const criterion of databaseRubric.criteria) {
      const section = page.getByRole('region', { name: `${criterion.section} grading criteria`, exact: true });
      const group = section.getByRole('group', { name: `Performance rating for ${criterion.label}`, exact: true });
      // Frame the entire real criterion card, not only its rating button.
      // Centering keeps the guidance clear of the sticky progress bar.
      await group.locator('..').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await hold(page, 240);
      await click(page, group.getByRole('button', { name: rating, exact: true }));
    }
    await expect(page.getByLabel('Current grading total')).toContainText(total);
    await type(page, page.locator('textarea'), 'Clear demonstration.');
    await click(page, page.getByRole('button', { name: 'Submit Scores & Feedback', exact: true }));
    await click(page, page.getByRole('button', { name: 'Submit Scores', exact: true }));
    await expect(page.getByText('Scores and feedback submitted successfully.', { exact: true })).toBeVisible();
    if (username === 'qa-panel-a') await finish('grading', panel.context, page, started);
    else await panel.context.close();
    await session.close();
  }
  const results = await recorder(browser, instructor);
  const page = results.page;
  await page.goto('/results');
  await expect(page.getByRole('button', { name: /QA-A/ })).toBeVisible();
  started = Date.now();
  await click(page, page.getByRole('button', { name: /QA-A/ }));
  await expect(page.getByRole('table', { name: 'Group results overview' })).toContainText('85');
  await click(page, page.getByRole('button', { name: 'View breakdown for Project Atlas', exact: true }));
  await hold(page, 1800);
  const downloaded = page.waitForEvent('download');
  await click(page, page.getByRole('button', { name: 'Download Member Grades CSV', exact: true }));
  expect((await downloaded).suggestedFilename()).toContain('Member_Grades');
  await finish('results', results.context, page, started);

  const pwa = await recorder(browser);
  await pwa.page.goto('/');
  await expect(pwa.page.getByRole('link', { name: 'Installable PWA · How to install' })).toBeVisible();
  started = Date.now();
  await click(pwa.page, pwa.page.getByRole('link', { name: 'Installable PWA · How to install' }));
  await expect(pwa.page.getByRole('heading', { name: 'Keep EvalSys one tap away.' })).toBeInViewport();
  await hold(pwa.page, 3500);
  await finish('pwa', pwa.context, pwa.page, started);
  await instructor.close();
  await writeFile(path.join(raw, 'captures.json'), JSON.stringify(captures, null, 2));
});

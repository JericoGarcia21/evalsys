import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/settings/public?*', route => route.fulfill({ json: { isMaintenanceMode: false } }));
});

test('public policies load without an account and fit desktop and mobile', async ({ page }) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, title] of [['/terms', 'Terms of Use'], ['/privacy', 'Privacy Policy'], ['/copyright', 'Copyright & Removal Requests']]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole('contentinfo')).toContainText(`© ${new Date().getFullYear()} Jerico B. Garcia`);
      await expect(page.getByRole('navigation', { name: 'Legal information' }).getByRole('link')).toHaveCount(3);
      await page.screenshot({ path: test.info().outputPath(`${path.slice(1)}-${width}.png`), fullPage: true });
    }
  }
});

test('copyright request opens a Gmail draft with the correct recipient and template', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await page.goto('/copyright');
  const link = page.getByRole('link', { name: /Request content removal/ });
  const url = new URL((await link.getAttribute('href'))!);
  expect(url.origin).toBe('https://mail.google.com');
  expect(url.searchParams.get('to')).toBe('garciajerico217@gmail.com');
  expect(url.searchParams.get('su')).toBe('EvalSys Copyright Removal Request');
  expect(url.searchParams.get('body')).toContain('Original work');
  expect(url.searchParams.get('body')).toContain('Material location in EvalSys');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByText('The button opens an email template in Gmail.', { exact: false })).toBeVisible();
  expect(writes).toEqual([]);
});

test('policy pages stay readable in maintenance while normal access stays paused', async ({ page }) => {
  await page.route('**/api/settings/public?*', route => route.fulfill({ json: { isMaintenanceMode: true, maintenanceMessage: 'Policy access test' } }));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'EvalSys is temporarily paused' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Legal information' }).last()).toBeVisible();
  for (const path of ['/terms', '/privacy', '/copyright']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'EvalSys is temporarily paused' })).toHaveCount(0);
    await expect(page.getByRole('main')).toBeVisible();
  }
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'EvalSys is temporarily paused' })).toBeVisible();
});

test('landing and login expose copyright and policy links', async ({ page }) => {
  for (const path of ['/', '/login']) {
    await page.goto(path);
    const links = page.getByRole('navigation', { name: 'Legal information' });
    for (const target of ['/terms', '/privacy', '/copyright']) await expect(links.locator(`a[href="${target}"]`)).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText('All rights reserved.');
  }
});

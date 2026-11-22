import { test, expect } from '@playwright/test';

test('table actions share the heading edge and consistent button heights', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill('qa-instructor');
  await page.getByLabel('Password', { exact: true }).fill('QaPassword!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  for (const path of ['/sections', '/groups', '/subjects']) {
    await page.goto(path);
    const heading = page.locator('th.col-actions').first();
    const cell = page.locator('td.col-actions').first();
    await expect(heading).toBeVisible();
    await expect(cell).toBeVisible();
    const alignment = await cell.evaluate(element => {
      const table = element.closest('table')!;
      const th = table.querySelector('th.col-actions')!;
      const control = element.firstElementChild!;
      return {
        headingEdge: th.getBoundingClientRect().left + parseFloat(getComputedStyle(th).paddingLeft),
        controlEdge: control.getBoundingClientRect().left,
        heights: Array.from(element.querySelectorAll('button, a')).map(item => item.getBoundingClientRect().height),
      };
    });
    expect(Math.abs(alignment.headingEdge - alignment.controlEdge)).toBeLessThan(2);
    expect(alignment.heights.every(height => height >= 36)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${path.slice(1)}-actions.png`), fullPage: true });
  }
});

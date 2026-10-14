import { test, expect, type Page } from '@playwright/test';

const roomId = '100000000000000000000001';
const teacherId = '200000000000000000000001';
const panelId = '300000000000000000000001';
const subject = { _id: '400000000000000000000001', code: 'IT101', title: 'Object Oriented Programming' };
async function mockChat(page: Page, role = 'panel') {
  let unread = 2;
  let failSend = false;
  let revoked = false;
  const writes: Record<string, unknown>[] = [];
  let sequence = 1;
  const messages = [{
    _id: '500000000000000000000001', body: 'Discuss the presentation after the demo.', createdAt: new Date().toISOString(),
    sender: { id: teacherId, name: 'Instructor Tester', role: 'admin' },
  }];
  await page.addInitScript(() => localStorage.setItem('token', 'chat-browser-test'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me')) return route.fulfill({ json: { id: role === 'panel' ? panelId : teacherId, _id: role === 'panel' ? panelId : teacherId, name: role === 'panel' ? 'Panel Tester' : 'Instructor Tester', role } });
    if (url.pathname.endsWith('/settings/public')) return route.fulfill({ json: { isMaintenanceMode: false } });
    if (url.pathname === '/api/chat/rooms') return route.fulfill({ json: { rooms: revoked ? [] : [{
      _id: roomId, name: 'General Panel Chat', subject, unread,
      instructor: { _id: teacherId, name: 'Instructor Tester' },
      participants: [{ _id: teacherId, name: 'Instructor Tester', role: 'admin' }, { _id: panelId, name: 'Panel Tester', role: 'panel' }],
    }] } });
    if (url.pathname.endsWith('/messages')) {
      if (revoked) return route.fulfill({ status: 403, json: { message: 'You are not assigned to this subject panel chat.' } });
      if (route.request().method() === 'POST') {
        const payload = route.request().postDataJSON();
        writes.push(payload);
        if (failSend) { failSend = false; return route.fulfill({ status: 500, json: { message: 'Temporary send failure. Your draft is kept.' } }); }
        sequence += 1;
        const message = {
          _id: '5000000000000000000000' + String(sequence).padStart(2, '0'),
          body: payload.body, createdAt: new Date().toISOString(),
          sender: { id: role === 'panel' ? panelId : teacherId, name: role === 'panel' ? 'Panel Tester' : 'Instructor Tester', role },
        };
        messages.push(message);
        return route.fulfill({ status: 201, json: message });
      }
      const after = url.searchParams.get('after');
      return route.fulfill({ json: { messages: after ? messages.filter(message => message._id > after) : messages, hasMore: false, hasMoreNew: false } });
    }
    if (url.pathname.endsWith('/read')) { unread = 0; return route.fulfill({ json: { read: true } }); }
    return route.fulfill({ json: [] });
  });
  return { writes, failNextSend: () => { failSend = true; }, revoke: () => { revoked = true; } };
}

test('general chat includes the instructor and panels without block or group discussion selectors', async ({ page }) => {
  const state = await mockChat(page);
  await page.goto('/dashboard');
  await expect(page.locator('aside nav').getByLabel('2 unread chat messages')).toBeVisible();
  await page.locator('aside nav').getByRole('link', { name: /Panel Chat/ }).click();
  await expect(page.getByRole('heading', { name: 'General Panel Chat', exact: true })).toBeVisible();
  await expect(page.getByText('Discuss the presentation after the demo.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Discussion', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Assigned block rooms', { exact: true })).toHaveCount(0);
  await page.getByText('2 participants', { exact: true }).click();
  await expect(page.getByText('Instructor Tester', { exact: true })).toBeVisible();
  await page.getByText('2 participants', { exact: true }).click();
  await page.getByLabel('Message', { exact: true }).fill('Let us coordinate our evaluation schedule.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Let us coordinate our evaluation schedule.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('');
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].groupId).toBeUndefined();
  await page.screenshot({ path: test.info().outputPath('general-chat-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('general-chat-mobile.png'), fullPage: true, animations: 'disabled' });
});

test('chat drafts survive reload, offline state and failed-send retries', async ({ page, context }) => {
  const state = await mockChat(page);
  await page.goto('/chat');
  await expect(page.getByText('Discuss the presentation after the demo.', { exact: true })).toBeVisible();
  await page.getByLabel('Message', { exact: true }).fill('My saved conversation draft');
  await page.reload();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('My saved conversation draft');
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await context.setOffline(false);
  state.failNextSend();
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Temporary send failure');
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('My saved conversation draft');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('My saved conversation draft', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(2);
  expect(state.writes[0].clientMessageId).toBe(state.writes[1].clientMessageId);
});

test('instructor can join the general panel chat', async ({ page }) => {
  await mockChat(page, 'admin');
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: 'General Panel Chat', exact: true })).toBeVisible();
  await page.getByLabel('Message', { exact: true }).fill('Use the same presentation order.');
  await page.getByLabel('Message', { exact: true }).press('Enter');
  await expect(page.getByText('Use the same presentation order.', { exact: true })).toBeVisible();
});

test('revoked panel assignments remove chat access and hide the prior conversation', async ({ page }) => {
  const state = await mockChat(page);
  await page.goto('/chat');
  await expect(page.getByText('Discuss the presentation after the demo.', { exact: true })).toBeVisible();
  state.revoke();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Discuss the presentation after the demo.', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Message', { exact: true })).toHaveCount(0);
  await expect(page.getByText('No panel team assigned yet', { exact: true })).toBeVisible();
});

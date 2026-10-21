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
    if (url.pathname === '/api/subjects') return route.fulfill({ json: [subject] });
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
  const offer = page.getByRole('region', { name: 'Tutorial invitation' });
  if (await offer.isVisible()) await offer.getByRole('button', { name: 'Maybe later', exact: true }).click();
  const launcher = page.getByRole('button', { name: 'Open panel chat', exact: true });
  await expect(launcher).toContainText('2 unread messages');
  await launcher.click();
  await page.getByRole('dialog', { name: 'Floating panel chat' }).getByRole('link', { name: 'Expand panel chat', exact: true }).click();
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

async function mockSubjectChats(page: Page) {
  await mockChat(page, 'admin');
  const subjects = [
    { _id: subject._id, code: 'SYS101', title: 'Systems Integration' },
    { _id: '400000000000000000000002', code: 'OOP201', title: 'Object Oriented Programming' },
    { _id: '400000000000000000000003', code: 'NEW301', title: 'No Assigned Team' },
  ];
  const roomIds = [roomId, '100000000000000000000002'];
  const writes: { room: string; body: string }[] = [];
  const roomMessages = roomIds.map((id, index) => [{
    _id: `50000000000000000000000${index + 1}`, body: `${subjects[index].code} private message`, createdAt: new Date().toISOString(),
    sender: { id: panelId, name: 'Panel Tester', role: 'panel' },
  }]);
  await page.addInitScript(({ current, saved, teacherId }) => {
    localStorage.setItem('evalsys_current_subject_id', current);
    localStorage.setItem('evalsys_chat_team:admin:' + teacherId, saved);
  }, { current: subjects[0]._id, saved: roomIds[1], teacherId });
  await page.route('**/api/subjects', route => route.fulfill({ json: subjects }));
  await page.route('**/api/chat/rooms', route => route.fulfill({ json: { rooms: roomIds.map((id, index) => ({
    _id: id, name: 'General Panel Chat', subject: subjects[index], unread: 0,
    instructor: { _id: teacherId, name: 'Instructor Tester' },
    participants: [{ _id: teacherId, name: 'Instructor Tester', role: 'admin' }, { _id: panelId, name: 'Panel Tester', role: 'panel' }],
  })) } }));
  await page.route('**/api/chat/rooms/*/messages*', async route => {
    const id = new URL(route.request().url()).pathname.split('/')[4];
    const index = roomIds.indexOf(id);
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      writes.push({ room: id, body: payload.body });
      const message = { _id: '500000000000000000000099', body: payload.body, createdAt: new Date().toISOString(), sender: { id: teacherId, name: 'Instructor Tester', role: 'admin' } };
      roomMessages[index].push(message);
      return route.fulfill({ status: 201, json: message });
    }
    return route.fulfill({ json: { messages: roomMessages[index], hasMore: false, hasMoreNew: false } });
  });
  const selectSubject = async (index: number) => {
    await page.locator('aside nav').getByRole('button').first().click();
    await page.getByRole('button', { name: `${subjects[index].code} - ${subjects[index].title}`, exact: true }).click();
  };
  return { subjects, roomIds, writes, selectSubject };
}

test('floating instructor chat follows the current subject over saved room preferences and isolates drafts', async ({ page }) => {
  const state = await mockSubjectChats(page);
  await page.goto('/groups');
  await page.getByRole('button', { name: 'Open panel chat', exact: true }).click();
  const chat = page.getByRole('dialog', { name: 'Floating panel chat' });
  await expect(chat.getByText('SYS101 private message', { exact: true })).toBeVisible();
  await expect(chat.getByText('OOP201 private message', { exact: true })).toHaveCount(0);
  await expect(chat.getByLabel('Panel team', { exact: true })).toHaveCount(0);
  await chat.getByLabel('Message', { exact: true }).fill('Systems draft stays here');
  await state.selectSubject(1);
  await expect(chat.getByText('OOP201 private message', { exact: true })).toBeVisible();
  await expect(chat.getByText('SYS101 private message', { exact: true })).toHaveCount(0);
  await expect(chat.getByLabel('Message', { exact: true })).toHaveValue('');
  await chat.getByLabel('Message', { exact: true }).fill('OOP message only');
  await chat.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(chat.getByText('OOP message only', { exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ room: state.roomIds[1], body: 'OOP message only' }]);
  await state.selectSubject(0);
  await expect(chat.getByLabel('Message', { exact: true })).toHaveValue('Systems draft stays here');
  await state.selectSubject(2);
  await expect(chat.getByText('No panel chat is assigned to the current subject.', { exact: true })).toBeVisible();
  await expect(chat.getByLabel('Message', { exact: true })).toHaveCount(0);
  await expect(chat.getByText('SYS101 private message', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('chat-subject-empty.png'), animations: 'disabled' });
});

test('expanded instructor chat ignores another subject room URL and follows sidebar switching', async ({ page }) => {
  const state = await mockSubjectChats(page);
  await page.goto('/chat?room=' + state.roomIds[1]);
  await expect(page.getByText('SYS101 private message', { exact: true })).toBeVisible();
  await expect(page.getByText('OOP201 private message', { exact: true })).toHaveCount(0);
  await state.selectSubject(1);
  await expect(page.getByText('OOP201 private message', { exact: true })).toBeVisible();
  await state.selectSubject(2);
  await expect(page.getByRole('heading', { name: 'No panel chat for this subject', exact: true })).toBeVisible();
  await expect(page.getByLabel('Message', { exact: true })).toHaveCount(0);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.JOB_MAX_ENTRIES = '2';
const { createJob, getJob } = require('../src/services/job.service');

test('status reads keep queued/running jobs at full capacity and reject overload', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const first = createJob({ type: 'qa', ownerId: 'owner', task: () => pending });
  const second = createJob({ type: 'qa', ownerId: 'owner', task: () => pending });
  assert.equal(getJob(first.id, 'owner'), first);
  assert.equal(getJob(second.id, 'owner'), second);
  assert.equal(getJob(first.id, 'other'), null);
  assert.throws(() => createJob({ type: 'qa', ownerId: 'owner', task: () => null }), error => error.statusCode === 503);
  release('complete');
  await new Promise(resolve => setTimeout(resolve, 20));
  const third = createJob({ type: 'qa', ownerId: 'owner', task: async () => 'third' });
  assert.equal(getJob(second.id, 'owner'), second);
  assert.ok(getJob(third.id, 'owner'));
});

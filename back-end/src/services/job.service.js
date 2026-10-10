const crypto = require('crypto');
const jobs = new Map();
const JOB_TTL_MS = Math.max(1000, Number(process.env.JOB_TTL_MS) || 30 * 60 * 1000);
const MAX_JOBS = Math.max(1, Number(process.env.JOB_MAX_ENTRIES) || 50);
const isFinished = job => ['completed', 'failed'].includes(job.status);

const pruneJobs = () => {
  for (const [id, job] of jobs) {
    if (isFinished(job) && job.expiresAt <= Date.now()) jobs.delete(id);
  }
};

const createJob = ({ type, ownerId, task }) => {
  pruneJobs();
  while (jobs.size >= MAX_JOBS) {
    const finished = [...jobs].find(([, job]) => isFinished(job));
    if (!finished) {
      const error = new Error('Background job capacity reached. Please try again shortly.');
      error.statusCode = 503;
      throw error;
    }
    jobs.delete(finished[0]);
  }
  const id = crypto.randomUUID();
  const job = { id, type, ownerId: ownerId?.toString(), status: 'queued', createdAt: new Date(), updatedAt: new Date(), expiresAt: Date.now() + JOB_TTL_MS, result: null, error: null };
  jobs.set(id, job);
  setImmediate(async () => {
    job.status = 'running';
    job.updatedAt = new Date();
    try { job.result = await task(); job.status = 'completed'; }
    catch (error) { job.status = 'failed'; job.error = error?.message || 'Background job failed'; }
    job.updatedAt = new Date();
    job.expiresAt = Date.now() + JOB_TTL_MS;
  });
  return job;
};
const getJob = (id, ownerId) => {
  pruneJobs();
  const job = jobs.get(id);
  return job?.ownerId === ownerId?.toString() ? job : null;
};
const serializeJob = (job, includeResult = false) => ({
  id: job.id, type: job.type, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt, error: job.error,
  ...(includeResult && job.status === 'completed' ? { result: job.result } : {}),
});
module.exports = { createJob, getJob, serializeJob };

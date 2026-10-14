const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_BUCKET = 'evalsys-proposals';

const getBucketName = () => process.env.SUPABASE_PROPOSAL_BUCKET || DEFAULT_BUCKET;

const getClient = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const sanitizeSegment = (value) => String(value || '')
  .trim()
  .replace(/[^a-zA-Z0-9._-]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '') || 'file';

const buildProposalPath = ({ instructorId, subjectId, groupId, originalName }) => {
  const ext = path.extname(originalName || '').toLowerCase();
  const baseName = sanitizeSegment(path.basename(originalName || 'proposal', ext));
  const timestamp = Date.now();
  return [
    sanitizeSegment(instructorId),
    sanitizeSegment(subjectId),
    sanitizeSegment(groupId),
    `${timestamp}-${baseName}${ext}`,
  ].join('/');
};

const isProposalPathForGroup = ({ storagePath, instructorId, subjectId, groupId }) => {
  const expectedPrefix = [
    sanitizeSegment(instructorId),
    sanitizeSegment(subjectId),
    sanitizeSegment(groupId),
  ].join('/');
  return String(storagePath || '').startsWith(`${expectedPrefix}/`);
};

const uploadProposalFile = async ({ buffer, storagePath, mimeType }) => {
  const supabase = getClient();
  if (!supabase) {
    throw new Error('Supabase Storage is not configured');
  }

  const { error } = await supabase.storage
    .from(getBucketName())
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) throw error;
};

const createProposalSignedUrl = async (storagePath) => {
  const supabase = getClient();
  if (!supabase) {
    throw new Error('Supabase Storage is not configured');
  }

  const { data, error } = await supabase.storage
    .from(getBucketName())
    .createSignedUrl(storagePath, 60 * 10);

  if (error) throw error;
  return data.signedUrl;
};

const downloadProposalFile = async (storagePath) => {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase Storage is not configured');
  const { data, error } = await supabase.storage.from(getBucketName()).download(storagePath);
  if (error) throw error;
  if (data.size > 10 * 1024 * 1024) throw new Error('Proposal exceeds the 10 MB limit');
  return Buffer.from(await data.arrayBuffer());
};

const bytesToMb = (bytes = 0) => Math.round((bytes / 1024 / 1024) * 100) / 100;

const getProposalStorageUsage = async () => {
  const supabase = getClient();
  const bucket = getBucketName();
  const freeTierLimitMb = Number(process.env.SUPABASE_STORAGE_LIMIT_MB || 1024);

  if (!supabase) {
    return {
      configured: false,
      bucket,
      freeTierLimitMb,
      message: 'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_PROPOSAL_BUCKET to show proposal storage usage.',
    };
  }

  const stack = [''];
  let fileCount = 0;
  let totalBytes = 0;
  const folders = new Set();

  while (stack.length) {
    const prefix = stack.pop();
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

      if (error) throw error;
      if (!data?.length) break;

      data.forEach((item) => {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id && item.metadata) {
          fileCount += 1;
          totalBytes += Number(item.metadata.size || 0);
        } else {
          folders.add(itemPath);
          stack.push(itemPath);
        }
      });

      if (data.length < 1000) break;
      offset += data.length;
    }
  }

  const usedMb = bytesToMb(totalBytes);
  return {
    configured: true,
    bucket,
    files: fileCount,
    folders: folders.size,
    usedMb,
    freeTierLimitMb,
    usagePercent: freeTierLimitMb > 0
      ? Math.round((usedMb / freeTierLimitMb) * 10000) / 100
      : 0,
  };
};

const listProposalFiles = async () => {
  const supabase = getClient();
  const bucket = getBucketName();
  if (!supabase) {
    throw new Error('Supabase Storage is not configured');
  }

  const stack = [''];
  const files = [];

  while (stack.length) {
    const prefix = stack.pop();
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

      if (error) throw error;
      if (!data?.length) break;

      data.forEach((item) => {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id && item.metadata) {
          files.push({
            path: itemPath,
            size: Number(item.metadata.size || 0),
            updatedAt: item.updated_at || item.created_at,
            mimeType: item.metadata.mimetype || item.metadata.mimeType,
          });
        } else {
          stack.push(itemPath);
        }
      });

      if (data.length < 1000) break;
      offset += data.length;
    }
  }

  return files;
};

const removeProposalFiles = async (storagePaths = []) => {
  const supabase = getClient();
  const bucket = getBucketName();
  if (!supabase) {
    throw new Error('Supabase Storage is not configured');
  }

  const paths = storagePaths.filter(Boolean);
  if (!paths.length) return { removed: 0 };

  const { data, error } = await supabase.storage
    .from(bucket)
    .remove(paths);

  if (error) throw error;
  return { removed: data?.length || paths.length };
};

module.exports = {
  downloadProposalFile,
  buildProposalPath,
  createProposalSignedUrl,
  getProposalStorageUsage,
  isProposalPathForGroup,
  listProposalFiles,
  removeProposalFiles,
  uploadProposalFile,
};

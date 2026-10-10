const RegistrationLink = require('../models/RegistrationLink');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const Group = require('../models/Group');
const {
  buildProposalPath,
  uploadProposalFile,
} = require('../services/proposalStorage.service');
const { getPagination, paginatedPayload } = require('../utils/pagination');

const getSubjectId = (req) => req.headers['x-subject-id'] || req.query.subject || req.body.subject;
const getOwnerId = (req) => req.user?.role === 'superadmin'
  ? req.instructorContext?._id
  : req.user?._id;
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const canAccessSubject = (req, subjectId) => (
  !subjectId ||
  req.user?.role === 'superadmin' ||
  (req.user?.assignedSubjects || []).some((id) => id.toString() === subjectId.toString())
);

const findUsableLink = async (token) => {
  const link = await RegistrationLink.findOne({ token, isActive: true })
    .populate('subject', 'code title isActive')
    .populate('sections', 'name block subject')
    .populate('createdBy', 'name email isActive');

  if (!link) return { error: 'Registration link is invalid or closed' };
  if (link.expiresAt.getTime() <= Date.now()) return { error: 'Registration link has expired' };
  if (!link.createdBy?.isActive) return { error: 'Registration instructor is inactive or unavailable' };
  if (!link.subject?.isActive) return { error: 'Subject is not accepting registration' };
  return { link };
};

exports.getRegistrationLinks = async (req, res) => {
  const subject = getSubjectId(req);
  const filter = { createdBy: getOwnerId(req) };
  if (subject) {
    if (!canAccessSubject(req, subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
    filter.subject = subject;
  } else if (req.user.role === 'admin') {
    filter.subject = { $in: req.user.assignedSubjects || [] };
  }

  const pagination = getPagination(req);
  const query = RegistrationLink.find(filter)
    .populate('subject', 'code title')
    .populate('sections', 'block')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

  if (!pagination) return res.json(await query);

  const [links, total] = await Promise.all([
    query.skip(pagination.skip).limit(pagination.limit),
    RegistrationLink.countDocuments(filter),
  ]);
  return res.json(paginatedPayload(links, total, pagination));
};

exports.createRegistrationLink = async (req, res) => {
  const subject = getSubjectId(req);
  const { sections = [], expiresAt } = req.body;
  if (!subject) return res.status(400).json({ message: 'Subject required' });
  if (!expiresAt) return res.status(400).json({ message: 'Expiration date required' });
  if (!canAccessSubject(req, subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });

  const expiresDate = new Date(expiresAt);
  if (Number.isNaN(expiresDate.getTime()) || expiresDate.getTime() <= Date.now()) {
    return res.status(400).json({ message: 'Expiration must be a future date/time' });
  }

  const subjectDoc = await Subject.findById(subject);
  if (!subjectDoc) return res.status(404).json({ message: 'Subject not found' });

  const uniqueSections = [...new Set(sections.filter(Boolean).map((id) => id.toString()))];
  if (uniqueSections.length) {
    const validCount = await Section.countDocuments({
      _id: { $in: uniqueSections },
      subject,
      createdBy: getOwnerId(req),
    });
    if (validCount !== uniqueSections.length) {
      return res.status(400).json({ message: 'All selected blocks must belong to the selected subject' });
    }
  }

  const link = await RegistrationLink.create({
    subject,
    sections: uniqueSections,
    expiresAt: expiresDate,
    createdBy: getOwnerId(req),
  });

  const populated = await RegistrationLink.findById(link._id)
    .populate('subject', 'code title')
    .populate('sections', 'block')
    .populate('createdBy', 'name email');

  res.status(201).json(populated);
};

exports.updateRegistrationLink = async (req, res) => {
  const link = await RegistrationLink.findById(req.params.id);
  if (!link) return res.status(404).json({ message: 'Registration link not found' });
  if (link.createdBy.toString() !== getOwnerId(req)?.toString()) {
    return res.status(403).json({ message: 'This registration link belongs to another instructor' });
  }
  if (!canAccessSubject(req, link.subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });

  if (typeof req.body.isActive === 'boolean') link.isActive = req.body.isActive;
  if (req.body.expiresAt) {
    const expiresDate = new Date(req.body.expiresAt);
    if (Number.isNaN(expiresDate.getTime())) return res.status(400).json({ message: 'Invalid expiration date' });
    link.expiresAt = expiresDate;
  }
  await link.save();

  const populated = await RegistrationLink.findById(link._id)
    .populate('subject', 'code title')
    .populate('sections', 'block')
    .populate('createdBy', 'name email');

  res.json(populated);
};

const parseMembers = (members) => {
  if (Array.isArray(members)) return members;
  if (typeof members !== 'string') return [];
  try {
    const parsed = JSON.parse(members);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

exports.deleteRegistrationLink = async (req, res) => {
  const link = await RegistrationLink.findById(req.params.id);
  if (!link) return res.status(404).json({ message: 'Registration link not found' });
  if (link.createdBy.toString() !== getOwnerId(req)?.toString()) {
    return res.status(403).json({ message: 'This registration link belongs to another instructor' });
  }
  if (!canAccessSubject(req, link.subject)) {
    return res.status(403).json({ message: 'You are not assigned to this subject' });
  }

  await link.deleteOne();
  res.json({ message: 'Registration link removed. Existing registered groups were not deleted.' });
};

exports.getPublicRegistrationLink = async (req, res) => {
  const { link, error } = await findUsableLink(req.params.token);
  if (error) return res.status(403).json({ message: error });

  const allowedSectionIds = (link.sections || []).map((section) => section._id.toString());
  const sectionFilter = allowedSectionIds.length
    ? { _id: { $in: allowedSectionIds } }
    : { subject: link.subject._id, createdBy: link.createdBy._id };

  const sections = await Section.find(sectionFilter)
    .select('name block subject')
    .populate('subject', 'code title')
    .sort({ block: 1 });

  res.json({
    token: link.token,
    subject: link.subject,
    sections,
    expiresAt: link.expiresAt,
    createdBy: link.createdBy,
  });
};

exports.registerGroupWithLink = async (req, res) => {
  const { link, error } = await findUsableLink(req.params.token);
  if (error) return res.status(403).json({ message: error });

  const { name, section } = req.body;
  const members = parseMembers(req.body.members);
  if (!name || !section) return res.status(400).json({ message: 'Name and section required' });

  const sectionDoc = await Section.findById(section);
  if (!sectionDoc) return res.status(404).json({ message: 'Section not found' });
  if (sectionDoc.subject.toString() !== link.subject._id.toString()) {
    return res.status(400).json({ message: 'Selected block does not belong to this registration subject' });
  }
  if (!sectionDoc.createdBy || sectionDoc.createdBy.toString() !== link.createdBy._id.toString()) {
    return res.status(400).json({ message: 'Selected block does not belong to this registration instructor' });
  }

  const allowedSectionIds = (link.sections || []).map((s) => s._id.toString());
  if (allowedSectionIds.length && !allowedSectionIds.includes(sectionDoc._id.toString())) {
    return res.status(400).json({ message: 'Selected block is not allowed for this registration link' });
  }

  const existing = await Group.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
    section,
  });
  if (existing) {
    return res.status(400).json({ message: `A group with the name "${name}" already exists in this block.` });
  }

  const group = await Group.create({
    name,
    section,
    createdBy: link.createdBy._id,
    members: members || [],
  });

  if (req.file) {
    const storagePath = buildProposalPath({
      instructorId: link.createdBy._id,
      subjectId: link.subject._id,
      groupId: group._id,
      originalName: req.file.originalname,
    });

    try {
      await uploadProposalFile({
        buffer: req.file.buffer,
        storagePath,
        mimeType: req.file.mimetype,
      });
      group.proposalFile = {
        path: storagePath,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date(),
      };
      await group.save();
    } catch (err) {
      await group.deleteOne();
      return res.status(502).json({
        message: err.message === 'Supabase Storage is not configured'
          ? 'Proposal upload is not configured yet. Please contact the instructor.'
          : 'Proposal upload failed. Please try again.',
      });
    }
  }

  res.status(201).json(group);
};

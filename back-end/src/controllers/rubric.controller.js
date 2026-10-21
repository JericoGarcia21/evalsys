const Rubric = require('../models/Rubric');
const Admin = require('../models/Admin');
const { getPagination, paginatedPayload } = require('../utils/pagination');

const getSubjectId = (req) => req.headers['x-subject-id'] || req.query.subject || req.body.subject;
const canAccessSubject = (req, subjectId) => (
  !subjectId ||
  req.user?.role === 'superadmin' ||
  (req.user?.assignedSubjects || []).some((id) => id.toString() === subjectId.toString())
);

const getOwnerFilter = (ownerId) => (
  ownerId
    ? { createdBy: ownerId }
    : { $or: [{ createdBy: { $exists: false } }, { createdBy: null }] }
);

const getRubricOwnerId = async (req, subject) => {
  if (req.user?.role === 'panel') {
    if (req.user.createdBy) {
      const instructor = await Admin.findOne({
        _id: req.user.createdBy,
        role: 'admin',
        isActive: true,
        assignedSubjects: subject,
      }).select('_id');
      return instructor?._id || null;
    }
    const instructor = await Admin.findOne({ role: 'admin', assignedSubjects: subject }).select('_id').sort({ createdAt: -1 });
    return instructor?._id || null;
  }

  if (req.user?.role === 'admin') return req.user._id;
  return req.query.createdBy || req.headers['x-instructor-id'] || null;
};

const canManageRubric = (req, rubric) => (
  req.user?.role === 'superadmin' ||
  (rubric.createdBy && rubric.createdBy.toString() === req.user?._id.toString()) ||
  (req.user?.role === 'admin' && !rubric.createdBy && canAccessSubject(req, rubric.subject))
);

const ensureRubricOwner = async (req, rubric) => {
  if (req.user?.role !== 'admin' || rubric.createdBy) return rubric;
  rubric.createdBy = req.user._id;
  await rubric.save();
  return rubric;
};

const claimUnownedSubjectRubrics = async (subject, ownerId) => {
  if (!subject || !ownerId) return;
  await Rubric.updateMany(
    {
      subject,
      $or: [{ createdBy: { $exists: false } }, { createdBy: null }],
    },
    { createdBy: ownerId }
  );
};

const validateRubricPayload = ({ title, criteria }) => {
  if (!String(title || '').trim()) return 'Rubric title is required';
  if (!Array.isArray(criteria) || criteria.length === 0) return 'Add at least one evaluation criteria';

  const criteriaKeys = new Set();
  const criteriaLabels = new Set();

  for (let ci = 0; ci < criteria.length; ci++) {
    const c = criteria[ci];
    const criteriaLabel = String(c?.label || '').trim();
    const criteriaKey = String(c?.key || '').trim();
    const maxScore = Number(c?.maxScore);
    const criteriaName = criteriaLabel || `Criteria ${ci + 1}`;

    if (!criteriaLabel) return `Criteria ${ci + 1}: name is required`;
    if (!criteriaKey) return `${criteriaName}: system key is required`;
    if (!Number.isFinite(maxScore) || maxScore <= 0) return `${criteriaName}: max score must be greater than 0`;

    const normalizedKey = criteriaKey.toLowerCase();
    if (c.section !== undefined && typeof c.section !== 'string') return 'Section must be text';
    if (c.description !== undefined && typeof c.description !== 'string') return 'Criterion description must be text';
    if (c.scoringMode && !['range', 'percentage'].includes(c.scoringMode)) return 'Invalid scoring mode';
    const normalizedLabel = `${String(c.section || '').trim().toLowerCase()}:${criteriaLabel.toLowerCase()}`;
    if (criteriaKeys.has(normalizedKey)) return `${criteriaName}: criteria key is duplicated`;
    if (criteriaLabels.has(normalizedLabel)) return `${criteriaName}: criteria name is duplicated`;
    criteriaKeys.add(normalizedKey);
    criteriaLabels.add(normalizedLabel);

    if (!Array.isArray(c.levels) || c.levels.length === 0) {
      return `${criteriaName}: add at least one score level`;
    }

    const levelLabels = new Set();
    const ranges = [];
    for (let li = 0; li < c.levels.length; li++) {
      const level = c.levels[li];
      const levelLabel = String(level?.label || '').trim();
      const minScore = Number(level?.minScore);
      const levelMaxScore = Number(level?.maxScore);
      const levelName = levelLabel || `Level ${li + 1}`;
      if (c.scoringMode === 'percentage') {
        const percentage = level?.percentage;
        const expected = Math.round(maxScore * percentage) / 100;
        if (typeof percentage !== 'number' || !Number.isFinite(percentage) || percentage < 0 || percentage > 100 ||
          minScore !== expected || levelMaxScore !== expected) return `${criteriaName}: percentage ratings must match their calculated points`;
      }

      if (!levelLabel) return `${criteriaName}: level ${li + 1} name is required`;
      const normalizedLevel = levelLabel.toLowerCase();
      if (levelLabels.has(normalizedLevel)) return `${criteriaName}: level "${levelLabel}" is duplicated`;
      levelLabels.add(normalizedLevel);

      if (!Number.isFinite(minScore) || !Number.isFinite(levelMaxScore)) {
        return `${criteriaName} - ${levelName}: range must be valid numbers`;
      }
      if (minScore < 0 || levelMaxScore < 0) {
        return `${criteriaName} - ${levelName}: range cannot be negative`;
      }
      if (minScore > levelMaxScore) {
        return `${criteriaName} - ${levelName}: minimum score cannot be higher than maximum score`;
      }
      if (levelMaxScore > maxScore) {
        return `${criteriaName} - ${levelName}: range cannot exceed criteria max score (${maxScore})`;
      }

      ranges.push({ min: minScore, max: levelMaxScore, label: levelLabel });
    }

    const sortedRanges = ranges.slice().sort((a, b) => a.min - b.min || a.max - b.max);
    for (let i = 1; i < sortedRanges.length; i++) {
      const previous = sortedRanges[i - 1];
      const current = sortedRanges[i];
      if (current.min <= previous.max) {
        return `${criteriaName}: "${current.label}" overlaps with "${previous.label}"`;
      }
    }
  }

  return null;
};

const normalizeActiveRubrics = async (subject, ownerId) => {
  const activeRubrics = await Rubric.find({ subject, ...getOwnerFilter(ownerId), isActive: true }).sort({ createdAt: -1 });
  if (activeRubrics.length === 1) return activeRubrics[0];
  if (!activeRubrics.length) {
    const replacement = await Rubric.findOne({ subject, ...getOwnerFilter(ownerId) }).sort({ createdAt: -1 });
    if (!replacement) return null;
    replacement.isActive = true;
    await replacement.save();
    return replacement;
  }

  const [current, ...duplicates] = activeRubrics;
  await Rubric.updateMany(
    { _id: { $in: duplicates.map((rubric) => rubric._id) } },
    { isActive: false }
  );

  return current;
};

const DEFAULT_RUBRIC = {
  title: 'Project Defense Rubric',
  criteria: [
    {
      key: 'systemFunctionality',
      label: '1. System Functionality',
      maxScore: 25,
      levels: [
        { label: 'Excellent', minScore: 21, maxScore: 25, description: 'System is complete, responsive, and works without errors.' },
        { label: 'Good',      minScore: 16, maxScore: 20, description: 'System works with minimal issues.' },
        { label: 'Fair',      minScore: 11, maxScore: 15, description: 'System is partially working with several issues.' },
        { label: 'Poor',      minScore: 0,  maxScore: 10, description: 'System has many missing or non-working features.' },
      ],
    },
    {
      key: 'apiIntegration',
      label: '2. API Integration and Database',
      maxScore: 25,
      levels: [
        { label: 'Excellent', minScore: 21, maxScore: 25, description: 'Advanced API integration and database are fully working, secure, and accurate.' },
        { label: 'Good',      minScore: 16, maxScore: 20, description: 'API and database work with minor issues.' },
        { label: 'Fair',      minScore: 11, maxScore: 15, description: 'API/database works partially with noticeable errors.' },
        { label: 'Poor',      minScore: 0,  maxScore: 10, description: 'API/database is incomplete or not working properly.' },
      ],
    },
    {
      key: 'presentation',
      label: '3. Presentation and System Demonstration',
      maxScore: 15,
      levels: [
        { label: 'Excellent', minScore: 13, maxScore: 15, description: 'Presentation is clear, organized, and confident.' },
        { label: 'Good',      minScore: 10, maxScore: 12, description: 'Presentation is good with minor issues.' },
        { label: 'Fair',      minScore: 6,  maxScore: 9,  description: 'Presentation lacks clarity or has demonstration issues.' },
        { label: 'Poor',      minScore: 0,  maxScore: 5,  description: 'Presentation and demonstration are weak.' },
      ],
    },
    {
      key: 'uiUx',
      label: '4. User Interface and User Experience',
      maxScore: 10,
      levels: [
        { label: 'Excellent', minScore: 9, maxScore: 10, description: 'Interface is clean, responsive, and easy to use.' },
        { label: 'Good',      minScore: 7, maxScore: 8,  description: 'Interface is good with minimal issues.' },
        { label: 'Fair',      minScore: 4, maxScore: 6,  description: 'Interface is usable but inconsistent.' },
        { label: 'Poor',      minScore: 0, maxScore: 3,  description: 'Interface is confusing or difficult to use.' },
      ],
    },
    {
      key: 'qa',
      label: '5. Question and Answer',
      maxScore: 25,
      levels: [
        { label: 'Excellent', minScore: 21, maxScore: 25, description: 'Answers questions correctly and confidently.' },
        { label: 'Good',      minScore: 16, maxScore: 20, description: 'Answers most questions with minor mistakes.' },
        { label: 'Fair',      minScore: 11, maxScore: 15, description: 'Answers some questions but lacks confidence.' },
        { label: 'Poor',      minScore: 0,  maxScore: 10, description: 'Unable to answer most questions properly.' },
      ],
    },
  ],
};

// Get active rubric
exports.getActiveRubric = async (req, res) => {
  const subject = getSubjectId(req);
  if (!subject) return res.json(null);
  const ownerId = await getRubricOwnerId(req, subject);
  if (ownerId) await claimUnownedSubjectRubrics(subject, ownerId);
  if (ownerId) await normalizeActiveRubrics(subject, ownerId);
  let rubric = ownerId
    ? await Rubric.findOne({ subject, createdBy: ownerId, isActive: true }).populate('createdBy', 'name email')
    : null;
  res.json(rubric);
};

exports.getAllRubrics = async (req, res) => {
  const subject = getSubjectId(req);
  const filter = {};
  if (subject) {
    if (req.user.role !== 'panel' && !canAccessSubject(req, subject)) {
      return res.status(403).json({ message: 'You are not assigned to this subject' });
    }
    filter.subject = subject;
  } else if (req.user.role === 'panel') {
    return res.status(400).json({ message: 'Subject required' });
  } else if (req.user.role === 'admin') {
    filter.subject = { $in: req.user.assignedSubjects || [] };
  }
  if (req.user.role === 'admin') {
    filter.$or = [
      { createdBy: req.user._id },
      { createdBy: { $exists: false } },
      { createdBy: null },
    ];
  } else if (req.user.role === 'superadmin' && req.query.createdBy) {
    filter.createdBy = req.query.createdBy;
  }
  if (subject && req.user.role === 'admin') {
    await claimUnownedSubjectRubrics(subject, req.user._id);
    await normalizeActiveRubrics(subject, req.user._id);
  }
  const pagination = getPagination(req);
  const query = Rubric.find(filter)
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });
  if (!pagination) return res.json(await query);
  const [rubrics, total] = await Promise.all([
    query.skip(pagination.skip).limit(pagination.limit),
    Rubric.countDocuments(filter),
  ]);
  return res.json(paginatedPayload(rubrics, total, pagination));
};

exports.createRubric = async (req, res) => {
  const { title, criteria, instructions = '' } = req.body;
  if (typeof instructions !== 'string') return res.status(400).json({ message: 'Instructions must be text' });
  const subject = getSubjectId(req);
  const validationError = validateRubricPayload({ title, criteria });
  if (validationError) return res.status(400).json({ message: validationError });
  if (!subject) return res.status(400).json({ message: 'Subject required' });
  if (!canAccessSubject(req, subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });

  const hasRubric = await Rubric.exists({ subject, createdBy: req.user._id });
  const rubric = await Rubric.create({ title, criteria, instructions, subject, createdBy: req.user._id, isActive: !hasRubric });
  res.status(201).json(await rubric.populate('createdBy', 'name email'));
};

exports.updateRubric = async (req, res) => {
  const existing = await Rubric.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Rubric not found' });
  if (!canAccessSubject(req, existing.subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
  if (!canManageRubric(req, existing)) return res.status(403).json({ message: 'You can only edit rubrics you created' });
  await ensureRubricOwner(req, existing);
  if (req.body.title !== undefined || req.body.criteria !== undefined) {
    const validationError = validateRubricPayload({
      title: req.body.title ?? existing.title,
      criteria: req.body.criteria ?? existing.criteria,
    });
    if (validationError) return res.status(400).json({ message: validationError });
  }
  if (req.body.instructions !== undefined && typeof req.body.instructions !== 'string') return res.status(400).json({ message: 'Instructions must be text' });
  const updates = {};
  for (const key of ['title', 'criteria', 'instructions']) if (req.body[key] !== undefined) updates[key] = req.body[key];
  const rubric = await Rubric.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).populate('createdBy', 'name email');
  res.json(rubric);
};

exports.setActiveRubric = async (req, res) => {
  const existing = await Rubric.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Rubric not found' });
  if (!canAccessSubject(req, existing.subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
  if (!canManageRubric(req, existing)) return res.status(403).json({ message: 'You can only activate rubrics you created' });
  await ensureRubricOwner(req, existing);
  await Rubric.updateMany({ subject: existing.subject, ...getOwnerFilter(existing.createdBy) }, { isActive: false });
  const rubric = await Rubric.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true }).populate('createdBy', 'name email');
  if (!rubric) return res.status(404).json({ message: 'Rubric not found' });
  res.json(rubric);
};

exports.deleteRubric = async (req, res) => {
  const rubric = await Rubric.findById(req.params.id);
  if (!rubric) return res.status(404).json({ message: 'Rubric not found' });
  if (!canAccessSubject(req, rubric.subject)) return res.status(403).json({ message: 'You are not assigned to this subject' });
  if (!canManageRubric(req, rubric)) return res.status(403).json({ message: 'You can only delete rubrics you created' });
  await ensureRubricOwner(req, rubric);

  const wasActive = rubric.isActive;
  const subject = rubric.subject;
  const ownerId = rubric.createdBy;
  await rubric.deleteOne();

  if (wasActive) {
    const replacement = await Rubric.findOne({ subject, ...getOwnerFilter(ownerId), _id: { $ne: rubric._id } }).sort({ createdAt: -1 });
    if (replacement) {
      await Rubric.updateMany({ subject, ...getOwnerFilter(ownerId) }, { isActive: false });
      replacement.isActive = true;
      await replacement.save();
    }
  }

  res.json({ message: 'Rubric deleted' });
};

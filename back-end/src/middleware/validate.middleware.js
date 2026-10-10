const Rubric = require('../models/Rubric');

const validateScores = async (req, res, next) => {
  const { scores, rubricId } = req.body;
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) {
    return res.status(400).json({ message: 'Scores must be an object' });
  }
  if (req.user?.role === 'panel' && !rubricId) {
    return res.status(400).json({ message: 'Rubric is required for panel grading' });
  }
  const subject = req.headers['x-subject-id'] || req.body.subject;
  const rubric = rubricId
    ? await Rubric.findById(rubricId)
    : await Rubric.findOne({ isActive: true, ...(subject ? { subject } : {}) });
  if (!rubric) return res.status(404).json({ message: 'Rubric not found' });
  const keys = new Set(rubric.criteria.map(criterion => criterion.key));
  if (Object.keys(scores).some(key => !keys.has(key))) {
    return res.status(400).json({ message: 'Scores contain an unknown criterion' });
  }
  const validated = {};
  for (const { key, maxScore } of rubric.criteria) {
    const raw = scores[key];
    if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) {
      return res.status(400).json({ message: 'Missing score: ' + key });
    }
    const value = Number(raw);
    if (!['number', 'string'].includes(typeof raw) || !Number.isFinite(value) || value < 0 || value > maxScore) {
      return res.status(400).json({ message: 'Invalid value for ' + key });
    }
    validated[key] = Math.min(Math.round(value), maxScore);
  }
  req.body.scores = validated;
  next();
};

module.exports = { validateScores };

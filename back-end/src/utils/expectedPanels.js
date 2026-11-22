const { getAssignedPanels } = require('./panelAssignments');
const toIdString = value => (value?._id || value)?.toString?.() || '';

// Preserve the roster at first grading while allowing removals and historical submissions.
const resolveExpectedPanelIds = ({ group, sectionPanels = [], groupPanels = [], evaluations = [], panelCreatedAt = new Map() }) => {
  const snapshotIds = (group?.gradingPanelIds || []).map(toIdString).filter(Boolean);
  const assignedIds = getAssignedPanels(sectionPanels, groupPanels).map(toIdString).filter(Boolean);
  const submittedIds = evaluations.map(evaluation => toIdString(evaluation.panel)).filter(Boolean);
  if (snapshotIds.length) {
    const assignedSet = new Set(assignedIds);
    const expected = snapshotIds.filter(id => assignedSet.has(id) || submittedIds.includes(id));
    return { ids: expected.length ? expected : submittedIds, legacy: false };
  }
  if (!evaluations.length) return { ids: assignedIds, legacy: false };
  const submittedAt = evaluations.map(evaluation => new Date(evaluation.createdAt || evaluation.updatedAt || 0).getTime()).filter(Number.isFinite);
  const firstSubmittedAt = submittedAt.length ? Math.min(...submittedAt) : NaN;
  const existingIds = assignedIds.filter(id => {
    const createdAt = panelCreatedAt.get(id);
    return !createdAt || !Number.isFinite(firstSubmittedAt) || new Date(createdAt).getTime() <= firstSubmittedAt;
  });
  return { ids: Array.from(new Set([...existingIds, ...submittedIds])), legacy: true };
};

module.exports = { resolveExpectedPanelIds };

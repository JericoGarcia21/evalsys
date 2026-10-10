// Submission accepts both block-level and group-level assignments.
// Result completeness must use the same combined set, without duplicates.
const getAssignedPanels = (...lists) => {
  const panels = new Map();
  for (const panel of lists.flat()) {
    if (!panel) continue;
    const id = (panel._id || panel).toString();
    if (!panels.has(id)) panels.set(id, panel);
  }
  return [...panels.values()];
};
module.exports = { getAssignedPanels };

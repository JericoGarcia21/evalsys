const MaintenancePreset = require('../models/MaintenancePreset');
const { recordAuditLog } = require('../services/audit.service');
const { textFilter } = require('../utils/reporting');

exports.list = async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await MaintenancePreset.find().select('-nameKey').sort({ nameKey: 1 }).lean());
};
exports.create = async (req, res) => {
  const body = req.body || {};
  const name = textFilter(body, 'name', 60), message = textFilter(body, 'message', 250);
  if (!name || !message) return res.status(400).json({ message: 'Preset name and maintenance message are required' });
  if (typeof body.delayMinutes !== 'number' || ![0, 5, 15, 30].includes(body.delayMinutes)) return res.status(400).json({ message: 'Preset delay must be 0, 5, 15, or 30 minutes' });
  const duration = body.durationMinutes === undefined ? null : body.durationMinutes;
  if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 10080)) return res.status(400).json({ message: 'Preset duration must be 1–10,080 minutes or null for manual ending' });
  const preset = await MaintenancePreset.create({ name, nameKey: name.toLowerCase(), message, delayMinutes: body.delayMinutes, durationMinutes: duration, createdBy: req.user._id });
  await recordAuditLog(req, { action: 'maintenance.preset.create', entity: { type: 'maintenance-preset', id: preset._id, name }, metadata: { delayMinutes: preset.delayMinutes, durationMinutes: duration } });
  res.status(201).json(preset);
};
exports.remove = async (req, res) => {
  if (typeof req.params.id !== 'string' || !/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ message: 'Invalid preset ID' });
  const preset = await MaintenancePreset.findByIdAndDelete(req.params.id);
  if (!preset) return res.status(404).json({ message: 'Maintenance preset not found' });
  await recordAuditLog(req, { action: 'maintenance.preset.delete', entity: { type: 'maintenance-preset', id: preset._id, name: preset.name } });
  res.json({ message: 'Maintenance preset deleted. Running schedules are unchanged.' });
};

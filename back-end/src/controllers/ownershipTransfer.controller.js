const { inspectTransfer, transferOwnership } = require('../services/ownershipTransfer.service');
const { confirm } = require('../services/accountControl.service');

exports.preview = async (req, res) => {
  const plan = await inspectTransfer(req.body);
  res.json(plan.summary);
};
exports.execute = async (req, res) => {
  confirm(req, 'TRANSFER');
  const summary = await transferOwnership(req);
  res.json({ ...summary, message: 'Subject workspaces transferred. Records and file paths were preserved; affected accounts must sign in again.' });
};

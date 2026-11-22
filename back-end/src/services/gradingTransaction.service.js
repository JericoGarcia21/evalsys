const mongoose = require('mongoose');
const { atomic } = require('./accountControl.service');

// Standalone development databases may grade, but cannot perform semester rollover.
// On replicas, grade writes share a group write fence with rollover's group deletion.
const supportByDatabase = new WeakMap();
exports.withGradingTransaction = async work => {
  const db = mongoose.connection.db;
  if (!supportByDatabase.has(db)) {
    const hello = await db.admin().command({ hello: 1 });
    supportByDatabase.set(db, Boolean(hello.setName || hello.msg === 'isdbgrid'));
  }
  return supportByDatabase.get(db) ? atomic(work) : work(null);
};

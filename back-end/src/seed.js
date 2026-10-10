require('dotenv').config();
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const mongoose = require('mongoose');
const Admin = require('./models/Admin');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');

  const existing = await Admin.findOne({ email: 'admin@evalsys.com' });
  if (existing) {
    await Admin.deleteOne({ email: 'admin@evalsys.com' });
    console.log('Old admin account deleted.');
  }

  await Admin.create({
    name: 'Admin',
    email: 'admin@evalsys.com',
    password: 'admin123',
    role: 'admin',
    isActive: true,
  });

  console.log('Default admin created:');
  console.log('  Email   : admin@evalsys.com');
  console.log('  Password: admin123');
  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

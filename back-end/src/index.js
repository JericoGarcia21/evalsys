require('dotenv').config();
const dns = require('node:dns');
if (process.env.DNS_SERVERS) {
  dns.setServers(process.env.DNS_SERVERS.split(',').map(value => value.trim()).filter(Boolean));
}
const app = require('./app');
const connectDB = require('./config/db');
const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  app.listen(PORT, () => console.log('Server running on port ' + PORT));
};

start().catch((err) => {
  console.error('Server startup failed:', err.name || 'Error');
  process.exit(1);
});

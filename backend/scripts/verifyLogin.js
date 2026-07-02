require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');

const PORT = process.env.PORT || 8000;
const BASE = `http://127.0.0.1:${PORT}`;

const TEST_USERS = [
  { label: 'Super Admin', email: 'superadmin@hms.com', password: 'admin123' },
  { label: 'Admin', email: 'admin@hms.com', password: 'admin123' },
  { label: 'Doctor', email: 'doctor@hms.com', password: 'admin123' },
  { label: 'Receptionist', email: 'receptionist@hms.com', password: 'admin123' },
  { label: 'Pharmacist', email: 'pharmacist@hms.com', password: 'admin123' },
  { label: 'Lab Technician', email: 'lab@hms.com', password: 'admin123' },
];

const postJson = (path, body) =>
  new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });

const getJson = (path) =>
  new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    }).on('error', reject);
  });

const run = async () => {
  console.log(`Testing auth at ${BASE}\n`);

  const debug = await getJson('/api/debug-auth');
  console.log('GET /api/debug-auth:', debug.status, debug.body);

  const results = [];

  for (const user of TEST_USERS) {
    try {
      const res = await postJson('/api/auth/login', { email: user.email, password: user.password });
      const ok = res.status === 200 && res.body?.success && res.body?.token && res.body?.data?.role;
      results.push({
        user: user.label,
        email: user.email,
        status: res.status,
        success: ok,
        role: res.body?.data?.role || null,
        message: res.body?.message || (ok ? 'OK' : 'FAILED'),
      });
      console.log(`${ok ? 'PASS' : 'FAIL'} | ${user.label} | ${res.status} | ${res.body?.message || ''}`);
    } catch (err) {
      results.push({
        user: user.label,
        email: user.email,
        status: 0,
        success: false,
        role: null,
        message: err.message,
      });
      console.log(`FAIL | ${user.label} | ERROR | ${err.message}`);
    }
  }

  console.log('\n--- Login Test Results ---');
  console.table(results);

  const passed = results.filter((r) => r.success).length;
  console.log(`\n${passed}/${results.length} logins successful`);
  process.exit(passed === results.length ? 0 : 1);
};

run().catch((err) => {
  console.error('Verification failed:', err.message);
  process.exit(1);
});

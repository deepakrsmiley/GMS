const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      family: 4
    });

    console.log('✅ MongoDB Connected');

    const existing = await User.findOne({
      email: 'superadmin@hms.com'
    });

    if (existing) {
      console.log('⚠️ Super Admin already exists');
      process.exit(0);
    }

    await User.create({
      name: 'Super Admin',
      email: 'superadmin@hms.com',
      password: 'Admin@123',
      role: 'Super Admin',
      isActive: true
    });

    console.log('✅ Super Admin Created Successfully');

    await mongoose.connection.close();
    process.exit(0);

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

createAdmin();
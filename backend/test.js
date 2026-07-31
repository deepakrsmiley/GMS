require('dotenv').config();
const mongoose = require('mongoose');

async function testConnection() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      family: 4
    });

    console.log('✅ MongoDB Connected Successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ MongoDB Connection Failed');
    console.error(error);
    process.exit(1);
  }
}

testConnection();
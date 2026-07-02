require('dotenv').config();
require('express-async-errors');
require('./models');

const express = require('express');
const http = require('http');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/error');
const logger = require('./utils/logger');

// Route files
const auth = require('./routes/auth');
const patients = require('./routes/patients');
const op = require('./routes/op');
const ip = require('./routes/ip');
const billing = require('./routes/billing');
const serviceMaster = require('./routes/serviceMaster');
const pharmacy = require('./routes/pharmacy');
const suppliers = require('./routes/suppliers');
const lab = require('./routes/lab');
const beds = require('./routes/beds');
const rooms = require('./routes/rooms');
const staff = require('./routes/staff');
const dashboard = require('./routes/dashboard');
const departments = require('./routes/departments');
const branding = require('./routes/branding');
const appointments = require('./routes/appointments');
const prescriptions = require('./routes/prescriptions');
const assets = require('./routes/assets');
const assetComplaints = require('./routes/assetComplaints');
const shifts = require('./routes/shifts'); // <-- Shift Route

if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const originStr = String(origin);
    if (
      originStr.startsWith('http://localhost') ||
      originStr.startsWith('http://172.') ||
      originStr.startsWith('http://192.168.') ||
      originStr.startsWith('https://gms-hospital-software.netlify.app')
    ) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);

// Security
app.use(helmet());
app.use(mongoSanitize());

// Rate Limiter
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 500,
});

app.use('/api', limiter);

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS
app.use(cors(corsOptions));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Socket.IO
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('join:room', (room) => {
    socket.join(room);
  });

  socket.on('doctor:available', (data) => {
    io.emit('doctor:status', data);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// ==========================
// API ROUTES
// ==========================

app.use('/api/auth', auth);
app.use('/api/patients', patients);
app.use('/api/op', op);
app.use('/api/ip', ip);
app.use('/api/billing', billing);
app.use('/api/services', serviceMaster);
app.use('/api/pharmacy', pharmacy);

app.use('/api/suppliers', suppliers); // <-- ADDED THIS LINE

app.use('/api/lab', lab);
app.use('/api/beds', beds);
app.use('/api/rooms', rooms);
app.use('/api/staff', staff);
app.use('/api/dashboard', dashboard);
app.use('/api/departments', departments);
app.use('/api/branding', branding);
app.use('/api/appointments', appointments);
app.use('/api/prescriptions', prescriptions);
app.use('/api/assets', assets);
app.use('/api/asset-complaints', assetComplaints);
app.use('/api/shifts', shifts); // <-- ADDED THIS LINE

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date(),
  });
});

// Debug Auth
app.get('/api/debug-auth', (req, res) => {
  res.status(200).json({
    success: true,
    auth: 'working',
    jwtConfigured: !!(
      process.env.JWT_SECRET &&
      process.env.JWT_EXPIRE
    ),
    nodeEnv: process.env.NODE_ENV,
  });
});

// Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    server.listen(PORT, () => {
      logger.info(
        `Server running on port ${PORT} in ${process.env.NODE_ENV} mode`
      );
    });
  } catch (error) {
    logger.error(`Server startup failed: ${error.message}`);
    process.exit(1);
  }
};

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(
      `Port ${PORT} is already in use. Stop the existing backend or change PORT.`
    );
  } else {
    logger.error(`Server error: ${error.message}`);
  }

  process.exit(1);
});

startServer();

module.exports = { app, io };
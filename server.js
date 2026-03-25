require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const path        = require('path');
const connectDB   = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

/* ── Bootstrap ── */
const app  = express();
const PORT = process.env.PORT || 5000;

// Trust proxy is necessary for Rate Limiting to work on platforms like Render/Heroku
app.set('trust proxy', 1);

// Connect to MongoDB
connectDB();

/* ── Security middleware ── */
app.use(helmet({
  crossOriginResourcePolicy: false, // Allows images to be loaded from /uploads on the frontend
}));

app.use(cors({
  origin: [
    process.env.CLIENT_URL || 'http://localhost:3000',
    'https://fy-lashes.netlify.app',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://localhost:5173', // Adding common Vite port just in case
  ],
  credentials: true,
}));

/* ── Rate limiting ── */
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many requests, please try again later' },
}));

app.use('/api/orders', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many order requests, please try again later' },
}));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
}));

/* ── Body parsing ── */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ── Static files (uploaded images) ── */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ── Routes ── */
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders',   require('./routes/orders'));

/* ── Health check ── */
app.get('/api/health', (_, res) =>
  res.json({ success: true, message: 'Fy Lashes API is running 🌸', env: process.env.NODE_ENV })
);

/* ── 404 ── */
app.use((req, res) =>
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` })
);

/* ── Error handler ── */
app.use(errorHandler);

/* ── Seed admin on first run ── */
const seedAdmin = async () => {
  try {
    const Admin = require('./models/Admin');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@fylashes.com';
    const exists = await Admin.findOne({ email: adminEmail });
    
    if (!exists) {
      await Admin.create({
        email:    adminEmail,
        password: process.env.ADMIN_PASSWORD || 'Admin@1234',
      });
      console.log(`🌸 Admin seeded — ${adminEmail}`);
    }
  } catch (err) {
    console.error('❌ Admin seeding failed:', err.message);
  }
};

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
  await seedAdmin();
});

module.exports = app;
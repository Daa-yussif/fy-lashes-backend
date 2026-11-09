require('dotenv').config();

const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const path          = require('path');
const connectDB     = require('./config/db');
const errorHandler  = require('./middleware/errorHandler');

// ── Bootstrap ──────────────────────────────────────────────
const app    = express();
const PORT   = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
connectDB();

// ── Security ───────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));

// ── CORS ───────────────────────────────────────────────────
// Real frontend: https://fy-lashes.pages.dev
const allowedOrigins = [
  process.env.CLIENT_URL || 'https://fy-lashes.pages.dev',
  'https://fy-lashes.pages.dev',
  'https://fy-lashes-frontend.pages.dev',
];
if (!isProd) {
  allowedOrigins.push(
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://localhost:5173',
    'http://localhost:3000'
  );
}

// Also allow Cloudflare preview links like https://1aa97288.fy-lashes.pages.dev
const previewPattern = /^https:\/\/[a-z0-9-]+\.fy-lashes\.pages\.dev$/;

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl / server-to-server
    const ok = allowedOrigins.includes(origin) || previewPattern.test(origin);
    cb(null, ok);
  },
  credentials: true,
}));

// ── Rate limiting ──────────────────────────────────────────
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { success: false, message: 'Too many requests, please try again later' },
}));

app.use('/api/orders', rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { success: false, message: 'Too many order requests, please try again later' },
}));

app.use('/api/discounts', rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  message: { success: false, message: 'Too many requests, please try again later' },
}));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, max: 200,
}));

// ── Body parsing & sanitisation ────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(mongoSanitize());

// ── Static files ───────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/products',  require('./routes/products'));
app.use('/api/orders',    require('./routes/orders'));
app.use('/api/discounts', require('./routes/discounts'));

// ── Health check ───────────────────────────────────────────
app.get('/api/health', (_, res) =>
  res.json({ success: true, message: 'Fy Lashes API is running 🌸', env: process.env.NODE_ENV })
);

// ── 404 ────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` })
);

// ── Error handler ──────────────────────────────────────────
app.use(errorHandler);

// ── Seed admin ────────────────────────────────────────────
const seedAdmin = async () => {
  try {
    const Admin      = require('./models/Admin');
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPass  = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPass) {
      console.warn('⚠️  Admin credentials missing in ENV. Seeding skipped.');
      return;
    }
    const exists = await Admin.findOne({ email: adminEmail });
    if (!exists) {
      await Admin.create({ email: adminEmail, password: adminPass });
      console.log(`🌸 Admin seeded — ${adminEmail}`);
    }
  } catch (err) {
    console.error('❌ Admin seeding failed:', err.message);
  }
};

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  await seedAdmin();
});

module.exports = app;
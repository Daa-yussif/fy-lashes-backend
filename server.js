require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const connectDB  = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

/* ── Bootstrap ── */
const app  = express();
const PORT = process.env.PORT || 5000;

connectDB();

/* ── Security middleware ── */
app.use(helmet());
app.use(cors({
  origin: [
    process.env.CLIENT_URL || 'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
  ],
  credentials: true,
}));

/* ── Rate limiting ── */
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many requests, please try again later' },
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
  const Admin = require('./models/Admin');
  const exists = await Admin.findOne({ email: process.env.ADMIN_EMAIL });
  if (!exists) {
    await Admin.create({
      email:    process.env.ADMIN_EMAIL    || 'admin@fylashes.com',
      password: process.env.ADMIN_PASSWORD || 'Admin@1234',
    });
    console.log(`🌸  Admin seeded — ${process.env.ADMIN_EMAIL}`);
  }
};

app.listen(PORT, async () => {
  console.log(`🚀  Server running on port ${PORT} [${process.env.NODE_ENV}]`);
  await seedAdmin();
});

module.exports = app;
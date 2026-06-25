const express = require('express');
const jwt     = require('jsonwebtoken');
const Admin   = require('../models/Admin');
const { protect } = require('../middleware/auth');

const router = express.Router();

/* ── Generate JWT ── */
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

/* ─────────────────────────────────────────────
   POST /api/auth/login
   Body: { email, password }
───────────────────────────────────────────── */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin || !(await admin.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    res.json({
      success: true,
      token: signToken(admin._id),
      admin: { id: admin._id, email: admin.email },
    });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   GET /api/auth/me  (protected)
───────────────────────────────────────────── */
router.get('/me', protect, (req, res) => {
  res.json({ success: true, admin: req.admin });
});

/* ─────────────────────────────────────────────
   PUT /api/auth/password  (protected)
   Body: { currentPassword, newPassword }
───────────────────────────────────────────── */
router.put('/password', protect, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both passwords are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const admin = await Admin.findById(req.admin._id);
    if (!(await admin.matchPassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    admin.password = newPassword;
    await admin.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
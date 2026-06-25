/**
 * FY LASHES — Discounts Route
 * ─────────────────────────────────────────────────────────────
 * Save as  routes/discounts.js  in your backend, then add to server.js:
 *
 *   const discountsRouter = require('./routes/discounts');
 *   app.use('/api/discounts', discountsRouter);
 * ─────────────────────────────────────────────────────────────
 */

const express   = require('express');
const router    = express.Router();
const mongoose  = require('mongoose');

/* ── Schema ─────────────────────────────────────────────────── */
const discountSchema = new mongoose.Schema(
  {
    code:        { type: String, required: true, unique: true, uppercase: true, trim: true },
    type:        { type: String, enum: ['percentage', 'fixed'], required: true },
    value:       { type: Number, required: true, min: 0 },
    minOrder:    { type: Number, default: 0 },
    maxUses:     { type: Number, default: null },   // null = unlimited
    usedCount:   { type: Number, default: 0 },
    expiryDate:  { type: Date,   default: null },
    active:      { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Discount = mongoose.models.Discount || mongoose.model('Discount', discountSchema);

/* ── GET /api/discounts  (admin) ────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const discounts = await Discount.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: discounts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── GET /api/discounts/:id  (admin) ────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const d = await Discount.findById(req.params.id).lean();
    if (!d) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, data: d });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── POST /api/discounts  (admin) ───────────────────────────── */
router.post('/', async (req, res) => {
  try {
    const { code, type, value, minOrder, maxUses, expiryDate, active } = req.body;
    if (!code || !type || value == null) {
      return res.status(400).json({ success: false, message: 'code, type, and value are required.' });
    }
    const existing = await Discount.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: `Code "${code}" already exists.` });
    }
    const d = await Discount.create({ code, type, value, minOrder, maxUses, expiryDate, active });
    res.status(201).json({ success: true, data: d });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'That code already exists.' });
    }
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── PUT /api/discounts/:id  (admin) ────────────────────────── */
router.put('/:id', async (req, res) => {
  try {
    const allowed = ['code','type','value','minOrder','maxUses','expiryDate','active'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const d = await Discount.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!d) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, data: d });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── DELETE /api/discounts/:id  (admin) ─────────────────────── */
router.delete('/:id', async (req, res) => {
  try {
    const d = await Discount.findByIdAndDelete(req.params.id);
    if (!d) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── POST /api/discounts/validate  (public — called from cart) ─
   Body: { code, orderTotal }
   Returns: { success, type, value, discountAmt, message }       */
router.post('/validate', async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'No code provided.' });

    const d = await Discount.findOne({ code: code.toUpperCase() });

    if (!d)          return res.json({ success: false, message: 'Code not found.' });
    if (!d.active)   return res.json({ success: false, message: 'This code is no longer active.' });
    if (d.expiryDate && new Date(d.expiryDate) < new Date()) {
      return res.json({ success: false, message: 'This code has expired.' });
    }
    if (d.maxUses !== null && d.usedCount >= d.maxUses) {
      return res.json({ success: false, message: 'This code has reached its usage limit.' });
    }
    if (d.minOrder > 0 && orderTotal < d.minOrder) {
      return res.json({
        success: false,
        message: `Minimum order of GH₵ ${Number(d.minOrder).toFixed(2)} required for this code.`,
      });
    }

    const discountAmt = d.type === 'percentage'
      ? Math.min(orderTotal * (d.value / 100), orderTotal)
      : Math.min(d.value, orderTotal);

    res.json({
      success:     true,
      type:        d.type,
      value:       d.value,
      discountAmt: parseFloat(discountAmt.toFixed(2)),
    });
  } catch (err) {
    console.error('validate error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
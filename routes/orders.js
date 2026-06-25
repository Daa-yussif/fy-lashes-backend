/**
 * FY LASHES — Orders Route
 * ─────────────────────────────────────────────────────────────
 * Paste this file into your backend as  routes/orders.js
 * Then in your main app.js / server.js add:
 *
 *   const ordersRouter = require('./routes/orders');
 *   app.use('/api/orders', ordersRouter);
 *
 * Requires: mongoose already connected, auth middleware exported
 * from your existing auth setup (adjust the import path below).
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');

/* ── Auth middleware ─────────────────────────────────────────
   Adjust this path to match wherever your auth middleware lives.
   It should set req.user if the token is valid.
   If your middleware is inline in server.js, replicate it here. */
// const { protect } = require('../middleware/auth');

/* ── Order Schema ──────────────────────────────────────────── */
const orderSchema = new mongoose.Schema(
  {
    customer: {
      name:    { type: String, required: true },
      phone:   { type: String, required: true },
      address: { type: String, default: '' },
      note:    { type: String, default: '' },
    },
    items: [
      {
        productId: { type: String },          // kept for reference
        name:      { type: String, default: '' },
        price:     { type: Number, default: 0 },
        quantity:  { type: Number, default: 1 },
      },
    ],
    deliveryType: {
      type:    String,
      enum:    ['pickup', 'delivery'],
      default: 'pickup',
    },
    subtotal: { type: Number, default: 0 },
    total:    { type: Number, default: 0 },
    status: {
      type:    String,
      enum:    ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

/* Avoid model re-registration during hot-reloads */
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

/* ── POST /api/orders  (public — called from cart.html) ────── */
router.post('/', async (req, res) => {
  try {
    const { customer, items, deliveryType, subtotal, total, status } = req.body;

    if (!customer || !customer.name || !customer.phone) {
      return res.status(400).json({ success: false, message: 'Customer name and phone are required.' });
    }
    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'Order must contain at least one item.' });
    }

    const order = await Order.create({
      customer,
      items,
      deliveryType: deliveryType || 'pickup',
      subtotal:     Number(subtotal) || 0,
      total:        Number(total)    || 0,
      status:       status || 'pending',
    });

    return res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error('POST /api/orders error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── GET /api/orders  (admin only) ─────────────────────────── */
// Add  protect  before the handler if you have auth middleware:
// router.get('/', protect, async (req, res) => { ... });
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: orders });
  } catch (err) {
    console.error('GET /api/orders error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── PUT /api/orders/:id/status  (admin only) ───────────────── */
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    return res.json({ success: true, data: order });
  } catch (err) {
    console.error('PUT /api/orders/:id/status error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── GET /api/orders/stats/summary  (used by admin dashboard) ─ */
router.get('/stats/summary', async (req, res) => {
  try {
    const [totalOrders, pendingOrders, revenueResult, totalProducts] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.aggregate([{ $group: { _id: null, total: { $sum: '$total' } } }]),
      /* If you have a Product model, replace the line below */
      Promise.resolve([{ count: 0 }]),
    ]);

    /* Try to count products if the model exists */
    let productCount = 0;
    try {
      const Product = mongoose.model('Product');
      productCount = await Product.countDocuments();
    } catch { /* Product model not registered — skip */ }

    return res.json({
      success: true,
      data: {
        totalProducts:  productCount,
        totalOrders,
        pendingOrders,
        totalRevenue:   revenueResult[0]?.total || 0,
      },
    });
  } catch (err) {
    console.error('GET /api/orders/stats/summary error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
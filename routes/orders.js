const express = require('express');
const router  = express.Router();

// Use the shared model — NOT an inline schema
const Order = require('../models/Order');
const { protect } = require('../middleware/auth');

/* ── POST /api/orders  (PUBLIC — called from cart.html) ─────── */
router.post('/', async (req, res) => {
  try {
    const {
      customer,
      items,
      deliveryType,
      subtotal,
      total,
      discountCode,
      discountAmt,
      status,
    } = req.body;

    // Basic validation
    if (!customer || !customer.name || !customer.phone) {
      return res.status(400).json({
        success: false,
        message: 'Customer name and phone are required.',
      });
    }
    if (!items || !items.length) {
      return res.status(400).json({
        success: false,
        message: 'Order must contain at least one item.',
      });
    }

    // Map items — frontend sends { productId, name, price, quantity }
    const mappedItems = items.map(i => ({
      productId: String(i.productId || i.id || ''),
      name:      i.name,
      price:     Number(i.price)    || 0,
      quantity:  Number(i.quantity) || 1,
      image:     i.image || '',
    }));

    const order = await Order.create({
      customer,
      items:        mappedItems,
      deliveryType: deliveryType || 'pickup',
      subtotal:     Number(subtotal)    || 0,
      total:        Number(total)       || 0,
      discountCode: discountCode        || '',
      discountAmt:  Number(discountAmt) || 0,
      // Public customers can't choose their own status
      status:       'pending',
    });

    return res.status(201).json({ success: true, data: order });

  } catch (err) {
    console.error('POST /api/orders error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error.' });
  }
});

/* ── GET /api/orders  (ADMIN — protected) ───────────────────── */
router.get('/', protect, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: orders });
  } catch (err) {
    console.error('GET /api/orders error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── GET /api/orders/stats/summary  (ADMIN — protected) ─────── */
// NOTE: this route must be defined BEFORE  /:id  routes
router.get('/stats/summary', protect, async (req, res) => {
  try {
    const mongoose = require('mongoose');

    const [totalOrders, pendingOrders, revenueResult] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.aggregate([{ $group: { _id: null, total: { $sum: '$total' } } }]),
    ]);

    let productCount = 0;
    try {
      const Product = mongoose.model('Product');
      productCount = await Product.countDocuments();
    } catch { /* Product model not loaded yet — skip */ }

    return res.json({
      success: true,
      data: {
        totalProducts: productCount,
        totalOrders,
        pendingOrders,
        totalRevenue: revenueResult[0]?.total || 0,
      },
    });
  } catch (err) {
    console.error('GET /api/orders/stats/summary error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/* ── PUT /api/orders/:id/status  (ADMIN — protected) ────────── */
router.put('/:id/status', protect, async (req, res) => {
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

module.exports = router;
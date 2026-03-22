const express = require('express');
const Order   = require('../models/Order');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');

const router = express.Router();

/* ═══════════════════════════════════════════
   PUBLIC ROUTES
═══════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   POST /api/orders  — place a new order
   Body: { customer, items, deliveryType }
───────────────────────────────────────────── */
router.post('/', async (req, res, next) => {
  try {
    const { customer, items, deliveryType } = req.body;

    if (!customer?.name || !customer?.phone) {
      return res.status(400).json({ success: false, message: 'Customer name and phone are required' });
    }
    if (!items?.length) {
      return res.status(400).json({ success: false, message: 'Order must have at least one item' });
    }

    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product ${item.productId} not found` });
      }
      if (!product.inStock) {
        return res.status(400).json({ success: false, message: `"${product.name}" is out of stock` });
      }

      const qty = parseInt(item.quantity) || 1;
      orderItems.push({
        product:  product._id,
        name:     product.name,
        price:    product.price,
        quantity: qty,
        image:    product.image,
      });
      subtotal += product.price * qty;
    }

    const delivery = deliveryType === 'delivery' ? 10 : 0;
    const total    = subtotal + delivery;

    const order = await Order.create({
      customer,
      items: orderItems,
      subtotal,
      delivery,
      total,
      deliveryType: deliveryType || 'pickup',
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   ADMIN ROUTES (protected)
═══════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   GET /api/orders
   Query: status, page, limit
───────────────────────────────────────────── */
router.get('/', protect, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip   = (parseInt(page) - 1) * parseInt(limit);
    const total  = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('items.product', 'name image');

    res.json({
      success: true,
      total,
      page:  parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data:  orders,
    });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   GET /api/orders/:id
───────────────────────────────────────────── */
router.get('/:id', protect, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.product', 'name image price');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   PUT /api/orders/:id/status
   Body: { status }
───────────────────────────────────────────── */
router.put('/:id/status', protect, async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['pending','confirmed','processing','shipped','delivered','cancelled'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   DELETE /api/orders/:id
───────────────────────────────────────────── */
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, message: 'Order deleted' });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   GET /api/orders/stats/summary
───────────────────────────────────────────── */
router.get('/stats/summary', protect, async (req, res, next) => {
  try {
    const [totalOrders, totalRevenue, pending, products] = await Promise.all([
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.countDocuments({ status: 'pending' }),
      require('../models/Product').countDocuments(),
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        pendingOrders: pending,
        totalProducts: products,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
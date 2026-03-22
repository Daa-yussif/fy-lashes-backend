const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');

const router = express.Router();

/* ── Multer — local image upload ── */
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename:    (_, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `product-${Date.now()}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only JPEG, PNG and WebP images are allowed'));
  },
});

/* ═══════════════════════════════════════════
   PUBLIC ROUTES
═══════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   GET /api/products
   Query: category, featured, search, page, limit
───────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const { category, featured, search, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (featured === 'true') filter.featured = true;
    if (search)  filter.$text = { $search: search };

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      total,
      page:  parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data:  products,
    });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   GET /api/products/:id
───────────────────────────────────────────── */
router.get('/:id', async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════
   ADMIN ROUTES (protected)
═══════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   POST /api/products  — create
───────────────────────────────────────────── */
router.post('/', protect, upload.single('image'), async (req, res, next) => {
  try {
    const { name, description, price, category, inStock, featured, stock } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : (req.body.image || '');

    const product = await Product.create({
      name, description,
      price:    parseFloat(price),
      category,
      image,
      inStock:  inStock  !== undefined ? inStock  === 'true' : true,
      featured: featured !== undefined ? featured === 'true' : false,
      stock:    parseInt(stock) || 0,
    });

    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   PUT /api/products/:id  — update
───────────────────────────────────────────── */
router.put('/:id', protect, upload.single('image'), async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const fields = ['name', 'description', 'price', 'category', 'inStock', 'featured', 'stock'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        if (f === 'price')    product[f] = parseFloat(req.body[f]);
        else if (f === 'stock') product[f] = parseInt(req.body[f]);
        else if (f === 'inStock' || f === 'featured') product[f] = req.body[f] === 'true';
        else product[f] = req.body[f];
      }
    });

    if (req.file) {
      if (product.image?.startsWith('/uploads/')) {
        const old = path.join(__dirname, '..', product.image);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      product.image = `/uploads/${req.file.filename}`;
    } else if (req.body.image !== undefined) {
      product.image = req.body.image;
    }

    await product.save();
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────────────────────────
   DELETE /api/products/:id
───────────────────────────────────────────── */
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    if (product.image?.startsWith('/uploads/')) {
      const file = path.join(__dirname, '..', product.image);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    await product.deleteOne();
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
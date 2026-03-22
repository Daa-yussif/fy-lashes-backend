const express    = require('express');
const multer     = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const Product    = require('../models/Product');
const { protect } = require('../middleware/auth');

const router = express.Router();

/* ── Cloudinary config ── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ── Multer — Cloudinary storage ── */
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'fy-lashes',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 800, crop: 'limit', quality: 'auto' }],
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024 },
});

/* ═══════════════════════════════════════════
   PUBLIC ROUTES
═══════════════════════════════════════════ */

/* GET /api/products */
router.get('/', async (req, res, next) => {
  try {
    const { category, featured, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (category)            filter.category = category;
    if (featured === 'true') filter.featured = true;
    if (search)              filter.$text    = { $search: search };

    const skip     = (parseInt(page) - 1) * parseInt(limit);
    const total    = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({ success: true, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), data: products });
  } catch (err) { next(err); }
});

/* GET /api/products/:id */
router.get('/:id', async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════
   ADMIN ROUTES (protected)
═══════════════════════════════════════════ */

/* POST /api/products — create */
router.post('/', protect, upload.single('image'), async (req, res, next) => {
  try {
    const { name, description, price, category, inStock, featured, stock } = req.body;
    const image = req.file ? req.file.path : (req.body.image || '');

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
  } catch (err) { next(err); }
});

/* PUT /api/products/:id — update */
router.put('/:id', protect, upload.single('image'), async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const fields = ['name', 'description', 'price', 'category', 'inStock', 'featured', 'stock'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        if (f === 'price')                            product[f] = parseFloat(req.body[f]);
        else if (f === 'stock')                       product[f] = parseInt(req.body[f]);
        else if (f === 'inStock' || f === 'featured') product[f] = req.body[f] === 'true';
        else                                          product[f] = req.body[f];
      }
    });

    if (req.file) {
      if (product.image?.includes('cloudinary')) {
        const parts    = product.image.split('/');
        const publicId = `fy-lashes/${parts[parts.length - 1].split('.')[0]}`;
        await cloudinary.uploader.destroy(publicId).catch(() => {});
      }
      product.image = req.file.path;
    } else if (req.body.image !== undefined) {
      product.image = req.body.image;
    }

    await product.save();
    res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

/* DELETE /api/products/:id */
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    if (product.image?.includes('cloudinary')) {
      const parts    = product.image.split('/');
      const publicId = `fy-lashes/${parts[parts.length - 1].split('.')[0]}`;
      await cloudinary.uploader.destroy(publicId).catch(() => {});
    }

    await product.deleteOne();
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
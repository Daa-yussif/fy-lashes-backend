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
    folder:           'fy-lashes',
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

/*
  GET /api/products
  - No "limit" in the URL  -> returns ALL matching products (no limit)
  - ?limit=24&page=2       -> optional pagination if you ever want it
  - ?category=mink  ?featured=true  ?search=word  still work
*/
router.get('/', async (req, res, next) => {
  try {
    const { category, featured, search } = req.query;
    const filter = {};

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (featured === 'true') filter.featured = true;

    if (search) {
      filter.$or = [
        { name:        { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category:    { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Product.countDocuments(filter);

    // Only paginate when the client explicitly asks for a positive limit
    const limitNum = parseInt(req.query.limit);
    const pageNum = parseInt(req.query.page);
    const usePaging = Number.isInteger(limitNum) && limitNum > 0 &&
      Number.isInteger(pageNum) && pageNum > 0;

    let query = Product.find(filter).sort({ createdAt: -1 });
    let page  = 1;
    let pages = 1;

    if (usePaging) {
      page = pageNum;
      pages = Math.ceil(total / limitNum);
      query = query.skip((page - 1) * limitNum).limit(limitNum);
    }

    const products = await query;

    res.json({
      success: true,
      total,
      page,
      pages,
      count: products.length,
      data: products,
    });
  } catch (err) { next(err); }
});

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

router.post('/', protect, upload.single('image'), async (req, res, next) => {
  try {
    const { name, description, price, category, lashType, inStock, featured, stock } = req.body;
    const image = req.file ? req.file.path : (req.body.image || '');

    const product = await Product.create({
      name,
      description,
      price:    parseFloat(price),
      category, // cluster, mink, strip, accessories, BeginnerSet, glam
      lashType,
      image,
      inStock:  inStock  !== undefined ? inStock  === 'true' : true,
      featured: featured !== undefined ? featured === 'true' : false,
      stock:    parseInt(stock) || 0,
    });

    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.put('/:id', protect, upload.single('image'), async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const fields = ['name', 'description', 'price', 'category', 'lashType', 'inStock', 'featured', 'stock'];
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
        const filename = parts[parts.length - 1].split('.')[0];
        const publicId = `fy-lashes/${filename}`;
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

router.delete('/:id', protect, async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    if (product.image?.includes('cloudinary')) {
      const parts    = product.image.split('/');
      const filename = parts[parts.length - 1].split('.')[0];
      const publicId = `fy-lashes/${filename}`;
      await cloudinary.uploader.destroy(publicId).catch(() => {});
    }

    await product.deleteOne();
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
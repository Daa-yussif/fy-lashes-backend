const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Please add a product name'],
    trim: true
  },
  description: { 
    type: String, 
    required: [true, 'Please add a description'] 
  },
  price: { 
    type: Number, 
    required: [true, 'Please add a price'] 
  },
  category: { 
    type: String, 
    required: [true, 'Please add a category'],
    // Common values: cluster, mink, strip, accessories, BeginnerSet, glam
    trim: true
  },
  // lashType used for specific product attributes if needed
  lashType: { 
    type: String, 
    default: '', 
    index: false 
  }, 
  image: { 
    type: String, 
    default: 'no-photo.jpg' 
  },
  inStock: { 
    type: Boolean, 
    default: true 
  },
  featured: { 
    type: Boolean, 
    default: false 
  },
  stock: { 
    type: Number, 
    default: 0 
  }
}, { 
  timestamps: true,
  // Prevents Mongoose from building indexes automatically if they clash with old ones
  autoIndex: false 
});

// We include 'category' in the text index so search works for "Mink", "Strip", etc.
productSchema.index({ 
  name: 'text', 
  description: 'text', 
  category: 'text' 
});

module.exports = mongoose.model('Product', productSchema);
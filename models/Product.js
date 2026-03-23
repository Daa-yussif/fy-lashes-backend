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
    required: [true, 'Please add a category'] 
  },
  // FIX: index: false ensures MongoDB doesn't treat this as a Unique/Required key
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
  // FIX: autoIndex: false prevents the server from crashing if 
  // the database still has the old 'lashType_1' unique index.
  autoIndex: false 
});

// Create text index for search functionality
productSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Product', productSchema);
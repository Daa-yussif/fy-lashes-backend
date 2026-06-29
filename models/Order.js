const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  // productId comes in as a plain string from the cart (not an ObjectId ref)
  productId: { type: String, default: '' },
  name:      { type: String, required: true },
  price:     { type: Number, required: true },
  quantity:  { type: Number, required: true, min: 1 },
  image:     { type: String, default: '' },
}, { _id: false });

const orderSchema = new mongoose.Schema({

  customer: {
    name:    { type: String, required: true, trim: true },
    phone:   { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    note:    { type: String, default: '' },
  },

  items:        { type: [orderItemSchema], required: true },
  subtotal:     { type: Number, default: 0 },
  delivery:     { type: Number, default: 0 },
  total:        { type: Number, required: true },

  deliveryType: {
    type:    String,
    enum:    ['pickup', 'delivery'],
    default: 'pickup',
  },

  // Discount fields sent by cart.html
  discountCode: { type: String, default: '' },
  discountAmt:  { type: Number, default: 0 },

  status: {
    type:    String,
    enum:    ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },

  whatsappSent: { type: Boolean, default: false },

}, { timestamps: true });

// Guard against model re-registration during hot-reloads
module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
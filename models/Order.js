const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:     { type: String, required: true },
  price:    { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  image:    { type: String, default: '' },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  /* Customer info */
  customer: {
    name:    { type: String, required: true, trim: true },
    phone:   { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    note:    { type: String, default: '' },
  },

  /* Items */
  items:      { type: [orderItemSchema], required: true },
  subtotal:   { type: Number, required: true },
  delivery:   { type: Number, default: 0 },
  total:      { type: Number, required: true },

  /* Delivery type */
  deliveryType: {
    type: String,
    enum: ['pickup', 'delivery'],
    default: 'pickup',
  },

  /* Status */
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },

  /* WhatsApp order reference */
  whatsappSent: { type: Boolean, default: false },

}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
const jwt   = require('jsonwebtoken');
const Admin = require('../models/Admin');

const protect = async (req, res, next) => {
  let token;

  // 1. Check if Authorization header exists and starts with Bearer
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 2. If no token, block access immediately
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Not authorized — please log in' 
    });
  }

  try {
    // 🛡️ Extra Safety: Ensure the secret exists before trying to verify
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET is missing in environment variables');
      return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    // 3. Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Find the admin and attach to request (excluding password for safety)
    req.admin = await Admin.findById(decoded.id).select('-password');

    // 5. If admin was deleted but token is still "valid", block access
    if (!req.admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin account no longer exists' 
      });
    }

    // 6. Everything is good, move to the next function (the controller)
    next();
  } catch (err) {
    // This catches expired tokens or tampered-with tokens
    return res.status(401).json({ 
      success: false, 
      message: 'Session expired or invalid. Please log in again.' 
    });
  }
};

module.exports = { protect };
require('dotenv').config();
const jwt = require('jsonwebtoken');

const DEFAULT_DEV_SECRET = '8fbd@hG35kd93JK!hG2c90MZ';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_DEV_SECRET;

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_DEV_SECRET)) {
  console.warn('⚠️ WARNING: Using fallback JWT_SECRET in production. Set a strong secret in production environment.');
}

/**
 * Sign a JWT token with consistent claims and defaults
 * @param {Object} payload 
 * @param {Object} options 
 * @returns {string} token
 */
function signToken(payload, options = {}) {
  const defaultOptions = {
    expiresIn: '7d',
    algorithm: 'HS256'
  };
  return jwt.sign(payload, JWT_SECRET, { ...defaultOptions, ...options });
}

/**
 * Verify and decode a JWT token
 * @param {string} token 
 * @returns {Object} decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}

module.exports = {
  JWT_SECRET,
  signToken,
  verifyToken
};

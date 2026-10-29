const { verifyToken } = require('../utils/jwt');

function authMiddleware(req, res, next) {
  // Public paths that do not require authentication
  const publicPaths = [
    '/api/login',
    '/api/admin/login',
    '/api/admin/signup',
    '/api/SignUp/register',
    '/api/auth/forgot',
    '/api/auth/verify-otp',
    '/api/auth/reset'
  ];

  if (publicPaths.includes(req.path) || publicPaths.includes(req.originalUrl)) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token missing' });
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Invalid token claims' });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email || null,
      role: decoded.role || decoded.userType || 'employee',
      userType: decoded.userType || decoded.role || 'employee',
      type: decoded.type || decoded.role, companyId: decoded.companyId || null
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional auth helper: decodes token if present, but doesn't reject if absent
authMiddleware.optional = function (req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    if (decoded && decoded.id) {
      req.user = {
        id: decoded.id,
        email: decoded.email || null,
        role: decoded.role || decoded.userType || 'employee',
        userType: decoded.userType || decoded.role || 'employee',
        type: decoded.type || decoded.role
      };
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }
  next();
};

module.exports = authMiddleware;

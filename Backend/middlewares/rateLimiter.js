/**
 * Production-grade in-memory rate limiter middleware
 * Provides IP-based rate limiting with automatic cleanup
 */

function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000; // default 15 minutes
  const max = options.max || 30; // default 30 attempts per window
  const message = options.message || 'Too many requests, please try again later.';
  const hits = new Map();

  // Periodically clean up expired entries (every 5 minutes)
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  if (interval.unref) interval.unref();

  const limiter = (req, res, next) => {
    // Bypass in test environment if configured
    if (process.env.DISABLE_RATE_LIMITER === 'true' || process.env.NODE_ENV === 'test') {
      return next();
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.baseUrl || req.path}`;
    const now = Date.now();

    let record = hits.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        success: false,
        message,
        retryAfter: retryAfterSeconds
      });
    }

    next();
  };

  limiter.reset = () => hits.clear();

  return limiter;
}

// 15 attempts per 15 minutes for login
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts. Please try again after 15 minutes.'
});

// 10 registrations per hour from same IP
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: 'Too many registration attempts from this address. Please try again later.'
});

// 5 password reset requests per 15 minutes
const forgotPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset attempts. Please try again later.'
});

module.exports = {
  createRateLimiter,
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter
};

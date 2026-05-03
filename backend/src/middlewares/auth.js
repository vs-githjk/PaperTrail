const authService = require("../modules/auth/auth.service");

function getTokenFromRequest(req) {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "").trim();
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function optionalAuth(req, _res, next) {
  try {
    const token = getTokenFromRequest(req);
    req.user = token ? await authService.getUserForToken(token) : null;
    next();
  } catch (error) {
    req.user = null;
    next();
  }
}

async function requireAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    const user = token ? await authService.getUserForToken(token) : null;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { optionalAuth, requireAuth };

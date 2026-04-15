const authService = require("../modules/auth/auth.service");

function getTokenFromRequest(req) {
  const header = req.headers?.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
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
    return res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = { optionalAuth, requireAuth };

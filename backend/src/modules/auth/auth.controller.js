const authService = require("./auth.service");

class AuthController {
  async signup(req, res, next) {
    try {
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      const result = await authService.signup(payload);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      const result = await authService.login(payload);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  async me(req, res) {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.json({
      data: {
        user: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          createdAt: req.user.createdAt
        }
      }
    });
  }
}

module.exports = new AuthController();

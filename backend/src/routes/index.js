const { Router } = require("express");
const paperController = require("../modules/papers/paper.controller");
const authController = require("../modules/auth/auth.controller");
const { optionalAuth, requireAuth } = require("../middlewares/auth");

const router = Router();

router.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

router.post("/auth/signup", (req, res, next) => authController.signup(req, res, next));
router.post("/auth/login", (req, res, next) => authController.login(req, res, next));
router.get("/auth/me", requireAuth, (req, res, next) => authController.me(req, res, next));

router.get("/papers", (req, res, next) => paperController.list(req, res, next));
router.get("/search", optionalAuth, (req, res, next) => paperController.search(req, res, next));
router.post("/papers/save", (req, res, next) => paperController.save(req, res, next));
router.delete("/papers/saved/:id", requireAuth, (req, res, next) => paperController.deleteSavedPaper(req, res, next));
router.post("/research-trails/save", optionalAuth, (req, res, next) => paperController.saveTrail(req, res, next));
router.delete("/research-trails/:id", requireAuth, (req, res, next) => paperController.deleteResearchTrail(req, res, next));
router.get("/history", requireAuth, (req, res, next) => paperController.history(req, res, next));
router.delete("/history/:id", requireAuth, (req, res, next) => paperController.deleteHistoryItem(req, res, next));
router.delete("/history", requireAuth, (req, res, next) => paperController.clearHistory(req, res, next));
router.get("/workspace", optionalAuth, (req, res, next) => paperController.workspace(req, res, next));
router.post("/papers/ancestor-tree", optionalAuth, (req, res, next) => paperController.ancestors(req, res, next));

module.exports = router;

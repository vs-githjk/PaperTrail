const { Router } = require("express");
const paperController = require("../modules/papers/paper.controller");

const router = Router();

router.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

router.get("/papers", (req, res, next) => paperController.list(req, res, next));
router.get("/search", (req, res, next) => paperController.search(req, res, next));

module.exports = router;

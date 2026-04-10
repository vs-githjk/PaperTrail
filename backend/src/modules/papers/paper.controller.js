const paperService = require("./paper.service");

class PaperController {
  async list(req, res, next) {
    try {
      const limit = Number(req.query.limit) || 20;
      const papers = await paperService.getRecentPapers(limit);
      res.json({ data: papers });
    } catch (error) {
      next(error);
    }
  }

  async search(req, res, next) {
    try {
      const query = String(req.query.q || "");
      const limit = Number(req.query.limit) || 20;
      const papers = await paperService.searchPapers(query, limit);
      res.json({ data: papers });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PaperController();

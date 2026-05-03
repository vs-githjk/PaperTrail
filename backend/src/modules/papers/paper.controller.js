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
      const clarification = {
        focus: req.query.focus,
        material: req.query.material,
        goal: req.query.goal
      };
      const papers = await paperService.searchPapers(query, limit, req.user?.id || null, clarification);
      res.json(papers);
    } catch (error) {
      next(error);
    }
  }

  async workspace(req, res, next) {
    try {
      const limit = Number(req.query.limit) || 6;
      const workspace = await paperService.getWorkspaceSnapshot(limit, req.user?.id || null);
      res.json(workspace);
    } catch (error) {
      next(error);
    }
  }

  async ancestors(req, res, next) {
    try {
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      const graph = await paperService.getAncestorTree(payload);
      res.json(graph);
    } catch (error) {
      next(error);
    }
  }

  async save(req, res, next) {
    try {
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      const saved = await paperService.savePaperForWorkspace(payload);
      res.status(201).json(saved);
    } catch (error) {
      next(error);
    }
  }

  async saveTrail(req, res, next) {
    try {
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      const saved = await paperService.saveResearchTrailForWorkspace(payload, req.user?.id || null);
      res.status(201).json(saved);
    } catch (error) {
      next(error);
    }
  }

  async history(req, res, next) {
    try {
      const limit = Number(req.query.limit) || 20;
      const history = await paperService.getHistory(limit, req.user?.id || null);
      res.json(history);
    } catch (error) {
      next(error);
    }
  }

  async deleteHistoryItem(req, res, next) {
    try {
      await paperService.deleteHistoryEntry(req.user?.id, req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async clearHistory(req, res, next) {
    try {
      const payload = await paperService.clearHistory(req.user?.id);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  }

  async deleteSavedPaper(req, res, next) {
    try {
      await paperService.deleteSavedPaperForWorkspace(req.params.id, req.user?.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async deleteResearchTrail(req, res, next) {
    try {
      await paperService.deleteResearchTrailForWorkspace(req.params.id, req.user?.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PaperController();

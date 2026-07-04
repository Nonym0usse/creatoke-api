import express, { type Request, type Response } from "express";
import { Prospect } from "../../middleware/admin/Prospect.ts";
import verifyTokenMiddleware from "../../database/auth.ts";

const router = express.Router();
const prospect = new Prospect();

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

router.get("/list", verifyTokenMiddleware, async (_req: Request, res: Response) => {
  try {
    const data = await prospect.listProspects();
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.post("/create", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await prospect.createProspect(req.body);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.put("/update", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    await prospect.updateProspect(req.body);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.delete("/delete/:id", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    await prospect.deleteProspect(req.params.id);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.post("/send-presentation/:id", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    await prospect.sendPresentation(req.params.id);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.post("/mark-replied/:id", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    await prospect.markReplied(req.params.id);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

// Déclenchement manuel du job de relances (tests / rattrapage).
router.post("/run-sequence", verifyTokenMiddleware, async (_req: Request, res: Response) => {
  try {
    const result = await prospect.runSequence();
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

export default router;

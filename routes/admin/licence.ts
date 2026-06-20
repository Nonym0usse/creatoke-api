import express, { type Request, type Response } from "express";
import { Licence } from "../../middleware/admin/Licence.ts";
import verifyTokenMiddleware from "../../database/auth.ts";

const router = express.Router();
const licence = new Licence();

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

router.put("/update", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    await licence.updateLicence(req.body);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.get("/list-licence", async (_req: Request, res: Response) => {
  try {
    const data = await licence.listLicence();
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

export default router;

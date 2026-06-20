import express, { type Request, type Response } from "express";
import { Category } from "../../middleware/admin/Category.ts";
import verifyTokenMiddleware from "../../database/auth.ts";

const router = express.Router();
const category = new Category();

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

router.get("/getAllCategory", async (_req: Request, res: Response) => {
  try {
    const categories = await category.getAllCategory();
    res.status(200).json(categories);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.post("/delete", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await category.deleteCategory(req.body);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.post("/create-category", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    await category.createCategory(req.body);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.put("/create-background", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    await category.createBackground(req.body);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.get("/getBackgroundImg", async (_req: Request, res: Response) => {
  try {
    const img = await category.getBackgroundImg();
    res.status(200).json(img);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.put("/modify-text", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    await category.modifyText(req.body);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.get("/getlastText", async (_req: Request, res: Response) => {
  try {
    const texts = await category.getTexts();
    res.status(200).json(texts);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

export default router;

import express, { type Request, type Response } from "express";
import { Comment } from "../../middleware/admin/Comment.ts";
import verifyTokenMiddleware from "../../database/auth.ts";

const router = express.Router();
const comment = new Comment();

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

router.post("/create", async (req: Request, res: Response) => {
  try {
    await comment.createComment(req.body);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.get("/list/:id", async (req: Request, res: Response) => {
  try {
    const data = await comment.getComments(req.params.id);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.get("/list-all", async (_req: Request, res: Response) => {
  try {
    const data = await comment.getAllComments();
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.delete("/delete/:id", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await comment.deleteComment(req.params.id);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

export default router;

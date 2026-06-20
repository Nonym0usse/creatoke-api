import express, { type Request, type Response } from "express";
import { MusicsAdmin } from "../../middleware/admin/MusicsAdmin.ts";
import verifyTokenMiddleware from "../../database/auth.ts";

const router = express.Router();
const musicsAdmin = new MusicsAdmin();

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

router.post("/create-music", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    await musicsAdmin.createMusic(req.body);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.get("/list-music", async (_req: Request, res: Response) => {
  try {
    const musics = await musicsAdmin.listMusics();
    res.status(200).json(musics);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.get("/single-music/:slug", async (req: Request, res: Response) => {
  try {
    const data = await musicsAdmin.singleMusic(req.params.slug);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.put("/update-music", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    await musicsAdmin.updateMusic(req.body);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.delete("/delete-music/:id", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    await musicsAdmin.deleteMusic(req.params.id);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.get("/highlight-music", async (_req: Request, res: Response) => {
  try {
    const data = await musicsAdmin.highlightMusic();
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.post("/getSongByCategory/", async (req: Request, res: Response) => {
  try {
    const data = await musicsAdmin.getSongByCategory(req.body);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.get("/preview-searching/:limit", async (req: Request, res: Response) => {
  try {
    const data = await musicsAdmin.searchRecommandSongs(req.params.limit);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

router.get("/searching/:term", async (req: Request, res: Response) => {
  try {
    const data = await musicsAdmin.search(req.params.term);
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

export default router;

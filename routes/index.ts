import express, { type Request, type Response } from "express";
import { Music } from "../middleware/Music.ts";

const router = express.Router();
const music = new Music();

/* GET home page. */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const musics = await music.getMusics();
    res.status(200).json(musics);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal error" });
  }
});

export default router;

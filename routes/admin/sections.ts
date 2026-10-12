import express, { type Request, type Response } from "express";
import verifyTokenMiddleware from "../../database/auth.ts";
import { SECTION_ERRORS, Sections } from "../../middleware/admin/Sections.ts";

// Rubriques du catalogue : lecture publique (menu du site), modification réservée à l'admin.
const router = express.Router();
const sections = new Sections();

const fail = (res: Response, error: unknown) => {
  const code = error instanceof Error ? error.message : "";
  if (SECTION_ERRORS[code]) {
    res.status(code === "SECTION_NOT_FOUND" ? 404 : 400).json({ error: code, message: SECTION_ERRORS[code] });
    return;
  }
  console.error("Sections:", error instanceof Error ? error.message : error);
  res.status(500).json({ error: "SECTIONS_FAILED" });
};

router.get("/", async (_req: Request, res: Response) => {
  try {
    res.json({ data: await sections.list() });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    res.status(201).json({ data: await sections.create(req.body ?? {}) });
  } catch (error) {
    fail(res, error);
  }
});

router.put("/:slug", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    res.json({ data: await sections.update(String(req.params.slug), req.body ?? {}) });
  } catch (error) {
    fail(res, error);
  }
});

router.delete("/:slug", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    await sections.delete(String(req.params.slug));
    res.json({ success: "OK" });
  } catch (error) {
    fail(res, error);
  }
});

export default router;

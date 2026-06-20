import express, { type Request, type Response } from "express";
import { admin } from "../../database/firebase.ts";
import verifyTokenMiddleware from "../../database/auth.ts";

const router = express.Router();

router.post("/refresh-token", verifyTokenMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user?.uid) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const newIdToken = await admin.auth().createCustomToken(req.user.uid);
    res.json({ idToken: newIdToken });
  } catch {
    res.status(500).json({ error: "Token refresh failed" });
  }
});

export default router;

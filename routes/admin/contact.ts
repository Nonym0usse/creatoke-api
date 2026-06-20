import express, { type Request, type Response } from "express";
import { Contact } from "../../middleware/admin/Contact.ts";

const router = express.Router();
const contact = new Contact();

router.post("/send-email", async (req: Request, res: Response) => {
  try {
    await contact.sendEmail(req.body);
    res.status(200).json({ success: "OK" });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;

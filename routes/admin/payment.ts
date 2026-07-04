import express, { type Request, type Response } from "express";
import validator from "validator";
import { Payment } from "../../middleware/admin/Payment.ts";
import verifyTokenMiddleware from "../../database/auth.ts";

const router = express.Router();
const payment = new Payment();

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

router.post("/create", async (req: Request, res: Response) => {
  try {
    const { email_client, price } = req.body ?? {};
    if (!email_client || !validator.isEmail(String(email_client))) {
      res.status(400).json({ error: "INVALID_EMAIL" });
      return;
    }
    if (price === undefined || Number.isNaN(Number(price))) {
      res.status(400).json({ error: "INVALID_PRICE" });
      return;
    }

    const createPayment = await payment.createPayment(req.body);
    res.status(200).json({ songUrlDownload: createPayment.songUrlDownload });

    // Facture + email de livraison en arrière-plan : ne doit jamais bloquer
    // ni faire échouer la réponse à l'acheteur.
    payment.processPostPayment(createPayment).catch((error) => {
      console.error("Post-payment processing failed:", errorMessage(error));
    });
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(400).json({ error: errorMessage(error) || "Payment creation failed" });
  }
});

router.get("/list-sell", verifyTokenMiddleware, async (_req: Request, res: Response) => {
  try {
    const data = await payment.getPaymentFromCurrentYear();
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});

export default router;

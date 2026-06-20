import type { Request, Response, NextFunction } from "express";
import { admin } from "./firebase.ts";

const verifyTokenMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = req.headers.authorization?.split(" ")[1]; // Expecting "Bearer <token>"
  if (!token || token === "null") {
    res.status(401).json({ message: "No token provided, authorization denied" });
    return;
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Error verifying token:", error);
    res.status(401).json({ message: "Token verification failed, authorization denied" });
  }
};

export default verifyTokenMiddleware;

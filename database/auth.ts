import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/auth.ts";

const verifyTokenMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.split(" ")[1]; // Expecting "Bearer <token>"
  if (!token || token === "null") {
    res.status(401).json({ message: "No token provided, authorization denied" });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch (error) {
    console.error("Error verifying token:", error instanceof Error ? error.message : error);
    res.status(401).json({ message: "Token verification failed, authorization denied" });
  }
};

export default verifyTokenMiddleware;

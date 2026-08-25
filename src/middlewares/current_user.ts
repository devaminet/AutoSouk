import { NextFunction, Request, Response } from "express";
import { verifyJWT } from "../utils/functions";

export default async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return next();
  }

  try {
    const token = authHeader.split("Bearer ")?.[1];
    if (!token) {
      return next();
    }
    const decoded = await verifyJWT<{
      id: number;
      email: string;
      role: string;
    }>(token);
    req.currentUser = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };
  } catch (error) {
    console.log("Error in current user middleware", error);
  }

  next();
};

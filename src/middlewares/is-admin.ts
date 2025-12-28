import { NextFunction, Request, Response } from "express";
import { NotAuthorizedError } from "../errors/not-authorized-error";
import { NotAllowedError } from "../errors/not-allowed";

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.currentUser) {
    return next(new NotAuthorizedError());
  }

  if (req.currentUser.role !== "admin") {
    return next(new NotAllowedError());
  }

  return next();
};

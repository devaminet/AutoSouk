import { NextFunction, Request, Response } from "express";
import { NotAllowedError } from "../errors/not-allowed";
import { NotAuthorizedError } from "../errors/not-authorized-error";

export const isSeller = (req: Request, res: Response, next: NextFunction) => {
  if (!req.currentUser) {
    return next(new NotAuthorizedError());
  }

  if (req.currentUser.role !== "seller") {
    throw new NotAllowedError();
  }
  next();
};

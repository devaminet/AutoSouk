import { NextFunction, Request, Response } from "express";
import { NotAllowedError } from "../errors/not_allowed";
import { NotAuthorizedError } from "../errors/not_authorized_error";

export const isSeller = (req: Request, res: Response, next: NextFunction) => {
  if (!req.currentUser) {
    return next(new NotAuthorizedError());
  }

  if (req.currentUser.role !== "seller") {
    throw new NotAllowedError();
  }
  next();
};

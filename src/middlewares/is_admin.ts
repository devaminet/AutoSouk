import { NextFunction, Request, Response } from "express";
import { NotAuthorizedError } from "../errors/not_authorized_error";
import { NotAllowedError } from "../errors/not_allowed";

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.currentUser) {
    return next(new NotAuthorizedError());
  }

  if (req.currentUser.role !== "admin") {
    return next(new NotAllowedError());
  }

  return next();
};

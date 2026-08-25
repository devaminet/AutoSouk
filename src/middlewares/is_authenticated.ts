import { NextFunction, Request, Response } from "express";
import { NotAuthorizedError } from "../errors/not_authorized_error";

export default (req: Request, res: Response, next: NextFunction) => {
  if (req.currentUser) {
    return next();
  }
  return next(new NotAuthorizedError());
};

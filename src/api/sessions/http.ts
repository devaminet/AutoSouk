import { Request, Response } from "express";
import {
  deviceCookieName,
  deviceCookieOptions,
  readCookie,
} from "../../utils/cookies";
import type { SignInContext, SignInResult } from "./services";

export const signInContext = (req: Request): SignInContext => ({
  deviceToken: readCookie(req, deviceCookieName),
  userAgent: req.get("user-agent"),
  ip: req.ip ?? null,
});

// Sets the cookies of a finished sign-in and returns the response body.
// A two-step challenge sets none: the user isn't signed in yet.
export const finishSignIn = (req: Request, res: Response, result: SignInResult) => {
  if (result.twoFactorRequired) {
    const { challengeToken, phoneHint, expiresAt } = result;
    return { twoFactorRequired: true, challengeToken, phoneHint, expiresAt };
  }
  req.session = { refreshToken: result.refreshToken };
  if (result.deviceToken) {
    res.cookie(deviceCookieName, result.deviceToken, deviceCookieOptions());
  }
  return { twoFactorRequired: false, accessToken: result.accessToken, user: result.user };
};

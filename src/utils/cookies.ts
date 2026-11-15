import { CookieOptions, Request } from "express";

// The cookie that remembers a device between sign-ins. It outlives the
// session cookie, which logging out clears.
export const deviceCookieName = "autosouk_device";

export const deviceCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 365 * 24 * 60 * 60 * 1000,
  path: "/api/auth",
});

// Reads one cookie from the request, without a cookie parser.
export const readCookie = (req: Request, name: string): string | null => {
  const header = req.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
};

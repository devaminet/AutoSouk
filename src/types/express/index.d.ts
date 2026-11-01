import type { Locale } from "../../i18n/config";

type AuthenticatedRole = "buyer" | "seller" | "mechanic" | "admin";

declare global {
  namespace Express {
    interface Request {
      session?:
        | (CookieSessionInterfaces.CookieSessionObject & {
            refreshToken?: string;
          })
        | null
        | undefined;
      locale: Locale;
      currentUser?: {
        id: number;
        email: string;
        role: AuthenticatedRole;
      };
    }
  }
}

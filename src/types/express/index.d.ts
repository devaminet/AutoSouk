export {};

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
      currentUser?: {
        id: number;
        email: string;
        role: AuthenticatedRole;
      };
    }
  }
}

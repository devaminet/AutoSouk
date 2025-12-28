export {};

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
        role: string;
      };
    }
  }
}

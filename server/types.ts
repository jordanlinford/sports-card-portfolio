import type { Request } from "express";

export interface AuthenticatedRequest extends Request {
  user: {
    claims: { sub: string };
    authProvider?: "google" | "replit" | "qa";
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  };
}

export function getUserId(req: AuthenticatedRequest): string {
  return req.user.claims.sub;
}

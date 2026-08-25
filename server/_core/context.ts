import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { reconcileOperationalRoleWithAssignments } from "../db";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (user) {
    try {
      user = await reconcileOperationalRoleWithAssignments(user);
    } catch (error) {
      console.warn("[Auth] Não foi possível reconciliar o perfil operacional", error);
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}

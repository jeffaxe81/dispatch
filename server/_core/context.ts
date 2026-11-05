import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { reconcileOperationalRoleWithAssignments } from "../db";
import { authenticateLocalRequest } from "../localAuth";

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
    user = await authenticateLocalRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (user) {
    try {
      user = await reconcileOperationalRoleWithAssignments(user);
    } catch {
      // A stale role must never survive an RBAC/tenant reconciliation failure.
      // Fail closed, and do not print identity/session details to server logs.
      console.warn("[Auth] Falha na validação de permissões; acesso negado.");
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}

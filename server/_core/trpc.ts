import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError, type core } from "zod";
import type { TrpcContext } from "./context";

// Human-readable labels for the field names most commonly validated across
// the app's procedures, used to turn a raw Zod validation failure into a
// message a user can act on instead of a dump of issue objects.
const ZOD_FIELD_LABELS: Record<string, string> = {
  username: "Usuário",
  password: "Senha",
  email: "E-mail",
  name: "Nome",
  code: "Código",
  reason: "Motivo",
  confirmation: "Confirmação",
  description: "Descrição",
  address: "Endereço",
  category: "Categoria",
};

function describeZodIssue(issue: core.$ZodIssue): string {
  const field = issue.path.length ? String(issue.path[issue.path.length - 1]) : "";
  const label = field ? (ZOD_FIELD_LABELS[field] ?? field) : "";

  let detail: string;
  switch (issue.code) {
    case "too_small":
      detail = issue.origin === "string" ? `deve ter pelo menos ${issue.minimum} caracteres` : `deve ser maior ou igual a ${issue.minimum}`;
      break;
    case "too_big":
      detail = issue.origin === "string" ? `deve ter no máximo ${issue.maximum} caracteres` : `deve ser menor ou igual a ${issue.maximum}`;
      break;
    case "invalid_type":
      detail = "é obrigatório";
      break;
    default:
      detail = issue.message;
  }

  return label ? `${label}: ${detail}.` : `${detail}.`;
}

function formatZodError(error: ZodError): string {
  return error.issues.map(describeZodIssue).join(" ");
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter(opts) {
    const { shape, error } = opts;
    if (error.cause instanceof ZodError) {
      return { ...shape, message: formatZodError(error.cause) };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

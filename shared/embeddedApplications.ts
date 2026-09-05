import { z } from "zod";

export const embeddedApplicationPermissionSchema = z.enum([
  "camera",
  "microphone",
  "clipboard-write",
]);

export const embeddedApplicationSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9-]{2,80}$/),
  name: z.string().trim().min(2).max(160),
  src: z.string().url().refine(value => value.startsWith("https://"), "A aplicação incorporada deve usar HTTPS."),
  origin: z.string().url().refine(value => {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === value;
  }, "Origin deve conter apenas protocolo HTTPS e host."),
  defaultHeight: z.number().int().min(240).max(2000),
  minHeight: z.number().int().min(160).max(1200),
  maxHeight: z.number().int().min(480).max(3000),
  maxWidth: z.number().int().min(320).max(4000).optional(),
  permissions: z.array(embeddedApplicationPermissionSchema).max(8),
  enabled: z.boolean(),
});

export type EmbeddedApplication = z.infer<typeof embeddedApplicationSchema>;

export const embeddedFrameMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TOGGLE_IFRAME_SIZE"),
    isExpanded: z.boolean(),
    width: z.number().finite().positive().max(10000).optional(),
    height: z.number().finite().positive().max(10000).optional(),
  }),
]);

export type EmbeddedFrameMessage = z.infer<typeof embeddedFrameMessageSchema>;

export const embeddedFrameInitMessageSchema = z.object({
  type: z.literal("init"),
  timestamp: z.number().int().nonnegative(),
});

export type EmbeddedFrameInitMessage = z.infer<typeof embeddedFrameInitMessageSchema>;

export const NEO_INTERACT_EMBEDDED_APPLICATION = embeddedApplicationSchema.parse({
  id: "neo-interact",
  name: "NEO Interact",
  src: "https://gscprj.saas.digitro.cloud/neo/",
  origin: "https://gscprj.saas.digitro.cloud",
  defaultHeight: 800,
  minHeight: 320,
  maxHeight: 1600,
  maxWidth: 1600,
  permissions: ["camera", "microphone", "clipboard-write"],
  enabled: true,
});

export const EMBEDDED_APPLICATIONS: readonly EmbeddedApplication[] = [
  NEO_INTERACT_EMBEDDED_APPLICATION,
];

export function parseEmbeddedFrameMessage(value: unknown) {
  return embeddedFrameMessageSchema.safeParse(value);
}

export function buildEmbeddedApplicationAllow(permissions: readonly string[]) {
  return permissions.join("; ");
}

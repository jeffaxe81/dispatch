import { z } from "zod";

export const MAX_WORKFLOW_CONDITION_DEPTH = 8;
export const MAX_WORKFLOW_CONDITION_CHILDREN = 50;

const fieldSchema = z.string().trim().min(1).max(180);
const primitiveValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const equalityConditionSchema = z.object({
  field: fieldSchema,
  operator: z.enum(["eq", "neq"]),
  value: primitiveValueSchema,
}).strict();

const presenceConditionSchema = z.object({
  field: fieldSchema,
  operator: z.enum(["present", "absent"]),
}).strict();

const comparisonConditionSchema = z.object({
  field: fieldSchema,
  operator: z.enum(["gt", "gte", "lt", "lte"]),
  valueType: z.enum(["number", "date"]),
  value: z.union([z.number(), z.string()]),
}).strict();

export type WorkflowCondition =
  | z.infer<typeof equalityConditionSchema>
  | z.infer<typeof presenceConditionSchema>
  | z.infer<typeof comparisonConditionSchema>
  | { all: WorkflowCondition[] }
  | { any: WorkflowCondition[] };

export const workflowConditionSchema: z.ZodType<WorkflowCondition> = z.lazy(() =>
  z.union([
    equalityConditionSchema,
    presenceConditionSchema,
    comparisonConditionSchema,
    z.object({
      all: z.array(workflowConditionSchema)
        .min(1, "Composição all não pode ser vazia.")
        .max(MAX_WORKFLOW_CONDITION_CHILDREN, "Composição all excede o limite de condições."),
    }).strict(),
    z.object({
      any: z.array(workflowConditionSchema)
        .min(1, "Composição any não pode ser vazia.")
        .max(MAX_WORKFLOW_CONDITION_CHILDREN, "Composição any excede o limite de condições."),
    }).strict(),
  ]),
);

export type WorkflowConditionContext = {
  fields: Record<string, unknown>;
  exposedFields: ReadonlySet<string>;
};

function requireExposedField(
  field: string,
  context: WorkflowConditionContext,
): unknown {
  if (!context.exposedFields.has(field)) {
    throw new Error(`Campo não exposto ao Workflow: ${field}.`);
  }
  return context.fields[field];
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} deve ser um número finito.`);
  }
  return value;
}

const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function requireIsoDate(value: unknown, label: string): number {
  if (typeof value !== "string" || !ISO_DATE_TIME_PATTERN.test(value)) {
    throw new Error(`${label} deve ser uma data ISO-8601 com timezone.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} deve ser uma data ISO-8601 válida.`);
  }
  return timestamp;
}

function compare(
  operator: "gt" | "gte" | "lt" | "lte",
  left: number,
  right: number,
) {
  switch (operator) {
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
  }
}

function evaluateParsed(
  condition: WorkflowCondition,
  context: WorkflowConditionContext,
  depth: number,
): boolean {
  if (depth > MAX_WORKFLOW_CONDITION_DEPTH) {
    throw new Error("Profundidade da condição excede o limite permitido.");
  }

  if ("all" in condition) {
    if (condition.all.length === 0) {
      throw new Error("Composição de condições all não pode ser vazia.");
    }
    return condition.all.every(child => evaluateParsed(child, context, depth + 1));
  }

  if ("any" in condition) {
    if (condition.any.length === 0) {
      throw new Error("Composição de condições any não pode ser vazia.");
    }
    return condition.any.some(child => evaluateParsed(child, context, depth + 1));
  }

  const fieldValue = requireExposedField(condition.field, context);

  if (condition.operator === "present") {
    return fieldValue !== null && fieldValue !== undefined;
  }
  if (condition.operator === "absent") {
    return fieldValue === null || fieldValue === undefined;
  }
  if (condition.operator === "eq") {
    return Object.is(fieldValue, condition.value);
  }
  if (condition.operator === "neq") {
    return !Object.is(fieldValue, condition.value);
  }

  if (condition.valueType === "number") {
    return compare(
      condition.operator,
      requireFiniteNumber(fieldValue, `Campo ${condition.field}`),
      requireFiniteNumber(condition.value, "Valor de comparação"),
    );
  }

  return compare(
    condition.operator,
    requireIsoDate(fieldValue, `Campo ${condition.field}`),
    requireIsoDate(condition.value, "Valor de comparação"),
  );
}

export function evaluateWorkflowCondition(
  input: unknown,
  context: WorkflowConditionContext,
): boolean {
  const condition = workflowConditionSchema.parse(input);
  return evaluateParsed(condition, context, 0);
}

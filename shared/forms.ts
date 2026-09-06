import { z } from "zod";

export const FORM_FIELD_TYPES = [
  "short_text", "long_text", "number", "currency", "date", "time", "date_time",
  "single_choice", "multiple_choice", "checkbox", "yes_no", "address", "geolocation",
  "image", "file", "simple_signature", "calculated", "section", "instruction",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

const fieldIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
const fieldKeySchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z][A-Za-z0-9_]*$/);
const labelSchema = z.string().trim().min(1).max(240);
const optionSchema = z.object({
  value: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(240),
}).strict();

const answerFieldBase = {
  id: fieldIdSchema,
  key: fieldKeySchema,
  label: labelSchema,
  required: z.boolean().default(false),
};

const textLimits = {
  minLength: z.number().int().nonnegative().max(100_000).optional(),
  maxLength: z.number().int().positive().max(100_000).optional(),
  pattern: z.string().max(500).optional(),
};

const numericLimits = {
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
};

const shortTextFieldSchema = z.object({ ...answerFieldBase, type: z.literal("short_text"), ...textLimits }).strict();
const longTextFieldSchema = z.object({ ...answerFieldBase, type: z.literal("long_text"), ...textLimits }).strict();
const numberFieldSchema = z.object({ ...answerFieldBase, type: z.literal("number"), ...numericLimits }).strict();
const currencyFieldSchema = z.object({ ...answerFieldBase, type: z.literal("currency"), currency: z.string().trim().length(3).optional(), ...numericLimits }).strict();
const dateFieldSchema = z.object({ ...answerFieldBase, type: z.literal("date") }).strict();
const timeFieldSchema = z.object({ ...answerFieldBase, type: z.literal("time") }).strict();
const dateTimeFieldSchema = z.object({ ...answerFieldBase, type: z.literal("date_time") }).strict();
const singleChoiceFieldSchema = z.object({ ...answerFieldBase, type: z.literal("single_choice"), options: z.array(optionSchema).min(1).max(500) }).strict();
const multipleChoiceFieldSchema = z.object({ ...answerFieldBase, type: z.literal("multiple_choice"), options: z.array(optionSchema).min(1).max(500), minSelections: z.number().int().nonnegative().optional(), maxSelections: z.number().int().positive().optional() }).strict();
const checkboxFieldSchema = z.object({ ...answerFieldBase, type: z.literal("checkbox") }).strict();
const yesNoFieldSchema = z.object({ ...answerFieldBase, type: z.literal("yes_no") }).strict();
const addressFieldSchema = z.object({ ...answerFieldBase, type: z.literal("address"), ...textLimits }).strict();
const geolocationFieldSchema = z.object({ ...answerFieldBase, type: z.literal("geolocation") }).strict();
const imageFieldSchema = z.object({ ...answerFieldBase, type: z.literal("image") }).strict();
const fileFieldSchema = z.object({ ...answerFieldBase, type: z.literal("file") }).strict();
const simpleSignatureFieldSchema = z.object({ ...answerFieldBase, type: z.literal("simple_signature") }).strict();
const calculatedFieldSchema = z.object({ ...answerFieldBase, type: z.literal("calculated"), expression: z.string().trim().min(1).max(500).optional() }).strict();
const sectionFieldSchema = z.object({ id: fieldIdSchema, type: z.literal("section"), label: labelSchema }).strict();
const instructionFieldSchema = z.object({ id: fieldIdSchema, type: z.literal("instruction"), label: labelSchema }).strict();

export const formFieldDefinitionSchema = z.discriminatedUnion("type", [
  shortTextFieldSchema,
  longTextFieldSchema,
  numberFieldSchema,
  currencyFieldSchema,
  dateFieldSchema,
  timeFieldSchema,
  dateTimeFieldSchema,
  singleChoiceFieldSchema,
  multipleChoiceFieldSchema,
  checkboxFieldSchema,
  yesNoFieldSchema,
  addressFieldSchema,
  geolocationFieldSchema,
  imageFieldSchema,
  fileFieldSchema,
  simpleSignatureFieldSchema,
  calculatedFieldSchema,
  sectionFieldSchema,
  instructionFieldSchema,
]);

export type FormFieldDefinition = z.infer<typeof formFieldDefinitionSchema>;

export const formSchemaDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(2_000).optional(),
  fields: z.array(formFieldDefinitionSchema).max(500),
}).strict().superRefine((schema, ctx) => {
  const ids = new Set<string>();
  const keys = new Set<string>();

  schema.fields.forEach((field, index) => {
    if (ids.has(field.id)) {
      ctx.addIssue({ code: "custom", path: ["fields", index, "id"], message: `Identificador de campo duplicado: ${field.id}` });
    }
    ids.add(field.id);

    if ("key" in field) {
      if (keys.has(field.key)) {
        ctx.addIssue({ code: "custom", path: ["fields", index, "key"], message: `Chave de resposta duplicada: ${field.key}` });
      }
      keys.add(field.key);
    }

    if ((field.type === "short_text" || field.type === "long_text" || field.type === "address") && field.minLength !== undefined && field.maxLength !== undefined && field.minLength > field.maxLength) {
      ctx.addIssue({ code: "custom", path: ["fields", index], message: "minLength não pode ser maior que maxLength." });
    }
    if ((field.type === "number" || field.type === "currency") && field.min !== undefined && field.max !== undefined && field.min > field.max) {
      ctx.addIssue({ code: "custom", path: ["fields", index], message: "min não pode ser maior que max." });
    }
    if (field.type === "multiple_choice" && field.minSelections !== undefined && field.maxSelections !== undefined && field.minSelections > field.maxSelections) {
      ctx.addIssue({ code: "custom", path: ["fields", index], message: "minSelections não pode ser maior que maxSelections." });
    }
    if (field.type === "single_choice" || field.type === "multiple_choice") {
      const values = new Set<string>();
      field.options.forEach((option, optionIndex) => {
        if (values.has(option.value)) {
          ctx.addIssue({ code: "custom", path: ["fields", index, "options", optionIndex, "value"], message: `Valor de opção duplicado: ${option.value}` });
        }
        values.add(option.value);
      });
    }
  });
});

export type FormSchemaDefinition = z.infer<typeof formSchemaDefinitionSchema>;

export const formAnswersSchema = z.record(z.string(), z.unknown());
export type FormAnswers = z.infer<typeof formAnswersSchema>;

export type FormAnswerValidationResult =
  | { success: true; data: FormAnswers }
  | { success: false; issues: z.core.$ZodIssue[] };

function issue(path: (string | number)[], message: string): z.core.$ZodIssue {
  return { code: "custom", path, message, input: undefined } as z.core.$ZodIssue;
}

function isBlank(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && value.trim().length === 0) || (Array.isArray(value) && value.length === 0);
}

function isIsoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isIsoTime(value: unknown) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

function isDateTime(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}

function validateText(field: Extract<FormFieldDefinition, { type: "short_text" | "long_text" | "address" }>, value: unknown) {
  if (typeof value !== "string") return false;
  if (field.minLength !== undefined && value.length < field.minLength) return false;
  if (field.maxLength !== undefined && value.length > field.maxLength) return false;
  if (field.pattern !== undefined) {
    try {
      if (!new RegExp(field.pattern).test(value)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function validateAnswerValue(field: Exclude<FormFieldDefinition, { type: "section" | "instruction" }>, value: unknown) {
  switch (field.type) {
    case "short_text":
    case "long_text":
    case "address":
      return validateText(field, value);
    case "number":
    case "currency":
      return typeof value === "number" && Number.isFinite(value) && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max);
    case "date":
      return isIsoDate(value);
    case "time":
      return isIsoTime(value);
    case "date_time":
      return isDateTime(value);
    case "single_choice":
      return typeof value === "string" && field.options.some(option => option.value === value);
    case "multiple_choice": {
      if (!Array.isArray(value) || !value.every(item => typeof item === "string" && field.options.some(option => option.value === item))) return false;
      const unique = new Set(value);
      if (unique.size !== value.length) return false;
      if (field.minSelections !== undefined && value.length < field.minSelections) return false;
      if (field.maxSelections !== undefined && value.length > field.maxSelections) return false;
      return true;
    }
    case "checkbox":
    case "yes_no":
      return typeof value === "boolean";
    case "geolocation":
      return typeof value === "object" && value !== null && typeof (value as { latitude?: unknown }).latitude === "number" && typeof (value as { longitude?: unknown }).longitude === "number" && Number.isFinite((value as { latitude: number }).latitude) && Number.isFinite((value as { longitude: number }).longitude) && (value as { latitude: number }).latitude >= -90 && (value as { latitude: number }).latitude <= 90 && (value as { longitude: number }).longitude >= -180 && (value as { longitude: number }).longitude <= 180;
    case "image":
    case "file":
    case "simple_signature":
      return typeof value === "string" && value.trim().length > 0;
    case "calculated":
      return (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.trim().length > 0);
  }
}

export function validateFormAnswers(schemaInput: unknown, answersInput: unknown): FormAnswerValidationResult {
  const schemaResult = formSchemaDefinitionSchema.safeParse(schemaInput);
  if (!schemaResult.success) return { success: false, issues: schemaResult.error.issues };

  const answersResult = formAnswersSchema.safeParse(answersInput);
  if (!answersResult.success) return { success: false, issues: answersResult.error.issues };

  const schema = schemaResult.data;
  const answers = answersResult.data;
  const answerFields = schema.fields.filter((field): field is Exclude<FormFieldDefinition, { type: "section" | "instruction" }> => "key" in field);
  const fieldsByKey = new Map(answerFields.map(field => [field.key, field]));
  const issues: z.core.$ZodIssue[] = [];

  Object.keys(answers).forEach(key => {
    if (!fieldsByKey.has(key)) issues.push(issue([key], `Chave de resposta desconhecida: ${key}`));
  });

  answerFields.forEach(field => {
    const value = answers[field.key];
    if (isBlank(value)) {
      if (field.required) issues.push(issue([field.key], `${field.label} é obrigatório.`));
      return;
    }
    if (!validateAnswerValue(field, value)) issues.push(issue([field.key], `Valor inválido para ${field.label}.`));
  });

  return issues.length > 0 ? { success: false, issues } : { success: true, data: { ...answers } };
}

// D-012G G1 — contrato TDD: candidato GREEN após implementação mínima.
import { describe, expect, it } from "vitest";

const modulePath = "./workflowConditionEvaluator";
const loadEvaluator = () => import(modulePath);

const context = {
  fields: {
    "input.priority": "alta",
    "input.attempts": 3,
    "input.enabled": true,
    "input.optional": "",
    "event.occurredAt": "2026-09-23T23:00:00.000-03:00",
    "event.score": 9.5,
    "meta.nullable": null,
  },
  exposedFields: new Set([
    "input.priority",
    "input.attempts",
    "input.enabled",
    "input.optional",
    "event.occurredAt",
    "event.score",
    "meta.nullable",
  ]),
};

describe("D-012G no-code condition evaluator", () => {
  it("avalia igualdade e diferença sem coerção implícita", async () => {
    const { evaluateWorkflowCondition } = await loadEvaluator();
    expect(evaluateWorkflowCondition(
      { field: "input.priority", operator: "eq", value: "alta" },
      context,
    )).toBe(true);
    expect(evaluateWorkflowCondition(
      { field: "input.attempts", operator: "eq", value: 3 },
      context,
    )).toBe(true);
    expect(evaluateWorkflowCondition(
      { field: "input.attempts", operator: "eq", value: "3" },
      context,
    )).toBe(false);
    expect(evaluateWorkflowCondition(
      { field: "input.enabled", operator: "neq", value: false },
      context,
    )).toBe(true);
  });

  it("considera campo presente quando exposto e diferente de null/undefined, inclusive string vazia", async () => {
    const { evaluateWorkflowCondition } = await loadEvaluator();
    expect(evaluateWorkflowCondition(
      { field: "input.optional", operator: "present" },
      context,
    )).toBe(true);
    expect(evaluateWorkflowCondition(
      { field: "meta.nullable", operator: "absent" },
      context,
    )).toBe(true);
  });

  it("compara somente números finitos quando valueType é number", async () => {
    const { evaluateWorkflowCondition } = await loadEvaluator();
    expect(evaluateWorkflowCondition(
      { field: "event.score", operator: "gt", valueType: "number", value: 9 },
      context,
    )).toBe(true);
    expect(evaluateWorkflowCondition(
      { field: "input.attempts", operator: "lte", valueType: "number", value: 3 },
      context,
    )).toBe(true);
    expect(() => evaluateWorkflowCondition(
      { field: "input.attempts", operator: "gt", valueType: "number", value: Number.POSITIVE_INFINITY },
      context,
    )).toThrow(/finito|número/i);
  });

  it("compara datas ISO válidas sem aceitar datas ambíguas", async () => {
    const { evaluateWorkflowCondition } = await loadEvaluator();
    expect(evaluateWorkflowCondition(
      {
        field: "event.occurredAt",
        operator: "gte",
        valueType: "date",
        value: "2026-09-24T01:00:00.000Z",
      },
      context,
    )).toBe(true);
    expect(() => evaluateWorkflowCondition(
      { field: "event.occurredAt", operator: "lt", valueType: "date", value: "24/09/2026" },
      context,
    )).toThrow(/data|ISO/i);
  });

  it("compõe condições com all/any", async () => {
    const { evaluateWorkflowCondition } = await loadEvaluator();
    expect(evaluateWorkflowCondition({
      all: [
        { field: "input.priority", operator: "eq", value: "alta" },
        {
          any: [
            { field: "input.attempts", operator: "gt", valueType: "number", value: 5 },
            { field: "input.enabled", operator: "eq", value: true },
          ],
        },
      ],
    }, context)).toBe(true);
  });

  it("falha fechado para campo não exposto, operador incompatível e composição vazia", async () => {
    const { evaluateWorkflowCondition } = await loadEvaluator();
    expect(() => evaluateWorkflowCondition(
      { field: "secret.token", operator: "eq", value: "x" },
      context,
    )).toThrow(/exposto|campo/i);
    expect(() => evaluateWorkflowCondition(
      { field: "input.priority", operator: "gt", valueType: "number", value: 1 },
      context,
    )).toThrow(/tipo|número/i);
    expect(() => evaluateWorkflowCondition({ all: [] }, context)).toThrow(/condi|vazio/i);
  });

  it("limita profundidade de composição para evitar expressões abusivas", async () => {
    const { evaluateWorkflowCondition, MAX_WORKFLOW_CONDITION_DEPTH } = await loadEvaluator();
    let condition: unknown = { field: "input.enabled", operator: "eq", value: true };
    for (let index = 0; index <= MAX_WORKFLOW_CONDITION_DEPTH; index += 1) {
      condition = { all: [condition] };
    }
    expect(() => evaluateWorkflowCondition(condition, context)).toThrow(/profundidade|limite/i);
  });

  it("expõe schema estrito para bloquear propriedades e operadores desconhecidos", async () => {
    const { workflowConditionSchema } = await loadEvaluator();
    expect(workflowConditionSchema.safeParse({
      field: "input.priority",
      operator: "eq",
      value: "alta",
      script: "return true",
    }).success).toBe(false);
    expect(workflowConditionSchema.safeParse({
      field: "input.priority",
      operator: "eval",
      value: "alta",
    }).success).toBe(false);
  });
});

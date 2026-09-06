import { describe, expect, it } from "vitest";
import {
  FORM_FIELD_TYPES,
  formSchemaDefinitionSchema,
  validateFormAnswers,
} from "../../shared/forms";

const representativeSchema = {
  schemaVersion: 1,
  title: "Atendimento de iluminação",
  fields: [
    { id: "f1", key: "protocolo", type: "short_text", label: "Protocolo", required: true, maxLength: 40 },
    { id: "f2", key: "risco", type: "single_choice", label: "Risco", required: true, options: [{ value: "baixo", label: "Baixo" }, { value: "alto", label: "Alto" }] },
    { id: "f3", key: "foto", type: "image", label: "Foto", required: false },
  ],
} as const;

function fieldFor(type: (typeof FORM_FIELD_TYPES)[number], index: number) {
  const base = { id: `field-${index}`, key: `field_${index}`, type, label: `Campo ${index}`, required: false };
  if (type === "single_choice" || type === "multiple_choice") {
    return { ...base, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] };
  }
  if (type === "section" || type === "instruction") {
    return { id: base.id, type, label: base.label };
  }
  return base;
}

describe("D-008 form schema contract", () => {
  it("mantém o catálogo inicial aprovado e aceita todos os componentes", () => {
    expect(FORM_FIELD_TYPES).toEqual([
      "short_text", "long_text", "number", "currency", "date", "time", "date_time",
      "single_choice", "multiple_choice", "checkbox", "yes_no", "address", "geolocation",
      "image", "file", "simple_signature", "calculated", "section", "instruction",
    ]);

    const parsed = formSchemaDefinitionSchema.safeParse({
      schemaVersion: 1,
      title: "Catálogo completo",
      fields: FORM_FIELD_TYPES.map(fieldFor),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejeita chaves de resposta duplicadas", () => {
    const parsed = formSchemaDefinitionSchema.safeParse({
      schemaVersion: 1,
      title: "Duplicado",
      fields: [
        { id: "a", key: "codigo", type: "short_text", label: "Código", required: false },
        { id: "b", key: "codigo", type: "number", label: "Código numérico", required: false },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("aceita referência calculada existente e rejeita referência ausente ou autorreferência", () => {
    const base = { schemaVersion: 1 as const, title: "Cálculo", fields: [
      { id: "q", key: "quantidade", type: "number" as const, label: "Quantidade", required: true },
    ] };
    expect(formSchemaDefinitionSchema.safeParse({ ...base, fields: [...base.fields, { id: "c", key: "copia", type: "calculated", label: "Cópia", required: true, expression: "quantidade" }] }).success).toBe(true);
    expect(formSchemaDefinitionSchema.safeParse({ ...base, fields: [...base.fields, { id: "c", key: "copia", type: "calculated", label: "Cópia", required: true, expression: "inexistente" }] }).success).toBe(false);
    expect(formSchemaDefinitionSchema.safeParse({ ...base, fields: [...base.fields, { id: "c", key: "copia", type: "calculated", label: "Cópia", required: true, expression: "copia" }] }).success).toBe(false);
  });

  it("exige resposta não vazia para campo obrigatório", () => {
    expect(validateFormAnswers(representativeSchema, { risco: "baixo" }).success).toBe(false);
    expect(validateFormAnswers(representativeSchema, { protocolo: "   ", risco: "baixo" }).success).toBe(false);
    expect(validateFormAnswers(representativeSchema, { protocolo: "OS-123", risco: "baixo" }).success).toBe(true);
  });

  it("valida opções configuradas em seleção única e múltipla", () => {
    const schema = {
      schemaVersion: 1,
      title: "Opções",
      fields: [
        { id: "s", key: "single", type: "single_choice", label: "Única", required: true, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
        { id: "m", key: "multi", type: "multiple_choice", label: "Múltipla", required: true, options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }] },
      ],
    } as const;

    expect(validateFormAnswers(schema, { single: "a", multi: ["x", "y"] }).success).toBe(true);
    expect(validateFormAnswers(schema, { single: "c", multi: ["x"] }).success).toBe(false);
    expect(validateFormAnswers(schema, { single: "a", multi: ["z"] }).success).toBe(false);
  });

  it("valida tipos básicos de número, moeda, datas e booleanos", () => {
    const schema = {
      schemaVersion: 1,
      title: "Tipos",
      fields: [
        { id: "n", key: "numero", type: "number", label: "Número", required: true },
        { id: "c", key: "moeda", type: "currency", label: "Moeda", required: true },
        { id: "d", key: "data", type: "date", label: "Data", required: true },
        { id: "dt", key: "data_hora", type: "date_time", label: "Data e hora", required: true },
        { id: "y", key: "sim_nao", type: "yes_no", label: "Sim/Não", required: true },
        { id: "b", key: "check", type: "checkbox", label: "Checkbox", required: true },
      ],
    } as const;

    expect(validateFormAnswers(schema, {
      numero: 10,
      moeda: 19.9,
      data: "2026-09-05",
      data_hora: "2026-09-05T22:00:00",
      sim_nao: true,
      check: true,
    }).success).toBe(true);

    expect(validateFormAnswers(schema, {
      numero: "10",
      moeda: "19.9",
      data: "05/09/2026",
      data_hora: "ontem",
      sim_nao: "sim",
      check: 1,
    }).success).toBe(false);
  });

  it("não cria respostas para seções/instruções e rejeita chaves desconhecidas", () => {
    const schema = {
      schemaVersion: 1,
      title: "Layout",
      fields: [
        { id: "sec", type: "section", label: "Identificação" },
        { id: "help", type: "instruction", label: "Preencha os dados" },
        { id: "name", key: "nome", type: "short_text", label: "Nome", required: false },
      ],
    } as const;

    expect(validateFormAnswers(schema, {}).success).toBe(true);
    expect(validateFormAnswers(schema, { sec: "indevido" }).success).toBe(false);
    expect(validateFormAnswers(schema, { desconhecido: "valor" }).success).toBe(false);
  });

  it("não modifica o schema recebido durante a validação", () => {
    const before = JSON.stringify(representativeSchema);
    validateFormAnswers(representativeSchema, { protocolo: "OS-123", risco: "alto" });
    expect(JSON.stringify(representativeSchema)).toBe(before);
  });
});
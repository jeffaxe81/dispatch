# D-010B Multi-Monitor N Telas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estender o Workspace do AXE Dispatch para múltiplas superfícies simultâneas sem limite lógico fixo, preservando o catálogo seguro, RBAC, tenant e persistência do D-010A.

**Architecture:** Evoluir `WorkspaceLayout` para `version: 2` com `screens[]`, migrando layouts v1 de forma determinística. Cada superfície externa é uma rota autenticada que renderiza apenas widgets registrados; a coordenação local usa `BroadcastChannel` e um `MultiMonitorManager`, enquanto o backend continua autoritativo para persistência.

**Tech Stack:** React 19, TypeScript 5.9, Wouter 3, tRPC 11, Zod 4, Vitest, Testing Library, Drizzle/MySQL existente, Web APIs `window.open` e `BroadcastChannel` com fallback seguro.

**Spec:** `docs/superpowers/specs/2026-09-06-d010b-multimonitor-design.md`

## Global Constraints

- Não criar mecanismo paralelo de layout: D-010B evolui o Workspace D-010A.
- Não impor limite lógico fixo de telas; limites defensivos de payload podem existir para proteção operacional.
- `tenantId` e `userId` permanecem exclusivamente server-side.
- `screenId` é apenas seletor de superfície dentro do layout autorizado.
- Nenhuma URL, script, componente ou widget arbitrário pode ser persistido/renderizado.
- `BroadcastChannel` coordena janelas, mas nunca substitui tRPC/backend como autoridade.
- Fechamento/falha de janela externa não pode derrubar a tela principal.
- D-010B não altera regras de negócio de despacho, GIS, jornada, telecom, ocorrências ou equipes.
- Nenhuma migration produtiva, deploy, grant automático ou remoção de checkpoint faz parte do plano.
- TDD obrigatório: RED → GREEN → regressão por tarefa; suíte completa apenas nos gates de fechamento.

[Conteúdo completo do plano permanece idêntico ao commit b2240e52b4c72e2cecd7c0f62d22aa96e99bf9e7.]

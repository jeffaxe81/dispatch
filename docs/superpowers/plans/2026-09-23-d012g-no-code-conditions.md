# D-012G — Condições No-Code — Implementation Plan

**Base dependente:** `feat/d012f-events-triggers` head `faa09ad0efad6bb124e3761487ce3e6124b8003d`
**Branch:** `feat/d012g-no-code-conditions`
**Gate:** não integrar em `main` antes do fechamento/aprovação explícita da D-012F.

## Objetivo

Adicionar decisões declarativas ao Workflow D-012 sem JavaScript, SQL, shell ou linguagem de script, usando somente campos explicitamente expostos ao runtime e operadores em allowlist.

## Contrato mínimo

Operadores:
- `eq`, `neq`
- `present`, `absent`
- `gt`, `gte`, `lt`, `lte` para número/data
- composição `all` / `any`

Fontes de dados iniciais:
- input congelado da instância;
- payload de evento recebido;
- metadados internos explicitamente expostos pelo Workflow.

Fail-closed:
- campo não exposto;
- operador incompatível com tipo;
- valor inválido;
- condição sem saída única resolvida;
- múltiplas arestas verdadeiras quando a definição exigir decisão exclusiva.

## Microentregas

### G1 — Contrato e avaliador puro
- criar tipos/schema Zod de condição;
- avaliador puro sem acesso a banco;
- TDD RED→GREEN para operadores e composição;
- nenhuma persistência nova.

### G2 — Validação de definição
- autorizar nó `decision.condition`;
- validar expressões na publicação;
- exigir saídas identificáveis e configuração consistente;
- preservar imutabilidade da versão publicada.

### G3 — Integração com máquina de estados
- resolver condição somente sobre contexto congelado/exposto;
- escolher transição válida da versão congelada;
- falhar fechado em ambiguidade;
- auditar decisão e `correlationId`.

### G4 — Persistência/runtime
- recuperar contexto autorizado da instância;
- executar avaliação dentro da transação existente;
- sem leitura cruzada em Formulários/Inventário/Ocorrências;
- nenhuma mutation de domínio externo.

### G5 — Hardening
- tenant A/B;
- valores ausentes;
- datas inválidas;
- números NaN/infinito;
- composição profunda limitada;
- regressão, security, TypeScript, testes, build e Docker.

## Gates

1. TDD RED → GREEN por microentrega.
2. Diff restrito ao D-012G.
3. Sem migration real, deploy, grants ou merge automáticos.
4. Checkpoint ao final do GREEN.
5. Integração somente após aprovação explícita.

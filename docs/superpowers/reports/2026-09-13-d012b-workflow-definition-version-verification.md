# D-012B — Verificação de definição, versão e publicação de workflow

Data: 2026-09-13
PR: #103
Branch: `feat/d012b-workflow-definition-version`
Base validada: `main` em `ccdeed007977fc959a89fa5a74ca56b273e0f5db`
Head funcional pré-relatório validado: `187e47a145f457503437aa2a61c1f0217e212719`

## Escopo verificado

A D-012B formaliza definição, versionamento e publicação sobre o workflow legado, sem introduzir um segundo engine.

Foram verificados:

- domínio puro de ciclo de publicação;
- separação entre `currentVersion` e `publishedVersion`;
- edição append-only de `workflow_versions`;
- publicação explícita da versão corrente;
- desativação preservando a última versão publicada;
- migration aditiva `0009_d012b_workflow_published_version.sql`, apenas versionada no repositório;
- executor e retry simulados resolvendo somente a versão publicada;
- falha fechada quando a publicação ativa não possui ponteiro válido;
- manutenção explícita de `SIMULAÇÃO / MOCK` e `externalRequests: 0`;
- compatibilidade com o contrato transacional D-007A;
- rollout e rollback documentados.

## Evidência TDD

### B1 — domínio de publicação

O primeiro RED referenciou o domínio `workflowVersioning` antes de sua implementação. Em seguida, a implementação mínima foi adicionada e o checkpoint B1 fechou GREEN, incluindo segurança, TypeScript, suíte completa, build e Docker.

### B2 — persistência

O RED da persistência comprovou a ausência do novo ponteiro: **1 teste novo falhou e 1.186 testes legados passaram**.

A implementação adicionou:

- projeção `workflowPublicationPointers` da tabela física `workflows`;
- coluna nullable `published_version` via migration versionada;
- backfill dos workflows já publicados para `current_version`;
- promoção atômica de `publishedVersion = currentVersion` dentro da mesma transação de publicação;
- preservação de `publishedVersion` na desativação;
- auditoria do ponteiro antes/depois.

Durante a integração, a movimentação do corpo legado para `dbLegacy.ts` expôs uma regressão arquitetural no contrato D-007A, que exige `controlOwnWorkShift` diretamente em `server/db.ts`. A causa foi isolada e corrigida na fachada, sem alterar o comportamento de workflow. O checkpoint B2 final, no commit `10686b36c158fab950d7f9ca2ffbb0cbe1c85290`, ficou completamente GREEN.

### B3 — executor da versão publicada

O RED foi deliberadamente construído com:

- `currentVersion = 2`;
- `publishedVersion = 1`;
- versão publicada com 2 nós;
- rascunho corrente com 3 nós.

No commit `e5053cec5adf33f27c3385fa34926f2c64edb678`, o teste falhou exatamente porque o executor legado processou o rascunho: **3 nós processados em vez dos 2 publicados**. Resultado do RED: **1 teste falhou e 1.187 passaram**.

O GREEN moveu a resolução de execução/retry para `workflowPublicationPointers.publishedVersion`. O executor:

- não consulta `workflow.currentVersion` no ponto de resolução;
- falha fechado sem ponteiro publicado;
- carrega a linha de `workflow_versions` correspondente à publicação;
- valida a definição antes de enfileirar;
- persiste `workflowVersionId` da versão publicada;
- mantém execução somente simulada e sem chamadas externas.

O checkpoint B3 em `9ff2e73c832294043914279eb65b301cb9dc4cb2` ficou GREEN em Qualidade, Docker, NEO externo, NEO workspace e GIS.

### B4 — hardening

Foi adicionado `server/workflowPublicationArchitecture.test.ts` para impedir regressões arquiteturais:

- exige `published_version` explícito;
- exige promoção controlada do ponteiro;
- proíbe `workflow.currentVersion` no novo resolvedor de execução;
- exige comportamento fail-closed;
- confirma a fachada explícita das operações D-012B;
- verifica que a migration é aditiva, sem `DROP COLUMN` ou `DELETE FROM`;
- impede introdução de `fetch`, `axios`, child process, `exec` ou `spawn` no executor;
- preserva `mode: "simulacao"` e `externalRequests: 0`.

## Verificação fresca do head funcional pré-relatório

Head: `187e47a145f457503437aa2a61c1f0217e212719`.

GitHub Actions:

- **Qualidade #1139** — run `34767904045` — SUCCESS;
  - dependências congeladas — SUCCESS;
  - verificação de segurança — SUCCESS;
  - TypeScript — SUCCESS;
  - suíte completa — SUCCESS;
  - build — SUCCESS;
  - empacotamento Docker — SUCCESS.
- **NEO external compatibility #1023** — run `34767904040` — SUCCESS.
- **NEO workspace visual homologation #1065** — run `34767904052` — SUCCESS.
- **GIS visual homologation #1085** — run `34767904047` — SUCCESS.

## Revisão manual

A revisão manual não identificou bloqueador dentro do escopo D-012B.

Pontos confirmados:

- publicação e ponteiro são atualizados na mesma transação;
- desativação não destrói o histórico publicado;
- execução e retry usam somente o ponteiro publicado;
- a migration é aditiva e possui backfill explícito;
- a aplicação nova deve ser iniciada somente após a migration existir no ambiente;
- rollback da aplicação deve preceder qualquer eventual remoção futura da coluna;
- nenhuma chamada externa ou alteração automática de ocorrência foi adicionada por D-012B.

## Risco conhecido / próxima fronteira

O consumidor legado de revisão externa ALRT ainda possui resolução histórica própria e não foi ampliado nesta microentrega. A D-012B cobre explicitamente publicação/versionamento e o executor/retry simulados.

A reconciliação de consumidores orientados por eventos/gatilhos externos pertence à **D-012F — eventos/gatilhos**, antes de qualquer ativação produtiva desses gatilhos. O fluxo atual de revisão externa permanece protegido por revisão humana e esta entrega não habilita novos efeitos automáticos.

## Operações não executadas

Nesta entrega não foram executados:

- merge em `main`;
- deploy;
- migration em ambiente;
- grant/permissão de infraestrutura;
- habilitação de gatilho externo produtivo.

A migration `0009` permanece apenas versionada no repositório.

## Gate de fechamento

O head funcional pré-relatório está tecnicamente GREEN. O commit deste relatório altera o HEAD e, portanto, deve passar por uma última revalidação fresca dos mesmos quatro workflows antes de retirar o PR de Draft.

Após essa revalidação, o PR pode ser marcado como **Ready for review**, mas o merge em `main` continua condicionado à aprovação explícita do responsável pelo projeto.

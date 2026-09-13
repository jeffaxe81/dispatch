# Changelog

## [2.19.0-rc.1] — 2026-09-12

### Release candidate — Inventário / Motor de Ativos integrado

Esta release candidate consolida a integração do Inventário/Motor de Ativos com o Sistema de Despacho e o pacote técnico do ciclo R1 de homologação.

### Incluído
- cliente REST do Inventário no Despacho com propagação de tenant, usuário e correlation ID;
- busca, detalhe, localização e vínculo contextual de ativos dentro da operação;
- consumo versionado de eventos, replay idempotente e fail-closed para versões incompatíveis;
- isolamento multi-tenant, autorização negativa e fronteira arquitetural sem acesso cruzado a banco;
- adaptador seguro `/homologation/events`, indisponível em produção e protegido por chave dedicada;
- harness de homologação externa com relatórios JSON/Markdown e correlation IDs;
- workflow manual protegido por GitHub Environment `homologation`;
- runbook de homologação externa e rollback operacional.

### Estado da homologação externa
- tentativa real executada no workflow run `34726884023`;
- resultado: FAIL no preflight por ausência das variáveis/segredo do environment `homologation`;
- nenhuma chamada ao Motor/Despacho real ocorreu nessa tentativa;
- produção permanece NO-GO;
- promoção para release final depende do issue #97 e do fechamento do ciclo #89.

### Controles de release
- versão de pacote: `2.19.0-rc.1`;
- migrations permanecem apenas versionadas; nenhuma aplicação automática em banco real;
- nenhum grant produtivo é concedido automaticamente;
- nenhum deploy produtivo é autorizado por esta RC.

## [2.18.0] — 2026-09-11

### Release final — Workspace Operacional + Observabilidade/Recovery seguro

Esta versão fecha o ciclo posterior à v2.17.0, consolidando o Workspace Operacional D-010 e a linha D-011 de observabilidade, recovery controlado e failover estritamente simulado.

### D-010 — Workspace Operacional
- WorkspaceLayout v2 com migração determinística v1 → v2;
- uma superfície principal e múltiplas superfícies externas configuráveis;
- Multi-Monitor com abertura, foco, reabertura e coordenação same-origin;
- rota externa sem tenant/user como autoridade na URL;
- catálogo fechado de 15 tipos de widgets;
- widgets operacionais para Kanban, ocorrência, recursos, alertas SLA, timeline, NEO, iframe autorizado, formulário D-008 read-only e dashboard configurável;
- settings tipados, allowlists fechadas e isolamento local de falha por widget;
- migration `0007_d010a_workspace_layouts.sql` versionada, sem aplicação automática em banco real.

### D-011A — Health Checks + Watchdog Passivo + Circuit Breaker
- health registry tipado;
- readiness reutilizando probes existentes de banco/storage;
- watchdog passivo com hysteresis/anti-flapping;
- isolamento/circuit breaker e observabilidade sanitizada;
- sem restart automático, failover real ou mutação produtiva.

### D-011B — Recovery controlado e cadeia auditável
- Recovery Policy Engine com dry-run;
- contrato de ação e adapter exclusivamente simulado;
- autorização fail-closed, kill switch default-off, lease/fencing e reserva idempotente;
- safety boundary permitindo somente capability `simulation`/`noop`;
- evidências determinísticas de execução e verificação pós-ação;
- binding evidence-to-ledger, reconciliação, closure e verificadores de cadeia/cronologia;
- verificação ponta a ponta execução → verificação → reconciliação → closure;
- runtime preservado `simulation-only`, sem executor/restart real.

### D-011C.1–C.4 — Failover estritamente simulado
- contrato de topologia e elegibilidade fail-closed;
- planner determinístico com anti-split-brain, generation/fencing e TTL controlado;
- adapter de failover exclusivamente in-memory/simulado;
- safety boundary estrutural sem filesystem, subprocesso, HTTP, DB/ORM, cloud SDK, containers/orquestradores ou SSH;
- receipt canônico SHA-256 e verifier puro para a simulação;
- vínculo de tenant, plano, source/target, topology, generation/fencing, health evidence e timeline `startedAt <= finishedAt <= recordedAt`;
- proteção contra cross-tenant, adulteração de digest, links inconsistentes e cronologia impossível;
- nenhum failover real/automático, promoção/demotion, DNS/VIP/route ou restart foi habilitado.

### Qualidade funcional antes do fechamento
- D-011C.4 validada em 242/242 arquivos e 1120/1120 testes;
- security check, TypeScript e build aprovados no candidato funcional D-011C.4;
- GIS visual, NEO external compatibility e NEO workspace aprovados no candidato funcional D-011C.4;
- o candidato de release `release/2.18.0` deve repetir integralmente os gates antes do merge.

### Controles de release
- baseline pré-release: `main` em `8fc0fc60030152a5a488c8209101a3c64f27fd35`;
- checkpoint pré-release: `checkpoint/pre-release-v2.18.0-20260911`;
- branch de release: `release/2.18.0`;
- migrations permanecem apenas versionadas; nenhuma aplicação automática em banco real;
- nenhum grant produtivo é concedido automaticamente;
- nenhum deploy produtivo é autorizado pelo fechamento;
- checkpoints devem ser preservados;
- qualquer evolução para executor/failover real exige novo desenho, TDD, revisão e aprovação explícita.

## [2.17.0] — 2026-09-06

### D-008 — Formulários Dinâmicos / No-Code

Esta versão consolida o épico D-008 do AXE Dispatch, mantendo a disciplina de tenant, RBAC, auditoria, versionamento, anexos e segurança operacional.

### Incluído
- engine de formulários versionados/no-code;
- designer visual e renderer dos tipos aprovados;
- submissões, correções auditáveis e histórico de revisão;
- anexos fora do JSON, SHA-256, limites e validações;
- validação de integridade de anexos;
- assinatura simples em tela, explicitamente não ICP-Brasil;
- integração com Ocorrências e Aplicativo Agente;
- resolução de tenant no servidor com fail-closed;
- administrador sem equipe resolvido apenas quando existe exatamente uma organização autorizada por assignments dinâmicos;
- publicação imutável e criação de nova versão após publicação;
- domain events/outbox D-008;
- migration `0006_d008_no_code_forms.sql` versionada.

### Qualidade registrada
- 161/161 arquivos de teste aprovados;
- 677/677 testes aprovados;
- security check aprovado;
- TypeScript aprovado;
- build de produção aprovado;
- GIS visual homologation #592 aprovado;
- NEO external compatibility #529 aprovado;
- NEO workspace visual homologation #572 aprovado;
- Qualidade #599 aprovado.

### Controles de release
- merge funcional D-008 em `main`: `c05d0fc23fee2c80ec6af5ea57b684e6300e1630`;
- checkpoint pré-D-008: `checkpoint/pre-d008-forms-20260905`;
- checkpoint pós-correção de tenant: `checkpoint/d008-teamless-tenant-20260906`;
- migrations versionadas, sem aplicação automática em banco real;
- permissões catalogadas, sem grants automáticos;
- nenhum deploy é autorizado pelo fechamento documental.

### Publicação
A release de código `2.17.0` foi integrada em `main` pelo PR #46. Tag/GitHub Release permanecem objetos de publicação separados quando não criados pelo fluxo de integração.

## [2.16.0] — 2026-09-05

### Release final — escopo fechado

Esta versão consolida o ciclo de evolução do AXE Dispatch até o Controle de Jornada D-007. Por convenção do projeto, releases finais/oficiais utilizam major `2`.

### Incluído
- D-005 — GIS Open Source.
- D-006 — integração responsiva por iframe e workspace Telecom/NEO, incluindo controles RBAC/CSP associados.
- D-007A — histórico auditável de sessões/eventos de jornada.
- D-007B — escalas, ciclos, 12x36, exceções e planejamento.
- D-007C — elegibilidade de jornada antes do ranking GIS/despacho.
- D-007D — operação, alertas, pendências, SLA/escalonamento, resolução auditada e workspace de supervisão.

### Qualidade registrada
- validação consolidada da D-007D: 111 arquivos de teste e 487 testes aprovados;
- security check aprovado no head validado da D-007D;
- TypeScript e build aprovados;
- homologação visual GIS aprovada;
- compatibilidade externa NEO aprovada;
- homologação visual do workspace NEO aprovada.

### Controles de release
- checkpoint pré-release: `checkpoint/pre-release-v2.16.0-20260905`;
- checkpoint D-007D: `checkpoint/d007d-work-shift-operations-20260905`;
- migrations versionadas, sem aplicação automática em banco real;
- permissões catalogadas, sem grants automáticos;
- nenhum deploy é autorizado pelo fechamento documental.

### Publicação
A release de código `2.16.0` foi integrada em `main` pelo PR #42. Tag/GitHub Release permanecem objetos de publicação separados quando não criados pelo fluxo de integração.

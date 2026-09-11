# Changelog

## [Unreleased] — D-011 Observabilidade e Recovery

### D-011B — Recovery controlado e cadeia auditável

Conclusão funcional da D-011B, consolidando política de recovery, autorização/coordenação, safety boundary, evidências determinísticas, verificação pós-ação, binding com ledger, reconciliação, closure e verificação ponta a ponta da cadeia.

### Incluído
- Recovery Policy Engine com dry-run;
- contrato de ação e adapter exclusivamente simulado;
- autorização fail-closed, kill switch default-off, lease/fencing e reserva idempotente;
- safety boundary que aceita somente capability `simulation`/`noop`;
- receipts de execução, verificação pós-ação, reconciliação e closure;
- verificadores de integridade, cadeia e cronologia;
- binding evidence-to-ledger sem mutação adicional;
- verificação final end-to-end entre execução, verificação, reconciliação e closure;
- vínculo de tenant, identidade da ação e fencing nas evidências aplicáveis;
- reason codes sanitizados e contratos fail-closed.

### Limites preservados
- runtime permanece `simulation-only`;
- nenhum executor/restart real foi habilitado;
- nenhum retry automático, failover, restore, rollback ou migration foi autorizado;
- nenhuma integração com systemd, Docker, Podman, Kubernetes, SSH, cloud ou hypervisor foi introduzida;
- nenhuma migration produtiva, grant ou deploy é autorizado por este registro;
- qualquer evolução para executor real exige nova microentrega, desenho, TDD e aprovação explícita.

### Evidência
- último merge funcional: PR #71 — D-011B.14;
- `main` após D-011B.14: `a58eac2599813bb63a7005cd7e996d1f506ea564`;
- último head funcional verificado: `1e18dc6a5af2d9a037b7e69bfe17c00f3754f3f6`;
- validação B14: 235 arquivos / 1035 testes GREEN, security check, TypeScript e build GREEN;
- relatório de fechamento: `docs/releases/d011b-recovery-verification.md`.

### Controle de fechamento
- checkpoint pré-fechamento: `checkpoint/pre-d011b-recovery-closure-20260910`;
- branch documental: `docs/d011b-recovery-closure-20260910`;
- merge do fechamento depende de gates frescos no SHA documental final e aprovação explícita do responsável técnico.

## [Unreleased] — D-010 Workspace Operacional

### D-010C — Catálogo ampliado de widgets operacionais

Ampliação do Workspace para um catálogo fechado de 15 tipos, com nove widgets D-010C funcionais e reutilizáveis em superfície principal ou externa, preservando RBAC, tenant e integrações homologadas.

### Incluído
- settings tipados e estritos por tipo de widget;
- registry fechado de renderers locais, sem componente remoto arbitrário;
- contexto operacional efêmero e isolado por superfície;
- widgets read-only de Kanban, detalhe de ocorrência, recursos, alertas SLA e timeline operacional;
- widget NEO resolvido exclusivamente pelo catálogo autorizado de aplicações incorporadas;
- widget iframe autorizado baseado somente em `applicationId`, sem URL livre em settings;
- widget de formulário dinâmico reutilizando D-008, somente para versão publicada e em modo read-only;
- dashboard configurável com allowlist fechada de métricas;
- montagem funcional no `WorkspaceScreenCanvas` para superfície principal e N superfícies externas;
- isolamento local de falha por widget, sem exposição de mensagem ou stack para a operação;
- regressões específicas contra URL arbitrária, métricas desconhecidas, formulários não publicados e falha de renderer.

### Controles
- nenhuma migration nova foi necessária para D-010C;
- nenhuma nova autenticação/SSO do NEO foi introduzida;
- nenhum grant produtivo executado;
- nenhum deploy produtivo executado;
- nenhum merge em `main` autorizado por este registro;
- relatório de verificação: `docs/releases/d010c-verification.md`.

### D-010A / D-010B — Workspace configurável e Multi-Monitor

Evolução do workspace operacional para layout persistido e superfícies lógicas múltiplas, mantendo autorização e persistência no backend.

### Incluído
- WorkspaceLayout v2 com migração determinística v1 → v2;
- uma superfície principal e N superfícies externas configuráveis;
- criação, renomeação, reordenação, definição da principal, movimentação de widgets e remoção com realocação;
- rota externa interna `/workspace/external`, sem tenant/user como autoridade na URL;
- abertura/foco/reabertura coordenados de superfícies em janelas do navegador;
- detecção explícita de bloqueio de pop-up;
- sincronização entre janelas por BroadcastChannel apenas para coordenação;
- hints progressivos de posicionamento por display, sem dependência obrigatória da Window Management API;
- catálogo fechado de widgets;
- navegação acessível das tabs por teclado com setas, Home e End;
- inventário tRPC incluindo `workspace.getOwn`, `workspace.getOwnScreen`, `workspace.saveOwn` e `workspace.resetOwn`;
- regressões específicas de segurança e integração do multi-monitor.

### Qualidade registrada no candidato funcional
- candidato: `7dcbb8939d647a39ceb848493ef141c2480d3c44`;
- 181/181 arquivos de teste aprovados;
- 762/762 testes aprovados;
- security check aprovado;
- TypeScript aprovado;
- build de produção aprovado;
- GIS visual homologation #680 aprovado;
- NEO external compatibility #617 aprovado;
- NEO workspace visual homologation #660 aprovado.

### Controles de release
- migration `0007_d010a_workspace_layouts.sql` versionada, sem aplicação produtiva neste fechamento;
- nenhum grant produtivo executado;
- nenhum deploy produtivo executado;
- nenhum merge em `main` autorizado por este registro;
- relatório de verificação: `docs/releases/d010b-verification.md`;
- checkpoint somente após novo GREEN do SHA documental final.

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

### Pendente antes da publicação final
A branch `release/2.17.0` deve passar pelos gates finais de release e revisão do diff. A tag final `v2.17.0` e a publicação da GitHub Release somente devem apontar para o commit aprovado após esses gates.

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

### Pendente antes da publicação final
A branch `release/2.16.0` deve passar pelos gates finais de release e revisão do diff. A tag final `v2.16.0` e a publicação da GitHub Release somente devem apontar para o commit aprovado após esses gates.

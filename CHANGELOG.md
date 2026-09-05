# Changelog

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

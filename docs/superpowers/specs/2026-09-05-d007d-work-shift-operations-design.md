# D-007D — Operação, Alertas e Gestão da Jornada

## Base e objetivo

Base imutável: `checkpoint/d007c-dispatch-work-shift-eligibility-20260904` @ `081ce9cd24a330ef5321c716282ff79469e80b66`.

A D-007D acrescenta a camada operacional de supervisão sem duplicar D-007A/B/C: detectar anomalias, manter pendências persistentes, controlar SLA, notificar/escalonar, permitir ajustes humanos auditáveis e refletir o resultado na elegibilidade consumida pelo Despacho.

## Arquitetura aprovada — Modelo 2

Implementar arquitetura híbrida: eventos + verificação periódica de segurança.

- Eventos de jornada são processados imediatamente.
- Verificador periódico detecta ausência de eventos esperados e anomalias temporais.
- Reutilizar o Motor de Eventos da plataforma; não criar motor paralelo.
- Evento duplicado deve ser idempotente e não gerar pendência duplicada.
- Falha temporária deve permitir reprocessamento seguro.
- Canais externos nunca bloqueiam pendência ou notificação interna.

Fluxo principal: `Escala/Jornada -> Motor de Eventos -> D-007D -> Anomalia -> Pendência -> SLA -> Notificação/Escalonamento -> Supervisor -> Ajuste ou justificativa -> Auditoria -> Elegibilidade -> Despacho`.

Rede de segurança: `Verificador periódico -> ausência/anomalia -> D-007D -> Pendência/SLA`.

## Anomalias e pendências

Anomalias iniciais: início ausente/atrasado; término não registrado; pausa/intervalo excessivo; divergência jornada real x escala; jornada excedida; inconsistências identificáveis pelas regras D-007A/B/C.

Toda anomalia relevante gera Pendência de Ajuste de Jornada persistente. A resolução nunca apaga nem mascara o evento original.

Estados mínimos: `open`, `in_review`, `waiting_information`, `resolved`, `no_adjustment_required`.

Registrar: tenant, usuário/agente, equipe, jornada/escala relacionada, tipo, severidade, instante da detecção, esperado/observado, status, SLA, responsável, justificativa, ação executada e timestamps.

## SLA e escalonamento

- SLA configurável por tenant e tipo/severidade.
- Pendências críticas ou vencidas permanecem destacadas até tratamento.
- Contadores por equipe e período.
- Escalonamento configurável por tenant: níveis, prazos, destinatários e canais.
- Referência padrão: Supervisor -> Gestor -> Administrador/nível definido pelo tenant.
- Escalonamento notifica; não corrige automaticamente a jornada.

## Ajustes humanos e autorização

Opção B aprovada: Supervisor ajusta somente usuários/equipes dentro do próprio escopo; Administrador possui abrangência global.

Todo ajuste exige justificativa e registra responsável, data/hora, valor anterior, valor novo, pendência e contexto. `no_adjustment_required` também exige justificativa.

Autorização e escopo são validados server-side. A implementação deve usar permissão dedicada compatível com RBAC e nunca confiar no escopo informado pelo cliente.

## Notificações e interconexão

Notificação interna é obrigatória. Telecom/NEO, e-mail, SMS, webhook, push e demais canais são adaptadores externos configuráveis e desacoplados.

Premissa do Prompt Master: todo módulo deve analisar suas interconexões pertinentes com módulos existentes ou planejados, compartilhando contratos, eventos, RBAC, auditoria, multi-tenant, observabilidade e resiliência e evitando infraestrutura duplicada.

Interconexões D-007D: D-007A (jornada real), D-007B (planejamento/escalas), D-007C (elegibilidade), Despacho, Motor de Eventos, Notificações, Orquestrador de Integrações, Segurança/Governança, Dashboards/Relatórios e Central Operacional.

## Painel operacional

Painel de Jornada integrado à Central Operacional customizável e disponível como workspace independente/destacável para múltiplos monitores. Compartilha tenant, usuário, equipe, filtros, período e permissões e apresenta jornada atual, cobertura, anomalias, pendências, SLA, criticidade e ações autorizadas.

D-007D não cria infraestrutura privada de multi-monitor. Deve consumir a capacidade transversal da plataforma ou, enquanto ela não existir, uma interface desacoplada compatível com sua evolução.

## Retenção e auditoria

Retenção configurável por tenant/política, sem prazo rígido no código. Auditoria protegida contra alteração/exclusão indevida e preparada para arquivamento futuro sem perda de rastreabilidade.

Ajustes concorrentes devem impedir sobrescrita silenciosa.

## Testes e fechamento

Implementação por TDD RED -> GREEN -> regressão, com checkpoint por marco. Cobertura mínima: eventos; verificador periódico; idempotência/deduplicação; ciclo de pendências; SLA/escalonamento; RBAC e escopo; ajustes com before/after; justificativas; falha de canais externos; integração D-007C/Despacho; isolamento multi-tenant; retenção/auditoria; regressão D-007A/B/C, GIS/OSRM e NEO workspace; segurança; TypeScript; suíte completa; build.

D-007D somente poderá ser declarada concluída após evidência fresca dos gates obrigatórios e checkpoint final imutável.

## Backlog explícito — Modelo 3

Evolução futura: Motor de Regras/Workflow completo e configurável para condições, temporizadores, SLA, ações, escalonamentos e automações encadeadas. Essa capacidade pertence ao módulo transversal Workflow/Automação e consumirá eventos da Jornada; não será um motor privado da D-007D.

Exemplo futuro: `SE agente não iniciar até X minutos -> criar pendência -> aguardar SLA -> alertar supervisor -> escalar -> executar ação configurada`.

A evolução deverá ser guiada pela operação real e entregue em novas features, preservando contratos e compatibilidade do núcleo.
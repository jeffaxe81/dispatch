# D-007D — Operação, Alertas e Gestão da Jornada — Design

## Estado

Design aprovado funcionalmente em 2026-09-05. Esta especificação parte exclusivamente do checkpoint imutável D-007C `checkpoint/d007c-dispatch-work-shift-eligibility-20260904` @ `081ce9cd24a330ef5321c716282ff79469e80b66`.

Sem merge, deploy ou alteração das regras D-007A/B/C nesta etapa documental.

## Objetivo

Fechar o ciclo operacional do Controle de Jornada oferecendo ao despachador/supervisor observabilidade, alertas, cobertura, ajustes auditáveis e contingência humana temporária, sem duplicar ou enfraquecer as regras de planejamento e elegibilidade existentes.

Fluxo arquitetural:

`D-007A histórico real → D-007B planejamento/12x36 → D-007C elegibilidade normal → D-007D operação/contingência → GIS/OSRM → despacho`

## Princípios invariantes

1. Falta de cobertura gera alerta e escalonamento; nunca cria automaticamente agente elegível.
2. Contingência exige decisão humana explícita, autorização e auditoria.
3. Fail-closed para permissão, tenant, escopo, planejamento ou dependência crítica não resolvida.
4. D-007D não reimplementa regras fixed/12x36 nem a elegibilidade normal D-007C.
5. Ajustes retroativos não reescrevem decisões históricas de despacho.
6. Despachos preservam snapshot da elegibilidade/autorização usada naquele instante.
7. Autorização excepcional é temporária e expira/revoga sem criar permissão permanente.
8. Reconhecer alerta não significa resolver sua causa.
9. Falha do painel ou de notificação não derruba o Motor de Despacho.
10. Toda autoridade de identidade, RBAC e escopo é resolvida server-side.

## Visão operacional

O painel deve responder imediatamente:
- quem deveria estar trabalhando;
- quem efetivamente está em jornada;
- quais equipes/regiões estão cobertas;
- onde existe degradação ou ausência de cobertura;
- quais contingências estão ativas e quando expiram.

Estados operacionais mínimos por pessoa: `em_jornada`, `pausa`, `intervalo`, `atrasado`, `ausente`, `fora_da_jornada`, `encerrado`.

Estados mínimos de cobertura:
- `NORMAL`: cobertura atende à política;
- `DEGRADED`: cobertura abaixo do mínimo configurado, mas ainda existe capacidade operacional;
- `CRITICAL`: nenhuma equipe/agente elegível para o escopo requerido.

## Política de cobertura

Os mínimos de cobertura são configuráveis por:

`tenant → operação → região → equipe → faixa horária`

Nenhum quantitativo operacional fica hardcoded. A política deve permitir diferentes mínimos por período e contexto operacional.

## Alertas e escalonamento

Alertas mínimos:
- atraso de início;
- jornada não iniciada;
- pausa/intervalo excessivo;
- término previsto próximo;
- jornada excedida;
- cobertura degradada;
- ausência crítica de cobertura;
- tentativa de despacho sem cobertura adequada;
- falha técnica relevante na resolução de jornada/contingência.

Alertas possuem severidade, timestamps, escopo, causa estruturada, reconhecimento, resolução e histórico. Eventos equivalentes devem ser correlacionados/deduplicados para evitar tempestade de notificações. Alertas não tratados podem escalar por tempo/severidade para grupos configurados. A normalização da condição pode resolver automaticamente o alerta, preservando o histórico.

## Contingência operacional

Uma contingência é um objeto próprio, não um booleano no usuário. Deve registrar no mínimo:
- tenant;
- operação/região/equipe/agente afetado conforme escopo;
- alerta(s) de origem quando aplicável;
- autor da decisão;
- justificativa obrigatória;
- motivo estruturado;
- início;
- expiração obrigatória;
- estado (`active`, `expired`, `revoked`);
- timestamps e correlação de auditoria.

A contingência não altera silenciosamente D-007B ou D-007C. O pipeline efetivo é:

`planejamento D-007B → elegibilidade normal D-007C → exceção autorizada D-007D → ranking GIS/OSRM`

Ao expirar ou ser revogada, volta a valer exclusivamente a elegibilidade normal. A interface deve indicar persistentemente contingência ativa, responsável, motivo e tempo restante.

### Autoautorização

Por padrão, a mesma pessoa não pode criar uma exceção de contingência para si própria. Eventual liberação futura depende de política explícita do tenant; o default permanece bloqueado.

## Ajustes manuais auditáveis

Supervisor autorizado pode ajustar início, término, pausa ou intervalo. Nenhum ajuste apaga o histórico original. Cada alteração preserva:
- valor anterior;
- novo valor;
- autor;
- timestamp;
- justificativa obrigatória;
- origem;
- correlação com ocorrência/despacho quando aplicável.

A auditoria é append-only do ponto de vista funcional. Ajuste retroativo corrige jornada e relatórios, mas não recalcula retrospectivamente o fundamento de despachos já executados.

## RBAC

Capacidades separadas:
- visualizar operação da jornada;
- reconhecer alertas;
- ajustar registros de jornada;
- autorizar/revogar contingência;
- configurar políticas de cobertura.

Ser administrador não implica automaticamente autorização operacional para contingência. Todas as verificações são tenant-aware e server-side.

## APIs e segurança

APIs server-side devem cobrir:
- painel operacional;
- cobertura;
- alertas e histórico;
- reconhecimento/resolução quando autorizado;
- ajustes auditáveis;
- criação, consulta, expiração e revogação de contingência;
- histórico e evidências.

O cliente nunca é fonte de autoridade para flags como `isSupervisor`, `eligible`, tenant membership ou escopo de equipe. Falhas de autorização e dependências críticas são fail-closed.

## Snapshot e despacho

Todo despacho realizado sob contingência deve preservar snapshot suficiente para demonstrar:
- elegibilidade normal no instante;
- contingência aplicada;
- autorização e responsável;
- justificativa/motivo;
- validade temporal;
- equipe/agente efetivamente selecionado;
- correlação com ocorrência e ranking.

A cadeia auditável esperada é:

`alerta → decisão humana → autorização temporária → despacho → snapshot → expiração/revogação → histórico`

## Resiliência

- Falha de painel não interrompe o Motor de Despacho.
- Falha de notificação não elimina alerta persistido; deve permitir retry.
- Falha de banco/serviço/RBAC bloqueia novas exceções quando não for possível provar autorização e escopo.
- Expiração deve ser validada server-side mesmo se o cliente estiver desatualizado.
- Concorrência entre supervisores deve evitar autorizações conflitantes ou silenciosamente sobrepostas.

## UX operacional

A Central de Despacho deve apresentar jornada como informação operacional, sem virar um sistema de ponto isolado. Deve destacar planejado × realizado, cobertura, alertas e contingências ativas. Situação crítica deve mostrar equipe/região, causa, duração, planejados × disponíveis e ações permitidas ao perfil atual.

## Critérios de aceite

Critério crítico: **nenhuma contingência pode transformar silenciosamente uma pessoa inelegível em elegível.**

Também devem ser demonstrados:
- isolamento por tenant e escopo;
- RBAC das capacidades separadas;
- justificativa obrigatória;
- autoautorização bloqueada por padrão;
- expiração e revogação efetivas;
- snapshot histórico imutável para despachos;
- cobertura NORMAL/DEGRADED/CRITICAL;
- deduplicação e escalonamento de alertas;
- comportamento fail-closed;
- compatibilidade integral com D-007A/B/C e GIS legado.

## Estratégia de testes

TDD RED → GREEN → regressão por tarefa. Cobertura obrigatória para:
- RBAC e tenant;
- tentativa de autoautorização;
- justificativa obrigatória;
- expiração/revogação;
- concorrência entre supervisores;
- alterações retroativas;
- snapshots históricos;
- cobertura normal/degradada/crítica;
- indisponibilidade de dependências;
- deduplicação/escalonamento de alertas;
- regressão D-007A/B/C;
- GIS/OSRM e ranking elegível;
- segurança, TypeScript, suíte completa e build.

A homologação final deve usar os gates aplicáveis já consolidados no projeto: Qualidade, GIS visual homologation, NEO external compatibility e NEO workspace visual homologation.

## Fora do escopo

- folha de pagamento;
- cálculo trabalhista/legal definitivo;
- alteração automática de escala para cobrir ausência;
- promoção automática de inelegível para elegível;
- reescrita histórica de despachos;
- mudanças nas regras fixed/12x36 D-007B;
- substituição do mecanismo de elegibilidade D-007C;
- merge/deploy nesta etapa de design.

## Próxima etapa após aprovação documental

Criar plano de implementação D-007D com tarefas pequenas, checkpoints por marco, TDD obrigatório e base imutável no checkpoint D-007C. Nenhuma implementação deve começar antes da revisão e aprovação desta especificação.
# D-012C — Relatório de Verificação

Data: 2026-09-13

## Escopo validado

A D-012C evolui o workflow existente para instâncias stateful manuais, reutilizando `workflow_executions` e preservando o executor legado em modo de simulação.

Foram validados:

- máquina de estados pura para início, avanço, conclusão, cancelamento e falha controlada;
- versão publicada congelada por `workflowVersionId` no nascimento da instância;
- avanço somente por arestas válidas da versão congelada;
- persistência mínima de `currentNodeId` e `correlationId`;
- transações de início, avanço e cancelamento com auditoria correlacionada;
- migration aditiva e compatível com linhas legadas;
- invariantes contra segunda engine, efeitos externos e acoplamento a Ocorrências;
- compatibilidade do executor legado de simulação.

## SHA validado

`8a0dc9104ccc57f8adc4e94f287e9d99e5d34708`

## Evidências de CI

No SHA acima:

- Qualidade, run #1154: SUCCESS;
  - instalação congelada: SUCCESS;
  - security gate: SUCCESS;
  - TypeScript: SUCCESS;
  - suíte completa de testes: SUCCESS;
  - build: SUCCESS;
  - empacotamento Docker: SUCCESS;
- NEO external compatibility, run #1038: SUCCESS;
- NEO workspace visual homologation, run #1080: SUCCESS;
- GIS visual homologation, run #1100: SUCCESS.

## Revisão arquitetural

O delta exclusivo D-012C permanece sobre a base da D-012B e não cria `workflow_instances` nem uma segunda engine. As transições persistidas recarregam a definição por `execution.workflowVersionId`, sem depender de `currentVersion` durante uma instância em andamento.

Não foram identificadas chamadas HTTP, execução de processos externos ou dependência de tabelas de Ocorrência no domínio/persistência da D-012C.

## Limitações e gate

A D-012C não inclui tarefas, RBAC/multi-tenant formal do engine, eventos externos, gatilhos, condições no-code, SLA, designer ou Kanban.

O PR #105 permanece dependente da integração prévia da D-012B/PR #103. Nenhum merge em `main` é autorizado por este relatório; a integração continua condicionada à aprovação explícita do responsável pelo projeto.

Não houve implantação produtiva nem alteração operacional de ambiente nesta verificação.

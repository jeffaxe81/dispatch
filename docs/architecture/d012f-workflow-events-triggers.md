# D-012F — Eventos e gatilhos versionados

## Objetivo

A D-012F conecta eventos autorizados do Despacho, D-008 Formulários e Inventário ao runtime de Workflow D-012, permitindo iniciar ou retomar instâncias de workflow sem leitura/escrita cruzada nos domínios produtores.

A entrega mantém processamento fail-closed, contratos versionados, rastreabilidade por `correlationId` e deduplicação persistente por `tenantId + eventId`.

## Contrato de entrada

O envelope canônico é definido em `shared/workflowIntegration/v1.ts` e exige:

- `envelopeVersion = "1"`;
- `eventId` válido e estável;
- `eventType` pertencente à allowlist;
- `producer` compatível com o tipo de evento;
- `tenantId` canônico;
- `correlationId`;
- `occurredAt`;
- `payload` estruturado.

Combinações de versão, produtor ou tipo não autorizadas são rejeitadas antes de qualquer efeito persistente.

## Allowlist D-012F

Eventos autorizados nesta microentrega:

| Produtor | Evento |
| --- | --- |
| `axe-dispatch` | `incident.created.v1` |
| `axe-dispatch` | `incident.status_changed.v1` |
| `d008-forms` | `form.submission.submitted.v1` |
| `d008-forms` | `form.submission.corrected.v1` |
| `asset-inventory` | `inventory.asset.created.v1` |
| `asset-inventory` | `inventory.asset.updated.v1` |

Eventos fora desta matriz não são processados.

## Fronteiras arquiteturais

Os adapters em `server/workflow/workflowEventAdapters.ts` são a fronteira tipada entre os eventos dos domínios produtores e o envelope D-012.

O consumer `workflowEventTriggerService.ts` não acessa diretamente banco, Formulários, Inventário ou Ocorrências. Ele opera somente sobre o envelope validado e portas explícitas.

A persistência `workflowEventTriggerPersistence.ts` acessa apenas dados pertencentes ao domínio de Workflow: definições/versionamento, escopo de tenant, recibos de consumo e instâncias de workflow.

A D-012F não cria uma segunda outbox para eventos de Formulários, Inventário ou Despacho.

## Deduplicação e recibos

A migration `drizzle/0013_d012f_workflow_event_receipts.sql` adiciona recibos de consumo com unicidade por:

`(tenant_id, event_id)`

Fluxo esperado:

1. validar envelope;
2. derivar organização/tenant;
3. reivindicar recibo;
4. se já existir, retornar `duplicate` sem repetir efeito;
5. localizar workflow publicado e elegível no mesmo tenant;
6. iniciar ou retomar a instância;
7. concluir recibo como `processed`, `ignored` ou `failed`.

Falhas de matching ou criação da instância são registradas sem transformar replay em novo efeito.

## Início por evento

Um workflow pode iniciar em `trigger.external_data` quando:

- o workflow está ativo;
- a versão publicada é a usada pelo runtime;
- o workflow pertence ao mesmo tenant;
- o trigger inicial declara exatamente o `eventType` recebido.

A versão da instância é congelada no início.

## Espera e retomada por evento

O nó `wait.event` coloca a instância em `waiting`.

Há caminhos separados para retomada:

- tarefas humanas usam `resumeWaitingWorkflowInstanceState`;
- eventos usam `resumeEventWaitingWorkflowInstanceState`.

Um `wait.event` não pode ser retomado pelo caminho humano. Da mesma forma, uma tarefa humana não pode ser retomada pelo caminho de evento.

A retomada respeita somente arestas válidas da versão congelada do workflow.

## Segurança e isolamento

- tenant não é aceito de fonte arbitrária do cliente;
- tenant de evento deve mapear para organização canônica;
- matching de workflow é restrito ao mesmo tenant;
- `correlationId` é preservado;
- payload não concede permissão;
- nenhum evento altera diretamente estado crítico de Ocorrência, Formulário ou Ativo;
- replay não repete efeitos;
- tipos/produtores/versões desconhecidos falham fechado.

## Migration e rollback

Migration aditiva:

`drizzle/0013_d012f_workflow_event_receipts.sql`

A aplicação em banco real não faz parte desta microentrega automática e depende do gate operacional do projeto.

Rollback operacional, se necessário antes de adoção produtiva:

1. interromper consumidores D-012F;
2. preservar/exportar recibos necessários para auditoria;
3. reverter a migration conforme procedimento controlado do ambiente;
4. restaurar o release/checkpoint anterior.

Não executar remoção destrutiva automática de recibos em produção.

## Fora de escopo

Nesta entrega não estão incluídos:

- novo barramento de mensagens;
- nova outbox para domínios produtores;
- alteração automática de estados críticos da ocorrência;
- scripts ou SQL arbitrários configuráveis por usuário;
- chamadas para URL arbitrária ou plugin remoto;
- deploy produtivo;
- aplicação automática de migration;
- concessão automática de permissões;
- merge automático em `main`.

## Verificação

Antes de integração, executar e registrar:

```sh
pnpm security:check
pnpm check
pnpm test
pnpm build
```

Também devem permanecer GREEN as homologações GIS e NEO já usadas como regressão global do Projeto Despacho.

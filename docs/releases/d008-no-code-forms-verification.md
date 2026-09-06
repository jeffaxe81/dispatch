# D-008 — Formulários Dinâmicos / No-Code — Relatório de Verificação

**Estado:** CANDIDATO TÉCNICO — GATES GREEN; MERGE/DEPLOY NÃO AUTORIZADOS  
**Base protegida:** `main` em `2ebdec3b8627bb2fbb09ad6422119f243756a790` (v2.16.0)  
**Branch:** `feature/d008-no-code-forms`  
**Head funcional GREEN:** `5748265d245a36d9ba7553d18f72eed29c95eefb`  
**Head documental GREEN verificado:** `b683a1b8444e80d5cef5bc3a7c61c2787efcae57`  
**PR de homologação existente:** #44  
**Data:** 2026-09-06

## 1. Regra de aprovação e evidência de runtime

Este documento registra evidência real de CI para a D-008, mas **não** autoriza merge em `main`, deploy, aplicação de migration real ou grants automáticos. Esses atos permanecem sujeitos à autorização explícita do responsável pelo projeto.

No head documental GREEN `b683a1b8444e80d5cef5bc3a7c61c2787efcae57`, os quatro gates obrigatórios foram executados no workflow `Qualidade`, run `34045111860` (#592), contra o merge sintético do branch D-008 com a `main` atual.

```sh
pnpm security:check
pnpm check
pnpm test
pnpm build
```

| Gate | Estado | Evidência |
| --- | --- | --- |
| `pnpm security:check` | GREEN | `Verificação de segurança aprovada: 7 migrações e 17 correções preservadas.` |
| `pnpm check` | GREEN | `tsc --noEmit`, exit code 0 |
| `pnpm test` | GREEN | 161/161 arquivos; 674/674 testes; 0 falhas |
| `pnpm build` | GREEN | Vite + esbuild concluídos com exit code 0 |

### Warnings não bloqueantes do build

- `VITE_ANALYTICS_ENDPOINT` e `VITE_ANALYTICS_WEBSITE_ID` não definidos no ambiente de CI;
- script de analytics sem `type="module"` não é incorporado pelo bundler;
- `LeafletOperationalMap.tsx` é importado dinamicamente e estaticamente, portanto não é movido para outro chunk;
- aviso de chunk acima de 500 kB; maior chunk registrado em aproximadamente 1,73 MB antes de gzip.

Esses avisos não impediram o build. Otimização de chunking pode permanecer em backlog sem prazo se não for requisito bloqueante de release.

## 2. Evidência estática concluída

### Contrato e persistência

- Contrato canônico de formulários em `shared/forms.ts`.
- Persistência D-008 em exatamente sete tabelas: templates, versões, vínculos, submissões, revisões, anexos e domain events.
- Migration `drizzle/0006_d008_no_code_forms.sql` criada e registrada no journal, **não aplicada em banco real**.
- Schema Drizzle D-008 e migration usam os mesmos nomes físicos para colunas enum (`status`, `context_type`, `kind`, `event_type`, `aggregate_type`, `delivery_status`).
- Limites tRPC foram alinhados aos limites persistentes (`contextId` 180, `fieldKey` 120, `name` 240 e `mimeType` 160).
- Criação inicial de formulário é atômica: template e versão draft v1 são criados na mesma transação.
- Versão draft inicial recebe `definitionHash`; salvamentos de draft atualizam definição e hash conjuntamente.
- Definições são validadas pelo schema canônico em runtime antes de salvar, publicar ou derivar nova versão.
- Versões publicadas/retiradas permanecem imutáveis; `createNewVersion` cria novo draft com próximo número, definição copiada e novo hash.
- Correções são persistidas de forma atômica: a submissão atual é lida no tenant, `before_hash` e `after_hash` são calculados, a revisão é inserida e o snapshot da submissão é atualizado dentro da mesma transação.
- Anexos armazenam metadados/hash e referência de storage; binários não são gravados no JSON de respostas.
- Respostas de `image`, `file` e `simple_signature` são server-authoritative: referências enviadas pelo cliente são descartadas e rematerializadas somente a partir dos anexos realmente persistidos para a própria submissão/campo.
- Upload de anexo só é permitido enquanto a submissão está `in_progress`; anexos em revisão permanecem bloqueados até existir ownership de revisão validado de ponta a ponta.

### Segurança e governança

- Tenant é resolvido no servidor e não pode ser aceito do cliente no tRPC D-008.
- O repository remove `tenantId` não confiável de todas as escritas genéricas e reinjeta exclusivamente o tenant da instância tenant-bound.
- Schemas tRPC de submissão são estritos e validam o par `contextType/contextId`.
- Contextos operacionais aceitos nesta entrega: `incident_category`, `incident`, `field_activity`.
- Consulta/preenchimento de ocorrência reaplica escopo operacional.
- Correção e upload de anexos reaplicam `assertSubmissionScope` antes de tocar no service.
- `field_activity` é autorizado como uma atividade atribuída (`incident_assignments.id`): o runtime valida a atribuição, a organização da equipe contra o tenant, a ocorrência vinculada e, para agente, a própria equipe. O mesmo escopo é aplicado em vínculo, início, envio e em submissões já existentes.
- Upload valida, no servidor, que `fieldKey` existe na versão exata e que `kind` corresponde a `image`, `file` ou `simple_signature` do schema publicado.
- O payload Base64 é limitado no schema tRPC antes da decodificação, com teto equivalente ao limite de 8 MiB do anexo.
- Storage persiste a chave efetivamente retornada pelo backend de armazenamento e falha fechado se ela não existir.
- Correção exige justificativa e cria revisão auditável.
- A UI usa `forms.capabilities`, calculado pelo mesmo avaliador de autorização do backend; falha da consulta mantém ações de escrita ocultas.
- Capabilities administrativas incluem `canCreate`, `canEdit`, `canPublish`, `canDisable` e permanecem somente informativas: não concedem privilégios.
- Campos calculados simples são server-authoritative: valores enviados pelo cliente são descartados e rematerializados a partir da chave de origem antes de validação/persistência.
- Referências de campos calculados são validadas no schema canônico: autorreferência e chave inexistente são rejeitadas antes de publicação/uso operacional.
- `security-regression-check.mjs` protege 17 invariantes/correções, incluindo contexto tRPC, limite Base64 pré-decodificação, escopo de submissão, chave real do storage, atomicidade/hashes de correção e registro do namespace `forms`.
- Nenhum grant produtivo ou alteração automática de papéis dinâmicos foi aplicado.

### Administração / Designer

- `/formularios` está conectado a `forms.list`, `forms.capabilities` e `forms.createDraft`.
- `/formularios/:id` carrega a versão corrente real por `forms.get`.
- Salvar rascunho usa `forms.updateDraft`; publicar usa `forms.publish`; nova versão usa `forms.createNewVersion`.
- O menu lateral exibe `Formulários` somente com `forms.view`, respeita o curinga administrativo e permanece oculto para agente de campo.
- O Designer permite adicionar, remover e reordenar campos; novas chaves/IDs são gerados sem depender apenas da contagem atual, evitando colisão após remoções.
- Em draft é possível editar rótulo, chave, obrigatório, limites de texto, regex, limites numéricos, moeda, opções de seleção e limites de múltipla seleção.
- Campo calculado novo não nasce com expressão vazia inválida; o Designer permite configurar apenas referência simples de outra chave nesta release.
- Antes de salvar ou publicar, a página valida a definição pelo schema canônico e bloqueia a ação com erro visível quando inválida.
- Ao publicar alterações válidas ainda não salvas, a definição atual é salva antes da publicação para evitar publicar silenciosamente uma versão anterior.
- Após publicação ou criação de nova versão, a página refaz a consulta e o estado interno do Designer é ressincronizado com o novo `versionId`/definition.
- Versões diferentes de `draft` ficam em modo imutável no Designer.
- `forms` está registrado no `rootRouter` com procedures administrativas e operacionais sem remover Dispatch ou Jornada.

### Integração operacional

- Ocorrência e Aplicativo Agente usam o dock operacional D-008.
- Estados visuais: Não iniciado, Em preenchimento, Enviado e Corrigido.
- `startSubmission` seguido de `submit` preserva o mesmo `submissionId`, evitando anexos órfãos.
- Foto/arquivo usam endpoint de anexo separado do JSON de respostas.
- Assinatura simples é capturada na própria tela por superfície de desenho, confirmada como PNG e enviada pelo mesmo fluxo de anexos.
- Assinatura simples permanece explicitamente **não ICP-Brasil**.
- Durante correção textual, campos de anexo ficam deliberadamente bloqueados nesta release, porque anexos de revisão exigem vínculo de revisão auditável ainda não exposto no fluxo operacional.
- Envio/correção de formulário não solicita transição automática de status da ocorrência nesta release.
- `forIncident()` hidrata submissões pelo repository para devolver revisão, respostas efetivas e metadados reais de anexos.

## 3. Homologações visuais e de compatibilidade

No head documental final `b683a1b8444e80d5cef5bc3a7c61c2787efcae57`:

- GIS visual homologation — run `34045111811` (#585): **GREEN**;
- NEO external compatibility — run `34045111847` (#522): **GREEN**;
- NEO workspace visual homologation — run `34045111766` (#565): **GREEN**;
- Qualidade — run `34045111860` (#592): **GREEN**.

## 4. Gates administrativos ainda bloqueados

1. **Permissões dinâmicas `forms.*`:** o módulo respeita assignments dinâmicos como autoridade. Mapeamento/grant produtivo para perfis não será criado automaticamente e depende de autorização explícita.
2. **Migration real:** `0006_d008_no_code_forms.sql` permanece somente como artefato versionado; aplicação em banco real depende de autorização explícita.
3. **PR #44 / merge:** o PR existe como superfície de homologação, porém merge em `main` não está autorizado.
4. **Deploy:** não autorizado nesta etapa.
5. **Checkpoints:** o checkpoint `checkpoint/pre-d008-forms-20260905` permanece preservado e não deve ser removido automaticamente.

## 5. Backlog sem prazo desta entrega

- modo offline completo e sincronização;
- lógica condicional complexa;
- fórmulas avançadas;
- repetidores/tabelas dinâmicas;
- criação por IA e OCR;
- automações e workflow avançado;
- retenção/anônimização/legal hold avançados, quando não forem requisito obrigatório;
- módulo ICP-Brasil separado consumindo representação estável/hash do formulário finalizado;
- anexos em correções/revisões com ownership explícito de `revision_id` e histórico auditável de evidências;
- otimização de code splitting/chunking do frontend, se não se tornar requisito bloqueante;
- revisar separadamente o padrão legado de reutilização de `mysqlEnum(...)` em schemas anteriores, sem alterar esses módulos dentro do escopo D-008.

## 6. Diagnóstico temporário removido

Durante a depuração da suíte foi utilizado um workflow temporário de diagnóstico para capturar a saída integral dos testes. Após obtenção do GREEN completo, esse workflow foi removido do branch no commit `ba9541ee70dd003503e5fd22ea5890b23adb2b99` e não integra o candidato final.

## 7. Restrições de fechamento

Este relatório **não autoriza**:

- merge do PR #44;
- merge em `main`;
- deploy;
- aplicação de migration em banco real;
- concessão automática de permissões;
- remoção de checkpoints;
- limpeza destrutiva de dados ou artefatos.

Qualquer novo commit posterior deve repetir os gates automáticos antes de uma decisão de integração.

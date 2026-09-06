# D-008 — Formulários Dinâmicos / No-Code — Relatório de Verificação

**Estado:** PRÉ-CANDIDATO — GATES DE RUNTIME PENDENTES  
**Base protegida:** `main` em `2ebdec3b8627bb2fbb09ad6422119f243756a790` (v2.16.0)  
**Branch:** `feature/d008-no-code-forms`  
**Head documentado:** `de2829f30546535751e19141b75d050b16115ff2`  
**Data:** 2026-09-06

## 1. Regra de aprovação

Este documento **não** declara D-008 GREEN, aprovado para merge, deploy ou aplicação de migration. A aprovação somente poderá ocorrer após execução comprovada dos gates abaixo e revisão dos resultados.

```sh
pnpm security:check
pnpm check
pnpm test
pnpm build
```

| Gate | Estado | Evidência |
| --- | --- | --- |
| `pnpm security:check` | PENDENTE | sem runner/CI associado ao head atual; verificador ampliado para D-008 |
| `pnpm check` | PENDENTE | sem runner/CI associado ao head atual |
| `pnpm test` | PENDENTE | sem runner/CI associado ao head atual |
| `pnpm build` | PENDENTE | sem runner/CI associado ao head atual |

Não registrar contagem de testes, warnings ou resultado GREEN até existir saída real dos comandos.

## 2. Evidência estática concluída

### Contrato e persistência

- Contrato canônico de formulários em `shared/forms.ts`.
- Persistência D-008 em exatamente sete tabelas: templates, versões, vínculos, submissões, revisões, anexos e domain events.
- Migration `drizzle/0006_d008_no_code_forms.sql` criada e registrada no journal, **não aplicada em banco real**.
- Limites tRPC foram alinhados aos limites persistentes (`contextId` 180, `fieldKey` 120, `name` 240 e `mimeType` 160).
- Criação inicial de formulário é atômica: template e versão draft v1 são criados na mesma transação.
- Versão draft inicial recebe `definitionHash`; salvamentos de draft atualizam definição e hash conjuntamente.
- Definições são validadas pelo schema canônico em runtime antes de salvar, publicar ou derivar nova versão.
- Versões publicadas/retiradas permanecem imutáveis; `createNewVersion` cria novo draft com próximo número, definição copiada e novo hash.
- Anexos armazenam metadados/hash e referência de storage; binários não são gravados no JSON de respostas.
- O nome do anexo só entra nas respostas após upload bem-sucedido; falha de storage não confirma referência inexistente no JSON.

### Segurança e governança

- Tenant é resolvido no servidor e não pode ser aceito do cliente no tRPC D-008.
- O repository remove `tenantId` não confiável de todas as escritas genéricas e reinjeta exclusivamente o tenant da instância tenant-bound.
- Schemas tRPC de submissão são estritos e validam o par `contextType/contextId`.
- Contextos operacionais aceitos nesta entrega: `incident_category`, `incident`, `field_activity`.
- Consulta/preenchimento de ocorrência reaplica escopo operacional.
- Upload de anexo exige `forms.fill`, valida tenant da submissão e reaplica escopo da ocorrência/equipe a partir da submissão resolvida no servidor.
- Storage persiste a chave efetivamente retornada pelo backend de armazenamento e falha fechado se ela não existir.
- Correção exige justificativa e cria revisão auditável.
- A UI usa `forms.capabilities`, calculado pelo mesmo avaliador de autorização do backend; falha da consulta mantém ações de escrita ocultas.
- Capabilities administrativas incluem `canCreate`, `canEdit`, `canPublish`, `canDisable` e permanecem somente informativas: não concedem privilégios.
- Campos calculados simples são server-authoritative: valores enviados pelo cliente são descartados e rematerializados a partir da chave de origem antes de validação/persistência.
- `security-regression-check.mjs` protege invariantes D-008 de contexto tRPC, escopo de submissão, chave real do storage e registro do namespace `forms`.
- Nenhum grant produtivo ou alteração automática de papéis dinâmicos foi aplicado.

### Administração / Designer

- `/formularios` está conectado a `forms.list`, `forms.capabilities` e `forms.createDraft`.
- `/formularios/:id` carrega a versão corrente real por `forms.get`.
- Salvar rascunho usa `forms.updateDraft`; publicar usa `forms.publish`; nova versão usa `forms.createNewVersion`.
- Após publicação ou criação de nova versão, a página refaz a consulta e o estado interno do Designer é ressincronizado com o novo `versionId`/definition.
- Versões diferentes de `draft` ficam em modo imutável no Designer.
- Campo calculado novo não nasce com expressão vazia inválida; o Designer permite configurar apenas referência simples de outra chave nesta release.
- `forms` está registrado no `rootRouter` com procedures administrativas e operacionais sem remover Dispatch ou Jornada.

### Integração operacional

- Ocorrência e Aplicativo Agente usam o dock operacional D-008.
- Estados visuais: Não iniciado, Em preenchimento, Enviado e Corrigido.
- `startSubmission` seguido de `submit` preserva o mesmo `submissionId`, evitando anexos órfãos.
- Foto/arquivo/assinatura simples usam endpoint de anexo separado do JSON de respostas.
- Assinatura simples permanece explicitamente **não ICP-Brasil**.
- Envio/correção de formulário não solicita transição automática de status da ocorrência nesta release.
- `forIncident()` hidrata submissões pelo repository para devolver revisão e respostas efetivas após correções.

## 3. Gates administrativos ainda bloqueados

1. **Permissões dinâmicas `forms.*`:** o módulo já respeita assignments dinâmicos como autoridade. O mapeamento/grant produtivo para perfis como `agente_campo` não será criado automaticamente e depende de autorização explícita.
2. **Migration real:** `0006_d008_no_code_forms.sql` permanece somente como artefato versionado; aplicação em banco real depende de autorização explícita.
3. **PR/merge:** nenhum PR de integração/merge em `main` deve ocorrer antes dos quatro gates GREEN e autorização.
4. **Deploy:** não autorizado nesta etapa.

## 4. Backlog sem prazo desta entrega

- modo offline completo e sincronização;
- lógica condicional complexa;
- fórmulas avançadas;
- repetidores/tabelas dinâmicas;
- criação por IA e OCR;
- automações e workflow avançado;
- retenção/anônimização/legal hold avançados, quando não forem requisito obrigatório;
- módulo ICP-Brasil separado consumindo representação estável/hash do formulário finalizado.

## 5. Critério para transformar este documento em evidência final

Após disponibilidade de runner, executar exatamente os quatro gates da seção 1 no mesmo commit candidato. Registrar neste arquivo: data/hora, commit testado, comando, exit code, contagem real dos testes, warnings relevantes, resultado do build e qualquer correção necessária. Se qualquer comando exigir correção, o head muda e todos os gates devem ser executados novamente no novo head antes de preparar o draft PR D-008 para `main`.

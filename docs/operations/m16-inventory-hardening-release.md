# M16 — Segurança, observabilidade e regressão final

## Objetivo
Consolidar os gates transversais da integração Motor de Ativos / Sistema de Despacho antes de qualquer release produtivo.

## Matriz de permissões proposta
Esta matriz é documental. Nenhum grant é aplicado automaticamente.

| Ação | Operador | Supervisor | Administrador |
| --- | --- | --- | --- |
| Pesquisar/consultar ativo | permitido conforme tenant | permitido conforme tenant | permitido conforme tenant |
| Consultar localização/prontuário | permitido conforme tenant | permitido conforme tenant | permitido conforme tenant |
| Vincular ocorrência/ordem | permitido quando autorizado pelo fluxo | permitido | permitido |
| Alterar cadastro técnico do Motor | não pelo Despacho | não pelo Despacho | somente no produto responsável |
| Executar grants/migrations/deploy | não | não | somente processo de release explícito |

## Gates obrigatórios
- isolamento entre tenants GREEN;
- autorização negativa GREEN;
- contratos REST versionados GREEN;
- contratos de eventos versionados GREEN;
- auditoria e correlação preservadas;
- carga mínima do consumidor GREEN;
- dependências, TypeScript, testes e build GREEN;
- manual operacional presente;
- plano de rollback revisado.

O helper `buildInventoryReleaseReadiness` é puro e somente consolida evidências fornecidas pelo processo de release. Ele não executa deploy, migration, grant ou alteração externa.

## Observabilidade
Toda integração crítica deve preservar `tenantId`, `correlationId`, identificação do evento/comando e resultado processado/ignorado/rejeitado. Erros de contrato e versões incompatíveis devem ser diagnosticáveis sem alterar automaticamente o estado crítico do Despacho.

## Carga mínima
A regressão M16 exercita pelo menos 250 eventos distintos no consumidor, confirmando processamento sem deduplicação indevida. Replay/idempotência continua coberto pelos testes da M15.

## Rollback
1. interromper o consumo/uso da integração de Inventário no Despacho;
2. manter o núcleo do Despacho operacional sem dependência do Motor;
3. reverter a versão do aplicativo para o último artefato homologado;
4. não executar rollback destrutivo de dados do Motor sem plano específico de banco;
5. preservar logs, correlação e evidências da tentativa;
6. validar novamente segurança, TypeScript, testes, build e smoke antes de restaurar a integração.

## Restrições
- sem gravação direta entre bancos;
- sem grants automáticos;
- sem migrations reais nesta microentrega;
- sem deploy produtivo automático;
- ICP-Brasil permanece desacoplado;
- funcionalidade nova fica fora da M16 e deve voltar ao backlog.

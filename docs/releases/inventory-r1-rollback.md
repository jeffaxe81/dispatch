# Inventário R1 — Plano de Rollback

## Objetivo

Definir a reversão segura da integração Inventário ↔ Despacho sem executar rollback produtivo neste ciclo.

## Gatilhos de rollback

Rollback deve ser considerado bloqueador quando ocorrer qualquer um dos cenários abaixo após um release autorizado:

- violação de isolamento entre tenants;
- falha de autorização que permita acesso indevido;
- contrato REST incompatível sem fallback controlado;
- evento incompatível alterando regra crítica do Despacho;
- indisponibilidade do Motor paralisando o núcleo do Despacho;
- regressão crítica de ocorrência, mapa ou autenticação;
- falha de inicialização/health check do pacote implantado.

## Estratégia

1. interromper novas mudanças do release;
2. preservar logs, correlation IDs e evidências da falha;
3. retirar a versão problemática do tráfego;
4. restaurar o último artefato homologado do Despacho;
5. manter o Motor de Ativos isolado; não realizar correção por escrita cruzada de banco;
6. se uma alteração real de banco tiver sido autorizada em release futuro, usar exclusivamente o plano de migration/backup/rollback aprovado para aquela mudança;
7. reexecutar smoke tests antes de restabelecer o tráfego.

## Verificações pós-rollback

- autenticação/login operacional;
- criação/consulta da ocorrência;
- mapa operacional;
- painel do ativo degradando de forma controlada quando o Motor estiver indisponível;
- `AssetInventoryClient` sem acesso direto ao banco;
- consumidor de eventos sem alterar regra crítica;
- isolamento multi-tenant;
- health check `/health/live`.

## Evidências obrigatórias

Registrar no incidente/release:

- SHA retirado;
- SHA restaurado;
- instante do início/fim do rollback;
- motivo;
- correlation IDs relevantes;
- validações pós-rollback;
- pendências abertas para correção.

## Restrições

- este documento não executa rollback;
- não autoriza `db:migrate`, `db:push` ou grants em produção;
- não autoriza deploy produtivo;
- alteração de banco deve possuir backup e procedimento específico aprovado antes da execução.

## Estado R1

**Plano documental pronto para uso em um release futuro autorizado.**
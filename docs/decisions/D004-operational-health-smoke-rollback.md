# D-004 — Saúde operacional, smoke test e rollback

## Contexto

O sistema instalava, compilava e passava a suíte local, mas não possuía uma forma pública e padronizada de distinguir processo vivo de instância pronta para tráfego. A inicialização também podia escolher outra porta silenciosamente em produção. A documentação citava verificações e artefatos de contêiner que não existem no pacote atual, e não havia runbook de retorno da aplicação.

## Conceitos

- **Liveness:** confirma que o processo HTTP está vivo; não consulta dependências.
- **Readiness:** informa se a instância pode receber tráfego; depende de banco e armazenamento.
- **Sentinela:** objeto pequeno, permanente e não vazio lido apenas para provar acesso ao armazenamento.
- **Smoke test:** verificação curta executada de fora da aplicação após uma publicação.
- **Rollback:** republicação controlada de um artefato anterior; não equivale a restaurar dados.

## Alternativas consideradas

1. Readiness apenas com banco: mais simples, mas poderia aprovar uma instância incapaz de recuperar evidências e fotos.
2. Readiness com banco e escrita temporária no armazenamento: verifica escrita, porém cria efeitos, exige exclusão e aumenta risco operacional.
3. Readiness com banco e leitura de sentinela: cobre as duas dependências críticas sem alterar dados. **Escolhida.**
4. Endpoint único de saúde: rejeitado porque mistura “processo vivo” com “pronto para tráfego”.
5. Rollback específico de Docker: rejeitado enquanto o mecanismo de publicação real não estiver homologado.

## Decisão

- expor `GET /health/live` público, independente e sem cache;
- expor `GET /health/ready` público, aprovado somente com banco e armazenamento;
- executar `SELECT 1` e uma leitura HTTP de um byte da sentinela em paralelo;
- limitar cada check a 2.000 ms e devolver somente `ok` ou `failed`;
- configurar a sentinela por `STORAGE_HEALTHCHECK_KEY`, sem impedir o processo de iniciar quando ausente;
- manter o contrato tRPC `system.health` e o endpoint ALRT inalterados;
- usar exatamente `PORT` em produção e permitir busca alternativa somente em desenvolvimento;
- criar smoke sem credenciais para liveness, readiness e homepage;
- documentar rollback de aplicação separado da recuperação de banco do D-005;
- não executar deploy, rollback real, migração ou merge neste ciclo.

## Riscos e controles

- **Bucket indisponível reprova toda a instância:** aceito porque evidências e fotos fazem parte do serviço; observabilidade detalhada será ampliada no D-010.
- **Sentinela ausente gera `503`:** comportamento intencional; provisionamento e variável precisam ser concluídos antes de liberar tráfego.
- **Checks públicos podem expor arquitetura:** respostas são sanitizadas e não incluem erro, versão, URL, credencial ou stack.
- **Leituras frequentes podem gerar custo:** apenas um byte é solicitado; frequência e métricas devem ser ajustadas na plataforma homologada.
- **Porta ocupada derruba a inicialização produtiva:** preferível a subir numa porta invisível ao balanceador.
- **Rollback incompatível com dados:** o runbook exige verificação de migração e bloqueia retorno isolado quando houver incompatibilidade.

## Contratos resultantes

| Endpoint/comando | Sucesso | Falha segura |
|---|---|---|
| `GET /health/live` | `200 {"status":"alive"}` | falha apenas se o processo HTTP não responde |
| `GET /health/ready` | `200`, banco e storage `ok` | `503`, somente estados `failed` |
| `pnpm smoke:post-deploy` | quatro linhas `PASS`, código 0 | identificação sanitizada, código 1 |

Todas as respostas de health usam `Cache-Control: no-store`.

## Validação implementada

Foram adicionados 38 testes focados: 15 para rotas e adaptadores, 12 para configuração de porta e 11 para o smoke executado como subprocesso contra um servidor efêmero. A instalação congelada, segurança, TypeScript, **241 testes locais em 60 arquivos** e build de frontend/backend foram aprovados. A integração sem ambiente foi bloqueada antes da coleta, conforme o contrato. O workflow remoto e o checkpoint final permanecem como condição de encerramento do D-004.

## Ativação externa pendente

1. criar no armazenamento real um objeto não vazio, por exemplo `health/ready.txt`;
2. configurar `STORAGE_HEALTHCHECK_KEY=health/ready.txt` no ambiente;
3. disponibilizar uma URL HTTP(S) autorizada para `SMOKE_BASE_URL`;
4. homologar a plataforma de publicação e seu mecanismo de retorno.

Nenhuma senha, token ou URL assinada deve ser enviada em conversa ou adicionada ao repositório.

## Retorno

Antes do checkpoint final, use `checkpoint/d004-pre-implementation` ou o bundle correspondente. Após validação integral, o retorno de aplicação planejado é `checkpoint/d003-v1.15.3`; qualquer restauração de dados fica bloqueada até o D-005.

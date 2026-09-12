# Inventário R1 — Go/No-Go

## Decisão

**GO COM RESSALVAS para preparação de release.**

Esta decisão significa que o pacote técnico está apto a avançar para uma homologação manual/externa controlada e para a preparação do release operacional. **Não autoriza deploy produtivo.**

## Evidências consolidadas

### Baseline
- `main`: `c59b11084e6451ba13ccc49bb0fa8c078691ae36`
- versão: `2.18.0`
- plano M0–M16 concluído antes do início deste ciclo.

### Execução fresca R1
Head executado: `85b4be6e06b11cc52908fbeb05fc5588dc7ba471`.

- Qualidade run `1077`: SUCCESS;
- NEO external compatibility run `968`: SUCCESS;
- GIS visual homologation run `1030`: SUCCESS;
- NEO workspace visual homologation run `1010`: SUCCESS;
- segurança: GREEN;
- TypeScript: GREEN;
- testes: **1160/1160 GREEN** em **250/250 arquivos**;
- build: GREEN;
- Docker Compose: GREEN.

### Escopo Inventário especificamente coberto
- cliente REST;
- consumidor de eventos;
- painel contextual do ativo;
- fronteira arquitetural;
- integração por contrato;
- multi-tenant;
- autorização;
- readiness M16;
- GIS/NEO.

## Ressalvas

### R1 — Homologação externa/manual ainda não executada
A evidência atual é automatizada em CI/Docker e não representa uma sessão manual contra uma instância externa real do Motor de Ativos em ambiente de homologação.

**Tratamento:** executar sessão controlada de homologação externa antes de qualquer decisão de produção.

### R2 — Variáveis de analytics ausentes no CI
O build registrou `%VITE_ANALYTICS_ENDPOINT%` e `%VITE_ANALYTICS_WEBSITE_ID%` não definidos.

**Tratamento:** validar configuração do ambiente de destino. Não é bloqueador do Inventário enquanto analytics permanecer opcional.

### R3 — Bundle grande/code splitting
O Vite registrou chunk acima do limite de aviso e importação mista do `LeafletOperationalMap.tsx`.

**Tratamento:** registrar otimização de performance no backlog técnico; não bloquear este release se a homologação de desempenho do ambiente alvo permanecer aceitável.

## Bloqueadores de produção

Produção deve permanecer em **NO-GO** se ocorrer qualquer um dos itens abaixo:

- falha de tenant isolation;
- autorização indevida;
- contrato REST/evento incompatível sem fail-closed;
- evento do Motor alterando automaticamente estado crítico da ocorrência;
- indisponibilidade do Motor paralisando o núcleo do Despacho;
- falha de build/empacotamento/health check;
- rollback não executável ou não auditável;
- ausência de autorização explícita do responsável pelo release.

## Próximo gate obrigatório

Executar homologação externa/manual em ambiente controlado com:

1. Motor de Ativos real de homologação;
2. Despacho apontando apenas por REST/eventos autorizados;
3. pelo menos dois tenants de teste para validação negativa;
4. fluxo de busca → detalhe → localização → vínculo → evento;
5. indisponibilidade simulada do Motor;
6. replay de evento e versão incompatível;
7. coleta dos correlation IDs e logs;
8. validação do rollback operacional.

## Autorização

**Deploy produtivo não autorizado por este documento.**

O passo produtivo deve ser tratado em um ciclo separado, com autorização explícita, janela, responsáveis, backup/migration quando aplicável e plano de rollback.
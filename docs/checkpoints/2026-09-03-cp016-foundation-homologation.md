# CP-016 — Checkpoint de Homologação da Fundação Operacional

Data: 2026-09-03
Branch: `feat/cp-016-operational-foundation`
Checkpoint homologado: `57f13c9921a33959af1159314d2dd6b9e12dd442`
Base de origem: `main`
Versão da aplicação preservada: `1.15.0`

## Escopo homologado

Este checkpoint consolida a fundação operacional do CP-016 de forma aditiva e sem remoção de estruturas existentes.

Itens cobertos:

- Contratos compartilhados de jornada, presença e escalas, incluindo 12x36.
- Schema Drizzle aditivo para jornada auditável, presença operacional, trilhas de rota e integrações embutidas.
- Migration MySQL `drizzle/0003_marvelous_lionheart.sql`.
- Regra pura de elegibilidade de despacho com exclusão obrigatória de equipe fora da jornada ou pausada.
- Persistência histórica de jornada e eventos, preservando o snapshot atual em `teams`.
- Presença operacional materializada para consumo pelo despacho.
- Trilhas GIS referenciando `team_locations`, sem duplicação de coordenadas.
- Configuração persistida de integrações embutidas.
- Root router tRPC com namespace `cp016.*`, preservando rotas legadas.
- Tela CP-016 ligada aos endpoints definitivos de jornada e integrações.
- Integração NEO Interact configurada por registro persistido, sem credenciais no iframe.
- Bootstrap idempotente do NEO Interact em `https://gscprj.saas.digitro.cloud/neo/`, sem sobrescrever configuração administrativa existente.
- Workflow de CI do CP-016 com concorrência por branch e validação em MySQL 8.4.

## Evidência de homologação

GitHub Actions run: `33816745417`

Resultado do job `verify`:

- Apply existing database migrations: success
- TypeScript check: success
- Unit and integration tests: success
- Security regression checks: success
- Production build: success

Resultado do job `generate-migration`:

- Drizzle Kit generate: success
- Upload generated migration: success
- Commit generated migration: success

Após a geração, a branch permaneceu no mesmo SHA `57f13c9921a33959af1159314d2dd6b9e12dd442`, comprovando ausência de drift adicional entre schema, snapshot e migration.

## Compatibilidade

- Nenhuma tabela ou coluna legada foi removida.
- Os campos de jornada já existentes em `teams` permanecem como snapshot operacional atual.
- O histórico definitivo passa a ser registrado nas estruturas CP-016.
- `team_locations` continua sendo a fonte de coordenadas de localização.
- As rotas tRPC existentes permanecem preservadas; o CP-016 foi adicionado sob namespace próprio.
- A integração NEO não armazena senha, token ou credencial de autenticação na configuração de iframe.

## Rollback

O CP-016 foi implementado de forma aditiva.

Em caso de rollback da aplicação:

1. Retornar o código da aplicação ao checkpoint anterior ao CP-016.
2. Interromper o consumo das novas tabelas/rotas CP-016.
3. Manter as tabelas e os dados históricos CP-016 no banco; não executar `DROP TABLE` ou exclusão de histórico como rollback automático.
4. Os campos legados de jornada em `teams` continuam disponíveis para compatibilidade.
5. A telemetria histórica continua em `team_locations`.
6. O iframe NEO pode ser desabilitado via configuração persistida sem afetar o despacho principal.

O rollback destrutivo de banco não faz parte deste checkpoint.

## Estado de integração

Este checkpoint homologa a branch de feature. Nenhum merge na `main` foi executado por este documento.

A próxima decisão é de integração:

- abrir Pull Request para revisão; ou
- manter a branch isolada para novas evoluções antes do merge.

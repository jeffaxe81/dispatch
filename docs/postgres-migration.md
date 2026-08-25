# Roteiro de migração para PostgreSQL

## Ponto de partida

O ambiente gerenciado atual usa o dialeto MySQL/TiDB do template. Embora as entidades de domínio — usuários, equipes, viaturas, ocorrências, atribuições, posições, eventos e auditoria — sejam adequadas ao PostgreSQL, os arquivos `drizzle/schema.ts` e `server/db.ts` utilizam tipos e operações específicos do dialeto atual, como `mysqlTable`, `mysqlEnum`, `AUTO_INCREMENT` e `onDuplicateKeyUpdate`.

## Caminho recomendado

| Etapa | Alteração | Critério de aceite |
|---|---|---|
| 1. Provisionamento | Criar PostgreSQL com TLS, backups, monitoramento e usuário de aplicação com privilégios mínimos | Conexão segura testada fora do cliente |
| 2. Adaptador | Trocar `drizzle-orm/mysql2` por o driver PostgreSQL escolhido e substituir `mysql-core` por `pg-core` | Verificação de tipos e testes unitários aprovados |
| 3. Esquema | Converter identificadores para `serial` ou `identity`, enums para `pgEnum`, JSON para `jsonb` e datas para `timestamptz` | Migração criada e revisada por DBA |
| 4. Upsert | Substituir `onDuplicateKeyUpdate` por `onConflictDoUpdate` para sincronização de usuários | Login e atualização de perfil validados |
| 5. Auditoria | Bloquear `UPDATE` e `DELETE` em `audit_logs` com política ou trigger PostgreSQL; aplicar usuário de aplicação sem privilégio de alteração | Tentativas de alteração bloqueadas e registradas |
| 6. Dados | Migrar em janela controlada, verificar contagens e relações e manter plano de reversão | Reconciliação aprovada pelos responsáveis |
| 7. Corte | Trocar a variável de conexão por canal seguro, monitorar erros e manter fallback de leitura por período definido | Operação estabilizada sob carga prevista |

## Requisitos de conexão

Quando a organização disponibilizar PostgreSQL, a conexão deve ser configurada como segredo de servidor e nunca publicada no cliente. A URL deve usar TLS e um usuário com acesso apenas às tabelas necessárias. Uma implantação PostgreSQL definitiva também deve acompanhar a revisão de índices conforme o volume de `team_locations`, pois esse histórico tende a crescer continuamente.

## Limite desta entrega

Não há conexão PostgreSQL externa configurada nesta versão. Consequentemente, a migração descrita neste documento é um roteiro técnico, não uma homologação em ambiente PostgreSQL. A efetivação requer o fornecimento de uma instância PostgreSQL pela organização e uma rodada adicional de testes de integração.


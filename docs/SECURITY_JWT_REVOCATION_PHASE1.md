# AXE Despacho — Revogação JWT persistente, fase 1

Data: 05/11/2026. **Proposta de laboratório; não aplicar migração, deploy ou liberação em produção.**

## Correção implementada

O cookie `HttpOnly` utiliza JWT com prazo de 8 horas. Anteriormente, `auth.logout` removia o cookie, mas um JWT capturado ainda podia autenticar até expirar.

A fase 1 adiciona:

1. Identificador randômico `jti` aos JWTs novos (`randomBytes(24)`). Os JWTs legados sem `jti` continuam assinados/verificados e podem ser revogados individualmente pelo hash completo do token.
2. Tabela MySQL `local_revoked_sessions`, com **somente SHA-256 do JWT assinado**, identificador do usuário e prazo de expiração; nunca armazenar token de acesso, cookie ou credenciais.
3. Em `authenticateLocalRequest`, após verificar assinatura, emissor, audiência, expiração e usuário, consulta-se a lista de revogação no banco compartilhado. Token revogado retorna usuário não autenticado. Falha no banco gera erro; `createContext` nega sessão (fail-closed).
4. Em `auth.logout`, um JWT ainda válido deve ser revogado persistentemente e de modo idempotente **antes** de apagar o cookie e retornar `success:true`. Se o banco falhar, a confirmação não ocorre, permitindo que o cliente mantenha o bloqueio de logout pendente. JWT ausente/inválido/expirado não possui sessão válida a revogar.
5. Endurecimento da validação: IDs positivos e inteiros seguros; JWT sem expiração válida não é aceito. `jti` malformado é rejeitado, sem bloquear legados sem `jti`.

## Migração e operação

Artefatos: `drizzle/localSessionRevocationSchema.ts` e `drizzle/0024_dispatch_local_session_revocation.sql`, registrados no Drizzle config e journal. A migração é **aditiva, mas obrigatória antes de ativar o backend novo**; se a tabela não existir, sessões autenticadas falham fechadas e não podem operar. Isso é intencional e precisa de plano de implantação e rollback.

Nenhum job automático de expurgo foi adicionado. As revogações devem permanecer até a expiração do JWT mais a margem operacional aprovada; nunca apagar entradas não expiradas. Verificar crescimento, índices, latência de consulta adicional por requisição e comportamento entre múltiplos nós MySQL.

## Testes previstos

- Testes unitários incluem tokens novos únicos, `jti`, digest, revogação idempotente, rejeição de replay pelo mecanismo de revogação, falha de banco e tratamento de tokens legados.
- **Ainda indispensável:** teste MySQL 8.4 real (migração + revogação/consulta), autenticação de ponta a ponta após logout, duas instâncias, logout simultâneo com mutação, recuperação de indisponibilidade do banco, cargas concorrentes, teste de legado, browser e compatibilidade de proxies.
- Confirmar `pnpm check`, `pnpm test`, `pnpm build` e todos os gates do CI no head SHA antes de considerar merge.

## Limitações e próximas fases

A fase 1 invalida cada token individualmente após confirmação da inserção. **Ela não garante o cancelamento de uma operação já iniciada antes do commit de revogação**. Evitar declarar atomicidade logout/mutação sem protocolo transacional. Também não revoga automaticamente todos os JWTs após reset de senha, exclusão de conta ou mudança de permissões. Esses fluxos devem ser projetados com versão de sessão por usuário ou outra política persistente, junto a testes de múltiplas instâncias.

Permanecem bloqueadores: revisão de RBAC/isolamento por tenant, CSRF (PR #238), SameSite/casos iframe (PR #239), autenticação nativa e GPS operacional. **Nenhuma alteração no banco de produção foi executada.**

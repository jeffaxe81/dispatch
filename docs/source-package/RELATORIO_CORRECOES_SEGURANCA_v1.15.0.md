# Relatório de correções — AXE Dispatch v1.15.0

**Data:** 23/08/2026  
**Origem:** pacote `dispatch-brusque-real (1).zip`, versão 1.14.23  
**Nova versão:** 1.15.0

## Resultado

Os sete achados da varredura técnica foram tratados no código. O bundle compilado antigo foi removido para impedir que uma execução acidental utilize a implementação vulnerável; a nova pasta `dist` deverá ser criada pelo comando oficial de build.

| Achado original | Correção aplicada | Situação |
|---|---|---|
| Cadeia de migrações inconsistente | Recuperado o marcador `0001`, removido o SQL não rastreado e eliminada a inclusão duplicada de `organization_id` | Corrigido e verificado estaticamente |
| Anexos sem autenticação | Rota privada exige sessão, resolve o objeto no banco e valida propriedade/permissão/escopo antes de gerar URL assinada | Corrigido com testes de regressão |
| JWT sem validação | Inicialização falha com segredo ausente, curto ou de exemplo; produção também exige banco e OAuth | Corrigido com testes de regressão |
| Exportação fora do escopo | Relatórios e exportações usam filtro de equipe autorizado; papéis dinâmicos não globais não podem omitir o recorte | Corrigido com testes de regressão |
| OAuth local incompatível | HTTPS usa `__Host-`, `Secure` e `SameSite=None`; HTTP local usa cookie separado com `SameSite=Lax` | Corrigido com testes de cookie |
| Parser global de 50 MB | ALRT possui parser próprio de 256 KiB; parser geral caiu para 12 MB e formulário URL encoded para 1 MB | Corrigido com teste de corpo excedente |
| Rate limit somente em memória | Produção usa reservas compartilhadas no MySQL, serializadas por `GET_LOCK`; o helper local também remove janelas expiradas | Corrigido no código |

## Melhorias adicionais

- Sessões agora rejeitam JWT cujo `appId` não corresponda ao aplicativo configurado.
- `X-Forwarded-Proto` e IP encaminhado só são considerados com `TRUST_PROXY=true`.
- Docker exige `JWT_SECRET` explícita e recebe as variáveis públicas OAuth como argumentos de build do cliente.
- Configuração de patch/override do pnpm foi movida para `pnpm-workspace.yaml`, compatível com versões atuais.
- Foi adicionado `pnpm security:check`, executável sem dependências instaladas, para detectar regressões nas sete correções.
- Versão e documentação de implantação foram atualizadas para 1.15.0.

## Testes acrescentados

- Rejeição de segredo JWT inseguro e ausência de configuração obrigatória em produção.
- Política de cookies em HTTP e HTTPS.
- Bloqueio de evidência para requisição anônima e liberação de foto somente ao proprietário.
- Exigência de escopo explícito para papel dinâmico não global.
- Rejeição de payload ALRT acima de 256 KiB antes da persistência.

O projeto agora contém **47 arquivos de teste** e **161 casos de teste declarados**.

## Validações executadas neste ambiente

| Validação | Resultado |
|---|---|
| `node scripts/security-regression-check.mjs` | Aprovada: 20 migrações e 7 correções preservadas |
| Análise sintática de todos os arquivos TS/TSX | Aprovada |
| Integridade de `package.json` e diário Drizzle | Aprovada |
| Sintaxe de `docker-compose.yml` e `pnpm-workspace.yaml` | Aprovada |
| Verificação funcional isolada da validação de ambiente | Aprovada |
| Busca por bundle antigo em `dist/index.js` | Aprovada: arquivo removido |

## Validações que devem ser executadas antes da produção

O ambiente de análise não permitiu baixar dependências e não possui Docker/MySQL. Portanto, execute em ambiente com acesso ao registro de pacotes:

```bash
pnpm install --frozen-lockfile
pnpm security:check
pnpm check
pnpm test
pnpm build
```

Depois, valide a migração em MySQL 8.4 vazio e em uma cópia da base anterior:

```bash
pnpm drizzle-kit migrate
```

Critérios finais: todas as verificações aprovadas; download anônimo retorna `401`; usuário fora do escopo recebe `403`; login funciona em HTTP local e HTTPS atrás do proxy; exportação não inclui outra equipe; ALRT devolve `413` acima de 256 KiB e `429` ao exceder a janela compartilhada.

## Configuração obrigatória

- Gere `JWT_SECRET` com no mínimo 32 bytes aleatórios.
- Mantenha `TRUST_PROXY=false` em acesso direto; use `true` somente com exatamente um proxy confiável.
- Informe `VITE_APP_ID` e `VITE_OAUTH_PORTAL_URL` como argumentos no build Docker, conforme `DEPLOY_CONTEINERIZADO.md`.
- Não reutilize as senhas locais do MySQL/MinIO em produção.

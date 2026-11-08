# AXE Despacho — refinamento R011/R021 (CSRF e listagem tenant-aware)

**Data:** 2026-11-07. **Estado:** código de revisão/testes; implantação operacional **NO-GO**. Ponto de partida: main após PR #258. Partes pertinentes das propostas antigas PR #238 (CSRF) e PR #236 (filtro) foram adaptadas ao router atual, sem fazer merge de branches antigos e incompatíveis.

## R021 — defesa CSRF nas mutações tRPC

- Middleware `requireSameOriginTrpcMutation` montado exclusivamente no prefixo `/api/trpc`, antes do handler tRPC e depois das rotas externas ALRT autenticadas separadamente.
- Para POST, PUT, PATCH e DELETE, `Sec-Fetch-Site` presente deve ser exatamente `same-origin`; `cross-site`, `same-site`, `none` e valores desconhecidos são negados com HTTP 403 sem processamento.
- Navegadores sem Fetch Metadata precisam enviar `Origin` válido e com **mesmo esquema, hostname e porta** esperados em `Host`, sem credenciais/caminho/query/fragmento. Sem os dois cabeçalhos, requisição com cookie é rejeitada; requisições sem cookie ainda dependem da autenticação da API.
- GET, HEAD e OPTIONS mantidos. Rejeições não são cacheadas e não ecoam credenciais, payload ou cabeçalhos.
- Com proxy de desenvolvimento Vite que reescreve `Host`, o navegador envia `Sec-Fetch-Site: same-origin`, evitando falso bloqueio por comparação com a origem interna. Validação de proxy/HTTPS real **ainda é necessária**.
- O cabeçalho `Sec-Fetch-Site` não autentica scripts nem aplicativos nativos; a proteção é defesa complementar para browsers, não substitui sessões, RBAC, CSRF token para cenários especiais ou HTTPS.

## R011 — listagem de ocorrências limitada pelo escopo

- O router normal e o router tenant-aware passam `input.teamId` por `resolveAuthorizedTeamFilter`, que exige permissão `occurrences.view`.
- Usuário com papel dinâmico não global precisa indicar uma equipe permitida, evitando expandir a consulta quando omitir filtro. Agente usa a equipe própria.
- No router tenant-aware, `assertTeamTenant` e `assertTeamScope` verificam que a equipe permitida pertence ao tenant selecionado **antes** da leitura; `listIncidentsForTenant` aplica filtro no SQL antes de contar/paginar.
- Não modifica os fluxos de criação, edição, armazenamento, integração, mobile nativo nem migradores SQL.

## Testes de CI exigidos

- `server/_core/trpcCsrf.test.ts`: HTTP inseguro, metadados válidos/falsificados, origens cruzadas, cabeçalhos ausentes, middleware 403 e sucesso da mesma origem.
- `server/incidentListAccess.router.test.ts`: filtro ausente/outro escopo, filtros explícitos, agente, datas e interrupção antes do acesso ao banco.
- `server/incidentListValidation.test.ts`: os dois routers adotam o filtro autorizado; a cláusula SQL tenant/tempo continua no banco.
- `server/refinementBacklog.test.ts`: status dos 100 IDs atualizado, sem marcar 100 funcionalidades entregues.
- Reexecutar `security:check`, `check`, `test`, `build` e todos os checks de MySQL/GIS/NEO/empacotamento Docker no mesmo SHA.

## Compatibilidade e pendências deliberadas

- **Cookies HTTPS `SameSite=None` não mudados neste patch:** a PR #239 indica dependências possíveis de NEO e iframe cross-site; migrar para `Lax` só após provas de compatibilidade de login, logout, iframe e proxy com navegadores reais. A proteção de origem reduz parte do risco de CSRF enquanto isso é avaliado.
- PR #237: escopo de auditoria e atribuições globais — permanece separada, requer revisão de escopo do perfil QA (empresa + equipe para agentes).
- PR #248: proteção de escrita e upload de evidências — permanece separada, requer migração/validação MySQL e revisões.
- Nenhum servidor de homologação real, navegador móvel físico ou integração externa foi acessado por esta alteração. Gates **REAL-01/02/03 = 0/3**, Mobile sem aprovação de campo e produção **NO-GO**.

## Recomendações para a validação externa

Testar aplicação web/Android PWA na mesma origem via HTTPS, proxy TLS confiável, iframes aprovados do NEO, reautenticação entre abas, cookies omitidos/expirados e requisições de origem diferente. Documentar SHA, execução, responsavel, equipamento/navegador, PASS/FAIL e evidência sanitizada em issue #259 e #192. Não modificar flags de produção ou liberar integração para realizar esses testes.

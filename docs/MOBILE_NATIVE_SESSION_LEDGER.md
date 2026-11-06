# AXE Despacho — ledger de sessões nativas revogáveis (pré-produção)

**Status:** biblioteca, schema e testes, sem endpoint, sem migração executada e sem login Android habilitado. Deriva do contrato PKCE da PR #243 e dos códigos de uso único da PR #244.

## Quatro frentes técnicas desta entrega

| Frente de revisão | Implementação verificável | Bloqueio antes de produção |
| --- | --- | --- |
| Banco/MySQL | `mobileSessionSchema.ts` registra `mobile_sessions`; `mobileSessionMySqlStore.ts` persiste apenas hashes e consulta o registro atual via transação `SELECT ... FOR UPDATE` | Gerar/revisar a migração, testes de integração concorrentes em MySQL 8.4 e procedimento de rollback |
| Segurança | `mobileSessionService.ts`: resgata o código PKCE uma única vez, cria handle aleatório de 256 bits, TTL 15 min, revalida tenant/equipe/usuário/dispositivo e permite revogação por handle ou dispositivo | Autorização real em cada rota, cadastro/revogação durável de dispositivos, auditoria de tokens e proteção CSRF |
| Android | Contrato de transporte futuro: handle somente no canal nativo, preferencialmente protegido pelo Android Keystore; WebView não recebe handle ou senha | App Links verificados, navegador de sistema, canal nativo, ciclo de vida, Android 14–16 e integração com a central |
| QA | `mobileSessionService.test.ts` valida replay, concorrência (20 resgates), revogação, expiração, isolamento de tenant/equipe e indisponibilidade MySQL | Testes reais multi-instância e multi-conexão, pentest e testes em aparelho físico |

## Fluxo previsto — ainda não implantado

1. O agente faz autenticação no navegador do sistema, através de Authorization Code + PKCE S256 e App Link HTTPS verificado; há confirmação atual de identidade e autorização no servidor.
2. O backend consome o código de autorização no banco (PR #244); o código **não** pode ser reutilizado, mesmo se a criação da sessão falhar.
3. O serviço cria um handle randômico de 256 bits e armazena **somente o SHA-256** na tabela `mobile_sessions`, junto ao hash do identificador do dispositivo e ao escopo mínimo (usuário, organização, equipe), emissão e expiração.
4. O handle só poderia ser entregue por um canal Android nativo auditado e protegido pelo Keystore. **Nenhuma rota atual devolve o handle.**
5. Antes de cada operação protegida, a central deve consultar a sessão **diretamente no banco primário**, verificar revogação e expiração e obter usuário ativo e permissões atuais por consulta server-side. As flags de escopo nunca devem vir do corpo enviado pelo dispositivo.
6. A central pode revogar um único handle ou todos os handles **já emitidos** para um dispositivo. Os dados permanecem no banco até política de retenção/expurgo aprovada.

## Limites importantes

- A biblioteca **não é um servidor OAuth/OIDC** e não altera `server/routers.ts`, `server/_core/context.ts`, `server/localAuth.ts`, JWT web ou cookies. O APK segue com `NATIVE_AUTH_PENDING`.
- O cadastro persistente e a revogação transacional de dispositivos já estão implementados em código e descritos em [cadastro e bloqueio de dispositivos](MOBILE_DEVICE_REGISTRY.md). Os adaptadores MySQL agora barram emissão/troca de códigos e criação/leitura de sessões para dispositivos revogados, mas **nenhuma migração foi aplicada ou validada em MySQL real**, e ainda não há fluxo de provisionamento, App Link ou Keystore aprovado para operação.
- A leitura usa o primário do MySQL e bloqueio pessimista por transação, evitando usar cache stale; a chamada retornada não cria uma transação longa em torno da ação seguinte. Ao ligar o middleware, operações sensíveis devem confirmar revogação/autorização na mesma fronteira de segurança em que são executadas.
- Uma sessão não é um refresh token. A camada atual não faz rotação de refresh tokens, detecção de replay de refresh, atestado do dispositivo, vinculação criptográfica do hardware ou controle de perda do telefone.
- A tabela `mobile_sessions` foi adicionada ao arquivo `drizzle.config.ts`, mas **nenhum DDL foi gerado, executado ou homologado em MySQL real** nesta PR. Não executar `db:push` em produção sem aprovação específica.
- Não armazenar handle em `localStorage`, WebView, logs ou observabilidade. Não habilitar GPS contínuo de produção, mesmo com o ledger integrado.

## Critérios de qualidade deste incremento

Executar `corepack pnpm check`, `corepack pnpm test`, `corepack pnpm security:check`, `corepack pnpm build` e os workflows disparados pela PR, inclusive Docker. O merge na `main` só é permitido com CI concluído em sucesso no mesmo SHA. A conclusão deste incremento **não** significa que autenticação nativa esteja operacional.

**Próximos gates:** migração MySQL homologada, vínculo persistente de dispositivos com bloqueio de reemissão, testes reais de transação/revogação, endpoints auditados, Android Keystore/App Links, autorização de tenant/equipe e homologação Android 14–16.

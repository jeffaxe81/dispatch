# AXE Despacho — cadastro e bloqueio persistente de dispositivos (P0.4)

**Situação:** infraestrutura de segurança inativa, sem rotas públicas ou migração MySQL aplicada. Continuação das PRs #243–#245. Nenhuma mudança no login web existente, na autenticação Android em produção ou no GPS operacional.

## Quatro frentes de revisão

| Frente | Implementação | Evidência / limite |
| --- | --- | --- |
| Banco/MySQL | `mobileRegisteredDevices` com hash exclusivo, escopo de usuário/organização/equipe, data de cadastro e `revokedAtMs`; Drizzle registrado | A migração **não foi aplicada**; testar MySQL real e rollback |
| Segurança | Toda emissão/resgate de código, criação/leitura de sessão exige dispositivo previamente cadastrado e não revogado. Bloqueio transacional em ordem dispositivo → código/sessão; revogação atômica invalida cadastro, códigos e sessões | Pré-condições exigem origem de autorização confiável; não há endpoint de provisionamento |
| Android | Contrato backend definido para futura vinculação criptográfica de um dispositivo pré-aprovado | Android Keystore, App Links, navegador do sistema e prova de posse ainda pendentes |
| Testes | Validação de escopo/ID e teste com adaptador SQL simulado cobrindo locks, revogação, rollback e tentativas subsequentes | Os testes simulados **não substituem** testes multi-instância/multi-conexão com MySQL 8.4 |

## Política de segurança

1. Um dispositivo só poderá ser incluído por processo **administrativo autenticado e auditado**. `registerApprovedMobileDevice` não está exposto em nenhuma rota. O banco impede duplicar `device_hash` e um registro revogado não pode ser reativado por upsert.
2. Na emissão de um código PKCE, `createMySqlMobileCodeStore.put` bloqueia a linha cadastrada com `SELECT ... FOR UPDATE`, verifica estado ativo e correspondência exata de usuário, organização e equipe e **então** insere o código na mesma transação.
3. Ao trocar o código, `take` obtém primeiro apenas uma dica de qual dispositivo consultar; bloqueia o registro do dispositivo e só depois bloqueia e consome o código. Nenhuma decisão de autorização usa a leitura não bloqueante.
4. Ao criar sessão móvel, `create` também bloqueia o registro do dispositivo na mesma transação. Assim, um código gasto imediatamente antes de uma revogação não pode permitir a criação de sessão **após a revogação ser confirmada**.
5. A verificação de uma sessão existente sempre consulta o cadastro atual no MySQL primário antes de confiar na sessão, sem cache. A verificação sozinha **não substitui** autorização no mesmo limite transacional da futura operação sensível.
6. `revokeRegisteredMobileDeviceHash` bloqueia o cadastro e revoga **na mesma transação** o registro do dispositivo, os códigos emitidos e todas as sessões conhecidas. Ambas as interfaces anteriores `revokeDevice` dos repositórios agora direcionam para essa revogação unificada.
7. Identificadores e handles de dispositivo não são armazenados em claro: são hashes SHA-256 dos identificadores (que precisam ser aleatórios e de alta entropia). Para produção, avaliar chave HMAC/pepper, identificação/prova de posse criptográfica, chaves de dispositivo e gerenciamento de troca de aparelho conforme threat model.
8. Falhas de conexão, dispositivo desconhecido, registro revogado, tenant/equipe divergente ou transação abortada falham fechadas. A lista de dispositivos não pode ser derivada de flags declaradas pelo cliente.

## Bloqueadores

- Gerar migrações revisadas para **três tabelas novas**: `mobile_authorization_codes`, `mobile_sessions` e `mobile_registered_devices`, aplicar em homologação MySQL 8.4 e testar concorrência com duas conexões e rollback real. Não executar `db:push` em produção.
- Auditar o fluxo de provisionamento do dispositivo, prova de posse e revogação em caso de perda, roubo, mudança de equipe ou desativação do agente. Uma entrada não deve ser criada apenas com um ID fornecido pelo telefone.
- Adicionar o servidor OAuth/PKCE com autenticação no navegador do sistema, App Link verificado, consentimento, antirreplay, rate limit e emissão de token/refresh apropriados; os serviços deste ciclo continuam desconectados de `server/routers.ts`.
- Revalidar autorização/tenant/equipe no banco na fronteira de cada mutação, sem confiar nos campos de `NativeAccessRequest` originados do aparelho. Integrar Android Keystore e testes Android 14–16.
- Preservar a separação do JWT web e suas PRs paralelas de segurança #238, #239 e #242.
- Continuam sem habilitação **login nativo operacional**, **GPS com tela bloqueada autenticado** e qualquer implantação de produção.

## Validação

Executar `corepack pnpm security:check`, `corepack pnpm check`, `corepack pnpm test` e `corepack pnpm build`, além de todos os workflows do GitHub no SHA exato. A aprovação da pipeline neste ciclo significa **prontidão do código para revisão**, não homologação da base e nem aceitação em produção.

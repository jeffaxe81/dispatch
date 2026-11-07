# AXE Despacho — perfis de homologação e tratamento dos pontos pendentes

**Estado:** código versionado para testes; **não é criação de usuários em ambiente real nem homologação concluída**. Os perfis só podem ser instalados por Super Administrador em stack **isolada** e explicitamente habilitada. A configuração padrão é desabilitada.

## Perfis predefinidos (RBAC dinâmico existente)
| Perfil | Código | Escopo | Privilégios explícitos | Restrições |
| --- | --- | --- | --- | --- |
| Observador | `homolog_observador` | Organização | occurrences.view, dispatch.view, teams.view, vehicles.view | Sem edição/atribuição |
| Executor | `homolog_executor` | Organização | occurrences.view/create/edit, dispatch.view, teams.view, vehicles.view | Apenas dados fictícios e homologação |
| Agente de Campo | `homolog_agente_campo` | Equipe | occurrences.view/transition, dispatch.view, teams.view, vehicles.view | Usuário operacional agente e equipe vinculada |
| Auditor de Segurança | `homolog_auditor` | Organização | audit.view, reports.view, occurrences.view | Sem administração ou mutações concedidas |
| Revisor Independente | `homolog_revisor` | Organização | audit.view, reports.view | Sem botão de aprovação de release |

**Matriz real de autorização:** o motor aplica permissões dinâmicas, papel operacional legado, escopo tenant e regras por endpoint. Estas permissões são a lista explícita concedida pelos templates; não devem ser interpretadas como uma certificação de todos os endpoints ou como uma substituição da revisão de segurança F04.

## Fluxo seguro de instalação
1. Subir ambiente **separado de produção** com MySQL e dados sintéticos, sem tokens de integrações reais.
2. No `.env` **exclusivo do laboratório**, configurar `AXE_DEPLOYMENT_STAGE=homologation` e `AXE_HOMOLOGATION_ENABLED=true`. A configuração de origem `.env.example` permanece em `production/false`.
3. Instalar migrações **somente no MySQL descartável de laboratório** e cadastrar as permissões básicas pré-existentes. Se o catálogo de permissões estiver incompleto, a instalação falha atomicamente, sem inventar concessões.
4. Acessar **Administração → Perfis e acessos → Instalar perfis de homologação** como Super Administrador autorizado. A operação idempotente instala cinco perfis de sistema protegidos, audita os IDs e **não cria nem vincula usuários**.
5. Pré-cadastrar um usuário de teste com função operacional **Operador** para simulações de central ou **Agente** para simulações de campo, usando **perfil comum limitado**. É proibido pré-cadastrar usuário com perfil `homolog_*` sem validade.
6. Em **Usuários e acessos → Alterar perfil**, selecionar o perfil `homolog_*`, a organização autorizada, a equipe quando aplicável e uma **validade obrigatória de até 14 dias**. Sessões anteriores são revogadas pela mesma transação.
7. Realizar testes permitidos apenas em dados fictícios. Registrar SHA, responsável, data UTC, PASS/FAIL e evidência sanitizada.

## Controles fail-closed
- Sem ambas as variáveis exatas, o instalador e novas atribuições de homologação são negados.
- Em qualquer outra stage, o contexto de autenticação rejeita contas que ainda tenham perfil `homolog_*` ativo, antes de chegar a procedures protegidas.
- Os privilégios dinâmicos destes perfis são removidos fora do sandbox, sem excluir a atribuição da avaliação e **sem reativar o fallback do perfil legado**.
- Não existe escopo global, permissão `*`, concessão de `users.*`, `roles.*`, `system.*` ou `integrations.*` em nenhum dos cinco perfis.
- Perfis instalados são `isSystem=true`: não permitem editar lista de permissões, desativar ou alargar escopo.
- Edição de papel ou substituição da atribuição revoga sessões antigas. Todos os vínculos são limitados por tenant e expiração.
- A criação de perfil genérico não pode usurpar o prefixo reservado `homolog_`.
- Nenhum perfil de teste permite, por si só, publicar em produção, alterar gates F04/F05/F06 ou disparar integradores externos.

## Pontos antigos ainda em revisão (não ocultar)
| PR | Assunto | Tratamento neste estágio |
| --- | --- | --- |
| [#248](https://github.com/jeffaxe81/dispatch/pull/248) | Segurança transacional, revogação de sessão e storage | Draft preservada, requer migração, revisão e homologação real |
| [#238](https://github.com/jeffaxe81/dispatch/pull/238) | Antifalsificação CSRF em mutações autenticadas | Draft preservada; não desabilitar a proteção |
| [#239](https://github.com/jeffaxe81/dispatch/pull/239) | SameSite dos cookies HTTPS | Draft preservada; validar login/integrações |
| [#236](https://github.com/jeffaxe81/dispatch/pull/236) e [#237](https://github.com/jeffaxe81/dispatch/pull/237) | Isolamento entre tenants e auditoria | Revisão RBAC e reexecução contra a main atuais antes de merge |
| [#235](https://github.com/jeffaxe81/dispatch/pull/235) | Responsividade | Verificar paridade de todas as telas antes de integração |

Esta entrega **corrige o controle de perfis protegidos, escopo e expiração do novo ciclo**, mas não declara as PRs acima corrigidas/mescladas. Elas permanecem no backlog para revisão dedicada.

## Evidências e saída
- Executar `corepack pnpm security:check && corepack pnpm check && corepack pnpm test && corepack pnpm build` e os checks reais do GitHub Actions.
- Executar [roteiro de testes de main](./MAIN_TESTING_PLAYBOOK.md) em browser e Android debug, sem autenticação nativa de produção.
- [Web REAL-01/02/03](https://github.com/jeffaxe81/dispatch/issues/192): 0/3 até evidência real.
- Mobile ANDROID-AUTH/GPS/E2E/IOS: não concluídos.
- Aprovação de produção: **NO-GO**, sem deploy, sem grants reais, sem alteração de dados operacionais.

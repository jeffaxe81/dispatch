# Inventário de portabilidade — AXE Dispatch v1.15.0

O pacote-fonte foi identificado como uma aplicação full-stack em **React 19, Express 4, tRPC 11, Drizzle ORM e MySQL**, com autenticação OAuth, autorização por papéis e escopos, armazenamento externo de evidências e receptor de integrações ALRT. A portabilidade deve manter a implementação existente e substituir apenas as partes de infraestrutura incompatíveis com o ambiente gerenciado.

| Área | Inventário do pacote-fonte | Critério de preservação |
|---|---:|---|
| Rotas de aplicação | 26 rotas explícitas e fallback 404 | Mesmos caminhos, parâmetros e regras de redirecionamento |
| Arquivos de páginas | 34 | Todos copiados, incluindo testes de páginas |
| Componentes próprios de alto nível | 16 | Todos copiados, sem reconstrução visual desnecessária |
| Migrações SQL históricas | 20 arquivadas + 2 migrações gerenciadas | Esquema final conciliado e aplicado ao MySQL gerenciado |
| Testes Vitest | 47 originais + 4 suítes de portabilidade | Suíte preservada e ampliada para ciclo de ocorrência, triagem, jornada, rotas e estados renderizados |
| Domínios de backend | Ocorrências, triagem, equipes, turnos, viaturas, workflows, integrações, auditoria, relatórios e administração | Procedimentos tRPC e regras de autorização mantidos |

## Rotas preservadas

| Grupo | Caminhos |
|---|---|
| Operação | `/`, `/dashboards-relatorios`, `/ocorrencias`, `/ocorrencias/:id`, `/equipes`, `/kanban`, `/agente`, `/viaturas` |
| Integrações | `/integracoes`, `/integracoes/workflows`, `/integracoes/workflows/:id`, `/integracoes/execucoes`, `/integracoes/conexoes`, `/integracoes/webhooks`, `/integracoes/credenciais`, `/integracoes/logs`, `/integracoes/revisoes-externas`, `/integracoes/api-docs` |
| Administração e suporte | `/manuais-ajuda`, `/administracao`, `/administracao/usuarios`, `/administracao/perfis`, `/administracao/escopos`, `/administracao/configuracoes`, `/administracao/log-operacoes`, `/404` |

## Regras de adaptação

A interface, os tokens de tema, os componentes e a navegação serão copiados diretamente do pacote. A autenticação continuará usando OAuth e cookies seguros do runtime gerenciado. O esquema Drizzle será preservado, porém sua aplicação ocorrerá pelo banco gerenciado. Os bytes de fotos e evidências serão enviados ao armazenamento gerenciado, mantendo no banco apenas chaves e metadados. O receptor ALRT continuará desativado por padrão e será ativável por configuração com chave de API ou HMAC, tolerância temporal e limitação de requisições.

## Evidências de equivalência após a portabilidade

| Verificação | Resultado |
|---|---|
| `server/routers.ts` original × portado | Arquivos idênticos; SHA-256 `35deacf52bf84249af9ab8f0bfbcb4776cc9be841d0b3aed8debc55926ec8762` |
| `server/db.ts` original × portado | Arquivos idênticos; SHA-256 `f8a55ba590940aa22ae8916a408ac2764ae083d53b605cc19b62c16221153142` |
| Superfície tRPC | 22 nós de roteador e 95 declarações de procedimentos preservadas |
| Banco gerenciado | 34 tabelas de domínio, 63 chaves estrangeiras e 134 índices/uniques, além do histórico Drizzle |
| Rotas React | 26 caminhos preservados e respondendo HTTP 200 no servidor de desenvolvimento |
| Ciclo de ocorrência | Criação, atualização, triagem, despacho, aceite, atendimento, conclusão e auditoria validados por contratos tRPC |
| Jornada/escala | Início, pausa, retorno e encerramento validados com restrição à equipe própria |
| Suíte automatizada | 52 arquivos de teste e 184 casos após a inclusão das suítes de portabilidade |
| Segurança | Regressão interna aprovada e auditoria de dependências de produção com 0 vulnerabilidades conhecidas |

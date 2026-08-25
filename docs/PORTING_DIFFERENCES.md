# Diferenças intencionais da portabilidade

Este registro cataloga as diferenças encontradas pelo `diff -qr` completo entre o pacote **AXE Dispatch v1.15.0** e o projeto gerenciado. Foram excluídos da comparação apenas `node_modules`, `dist`, `.git`, `.manus-logs` e o metadado local do ambiente. As áreas funcionais centrais — incluindo `client/src/App.tsx`, páginas, componentes de domínio, `server/routers.ts` e `server/db.ts` — permanecem iguais ao pacote-fonte, salvo as adaptações listadas abaixo.

| Área | Diferença intencional | Motivo e preservação |
|---|---|---|
| Identidade no cabeçalho | `DashboardLayout.tsx` substitui a URL `/manus-storage/axe-sistemas-viking-mark_2bb3ebce.png` por um escudo vetorial em gradiente. | O arquivo referenciado não existe no ZIP: não há nenhum PNG, JPG, WEBP, SVG ou ICO no pacote. A substituição elimina o ícone quebrado, mantém o espaço, a paleta, a hierarquia e os nomes “AXE Dispatch / AXE Sistemas”, sem alterar a navegação. |
| Favicon e documento | `client/index.html` usa favicon SVG embutido e mantém o título “AXE Dispatch — AXE Sistemas”. | A mesma ausência do asset impossibilita restaurar o bitmap original. O SVG usa a mesma marca vetorial do cabeçalho e não exige armazenamento externo. |
| Banco e migrações | As 20 migrações históricas foram arquivadas em `docs/legacy-migrations`; o runtime usa a migração-base gerenciada e uma migração consolidada do domínio. | Evita recriar ou apagar a tabela `users` existente. O esquema final foi aplicado ao MySQL gerenciado com 34 tabelas, 63 chaves estrangeiras e 134 índices/uniques. |
| Nomes de restrições | Três chaves estrangeiras em `drizzle/schema.ts` receberam nomes explícitos curtos. | Os nomes automáticos originais excediam o limite de 64 caracteres do MySQL. Relações, colunas e regras de exclusão foram preservadas. |
| Armazenamento | `server/storage.ts` usa o serviço de arquivos gerenciado; o teste `storage.external.test.ts` valida esse helper. | Remove a dependência de credenciais AWS externas e mantém bytes no armazenamento, com somente chaves e metadados no banco. O proxy continua autenticando antes de gerar URLs. |
| Ambiente e boot | `server/_core/env.ts` concilia variáveis gerenciadas com ALRT; `server/_core/index.ts` mantém validação rígida em produção e aceita o segredo efêmero do preview em desenvolvimento. | Preserva a segurança de publicação sem impedir o ambiente de desenvolvimento gerenciado. O receptor ALRT permanece desativado por padrão. |
| Dependências | `package.json`, `pnpm-lock.yaml` e `pnpm-workspace.yaml` foram conciliados e atualizados. | Mantém as bibliotecas necessárias ao pacote, adiciona o YAML usado pelo OpenAPI e aplica versões corrigidas. A auditoria de produção terminou com 0 vulnerabilidades conhecidas. |
| Testes de portabilidade | Foram adicionados `incidentLifecycle.router.test.ts` e `triageAndShift.router.test.ts`; testes de ALRT, marca e armazenamento foram tornados determinísticos para o runtime gerenciado. | Acrescenta cobertura do ciclo ocorrência→triagem→despacho→aceite→atendimento→conclusão, auditoria, jornada e equipe própria sem usar segredos reais. |
| Cobertura de contratos | Foram adicionados `scripts/generate-trpc-coverage.mjs` e `docs/TRPC_CONTRACT_COVERAGE.md`. | Inventaria os 95 procedimentos tRPC, exige classificação e evidência, e falha se surgir contrato sem regra aprovada. |
| Segurança | `scripts/security-regression-check.mjs` consulta a migração histórica arquivada e também valida a migração consolidada. | Preserva as sete regressões de segurança originais após a reorganização das migrações. |
| Runtime de implantação | Dockerfile, Compose, `.env.container.example`, backup shell e scripts de restauração não integram o runtime gerenciado. | O ambiente fornece build, banco, arquivos, segredos, logs e publicação. Reintroduzir Docker ou backup local criaria caminhos incompatíveis e não persistentes. A documentação original foi preservada em `docs/source-package`. |
| Arquivos do scaffold | O projeto inclui arquivos centrais, analytics, configuração e componentes disponibilizados pelo runtime gerenciado. | São necessários para preview, autenticação, banco, armazenamento e publicação. Não substituem páginas ou fluxos do AXE Dispatch. |
| Documentação | `PORTING_INVENTORY.md`, este documento, a matriz tRPC e o `todo.md` foram adicionados. | Fornecem rastreabilidade da portabilidade, validações e decisões técnicas. |

## Evidências de preservação

| Verificação | Resultado |
|---|---|
| `server/routers.ts` original × portado | Idênticos, SHA-256 `35deacf52bf84249af9ab8f0bfbcb4776cc9be841d0b3aed8debc55926ec8762` |
| `server/db.ts` original × portado | Idênticos, SHA-256 `f8a55ba590940aa22ae8916a408ac2764ae083d53b605cc19b62c16221153142` |
| Diretório `client` | Somente `client/index.html` e `DashboardLayout.tsx` diferem, pelos motivos de marca acima |
| Rotas | 26 caminhos React responderam HTTP 200 |
| Responsividade | 8 rotas recapturadas em desktop (1440×900) e 8 em mobile (390×844) |
| Testes | 51 arquivos e 178 casos aprovados |
| Contratos tRPC | 95 inventariados; 91 com cobertura direta e 4 com cobertura indireta documentada |
| Segurança | Regressão interna aprovada; auditoria de produção com 0 vulnerabilidades |

> **Decisão visual documentada:** a substituição vetorial é a única alteração perceptível de identidade. Ela foi necessária porque o ZIP referencia um asset externo que não foi incluído no pacote. Todas as demais telas, tokens, tipografia, cores, espaçamentos, rotas e fluxos foram preservados.

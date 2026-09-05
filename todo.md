# Project TODO

- [x] Inventariar todas as páginas, rotas, componentes, fluxos e tokens visuais do pacote AXE Dispatch v1.15.0.
- [x] Copiar a aplicação React existente para o projeto gerenciado sem remover telas, componentes ou rotas.
- [x] Copiar e adaptar o backend Express/tRPC preservando todos os procedimentos e contratos existentes.
- [x] Conciliar dependências e configurações do pacote com o runtime gerenciado sem reduzir funcionalidades.
- [x] Preservar autenticação e sessão usando a infraestrutura OAuth gerenciada.
- [x] Preservar controle de acesso por papéis, escopos e hierarquia operacional nos procedimentos protegidos.
- [x] Migrar integralmente o esquema Drizzle de usuários, ocorrências, triagens, equipes, turnos, workflows, auditoria, integrações e relatórios.
- [x] Aplicar ao banco MySQL gerenciado todas as tabelas, índices e restrições necessários ao esquema atual.
- [x] Adaptar fotos de perfil e evidências para o armazenamento de arquivos gerenciado, mantendo metadados no banco.
- [x] Preservar criação, consulta, atualização, despacho e tratamento de ocorrências.
- [x] Preservar triagens, equipes, escalas, turnos e execução de workflows operacionais.
- [x] Preservar evidências, auditoria, relatórios operacionais e exclusões controladas.
- [x] Preservar a entrada ALRT, com modo de ativação configurável, chave de API, assinatura HMAC, tolerância temporal e limitação de requisições.
- [x] Preservar as 26 telas/rotas e seus tratamentos de carregamento, vazio e erro, validados por matriz estrutural, testes de páginas existentes, componente compartilhado renderizado, capturas e fallback global.
- [x] Preservar a identidade visual existente, com acabamento responsivo e substituição vetorial documentada do único asset ausente no ZIP.
- [x] Executar `pnpm check` sem erros de TypeScript.
- [x] Executar a suíte Vitest e corrigir regressões relacionadas à portabilidade.
- [x] Executar a verificação de segurança fornecida pelo pacote e corrigir falhas impeditivas.
- [x] Validar visualmente as rotas principais em desktop e mobile.
- [x] Revisar os logs de servidor, navegador e rede, eliminando erros impeditivos.
- [x] Criar checkpoint final do projeto validado e preparar instruções de publicação pelo painel.
- [x] Conciliar e validar `context.ts`, `cookies.ts`, `env.ts`, `index.ts`, `oauth.ts`, `sdk.ts` e `storageProxy.ts` preservando os fluxos do pacote no runtime gerenciado.
- [x] Confirmar por boot, tipagem e testes que todos os procedimentos tRPC portados permanecem compatíveis.
- [x] Revalidar dependências, patches PNPM e configurações de build/runtime sem diferenças críticas que reduzam funcionalidades.
- [x] Executar testes com cobertura direta de 91 procedimentos tRPC e cobertura indireta documentada dos 4 restantes, registrando a compatibilidade dos 95 contratos.
- [x] Executar a suíte Vitest completa e o build de produção para validar dependências, patches e runtime.
- [x] Revisar sem filtros excessivos as diferenças restantes e documentar cada adaptação intencional sem perda funcional.
- [x] Validar em conjunto os procedimentos de criação, atualização, despacho, aceite, atendimento e conclusão de ocorrências.
- [x] Validar explicitamente triagem, escalas, equipes, turnos e execução de workflows após a migração.
- [x] Validar persistência e consulta de auditoria, log operacional, relatórios e exclusões controladas.
- [x] Recapturar rotas após a correção da marca e comprovar layout desktop/mobile e estados principais.
- [x] Comparar procedimento a procedimento o `appRouter` original e o portado, registrando qualquer diferença intencional.
- [x] Adicionar cobertura dedicada para triagem, jornada/escala, equipes e regras de permissão após a migração.
- [x] Registrar a cobertura dos procedimentos tRPC restantes para sustentar a equivalência total do backend.
- [x] Mapear os 95 procedimentos do `appRouter` para suítes existentes ou justificativas técnicas verificáveis.
- [x] Gerar um inventário final procedimento→cobertura antes do checkpoint.
- [x] Classificar os 95 procedimentos tRPC como cobertura direta, indireta ou justificativa estrutural aprovada.
- [x] Fazer o gerador falhar se algum procedimento não tiver classificação e evidência verificável.
- [x] Adicionar cobertura explícita aos contratos atualmente sustentados apenas por equivalência estrutural.
- [x] Validar carregamento, vazio, erro e navegação das rotas principais por evidência combinada, distinguindo testes renderizados, testes estruturais, capturas e fallbacks globais.
- [x] Restaurar o asset original da marca ou documentar formalmente a substituição vetorial necessária pela ausência do arquivo no pacote.
- [x] Executar um diff completo do projeto-fonte contra o portado e catalogar cada diferença intencional com motivo.
- [x] Gerar uma matriz completa rota→tela→navegação→carregamento→vazio→erro, distinguindo evidência direta, indireta e global.
- [x] Validar estados compartilhados renderizados com `QueryState.test.tsx` e registrar separadamente as páginas cobertas por testes próprios ou inspeção estrutural.
- [x] Diagnosticar a rejeição de `JWT_SECRET` no ambiente de produção gerenciado durante o boot.
- [x] Ajustar a validação de segredo para aceitar somente o segredo gerenciado equivalente, sem permitir valores de exemplo ou segredos fracos.
- [x] Validar o boot do bundle de produção com ambiente representativo, testes, segurança e build.
- [x] Criar checkpoint corrigido e orientar nova publicação pelo painel.
- [x] Diagnosticar por que os itens e botões laterais não são exibidos na sessão operacional padrão.
- [x] Restaurar os grupos e botões laterais previstos no AXE Dispatch, mantendo as regras de acesso e rotas válidas.
- [x] Cobrir a visibilidade da navegação lateral por perfil e preservar os controles existentes de recolhimento.
- [x] Validar a barra lateral restaurada em desktop e mobile.
- [x] Criar checkpoint publicável da correção da barra lateral e registrar as instruções de acesso.
- [x] Adicionar teste renderizado da barra lateral para superadministrador, despachador e agente de campo.
- [x] Adicionar teste de interação do botão de recolhimento e expansão da barra lateral.
- [x] Reproduzir a ausência de itens laterais na sessão publicada e registrar perfil, permissões e estado de carregamento efetivos.
- [x] Corrigir a regra de fallback da navegação lateral para não ocultar itens quando as permissões ainda não foram carregadas.
- [x] Validar o fallback da sidebar com catálogo RBAC vazio, testes de acesso, testes renderizados e preview atualizado.
- [x] Criar checkpoint da correção comprovada e orientar atualização sem cache.
- [x] Mapear callbacks, contexto, cookies, procedimentos e componentes dependentes do OAuth Manus.
- [x] Adicionar credenciais locais com senha derivada de forma resistente, usuário único e identificador de login.
- [x] Implementar sessão local HTTP-only, expiração, logout e proteção contra tentativa excessiva de autenticação.
- [x] Criar bootstrap administrativo via credenciais seguras de implantação, sem senha padrão no código ou banco.
- [x] Substituir redirecionamentos e telas do OAuth por uma página de login local acessível e compatível com o padrão visual.
- [x] Preservar papéis, permissões e controle de acesso no contexto autenticado local.
- [x] Cobrir login, falha de senha, bloqueio por tentativas, sessão, logout e autorização com Vitest.
- [x] Validar login local e as rotas protegidas em desktop/mobile, com credenciais administrativas fornecidas de forma segura.
- [x] Criar checkpoint publicado e entregar somente as instruções seguras de primeiro acesso.
- [x] Cobrir procedimentos críticos de ocorrências permitidos e proibidos para despachador e agente após login local.
- [x] Permitir provisionar ou redefinir login e senha locais para usuários operacionais sem expor hashes.
- [x] Cobrir autenticação local e autorização para administrador, despachador e agente de campo.
- [x] Executar testes integrados de login, sessão, logout e procedimentos protegidos para administrador, despachador e agente.
- [x] Cobrir a persistência de falhas de senha e o bloqueio temporário no banco por meio de testes integrados.
- [x] Validar no navegador o login administrativo e o acesso subsequente a rota protegida em desktop e mobile.
- [x] Testar provisionamento e redefinição de credenciais locais, incluindo o bloqueio de acesso não autorizado.
- [x] Cobrir tRPC permitido/proibido e logout para despachador e agente com sessão local.
- [x] Testar `access.createUser` com credenciais locais e autenticar o usuário provisionado.
- [x] Cobrir procedure protegido permitido por despachador e agente em contexto de sessão local.
- [x] Cobrir fluxo integrado do administrador com login, `auth.me`, procedure protegido permitido e logout.
- [x] Validar em repositório o navegador desktop/mobile com login local, rota protegida e logout.
- [x] Comparar o HTML e os bundles do domínio publicado com a revisão de autenticação local atual; o domínio respondeu 503 sem assets e sem cache, confirmando implantação inativa.
- [x] Acionar nova publicação automática da revisão validada para restaurar uma implantação ativa.
- [x] Preparar a confirmação pública do login local após a nova publicação automática.


## GIS-1 — Fundação open source

- [x] Reconciliar a GIS-1 com o checkpoint D-005A 1.15.5 em `checkpoint/d005a-gis1-reconciled-20260903`, preservando recuperação, segurança e testes anteriores.

- [x] Formalizar D-005 — Arquitetura GIS Open Source e Despacho Georreferenciado.
- [x] Isolar a evolução em branch própria sem alterar a `main`.
- [x] Tornar OpenStreetMap o provider preferencial no modo automático.
- [x] Manter Google Maps somente como opção explícita de transição/rollback.
- [x] Criar contratos GIS portáveis em `shared/gis.ts`.
- [x] Padronizar geometria de rota como GeoJSON LineString.
- [x] Implementar adapter OSRM desacoplado do domínio.
- [x] Tratar coordenada inválida, indisponibilidade de rede, timeout e resposta inválida.
- [x] Adicionar testes unitários do adapter OSRM.
- [x] Executar testes GIS direcionados (11/11), `pnpm check` e build em CI com dependências instaladas via lockfile congelado.
- [x] Reexecutar a suíte local Vitest completa sobre a base D-005A reconciliada; integração e recovery com infraestrutura real permanecem suítes separadas e não foram simuladas.
- [x] Integrar o provider OSRM a uma procedure autenticada do backend.
- [x] Exibir distância e ETA da equipe candidata no fluxo de despacho.
- [x] Implementar pré-seleção por distância geodésica e ranking das equipes candidatas.
- [x] Desenhar a geometria GeoJSON da rota no mapa Leaflet do fluxo de despacho.
- [x] Substituir o embed OSM por renderização Leaflet nativa com carregamento lazy e rollback Google preservado.
- [x] Validar GIS-1 em desktop/mobile com o componente real `OperationalMap`, evidência Chrome 1440×900 e 390×844, sem overflow horizontal; checkpoint de homologação preparado.


## D-006 — Módulo iFrame Responsivo e Aplicações Incorporadas

- [x] Validar workspace D-006B em CI: Qualidade #30, GIS visual #25 e NEO workspace visual #5 aprovados no commit `b34798782ce1f95971d711ee5af1c78abe376f8a`.
- [x] Validar D-006A em CI: Qualidade #14 e GIS visual #9 aprovados no commit `354d6a8396605117a0ca6bc840034fbaa5f7720e`.
- [x] Validar D-006D RBAC no commit `8854eba41d4c35080464093c6eddb73ea023d229`: Qualidade #115, GIS visual #110, NEO external #47 e NEO visual #90 aprovados; checkpoint `checkpoint/d006d-embedded-app-rbac-20260904`.
- [x] Validar D-006E CSP no commit `7b71fcd24fcb290c9e5bfa42165df2bd3f2e7d4f`: Qualidade #121, GIS visual #116, NEO external #53 e NEO visual #96 aprovados.

- [x] Formalizar arquitetura e requisitos do módulo iFrame responsivo.
- [x] Registrar NEO Interact como primeira aplicação de referência.
- [x] Registrar URL do iframe `https://gscprj.saas.digitro.cloud/neo/` e origin `https://gscprj.saas.digitro.cloud`.
- [x] Criar modelo tipado de configuração de aplicações incorporadas, com NEO Interact na allowlist inicial.
- [x] Criar RBAC específico: `embedded_apps.view` para visualizar/abrir e `embedded_apps.manage` para administração, preservando wildcard administrativo legado.
- [x] Implementar componente `EmbeddedApplicationFrame`.
- [x] Implementar allowlist de URL/origin e bloqueio de URL arbitrária.
- [x] Implementar comunicação bidirecional via `postMessage` (`init` + recepção controlada).
- [x] Validar mensagens com schema tipado e rejeitar payload desconhecido.
- [x] Implementar `TOGGLE_IFRAME_SIZE` com limites de viewport/container.
- [x] Implementar loading, timeout, erro e retry/fallback controlado.
- [x] Implementar permissões declarativas de câmera, microfone e clipboard na configuração da aplicação.
- [x] Verificar CSP `frame-src`, `frame-ancestors` e X-Frame-Options: o AXE Dispatch restringe `frame-src` a `'self'` + `https://gscprj.saas.digitro.cloud`; no HTTP externo observado do NEO não houve `frame-ancestors` nem X-Frame-Options, portanto a classificação externa permanece `undetermined` e não constitui autorização comprovada de embedding autenticado.
- [ ] Homologar sessão/login/cookies no contexto incorporado.
- [x] Validar layout D-006B em desktop 1440×900 e mobile real 390×844 sem overflow horizontal.
- [x] Criar teste visual automatizado com Chrome DevTools para o workspace responsivo e evidências PNG/DOM/relatório.
- [ ] Homologar NEO Interact em ambiente autorizado.
- [x] Implementar primeira composição operacional lado a lado Ocorrência + NEO em desktop e empilhada em mobile; dock/janela desacoplada permanecem evolução posterior.


## D-007 — Controle de Jornada de Trabalho

- [x] D-007A — Fundação histórica da jornada: sessões/eventos auditáveis, máquina de estados por usuário, compatibilidade legada e histórico básico; checkpoint `checkpoint/d007a-work-shift-history-20260904`.
- [x] D-007B — Implementar escalas fixas e cíclicas 12x36, associação por usuário, exceções, bloqueio de sobreposição, snapshot planejado na sessão real e planejado x realizado.
- [x] D-007B — Implementar cobertura `completed` / `in_progress` / `missing_start`, contratos tRPC e RBAC `work_shift_schedules.view/manage` com escopo fail-closed.
- [x] D-007B — Materializar/versionar `drizzle/0004_d007b_work_shift_schedules.sql` sem aplicar migration em banco real e sem criar grants automáticos.
- [x] D-007B — Validar segurança, TypeScript, 434 testes, build, GIS visual, NEO external e NEO workspace no SHA funcional `a60f62ddda24a08465f936e9ef62683f9eec9ece`.
- [x] D-007B — Fechar documentação, inventário dos 110 contratos tRPC e evidência auditável; checkpoint definitivo `checkpoint/d007b-work-shift-schedules-20260904` @ `be9b63e9e62f9e28620bb1fa753b89fdef5242f5`.
- [x] D-007C — Implementar elegibilidade individual D-007A/B, consolidação por equipe e razões explícitas de inelegibilidade antes do GIS/OSRM.
- [x] D-007C — Carregar membros, sessões e planejamento exclusivamente server-side, com consultas somente leitura, fallback D-007A quando não há D-007B e falha técnica fail-closed.
- [x] D-007C — Adicionar `dispatch.rankEligibleCandidates`, validar `dispatch.view`/escopo de cada equipe e impedir que candidatos inelegíveis sejam enviados ao GIS/OSRM; `gis.rankCandidates` legado permanece compatível.
- [x] D-007C — Implementação funcional concluída; fechamento condicionado aos quatro gates finais e ao checkpoint `checkpoint/d007c-dispatch-work-shift-eligibility-20260904`, a ser registrado sem merge/deploy.
- [ ] D-007D — Administração avançada, relatórios, alertas e ajustes de jornada. Não iniciado.

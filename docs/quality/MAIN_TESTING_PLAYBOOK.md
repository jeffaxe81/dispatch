# AXE Despacho Web + Mobile — roteiro de testes a partir da main

**Escopo:** laboratório local e homologação autorizada. **NÃO é release de produção, não concede acesso a sistemas externos e não modifica gates reais por inferência.** Para cada teste anotar SHA, data UTC, executor, resultado e link de evidência sanitizada.

## 1. O que pode ser testado hoje
| Plataforma | Ambiente | Permitido testar | Não aprovado |
| --- | --- | --- | --- |
| Web | Node 24 / Docker + MySQL 8.4 descartável | Login local de teste, RBAC, ocorrências, formulários, GIS/NEO simulados, contratos tRPC, segurança, build, responsividade | Conectar NEO/CRM/Forge reais ou migrar banco operacional |
| Mobile Web/PWA | Navegador desktop com backend e proxy locais de desenvolvimento | UI responsiva, login via cookie HttpOnly da mesma origem, sessão, atribuições fictícias, estados de erro e cache opcional | Acessar central pública sem homologação ou aceitar cookies de origem cruzada |
| Mobile Android debug | Android 14/15/16 (SDK API 34/35/36) | Instalar APK debug, telas do laboratório, navegação, rotação, retorno ao app, perda de rede, UI e permissões locais | Login nativo operacional, GPS autenticado para a central, background operacional ou teste com dados reais |
| Mobile iOS | Código e testes de contrato; compilação iOS exige macOS/Xcode | Inspeção de UI e testes de código | Distribuição iOS ou homologação física concluída |

## 2. Evidências automáticas — verificar no GitHub
- [CI Web, branch main](https://github.com/jeffaxe81/dispatch/actions/workflows/quality.yml)
- [CI Mobile, branch main](https://github.com/jeffaxe81/axe-despacho-mobile/actions/workflows/quality.yml)
- [Android APK debug e emuladores](https://github.com/jeffaxe81/axe-despacho-mobile/actions/workflows/android-debug.yml)
- [Fases e aceite Web](https://github.com/jeffaxe81/dispatch/blob/main/docs/quality/PHASE_HANDOFF_REPORT.md)
- [Fases e aceite Mobile](https://github.com/jeffaxe81/axe-despacho-mobile/blob/main/docs/quality/PHASE_HANDOFF_REPORT.md)

**Somente uma execução marcada `success` no SHA em teste é evidência de CI.** Suites sintéticas e emuladores não equivalem a teste de campo.

## 3. Testes locais Web
Requisitos: Node.js 24, Corepack/pnpm do repositório, Docker com Docker Compose; ambiente local isolado.
```bash
git clone https://github.com/jeffaxe81/dispatch.git
cd dispatch
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm security:check
corepack pnpm check
corepack pnpm test
corepack pnpm readiness:dispatch
node --test scripts/quality/phase-handoff-audit.nodecheck.mjs
corepack pnpm build
```
Para testar a aplicação com MySQL descartável: copiar `.env.example` para `.env`, preencher valores `CHANGE_ME` com segredos **gerados localmente**, manter adapters externos desabilitados, limitar o acesso de rede ao laboratório e então executar `docker compose up --build -d`. Confirmar `/health/live` local na porta configurada, visualizar `docker compose ps` e depois `docker compose down` **sem `-v`** caso seja necessário preservar as evidências do banco de teste. **Nunca compartilhar o arquivo .env nem reutilizar credenciais reais.**

### Matriz mínima Web
- [ ] Login, sessão expirada e logout: tela perde dados sensíveis; acesso não autorizado retorna erro.
- [ ] Perfis de usuário e organizações A/B com dados sintéticos: testar acesso permitido e negado.
- [ ] Criar/atribuir/concluir ocorrência fictícia e verificar atualização na central.
- [ ] Simular falha de API, indisponibilidade GIS e componentes NEO; conferir estados de erro sem perda indevida de dados.
- [ ] Verificar responsividade em larguras 320, 375, 768, 1024 px, teclado e rolagem.
- [ ] Executar preflight de evidências e comprovar `NO_GO` enquanto 0/3 gates reais permanecerem pendentes.

## 4. Teste Mobile Web/PWA
```bash
git clone https://github.com/jeffaxe81/axe-despacho-mobile.git
cd axe-despacho-mobile
npm install
npm run check
npm test
npm run readiness:mobile
node --test scripts/quality/phase-handoff-audit.nodecheck.mjs
npm run build
```
Para executar em navegador **no mesmo computador da central de teste**, definir no `.env.local` a variável `VITE_DISPATCH_DEV_PROXY=http://127.0.0.1:3000` (sem credenciais) e executar `npm run dev`; a UI fica em `http://127.0.0.1:5175`. A autenticação por cookie está limitada à PWA same-origin. Não publicar o proxy Vite na LAN nem expor via túnel.

### Matriz mínima Mobile
- [ ] Android debug: baixar artefato `axe-despacho-android-debug` de uma execução **verde** do workflow Android, seção **Artifacts**, dentro do prazo de retenção.
- [ ] Emuladores API 34/35/36: conferir instalação, inicialização, retorno do app, botão Voltar, mudanças de orientação e permissão de GPS de laboratório.
- [ ] Tentar login nativo e confirmar bloqueio `NATIVE_AUTH_PENDING` (não contornar).
- [ ] Na PWA, validar escopo usuário/organização/equipe, sessão revogada e alternância de abas.
- [ ] Limpar `localStorage` em outra aba: interface operacional perde acesso e exige confirmação remota do logout.
- [ ] Cache opt-in: verificar limite de 15 minutos, dados sem endereço/coordenadas/descrição e limpeza ao sair.
- [ ] Simular perda de rede, resposta atrasada, relógio avançando e GPS velho; não reexecutar mutações automaticamente.
- [ ] Conferir `NO_GO` e 0/4 gates reais no `readiness:mobile`.

## 5. Evidência de cada cenário
Registrar: ID, ambiente, SHA, data UTC, executor, teste, resultado `PASS/FAIL/BLOCKED`, logs/prints **sem credenciais ou dados pessoais**, link de execução e problema associado. Se falhar, registrar issue e impedir promoção da entrega. A passagem F04 requer revisor **independente**. F05 requer homologação operacional real e F06 exige aprovação explícita; até lá, manter **NO-GO**.

## 6. PRs ainda não aptas a integrar
PRs Draft de autenticação, RBAC, cookies, escopo, storage e alterações responsivas do repositório Web devem ser revisadas, atualizadas contra `main` e reexecutadas na CI antes de merge. O objetivo de testar a `main` não autoriza remover controles nem publicar ambientes.

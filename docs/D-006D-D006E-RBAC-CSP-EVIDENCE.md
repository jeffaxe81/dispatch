# D-006D / D-006E — Evidência de RBAC e CSP para aplicações incorporadas

**Data:** 04/09/2026  
**Escopo:** AXE Dispatch + NEO Interact incorporado  
**Status:** controles sob responsabilidade do AXE validados; autenticação embedded do NEO permanece dependência externa.

## 1. Aplicação de referência

- iframe: `https://gscprj.saas.digitro.cloud/neo/`
- origin exato: `https://gscprj.saas.digitro.cloud`

## 2. D-006D — RBAC específico

Checkpoint funcional validado: `8854eba41d4c35080464093c6eddb73ea023d229`.

Permissões separadas:

- `embedded_apps.view`: listar e abrir aplicações incorporadas;
- `embedded_apps.manage`: consultar o catálogo administrativo e preparar a administração futura;
- `*`: compatibilidade preservada para o administrador legado.

A interface do detalhe da ocorrência não usa mais `integrations.view` como autorização para exibir **Comunicação NEO**. O botão passa a depender de `embedded_apps.view` ou do wildcard administrativo.

Gates do checkpoint D-006D:

- Qualidade #115 — sucesso;
- GIS visual #110 — sucesso;
- NEO external compatibility #47 — sucesso;
- NEO workspace visual #90 — sucesso.

Checkpoint imutável: `checkpoint/d006d-embedded-app-rbac-20260904`.

## 3. D-006E — `frame-src` do AXE Dispatch

Commit funcional validado antes da consolidação documental: `7b71fcd24fcb290c9e5bfa42165df2bd3f2e7d4f`.

O servidor passa a aplicar uma diretiva específica para frames:

```text
frame-src 'self' https://gscprj.saas.digitro.cloud
```

Regras implementadas:

- nenhuma origem com wildcard é promovida para a política;
- somente origins HTTPS exatas de aplicações habilitadas entram na allowlist;
- o caminho `/neo/` não é inserido em `frame-src`;
- origins duplicadas são eliminadas;
- um `frame-src` anterior é substituído pela allowlist calculada;
- demais diretivas CSP existentes são preservadas;
- o middleware é registrado antes das rotas tRPC/static e passa a valer para as respostas atendidas pelo servidor.

A implementação foi conduzida em três ciclos RED/GREEN:

1. contrato puro da diretiva e merge da CSP;
2. middleware Express preservando CSP existente;
3. ligação efetiva do middleware no servidor.

Gates do commit funcional:

- Qualidade #121 — sucesso;
- GIS visual #116 — sucesso;
- NEO external compatibility #53 — sucesso;
- NEO workspace visual #96 — sucesso.

## 4. `frame-ancestors` e `X-Frame-Options` observados no NEO

O probe HTTP externo, executado sem credenciais e sem cookie jar, observou na resposta inicial do NEO:

- HTTP 200;
- sem redirecionamento;
- nenhum `Content-Security-Policy` com `frame-ancestors` observado;
- nenhum `X-Frame-Options` observado;
- nenhum cookie de sessão observado nessa resposta inicial.

A classificação permanece **`undetermined`**. A ausência desses cabeçalhos na resposta observada **não deve ser interpretada como autorização comprovada de incorporação autenticada**.

Evidência externa de referência do SHA D-006D/D-006E:

- workflow: NEO external compatibility #47/#53;
- artifact de referência: `d006c-neo-external-compatibility`;
- artifact id observado anteriormente: `9941274456`;
- digest: `sha256:7a51cb21e78d6c02093995ec089f904faf98dab19b25c7cb1d4b65840120e6a3`.

## 5. Dependência externa ainda aberta — autenticação embedded

A issue #23, **D-006C — autenticação NEO em iframe cross-site**, permanece aberta.

A autenticação real do NEO já foi diagnosticada: após login em primeira parte, a sessão usa armazenamento local do navegador, e o contexto cross-site/embedded não reutilizou automaticamente essa sessão. Portanto o AXE não tentará contornar essa separação de segurança.

Para concluir a homologação autenticada é necessário definir um mecanismo oficialmente suportado pelo NEO, como SSO, bootstrap/token exchange específico, modo de integração documentado ou outra estratégia homologada pelo fornecedor.

Critérios que permanecem pendentes:

- login suportado dentro do cenário embedded;
- reaproveitamento/estabelecimento seguro da sessão no iframe;
- logout e expiração;
- câmera/microfone em sessão autenticada;
- comportamento real do `TOGGLE_IFRAME_SIZE` emitido pela aplicação;
- desktop/mobile autenticados no ambiente autorizado.

## 6. Limites desta evidência

Esta etapa não realizou:

- merge em `main`;
- deploy;
- alteração de produção;
- migration de banco;
- persistência de senha/token do NEO;
- bypass de política de navegador ou do provedor.

O objetivo desta evidência é fechar os controles de RBAC e CSP que pertencem ao AXE Dispatch, mantendo explicitamente separada a dependência externa de autenticação do NEO.

# Cookies de sessão AXE Despacho — segurança pré-produção

Data: 05/11/2026. Mudança proposta em PR de revisão, **não implementada em produção**.

## Ajuste
O cookie de autenticação da central mantém `HttpOnly`, `Secure` quando a conexão é HTTPS e `Path=/`, mas troca o padrão HTTPS de `SameSite=None` para `SameSite=Lax`. Isso limita o envio automático do cookie em requisições entre sites, mitigando parte dos riscos de CSRF e reduzindo exposição da sessão.

A API web e o cliente AXE Despacho Mobile PWA devem operar **na mesma origem**. Não foi introduzido armazenamento de credenciais em JavaScript, uso de CORS aberto nem autenticação nativa. `SameSite=Lax` não substitui a validação de origem por middleware (PR #238) nem a defesa contra XSS.

## Risco de compatibilidade e homologação
A modificação pode interromper aplicações que dependem de sessões da central carregadas em iframes de terceiros ou fluxos de autenticação cross-site. **Não fazer merge** sem inventário e homologação de todos esses casos, incluindo HTTPS reverso proxy, acesso direto, login, logout e mutações autenticadas.

O valor `Secure` continua derivado de `req.secure/req.protocol` com `trust proxy` configurado; confirmar que o ambiente TLS de produção não gera cookies sem `Secure`. Validar cabeçalhos e comportamento em Chrome, Firefox, Safari e Android.

## Próximos bloqueios
Revogação persistente de JWT após logout (o token emitido continua válido até expirar, se capturado), autenticação nativa, GPS operacional, testes com banco real, RBAC tenant-aware e revisão final de aplicação. Este PR não altera schema, backend de autenticação nem produção.

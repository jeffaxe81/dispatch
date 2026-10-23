# D-012J J32 — executor isolado de probe em homologação

## Objetivo

Compor a autorização one-shot da J31 com um callback de probe **somente por injeção interna**, sem conectar qualquer adapter real, endpoint, scheduler ou worker.

## Ordem obrigatória

1. Validar gate estrito de homologação.
2. Consumir a intenção one-shot J31 via CAS/fencing.
3. Somente após o consumo vencedor, chamar o callback de probe com `organizationId + system`.
4. O callback não recebe lease token nem execution token.
5. Resultado confiável `success|failure` é encaminhado para `resolveProbe`.
6. Exceção/resultado incerto não gera retry nem segunda tentativa: o grant fica consumido e o circuito permanece half-open até reconciliação/expiração.

## Gate de runtime

A composição fica desabilitada por padrão e só pode operar quando:
- `NODE_ENV=test`;
- `AXE_RUNTIME_ENV=homologation`;
- `AXE_INTEGRATION_PROBE_J32_ENABLED=true`.

Nenhum módulo produtivo importa ou instancia este executor nesta entrega.

## Segurança

- tenant+sistema continuam resolvidos pelo coordinator persistente;
- CAS/fencing J31 é obrigatório antes do callback;
- callback não vê tokens;
- não existe replay automático;
- não existe fallback em caso de outcome incerto;
- segundo uso do mesmo grant falha antes do callback.

## Fora de escopo

- HTTP/tRPC/UI;
- adapters NEO/CRM/Inventário reais;
- credenciais;
- scheduler/worker;
- retry;
- deploy;
- grants;
- migration real;
- merge da pilha em main.

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


## Endurecimento de exceções e concorrência

- Erros do adapter e do banco/coordinator são substituídos por mensagens estáticas sem `cause`, tokens, SQL, endpoints, payloads ou credenciais.
- Falha ao consumir o grant encerra antes de chamar o callback; não ocorre execução não autorizada.
- Se o callback falhar, retornar resultado ambíguo ou a persistência da resolução ficar incerta, o grant já consumido **não** é reutilizado. O estado continua conservador para reconciliação manual.
- `failure` confiável reabre o circuito com cooldown; `success` confiável fecha o circuito.
- Testes adicionais verificam ausência de vazamento de segredos, token consumido, falha do storage e disputa simultânea com um único vencedor CAS.
- A cobertura em memória não substitui MySQL real, homologação externa ou monitoramento operacional.

A correção não amplia o gate J32 nem concede permissão para executar adaptações reais, chamadas externas, scheduler ou replay.

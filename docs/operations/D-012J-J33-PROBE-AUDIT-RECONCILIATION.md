# D-012J J33 — reconciliação passiva de evidências de probe

## Objetivo

Distinguir o *estado auditado do circuito* após J31/J32 sem inferir confirmação do serviço remoto e **sem conceder permissões de reexecução**. O J33 não reinicia operações, não libera tráfego e não gera novo grant.

## Estados de saída

- `manual_review_required`: intenção one-shot consumida, sem registro confiável de resolução; requer investigação humana
- `circuit_closed_verified`: auditorias sanitizadas encadeadas e versão CAS atual comprovam fechamento do circuit breaker, **não** prova entrega/aceitação remota
- `circuit_opened_verified`: auditorias encadeadas e versão CAS atual comprovam retorno ao estado aberto
- `evidence_missing`: não há registros suficientes para qualquer conclusão
- `inconsistent`: dados de escopo, versões, estado ou auditoria divergem/duplicam; bloqueio conservador
- `history_advanced`: circuito mudou após a resolução que se pretendia verificar; não se afirma o desfecho atual da operação original
- `not_found`: não foi encontrado circuito para o tenant+sistema fornecido pelo servidor

Todas as respostas incluem `permitsReplay:false`, `permitsProbe:false`, `permitsExternalCall:false` e `permitsAutomaticReplay:false`. Não contêm credenciais, tokens, dados brutos de auditoria nem texto de erros SQL.

## Fonte de evidência

`server/integrationProbeAuditReconciler.ts`: classificador puro e serviço interno somente leitura. Exige o par tenant+sistema e a versão CAS de consumo J31, valida a sequência `consumed (v) → resolved (v+1)` e exige uma única auditoria sanitizada de cada etapa. Ausência de evidência nunca significa que uma chamada não aconteceu.

`server/integrationProbeAuditMySqlReader.ts`: consulta somente as colunas necessárias de `integration_circuit_state`, filtrando por `organization_id + system`, obtém `resource_id` da linha autorizada e lê até 200 auditorias somente dos três eventos permitidos. Se o limite for alcançado, retorna `inconsistent`, sem inferir que o histórico está completo.

O classificador exige os campos exatos `organizationId,system,state,version,consecutiveFailures` em cada projeção. Campos adicionais como token, payload ou mensagem bruta invalidam a evidência. Erros do banco são substituídos por erro estático sem `cause`.

A leitura em duas consultas pode observar dados em momentos diferentes. Os estados descritos são diagnósticos conservadores, **não** uma autorização transacional para qualquer ação futura; a produção precisará de uma captura consistente e controles administrativos explícitos antes de permitir qualquer mutação. Mesmo a classificação verificada não confirma que o sistema remoto recebeu algo.

## Gate

O serviço interno rejeita uso salvo quando **todos** estão presentes:

- `NODE_ENV=test`
- `AXE_RUNTIME_ENV=homologation`
- `AXE_INTEGRATION_PROBE_J33_ENABLED=true`

Não há rota HTTP, tRPC, botão de UI, scheduler, worker, integrador real ou exposição a cliente. O chamador confiável deve resolver `organizationId` no servidor; nenhuma autoridade de tenant deve vir de parâmetro do navegador.

## Testes e fechamento

- test-first/RED para classificação, idempotência, versões, escopo, sanitização, leituras bloqueadas, ausência de replay e histórico avançado
- validação em CI de TypeScript, segurança, suíte unitária, build, Docker, SLA MySQL e integração MySQL
- PR Draft empilhada sobre J32, sem merge em `main`, deploy, migration real, ativação externa ou política de replay

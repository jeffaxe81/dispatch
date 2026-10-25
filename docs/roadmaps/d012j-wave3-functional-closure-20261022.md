# D-012J — Onda 3 — consolidação funcional

**Data:** 2026-10-22  
**Base empilhada:** D-012J J1–J7  
**Estado:** escopo funcional antecipado; gates ambientais ainda separados.

## Objetivo

Consolidar a Onda 3 do roadmap de antecipação: observabilidade, resiliência e campo, sem converter automaticamente o resultado em merge, deploy ou ativação produtiva.

## Entregas funcionais cobertas

1. **Métricas operacionais SLA/DLQ — J3 / PR #134**
   - backlog, leases, retry, DLQ e lag;
   - tenant-scoped;
   - sem payload sensível.

2. **Trilha por correlationId — J4 / PR #135**
   - diagnóstico sanitizado;
   - sem token, corpo de notificação ou PII.

3. **Readiness passivo — J5 / PR #136**
   - scheduler/adapters classificados sem probes ativos;
   - backlog e evidências tratados fail-closed;
   - sem tornar terceiro requisito do core.

4. **Conflito explícito no aplicativo de campo — J6 / PR #137**
   - mais de uma ocorrência ativa deixa de ser resolvida silenciosamente por `find(...)`;
   - ações de transição, evidências e compartilhamento de localização são bloqueadas até saneamento;
   - RED real: 1 falha nova / 1.541 testes anteriores passando;
   - GREEN head: `5b7e3b9469d61b28420dd3ef3cf50059d6574582`;
   - Qualidade #1461 e SLA MySQL #52: GREEN;
   - checkpoint: `checkpoint/d012j-j6-green-20261022`.

5. **GIS degradado — J7 / PR #138**
   - provider preferencial atual preservado;
   - falha real de tiles OSM sinaliza `degraded`;
   - aviso operacional informa que o mapa base externo falhou sem derrubar o core;
   - RED real: 1 falha nova / 1.542 testes anteriores passando;
   - GREEN head: `82aa562b12c39eb9b179d224db33c3bec0352cae`;
   - Qualidade #1468 e SLA MySQL #59: GREEN;
   - checkpoint: `checkpoint/d012j-j7-green-20261022`.

6. **Backup / restore / rollback em ambiente separado — evidência herdada D-005**
   - `RECOVERY_SOURCE_CLASS` rejeita produção;
   - alvo exige classe `disposable`;
   - banco alvo precisa começar com `dispatch_recovery_`;
   - fonte e alvo não podem compartilhar URL de banco nem credencial de storage;
   - confirmação explícita `RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH`;
   - drill controlado cobre backup, limpeza do alvo descartável, restore, verificação e rejeições de integridade.

## Gates que NÃO são inferidos como concluídos

Os itens abaixo exigem ensaio/homologação própria e permanecem pendentes enquanto não houver evidência executada:

- failover de infraestrutura externa completo;
- reconexão de adapters externos reais;
- ensaio específico de segurança de localização em dispositivo/navegador real;
- carga mínima de homologação;
- recuperação contra infraestrutura física/serviço separado além do harness controlado;
- aplicação de migrations em banco operacional;
- grants produtivos;
- deploy;
- merge em `main`.

## Resultado da antecipação

O equivalente funcional da **Onda 3 / mês 3** fica implementado e empilhado até J7. A próxima frente de desenvolvimento pode avançar para a Onda 4 (integrações e contratos), enquanto os gates ambientais acima seguem como homologação independente.

Nenhum PR desta trilha deve sair de Draft ou ser mesclado por inferência.

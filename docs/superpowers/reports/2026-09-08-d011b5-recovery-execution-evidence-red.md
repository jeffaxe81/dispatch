# D-011B.5 — Recovery Execution Evidence / Audit Receipt — RED

Baseline: `main` @ `ba2257d5a66093725b142bb8b2fb28b1b8bf10bb`.

Escopo aprovado: ampliar a evidência auditável de cada tentativa de recovery simulada, sem introduzir qualquer executor real ou side effect operacional.

Contrato RED introduzido:
- `evidenceVersion = d011b5-v1`;
- `evidenceId` SHA-256 determinístico;
- vínculo explícito com `authorizationRef`;
- vínculo explícito com `leaseId` e `fencingToken`;
- alteração de `authorizationRef` deve alterar o `evidenceId`;
- allowlist fechada do evento continua obrigatória.

Restrições preservadas:
- simulation-only;
- fail-closed;
- nenhum restart real;
- nenhum systemd/Docker/Podman/Kubernetes/SSH/cloud/hypervisor;
- nenhum failover/rollback/restore/migration;
- nenhum deploy ou habilitação produtiva automática.

Este checkpoint contém somente o contrato de teste e documentação do RED. A implementação produtiva só pode vir após evidência de falha esperada no CI.

# AXE Despacho Web — preparação da revisão independente F04

**F04: PENDENTE (0% de aceite formal).** Documento de entrada para o revisor, não um parecer de segurança nem uma homologação real.

## Evidências de desenvolvimento disponíveis
- [Relatório de passagem de fases](./PHASE_HANDOFF_REPORT.md)
- [PR #250 — auditoria de fases](https://github.com/jeffaxe81/dispatch/pull/250)
- [PR #248 — segurança de sessão e storage (Draft; sem aprovação para integrar)](https://github.com/jeffaxe81/dispatch/pull/248)
- [Issues de homologação operacional #192](https://github.com/jeffaxe81/dispatch/issues/192) e [#97](https://github.com/jeffaxe81/dispatch/issues/97)

## Trabalho técnico verificável a executar
1. Revisar autenticação e autorização por operação, incluindo sessões revogadas, acesso negado, privilégios e isolamento entre tenants, com testes negativos e revisão do código de PR #248.
2. Revisar persistência de anexos e conciliação após falha de banco/objeto, exposição de URLs assinadas, limpeza **não automática** e política de retenção.
3. Conferir logs sanitizados, configuração TLS/HTTPS, limites de upload, tratamento de erros e restrições de rede sem desabilitar controles para "passar" na CI.
4. Conferir resultados dos testes isolados do PR de segurança e documentação das limitações frente ao ambiente Forge real.
5. Registrar riscos residuais, responsáveis, decisão e versão/commit sob revisão. **Não reutilizar os checks de CI como se fossem homologação real.**

## Critérios documentais de passagem
- PR ou parecer com evidências específicas vinculadas ao **commit sob análise**.
- Autor e **revisor independente**, distintos; decisão explícita APPROVED e data UTC auditável.
- Achados e tratamentos revisados, sem bloqueios críticos pendentes; homologação real continua no gate F05 separado.
- O auditor de fases verifica coerência **dos metadados**, não a identidade real do revisor ou a autenticidade remota do parecer. A revisão humana deve confirmá-las.

## Bloqueios atuais
- F04: não existe aqui aceite independente assinado.
- F05: gates [DISPATCH-REAL-01/02/03](https://github.com/jeffaxe81/dispatch/issues/192) não comprovados (0/3).
- F06: sem autorização formal de rollout, restauração/rollback e produção.

**NO-GO. Nenhum deploy, credencial externa, migração de ambiente real ou ativação de storage externo é autorizado por este documento.**

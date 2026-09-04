# Rollback operacional do AXE Dispatch

**Versão de referência:** 1.15.4
**Escopo:** retorno da aplicação, sem restauração automática de dados

## Objetivo

Rollback é a republicação de uma versão anterior conhecida e validada quando uma nova versão causa impacto relevante. Ele reduz o tempo de indisponibilidade, mas não corrige sozinho dados incompatíveis, migrações destrutivas ou falhas de infraestrutura.

Este procedimento é independente do provedor de hospedagem. Use somente o mecanismo de publicação já homologado pela organização. Não execute comandos de remoção de contêineres, volumes, buckets, tabelas ou arquivos como parte deste roteiro.

## Quando considerar rollback

- liveness ou readiness permanece em falha após a janela operacional definida;
- o smoke pós-publicação falha em liveness, readiness ou homepage;
- regressão funcional crítica impede despacho ou consulta operacional;
- aumento anormal de erros, latência ou falhas de autenticação coincide com a nova versão;
- um controle de segurança foi removido ou enfraquecido.

Uma falha isolada e compreendida de configuração pode ser corrigida sem rollback quando a alteração for segura, auditável e mais rápida. Na dúvida sobre integridade de dados, interrompa a decisão e envolva o responsável pelo banco.

## Responsáveis e evidências mínimas

| Papel | Responsabilidade |
|---|---|
| Responsável operacional | declarar o impacto e confirmar a prioridade do serviço |
| Responsável técnico | diagnosticar, verificar compatibilidade e selecionar o checkpoint |
| Autorizador da publicação | aprovar a republicação pelo mecanismo homologado |
| Observador/QA | executar health, smoke e validação funcional controlada |

Antes de agir, registre horário UTC, versão atual, versão pretendida, sintomas, endpoints afetados, início do impacto e evidências disponíveis. Não copie tokens, senhas, URLs assinadas ou conteúdo sensível para o registro.

## Bloqueio obrigatório por compatibilidade de dados

1. Compare as migrações e contratos de dados entre a versão atual e o checkpoint anterior.
2. Se a nova versão criou apenas estruturas compatíveis e a versão anterior consegue ignorá-las, o rollback da aplicação pode prosseguir após aprovação.
3. Se houve remoção, renomeação, transformação irreversível ou escrita em formato não compreendido pela versão anterior, **não faça rollback da aplicação isoladamente**.
4. Restauração de banco, recuperação de backup e reconciliação de objetos pertencem ao D-005 e exigem um plano separado.

O D-004 não altera esquema de banco. Mesmo assim, esta verificação permanece obrigatória para versões futuras que reutilizarem o runbook.

## Procedimento controlado

1. **Conter:** impeça novas mudanças e preserve logs, métricas e a versão problemática para diagnóstico.
2. **Confirmar impacto:** execute liveness, readiness e smoke contra a URL autorizada. Diferencie falha da aplicação, banco, armazenamento e roteamento.
3. **Selecionar checkpoint:** use uma tag, digest de artefato ou commit imutável previamente aprovado. Para retornar antes do D-004, o checkpoint é `checkpoint/d003-v1.15.3`.
4. **Validar compatibilidade:** aplique o bloqueio de dados descrito acima. Se houver dúvida, pare.
5. **Autorizar:** registre quem aprovou, qual versão será republicada e por quê.
6. **Republicar:** use a função de rollback/redeploy do provedor homologado apontando para o artefato imutável. Não reconstrua a versão anterior a partir de dependências móveis.
7. **Validar:** aguarde a nova instância e execute, nesta ordem, liveness, readiness, smoke e uma jornada funcional de baixo risco.
8. **Observar:** acompanhe erros, latência e disponibilidade pelo período definido pela operação antes de encerrar o incidente.
9. **Registrar:** documente resultado, horários, versão efetiva, evidências e próximos responsáveis.

## Validação pós-retorno

```bash
curl --fail --silent https://seu-dominio.example/health/live
curl --fail --silent https://seu-dominio.example/health/ready
SMOKE_BASE_URL=https://seu-dominio.example corepack pnpm smoke:post-deploy
```

Além dos checks automáticos, valide login e uma consulta operacional sem criar ocorrência, alterar despacho ou enviar arquivo. Qualquer ação com efeito real exige autorização da operação.

## Se o retorno também falhar

- não alterne repetidamente entre versões;
- retire a instância não pronta do tráfego pelo mecanismo do provedor;
- preserve logs e correlação de horário;
- verifique banco, armazenamento, DNS, TLS, proxy e variáveis de ambiente;
- escale para recuperação de dados somente pelo plano D-005;
- informe a operação sobre o estado e a alternativa de contingência homologada.

## Registro de encerramento

| Campo | Preenchimento esperado |
|---|---|
| Início e fim UTC | horários do incidente e da estabilização |
| Versão com falha | tag, commit ou digest |
| Versão restaurada | checkpoint imutável efetivamente publicado |
| Motivo | sintoma e causa confirmada ou hipótese atual |
| Compatibilidade | análise de migrações e dados |
| Aprovação | responsáveis operacional e técnico |
| Validação | resultados de health, smoke e jornada controlada |
| Pendências | correção definitiva, D-005, D-010 ou acompanhamento |

## Retorno local de desenvolvimento

O bundle `dispatch-d004-pre-implementation.bundle` e a tag `checkpoint/d004-pre-implementation` preservam o estado anterior ao código do D-004. O checkpoint final 1.15.4 só deve ser criado depois que testes locais e GitHub estiverem verdes. Restaurar uma cópia de desenvolvimento não autoriza publicação em produção.

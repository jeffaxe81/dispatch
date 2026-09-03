# D-002 — Separação das suítes de teste

## Contexto

A execução de `pnpm test` mistura testes locais determinísticos com testes que exigem banco de dados e credenciais de bootstrap. Sem variáveis de ambiente, a linha de base apresentou 51 arquivos aprovados, 5 arquivos falhos, 189 testes aprovados, 4 testes falhos e 7 ignorados.

## Diagnóstico

As falhas de `branding.test.ts`, `localAuth.test.ts` e `storage.external.test.ts` são causadas pela ausência de valores de teste para título, segredo de sessão e configuração simulada do armazenamento. O teste de armazenamento não chama um serviço real: o `fetch` é substituído por um mock.

`localAuth.integration.test.ts` e `localAuth.bootstrap.test.ts` exercitam banco, bootstrap administrativo e persistência real. Esses testes pertencem a uma suíte de integração explícita.

## Decisão

- `pnpm test` e `pnpm test:unit` executarão diretamente a configuração local do Vitest, sem iniciar outra versão do pnpm.
- Testes de integração usarão o sufixo `.integration.test.ts` e serão executados por `pnpm test:integration`.
- `pnpm test:all` executará as duas suítes em sequência.
- A suíte local receberá somente valores fictícios e determinísticos em um setup dedicado.
- A suíte de integração validará `DATABASE_URL`, `JWT_SECRET`, `LOCAL_AUTH_BOOTSTRAP_USERNAME` e `LOCAL_AUTH_BOOTSTRAP_PASSWORD` antes da coleta.
- O teste de armazenamento será classificado como local, pois toda comunicação externa é simulada.

## Alternativas consideradas

1. Ignorar todos os testes que falham sem ambiente: rejeitada porque ocultaria regressões locais de sessão e armazenamento.
2. Exigir banco e credenciais para todo `pnpm test`: rejeitada porque tornaria o ciclo local lento, frágil e inadequado para CI básico.
3. Usar uma única suíte com `skip` condicional: rejeitada porque um resultado verde poderia esconder testes não executados.

## Riscos e controles

- Valores de teste não podem ser usados em produção: o setup será carregado apenas pela configuração da suíte local.
- A suíte de integração pode continuar indisponível fora do ambiente preparado: o comando falhará com uma mensagem explícita, sem marcar testes como ignorados.
- Nenhum contrato de API, evento, conector ou banco será alterado.

## Critérios de aceitação

- `pnpm test` e `pnpm test:unit` passam sem banco ou credenciais reais.
- Nenhum teste da suíte local fica ignorado por falta de ambiente.
- `pnpm test:integration` seleciona somente arquivos `.integration.test.ts`.
- Sem configuração externa, a suíte de integração falha imediatamente e lista as variáveis ausentes.
- Segurança, TypeScript e build permanecem aprovados.

## Resultado

- Instalação congelada aprovada com pnpm 10.4.1.
- Segurança aprovada com 3 migrações e 11 correções preservadas.
- TypeScript aprovado.
- Suíte local aprovada com 56 arquivos e 197 testes, sem testes ignorados.
- Build de produção aprovado; permanecem os avisos preexistentes de analytics e tamanho do bundle.
- A ausência de ambiente de integração é identificada antes da coleta, em aproximadamente 0,1 segundo, com os quatro nomes de variáveis necessários.
- Checkpoint compatível registrado como `1.15.2`.

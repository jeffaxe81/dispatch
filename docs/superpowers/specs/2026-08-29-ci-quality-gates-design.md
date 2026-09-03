# D-003 — CI com portões de qualidade

**Data:** 29 de agosto de 2026

**Produto:** Sistema de Despacho

**Situação:** produto em produção

**Base validada:** versão 1.15.2, checkpoint D-002

**Branch de trabalho:** `chore/ci-quality-gates`

## 1. Contexto atual

O D-002 separou os testes que funcionam sem infraestrutura externa dos testes que exigem banco e credenciais. A versão 1.15.2 foi novamente validada antes deste desenho:

- instalação congelada aprovada com pnpm 10.4.1;
- controle de segurança aprovado;
- TypeScript aprovado;
- 56 arquivos e 197 testes locais aprovados;
- pré-validação de integração interrompendo corretamente quando faltam quatro variáveis obrigatórias;
- build de produção aprovado;
- branch Git limpa e checkpoint local/remoto preservado.

O projeto ainda não possui workflow em `.github/workflows`. Assim, os controles são executados manualmente e um Pull Request pode receber uma regressão sem um aviso automático.

## 2. Objetivo do ciclo

Criar a primeira integração contínua do projeto. Em linguagem simples, o GitHub deverá repetir automaticamente as verificações essenciais sempre que houver uma proposta de mudança para `main` ou uma alteração já integrada nela.

O workflow será um **portão de qualidade informativo** nesta etapa: ele produzirá um resultado confiável, mas a proteção obrigatória da branch será ativada somente depois de observarmos pelo menos uma execução real bem-sucedida.

## 3. Escopo

### Incluído

- workflow para Pull Requests destinados a `main`;
- workflow para pushes em `main`;
- execução manual para diagnóstico;
- instalação com lockfile congelado;
- controle de segurança do projeto;
- verificação TypeScript;
- 197 testes locais;
- build de produção;
- teste automatizado da própria configuração de CI;
- documentação, changelog e checkpoint da versão 1.15.3.

### Não incluído

- testes de integração com banco e credenciais;
- armazenamento de segredos no GitHub;
- implantação em produção;
- merge automático;
- alteração imediata das regras de proteção da `main`;
- cache de dependências na primeira versão;
- atualização geral de bibliotecas;
- mudanças em banco, APIs, eventos ou conectores.

Os testes de integração ficam fora porque ainda não existe um ambiente isolado e seguro para eles no GitHub. Colocar credenciais de produção apenas para “fazer o teste passar” seria um risco inaceitável.

## 4. Opções avaliadas

| Opção | Vantagem | Risco/custo | Decisão |
|---|---|---|---|
| Um job sequencial | Fluxo simples, diagnóstico claro e sem repetição da instalação | Menos paralelismo | **Escolhida** |
| Vários jobs paralelos | Resultado potencialmente mais rápido | Instalação repetida, mais consumo e configuração mais complexa | Adiada |
| Execução somente manual | Implantação simples | Não protege Pull Requests automaticamente | Rejeitada |
| Incluir integração agora | Cobertura mais ampla | Exige banco efêmero, migrações e segredos ainda não preparados | Adiada para evolução própria |
| Habilitar cache já | Pode reduzir o tempo | Acrescenta outra ação externa e complexidade antes de termos uma linha de base | Adiada |

## 5. Arquitetura recomendada

Será criado um único workflow de qualidade com um job sequencial em um executor Linux hospedado pelo GitHub.

### Disparadores

- Pull Request direcionado a `main`;
- push em `main`;
- execução manual por `workflow_dispatch`.

### Ordem das verificações

1. obter o código;
2. preparar Node.js 24;
3. habilitar o Corepack;
4. instalar com `pnpm install --frozen-lockfile`;
5. executar `pnpm security:check`;
6. executar `pnpm check`;
7. executar `pnpm test`;
8. executar `pnpm build`.

A segurança deve rodar antes do build porque o controle atual também verifica que um artefato antigo do servidor não está indevidamente presente. Executar o build primeiro alteraria essa condição e produziria um resultado enganoso.

O Node será mantido na linha 24.x. Isso preserva a versão principal adotada pelo projeto e permite receber correções compatíveis dessa linha. A versão do pnpm continuará vindo do campo `packageManager` do `package.json`, evitando uma segunda fonte de verdade.

## 6. Segurança do workflow

- permissão global mínima: somente leitura de conteúdo;
- nenhuma credencial ou segredo da aplicação;
- ações de terceiros oficiais fixadas por SHA completo e imutável, com comentário indicando a versão humana correspondente;
- nenhuma ação executada com permissão de escrita;
- tempo máximo para impedir execução presa;
- concorrência por workflow e referência, cancelando uma execução antiga quando uma nova alteração torna seu resultado obsoleto;
- sem comandos de deploy, publicação de pacote ou merge.

Fixar uma ação pelo SHA completo reduz o risco de uma etiqueta de versão ser movida posteriormente. As versões exatas serão obtidas nos repositórios oficiais das ações durante a implementação e ficarão explícitas no arquivo do workflow.

## 7. Tratamento de falhas e observabilidade

O job será interrompido na primeira etapa que falhar. A interface do GitHub mostrará o comando, o tempo e o log da falha.

Diagnóstico esperado:

| Falha | O que observar primeiro |
|---|---|
| Instalação | divergência entre `package.json` e `pnpm-lock.yaml` |
| Segurança | migração/correção removida ou artefato indevido |
| TypeScript | arquivo e linha do erro de tipos |
| Testes | suíte, teste e mensagem da asserção |
| Build | variável opcional ausente, importação ou limite de memória |
| Timeout | etapa que consumiu o tempo e possível processo bloqueado |

Os avisos conhecidos de analytics ausente e bundle grande continuarão documentados. Eles não serão ocultados nem transformados artificialmente em sucesso.

## 8. Estratégia de testes

A implementação seguirá desenvolvimento orientado a testes:

1. criar um teste de configuração que falhe porque o workflow ainda não existe;
2. verificar no teste os disparadores, permissões mínimas, timeout, concorrência, ordem dos comandos e pinos SHA;
3. criar o workflow mínimo para fazer o teste passar;
4. repetir localmente instalação, segurança, TypeScript, 197 testes e build;
5. enviar a branch e observar a primeira execução real no GitHub.

O teste também deverá garantir que o workflow não execute `test:integration`, não solicite permissões de escrita e não faça referência a segredos da aplicação.

## 9. Versionamento, documentação e checkpoints

- desenvolvimento isolado em `chore/ci-quality-gates`;
- checkpoint inicial já garantido por `checkpoint/d002-v1.15.2`;
- commits pequenos: especificação, teste/workflow e documentação/versionamento;
- versão planejada: 1.15.3, por ser uma melhoria operacional compatível;
- atualização do changelog e do histórico de decisão;
- checkpoint local e remoto `checkpoint/d003-v1.15.3` somente após todas as verificações;
- Pull Request sem merge automático;
- nenhum deploy nesta etapa.

## 10. Critérios de aceite

O D-003 estará concluído quando:

- a configuração possuir teste de regressão aprovado;
- o workflow usar permissões mínimas e ações fixadas por SHA;
- a instalação congelada passar;
- segurança e TypeScript passarem;
- os 197 testes locais, acrescidos do novo teste de configuração, passarem;
- o build passar;
- o GitHub registrar pelo menos uma execução real bem-sucedida;
- changelog, decisão e versão 1.15.3 estiverem coerentes;
- checkpoints local e remoto existirem;
- nenhuma alteração tiver sido mesclada ou implantada sem autorização.

## 11. Riscos e trade-offs

- O job único pode ficar mais lento conforme o projeto crescer. A simplicidade é preferível agora; a divisão em jobs será avaliada com tempos reais.
- Sem cache, cada execução instalará dependências. Isso cria uma linha de base mais previsível; o cache poderá ser adicionado depois com medição.
- Os testes de integração ainda não protegerão Pull Requests. O risco fica explícito até criarmos banco efêmero, migrações controladas e segredos próprios de teste.
- `ubuntu-latest` pode evoluir. As ferramentas determinantes ficam controladas por Node, pnpm e lockfile; se surgir instabilidade do executor, fixaremos uma imagem após analisar a causa.
- A proteção de branch não será obrigatória de imediato. Ativá-la antes de provar o workflow poderia bloquear o trabalho por erro de configuração.

## 12. Retorno a uma versão anterior

Se o workflow causar bloqueio ou comportamento inesperado:

1. não fazer merge do Pull Request;
2. comparar com o checkpoint `checkpoint/d002-v1.15.2`;
3. corrigir ou remover apenas o workflow na branch de trabalho;
4. repetir as verificações locais;
5. preservar o histórico — sem reescrever ou apagar checkpoints.

Como esta etapa não modifica dados, contratos ou produção, o retorno consiste em retirar a automação do Pull Request. A versão 1.15.2 permanece íntegra e recuperável.

## 13. Aprendizado esperado

Integração contínua não é implantação automática. CI significa verificar continuamente o código; CD é o processo de entregar ou implantar. Neste ciclo criaremos somente CI. Primeiro provamos que a automação observa corretamente a qualidade; decisões de publicação continuam humanas e separadas.

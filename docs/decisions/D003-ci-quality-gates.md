# D-003 — Integração contínua com portões de qualidade

## Contexto

Depois do D-002, o projeto passou a possuir uma suíte local determinística e outra suíte explicitamente dependente de infraestrutura. Ainda assim, instalação, segurança, tipos, testes e build dependiam de execução manual. Um Pull Request poderia, portanto, introduzir uma regressão sem aviso automático do GitHub.

## Conceito técnico

Integração contínua, ou CI, é a repetição automática das verificações do projeto sempre que o código muda. Ela não é implantação: este ciclo observa a qualidade, mas não publica a aplicação nem altera produção.

Um **portão de qualidade** é uma verificação que precisa passar antes de considerarmos a mudança segura. Nesta etapa, o resultado será primeiro observado em um Pull Request. Torná-lo obrigatório na proteção de `main` será uma decisão posterior, após comprovar a execução real.

## Decisão

- usar um único job sequencial para facilitar diagnóstico e evitar instalações repetidas;
- executar em Pull Requests para `main`, pushes em `main` e acionamento manual;
- usar Node 24 e a versão do pnpm declarada em `packageManager`;
- instalar somente com lockfile congelado;
- executar segurança antes do build, seguida por tipos, testes locais e build;
- conceder apenas `contents: read`;
- fixar ações oficiais por SHA completo, com a versão legível em comentário;
- não usar segredos, cache, banco, testes de integração, deploy ou merge automático;
- limitar o job a 20 minutos e cancelar execução anterior da mesma referência;
- proteger o YAML com testes Vitest de regressão.

## Alternativas consideradas

1. Vários jobs paralelos: adiado até termos tempos reais, pois repetiria instalações e ampliaria a configuração.
2. Execução somente manual: rejeitada porque não protege propostas de mudança.
3. Integração com banco desde o início: adiada porque exigiria ambiente efêmero, migrações e credenciais próprias ainda inexistentes.
4. Cache imediato: adiado para reduzir dependências e estabelecer primeiro uma linha de base previsível.

## Segurança da cadeia de execução

As ações usadas são oficiais e foram conferidas em suas versões atuais:

- `actions/checkout` v7.0.1: `3d3c42e5aac5ba805825da76410c181273ba90b1`;
- `actions/setup-node` v7.0.0: `820762786026740c76f36085b0efc47a31fe5020`.

O SHA completo é imutável, ao contrário de uma referência móvel como `@v7`. O workflow não possui permissão de escrita e não acessa credenciais da aplicação.

## Riscos e controles

- A primeira execução pode revelar diferenças do executor GitHub: o Pull Request permanecerá sem merge até o diagnóstico.
- O job único pode ficar lento no futuro: a divisão será baseada em medição, não em suposição.
- Sem cache há mais transferência de dependências: a simplicidade e previsibilidade foram priorizadas nesta linha de base.
- A integração ainda não roda na CI: o comando local falha explicitamente quando banco e credenciais não existem, impedindo falso resultado verde.
- `ubuntu-latest` pode evoluir: Node, pnpm e dependências do projeto permanecem controlados; a imagem será fixada somente se houver evidência de instabilidade.

## Validação local

- instalação congelada aprovada com pnpm 10.4.1;
- segurança aprovada com 3 migrações e 11 correções preservadas;
- TypeScript aprovado;
- 57 arquivos e 203 testes locais aprovados;
- 6 testes específicos do workflow aprovados;
- integração interrompida antes da coleta, listando as quatro configurações obrigatórias ausentes;
- build de frontend e backend aprovado;
- avisos preexistentes de analytics e bundle grande preservados no backlog.

## Retorno

O checkpoint anterior é `checkpoint/d002-v1.15.2`. Se a automação apresentar comportamento inseguro, o Pull Request não será mesclado e o workflow será corrigido ou retirado apenas da branch D-003. Nenhum dado, contrato, banco ou ambiente produtivo foi modificado.

## Resultado remoto e encerramento

O GitHub executou **Qualidade #1** no Pull Request #2. Checkout, Node 24, Corepack, instalação congelada, segurança, TypeScript, 203 testes locais e build foram aprovados no executor hospedado. O checkpoint recuperável deste ciclo é `checkpoint/d003-v1.15.3`, criado somente após a execução final aprovada.

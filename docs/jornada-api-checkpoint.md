# Jornada MVP — checkpoint de API

Head de referência: `b8b676c449372776b110502965c1232594340da5`

## Entregue
- gateway para localizar sessão ativa por usuário;
- somente estados `em_jornada` e `em_intervalo` são considerados ativos;
- runtime real conectado ao MySQL via `getDb()`;
- consulta do estado atual da própria jornada;
- router autenticado próprio para Jornada;
- ações `start`, `break`, `resume` e `end`;
- usuário autenticado é sempre sujeito e ator da ação;
- timestamps das ações são gerados no servidor;
- root router composto preserva rotas existentes e adiciona `workShift`;
- cliente tRPC tipado pelo root router composto.

## Segurança
- usuário inativo é bloqueado;
- o MVP não aceita `userId` arbitrário vindo do cliente;
- o cliente não fornece timestamps das transições;
- sem merge e sem deploy.

## Pendência de validação
GitHub Actions ainda não está associando workflow runs ao branch `feature/jornada-mvp`; CI permanece pendente de infraestrutura.

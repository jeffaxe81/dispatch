# D-005 — Prova de backup e restauração

**Data:** 1º de setembro de 2026

**Versão candidata:** 1.15.5

**Base de retorno:** `checkpoint/d004-v1.15.4`

## Estado da decisão

- **D-005A: validada em ambiente controlado.** Banco, objetos referenciados, criptografia, manifesto, restauração, remapeamento e verificação foram exercitados com adaptadores determinísticos.
- **D-005B: pendente.** O harness real está separado em `pnpm test:recovery` e bloqueia antes da coleta quando faltam variáveis protegidas ou os clientes `mysqldump` e `mysql`.
- **D-005C: não iniciada.** Agenda, retenção, permissões, alertas e ativação produtiva dependem de nova decisão e aprovação.

O resultado atual comprova a automação controlada, mas não comprova recuperação no provedor nem em produção.

## Contexto

O banco guarda registros operacionais e referências aos objetos de evidências e avatares. Recuperar apenas um desses conjuntos pode produzir arquivos órfãos ou referências quebradas. A unidade de recuperação deve incluir banco, objetos referenciados, manifesto versionado e hashes verificáveis.

## Decisão

Foi adotada uma estratégia híbrida:

1. usar exportação/restauração nativa de MySQL/TiDB por adaptador de privilégio mínimo;
2. copiar somente objetos referenciados pelo banco;
3. criptografar cada artefato com AES-256-GCM;
4. publicar um manifesto criptografado e um envelope público sem dados identificáveis;
5. restaurar somente em banco vazio, descartável e prefixado por `dispatch_recovery_`;
6. gravar objetos sob um prefixo isolado e remapear apenas as referências do banco restaurado;
7. aprovar somente quando contagens, invariantes, hashes, RPO e RTO forem verificados.

## Limites de segurança

- fontes produtivas permanecem bloqueadas até D-005C;
- a confirmação exata é `RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH`;
- não existem comandos de delete, drop, truncate, promoção ou produção;
- credenciais são lidas somente de variáveis protegidas;
- URLs, tokens, chaves e conteúdo pessoal não entram em logs ou relatórios;
- pacotes de recuperação ficam fora do Git;
- o workflow de qualidade não executa `pnpm test:recovery`.

## Evidência atual

A versão candidata 1.15.5 passou em testes locais independentes de infraestrutura, tipagem, verificação de segurança e build. A suíte D-005B também foi executada sem credenciais para comprovar o bloqueio antes da coleta; ela listou somente os nomes das variáveis e binários ausentes.

## Consequências e riscos restantes

- o RPO provisório é 1 hora e o RTO provisório é 2 horas;
- volume, duração, custo, snapshots, versionamento e retenção do provedor ainda precisam ser medidos no D-005B;
- uma restauração interrompida permanece isolada para diagnóstico e não é promovida;
- o destino descartável deve ser recriado pelo operador autorizado antes de repetir um exercício falho;
- produção continua sem agendamento automático nesta versão.

## Retorno e checkpoints

- retorno anterior ao D-005: `checkpoint/d005-pre-design`;
- adaptadores e automação: checkpoints `checkpoint/d005-task3-database-adapter` a `checkpoint/d005-task9-real-harness`;
- nenhum checkpoint desta decisão altera `main`, executa deploy ou ativa retenção.

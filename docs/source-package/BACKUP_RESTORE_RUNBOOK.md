# Runbook de backup e restauração — D-005

## Situação e limite

A automação D-005A foi validada com dados sintéticos e adaptadores controlados. O D-005B ainda depende de infraestrutura descartável autorizada. O processo está **não comprovado em produção** e não agenda, promove, apaga ou restaura produção.

## Condições obrigatórias

Antes de configurar qualquer valor, o operador deve confirmar:

1. a origem contém somente dados sintéticos e está classificada como não produtiva;
2. o destino é separado, descartável, já existe e não possui tabelas da aplicação;
3. o nome do banco de destino começa com `dispatch_recovery_`;
4. as credenciais de origem e destino são diferentes;
5. há autorização para usar somente os recursos temporários informados;
6. os clientes `mysqldump` e `mysql` estão instalados no runner.

Pare se qualquer condição for falsa ou não puder ser demonstrada.

## Variáveis protegidas

Configure os valores fora do Git, da conversa e de transcrições públicas. Os nomes exigidos são:

```text
RECOVERY_SOURCE_CLASS=non-production
DATABASE_URL
BUILT_IN_FORGE_API_URL
BUILT_IN_FORGE_API_KEY
RECOVERY_TARGET_CLASS=disposable
RECOVERY_TARGET_DATABASE_URL
RECOVERY_TARGET_FORGE_API_URL
RECOVERY_TARGET_FORGE_API_KEY
RECOVERY_TARGET_STORAGE_PREFIX
RECOVERY_CONFIRM_RESTORE=RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH
RECOVERY_ENCRYPTION_KEY
```

`RECOVERY_ENCRYPTION_KEY` deve conter exatamente 32 bytes codificados em Base64. Não registre seu valor.

## Preflight do exercício real

```bash
corepack pnpm test:recovery
```

Sem ambiente completo, o comando deve terminar antes da coleta e listar apenas nomes ausentes. Com ambiente completo e autorização, ele executa backup, valida alvo vazio, restaura e verifica o conjunto.

## Backup administrativo

Escolha uma pasta absoluta, fora do repositório:

```bash
corepack pnpm recovery:backup -- --output /caminho/absoluto/recovery-packages --source-label homologacao-controlada
```

Resultado esperado: código 0, identificador `d005-*`, pacote final sem sufixo `.partial`, envelope público, manifesto criptografado, banco criptografado, objetos criptografados e relatório sanitizado. Um diretório `.partial` indica falha e não é restaurável como pacote completo.

## Restauração descartável

Confirme novamente o banco prefixado, o alvo vazio e a frase exata. Em seguida:

```bash
corepack pnpm recovery:restore -- --package /caminho/absoluto/recovery-packages/d005-...
```

O fluxo valida envelope, manifesto e hashes antes do banco; exige alvo vazio; descriptografa temporariamente; restaura banco; envia objetos ao prefixo isolado; remapeia referências; apaga temporários plaintext; e executa o verificador.

## Verificação independente

```bash
corepack pnpm recovery:verify -- --package /caminho/absoluto/recovery-packages/d005-...
```

O resultado só é aprovado com contagens exatas, invariantes iguais a zero, objetos acessíveis, tamanhos e hashes idênticos, RPO de até 3.600.000 ms e RTO de até 7.200.000 ms.

## Diagnóstico e retorno

| Sinal                            | Interpretação                                          | Ação segura                                                                    |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `backup incomplete`              | Banco, objeto, tamanho, manifesto ou publicação falhou | Preserve o diretório `.partial`; não o promova; revise o relatório sanitizado. |
| `artifact hash mismatch`         | Artefato ausente ou alterado                           | Interrompa antes da restauração e obtenha um pacote íntegro.                   |
| `target database must be empty`  | Destino já contém tabelas                              | Não limpe pelo script; solicite recriação autorizada do destino descartável.   |
| `artifact authentication failed` | Chave incorreta ou conteúdo inválido                   | Verifique a origem protegida da chave; não copie seu valor para logs.          |
| relatório `rejected`             | Contagens, relações, objetos, RPO ou RTO falharam      | Mantenha o ambiente isolado e registre a causa sanitizada.                     |

Para retorno do código, abandone a branch e use `checkpoint/d004-v1.15.4` ou o último checkpoint D-005 aprovado. O runbook não executa rollback de dados.

## Condições de parada

- qualquer indício de produção;
- credenciais iguais entre origem e destino;
- banco sem prefixo `dispatch_recovery_`;
- destino não vazio;
- arquivo, hash ou relação divergente;
- erro repetido sem causa identificada;
- tentativa de colar segredo em terminal compartilhado, issue, documento ou Pull Request;
- pedido de agenda, retenção ou promoção antes do desenho D-005C.

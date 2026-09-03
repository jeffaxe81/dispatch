# Checklist do exercício de recuperação — D-005B

## Antes

- [ ] Aprovação explícita do responsável registrada.
- [ ] Origem confirmada como sintética e não produtiva.
- [ ] Destino confirmado como descartável, separado e sem tabelas da aplicação.
- [ ] Banco de destino começa com `dispatch_recovery_`.
- [ ] Credenciais de banco e armazenamento diferem entre origem e destino.
- [ ] Variáveis protegidas configuradas fora do Git e da conversa.
- [ ] `RECOVERY_CONFIRM_RESTORE` contém exatamente `RESTORE_ONLY_DISPOSABLE_AXE_DISPATCH`.
- [ ] `mysqldump` e `mysql` disponíveis.
- [ ] Janela, responsável e critério de parada definidos.
- [ ] Caminho de evidências e pacote fora do repositório.

## Durante

- [ ] Executar uma única vez `corepack pnpm test:recovery`.
- [ ] Registrar somente run ID, horários, versões e estados sanitizados.
- [ ] Confirmar que o alvo vazio foi verificado antes da restauração.
- [ ] Confirmar que o pacote foi publicado sem `.partial`.
- [ ] Confirmar restauração do banco sem drop, create database ou truncate.
- [ ] Confirmar upload sob o prefixo isolado.
- [ ] Confirmar remapeamento somente no banco restaurado.
- [ ] Interromper na primeira falha; não repetir sem diagnóstico.
- [ ] Não criar ocorrência, atribuição ou despacho real.

## Depois

- [ ] Verificar login com conta sintética em modo somente leitura.
- [ ] Abrir ocorrência sintética, atribuição e histórico de auditoria.
- [ ] Baixar avatar e evidência restaurados.
- [ ] Conferir contagens, invariantes, hashes, RPO e RTO.
- [ ] Preencher `RECOVERY_EVIDENCE_TEMPLATE.md` sem hostnames ou segredos.
- [ ] Classificar o resultado como aprovado, bloqueado ou falho.
- [ ] Manter destino falho isolado até decisão administrativa.
- [ ] Registrar custo, volume e capacidades do provedor.
- [ ] Não promover o ambiente nem iniciar D-005C automaticamente.

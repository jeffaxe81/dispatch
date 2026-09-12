# R1 — Runbook de Homologação Externa do Inventário ↔ Despacho

Issue pai: #89  
Subtarefa: #95  
Workflow: `.github/workflows/inventory-external-homologation.yml`

## 1. Objetivo

Executar, em ambiente real de homologação, a validação externa da integração entre o Motor de Ativos/Inventário e o Sistema de Despacho, produzindo evidências rastreáveis para a decisão final de GO/NO-GO do ciclo R1.

Este procedimento **não autoriza produção** e não executa deploy, migration, `db:push`, grants ou qualquer escrita administrativa em ambiente produtivo.

## 2. Pré-requisitos obrigatórios

Antes de disparar o workflow manual, validar que o GitHub Environment `homologation` está criado e contém somente dados do ambiente de homologação.

### Variables do environment

- `ASSET_MOTOR_BASE_URL`: URL HTTPS do Motor de Ativos em homologação.
- `DISPATCH_BASE_URL`: URL HTTPS do Despacho em homologação.
- `HOMOLOGATION_TENANT_A`: tenant principal de teste.
- `HOMOLOGATION_TENANT_B`: segundo tenant, distinto do tenant A, usado para teste negativo de isolamento.
- `HOMOLOGATION_USER_ID`: usuário de homologação autorizado no tenant A.
- `HOMOLOGATION_INCIDENT_REFERENCE`: ocorrência de homologação válida para vínculo com ativo.
- `HOMOLOGATION_TIMEOUT_MS`: opcional; usar apenas se o timeout padrão de 3000 ms não for adequado ao ambiente.

### Secret do environment

- `HOMOLOGATION_AUTH_TOKEN`: token exclusivo de homologação com o menor privilégio suficiente para os testes.

Nunca registrar o token em issue, PR, artifact, screenshot, log manual ou documento.

## 3. Dados mínimos de homologação

Preparar previamente:

1. Tenant A com ao menos um ativo pesquisável contendo código compatível com a consulta do harness (`PST`), detalhe acessível e localização válida.
2. Tenant B distinto, sem acesso ao ativo do tenant A.
3. Usuário de homologação autorizado no tenant A.
4. Uma ocorrência de homologação existente e apropriada para receber vínculo de ativo.
5. Endpoint de eventos do Despacho disponível em `/homologation/events`.
6. Logs de aplicação com pesquisa por `correlationId` habilitada no Motor e no Despacho.

## 4. Pré-check manual

Antes da execução:

- [ ] Confirmar que as duas URLs são HTTPS e não apontam para produção.
- [ ] Confirmar que tenant A e tenant B são diferentes.
- [ ] Confirmar que o usuário pertence ao tenant A.
- [ ] Confirmar que a ocorrência é exclusivamente de homologação.
- [ ] Confirmar que o token está armazenado somente como secret do environment.
- [ ] Confirmar que não há nenhuma variável produtiva herdada no job.
- [ ] Confirmar acesso aos logs para consulta posterior dos correlation IDs.

Se qualquer item falhar, **não executar**.

## 5. Execução do workflow

No GitHub Actions:

1. Abrir o workflow **Inventory external homologation**.
2. Selecionar **Run workflow**.
3. Executar exclusivamente a partir da branch `main`.
4. Se o environment exigir aprovação, revisar os dados antes de autorizar.
5. Aguardar a conclusão integral do job.

O workflow deve falhar fechado se a configuração obrigatória estiver ausente ou se o ref não for `main`.

## 6. Fluxo funcional esperado

O harness executa a seguinte sequência:

1. Pesquisa de ativo no Motor.
2. Leitura do detalhe do ativo.
3. Leitura da localização.
4. Criação idempotente do vínculo com a ocorrência de homologação.
5. Tentativa de leitura do mesmo ativo pelo tenant B.
6. Envio de evento `asset.updated` versão `1` para o Despacho.
7. Replay do mesmo evento.
8. Envio de evento com versão incompatível (`999`).
9. Geração de relatório JSON e Markdown com checks e correlation IDs.

## 7. Critérios de aceite por check

### `asset-search`

**PASS:** pesquisa retorna ao menos um ativo válido do tenant A.  
**FAIL:** erro HTTP, retorno vazio ou ativo sem identificador.

### `asset-detail`

**PASS:** detalhe retorna o mesmo ativo pesquisado.  
**FAIL:** divergência de ID, autorização inesperada ou erro HTTP.

### `asset-location`

**PASS:** latitude e longitude numéricas válidas.  
**FAIL:** ausência ou formato inválido.

### `dispatch-reference-link`

**PASS:** vínculo é aceito pelo Motor e permanece limitado ao contexto externo da ocorrência.  
**FAIL:** erro HTTP ou necessidade de acesso direto ao banco do Despacho.

### `tenant-isolation`

**PASS:** tenant B recebe `401`, `403` ou `404` ao tentar acessar o ativo do tenant A.  
**FAIL CRÍTICO:** tenant B recebe o ativo ou metadados protegidos.

Qualquer falha de isolamento implica **NO-GO imediato**.

### `event-processed`

**PASS:** primeira entrega do evento retorna status `processed`.  
**FAIL:** contrato rejeitado sem motivo previsto ou processamento inconsistente.

### `event-replay-idempotent`

**PASS:** replay retorna status `duplicate` sem repetir efeito operacional.  
**FAIL:** replay produz segundo efeito ou altera estado crítico.

### `event-unsupported-version-fail-closed`

**PASS:** versão não suportada é rejeitada com código `asset_event.unsupported_version`.  
**FAIL CRÍTICO:** versão incompatível é processada como válida.

## 8. Teste controlado de indisponibilidade do Motor

O workflow principal valida o caminho normal. A degradação deve ser verificada separadamente em homologação, sem alterar produção.

Procedimento recomendado:

1. Usar uma janela de homologação autorizada.
2. Tornar o endpoint do Motor temporariamente indisponível por mecanismo reversível do próprio ambiente de homologação, ou apontar uma sessão isolada do Despacho para um endpoint deliberadamente indisponível de teste.
3. Validar que o core do Despacho continua operacional.
4. Validar que ocorrências, mapa, autenticação e navegação principal permanecem disponíveis.
5. Validar que o painel de ativos apresenta erro controlado com possibilidade de retry.
6. Restaurar imediatamente o endpoint normal.

**Não** simular indisponibilidade por desligamento de produção, alteração de DNS produtivo, firewall produtivo ou mudança destrutiva de infraestrutura.

Critério: a indisponibilidade do Motor não pode impedir o funcionamento do core do Despacho.

## 9. Coleta de evidências

Após a execução:

1. Baixar o artifact `inventory-external-homologation-<run_id>`.
2. Preservar:
   - `inventory-external-homologation.json`;
   - `inventory-external-homologation.md`.
3. Registrar no issue #89:
   - run ID;
   - commit SHA da `main` executada;
   - data/hora;
   - resultado PASS/FAIL;
   - lista dos correlation IDs;
   - evidência do teste de indisponibilidade;
   - evidência de que tenant B não acessou dados do tenant A.
4. Nos logs do Motor e do Despacho, pesquisar cada `correlationId` e confirmar a mesma cadeia de rastreabilidade.

Não copiar tokens, cookies, Authorization headers ou credenciais para o issue.

## 10. Evidência mínima para encerramento do #89

O ciclo R1 somente pode ser fechado quando houver:

- [ ] workflow externo real concluído com `PASS`;
- [ ] dois tenants usados no teste negativo;
- [ ] isolamento de tenant validado;
- [ ] vínculo de ativo validado;
- [ ] evento versão `1` processado;
- [ ] replay tratado como duplicado;
- [ ] versão incompatível rejeitada em fail-closed;
- [ ] correlation IDs confirmados nos logs;
- [ ] degradação com Motor indisponível validada;
- [ ] rollback operacional ensaiado/documentado;
- [ ] nenhuma mudança produtiva executada durante a homologação;
- [ ] decisão final registrada como `GO` ou `NO-GO`.

## 11. Critérios de NO-GO

Aplicar **NO-GO** se ocorrer qualquer um dos seguintes:

- violação de isolamento multi-tenant;
- bypass de autorização;
- acesso direto entre bancos de produtos;
- incompatibilidade REST/eventos sem fail-closed;
- replay com efeito duplicado;
- evento do Motor alterando automaticamente estado crítico de ocorrência;
- indisponibilidade do Motor interrompendo o core do Despacho;
- ausência de rastreabilidade por correlation ID;
- falha de build/package/health relacionada à versão candidata;
- rollback não executável ou não auditável.

## 12. Decisão final

### GO

Somente quando todos os critérios obrigatórios estiverem PASS e as evidências estiverem anexadas/versionadas.

### GO COM RESSALVAS

Pode ser usado apenas para preparação de release quando não houver risco crítico aberto. Não autoriza produção por si só.

### NO-GO

Obrigatório para qualquer falha de segurança, tenant isolation, autorização, contrato sem fail-closed, integridade operacional ou rollback.

## 13. Rollback documental

Se a sessão detectar falha crítica:

1. Interromper a homologação.
2. Preservar artifacts, logs e correlation IDs.
3. Registrar o SHA executado e o motivo da falha.
4. Restaurar a configuração anterior do ambiente de homologação, quando houver alteração temporária de endpoint.
5. Validar login, ocorrência, mapa e `/health/live`.
6. Confirmar que o Despacho voltou ao estado homologado anterior.
7. Abrir item corretivo no backlog antes de repetir a sessão.

## 14. Estado atual

Este runbook prepara a execução operacional. A homologação externa **não deve ser considerada concluída** até existir um run real do workflow contra instâncias reais de homologação com evidências anexadas ao issue #89.

Produção permanece **NO-GO** até autorização específica e separada.
# Inventário R1 — Homologação Externa Controlada

## Objetivo

Executar, em ambiente de homologação, uma validação técnica reproduzível da integração Motor de Ativos ↔ Sistema de Despacho sem acessar diretamente banco de dados e sem autorizar produção.

## Comando

```bash
corepack pnpm homologation:inventory
```

## Variáveis obrigatórias do harness

```bash
ASSET_MOTOR_BASE_URL=https://motor-hml.exemplo
DISPATCH_BASE_URL=https://dispatch-hml.exemplo
TENANT_A=tenant-a
TENANT_B=tenant-b
HOMOLOGATION_USER_ID=usuario-hml
HOMOLOGATION_INCIDENT_REFERENCE=INC-HML-001
```

## Variáveis opcionais do harness

```bash
HOMOLOGATION_AUTH_TOKEN=<token temporário de homologação>
HOMOLOGATION_TIMEOUT_MS=3000
HOMOLOGATION_REPORT_DIR=artifacts/homologation
```

Nunca versionar tokens, segredos ou credenciais reais no repositório.

## Ativação do adaptador no Despacho

O endpoint `POST /homologation/events` existe somente quando o ambiente do Despacho não é produção e as duas variáveis abaixo estão configuradas:

```bash
ASSET_INVENTORY_HOMOLOGATION_ENABLED=true
ASSET_INVENTORY_HOMOLOGATION_API_KEY=<chave temporária com pelo menos 24 bytes>
```

A mesma chave deve ser fornecida ao harness em `HOMOLOGATION_AUTH_TOKEN`. O harness envia essa credencial como `Authorization: Bearer <token>`.

Regras de segurança do adaptador:

- a rota não é registrada quando `ASSET_INVENTORY_HOMOLOGATION_ENABLED=false`;
- a rota não é registrada quando `NODE_ENV=production`, mesmo que a flag seja ligada por engano;
- `validateRuntimeEnv` rejeita explicitamente homologação habilitada em produção;
- a chave de homologação deve possuir pelo menos 24 bytes;
- a comparação da credencial usa comparação temporalmente segura;
- o endpoint encaminha o envelope ao consumidor M15 existente e não cria regra de negócio paralela;
- não existe alteração automática de estado crítico de ocorrência.

## Fluxos validados

O harness executa os seguintes checks:

1. pesquisa de ativo no tenant A;
2. detalhe do ativo;
3. localização do ativo;
4. vínculo de referência de ocorrência;
5. tentativa de leitura do mesmo ativo pelo tenant B, esperando negação por `401`, `403` ou `404`;
6. consumo de evento `asset.updated` versão `1`;
7. replay do mesmo envelope/eventId esperando `duplicate`;
8. versão incompatível `999`, esperando `asset_event.unsupported_version`;
9. captura dos `correlation IDs` enviados;
10. quando o Motor estiver indisponível, registro de falha funcional com detecção controlada de indisponibilidade.

## Saídas

Por padrão são gerados:

- `artifacts/homologation/inventory-external-homologation.json`;
- `artifacts/homologation/inventory-external-homologation.md`.

O processo termina com código diferente de zero quando o relatório final for `FAIL`.

## Contrato do endpoint de eventos de homologação

```text
POST /homologation/events
Authorization: Bearer <HOMOLOGATION_AUTH_TOKEN>
Content-Type: application/json
```

O adaptador devolve apenas o resultado do consumidor versionado (`processed`, `duplicate`, `ignored`) ou erro fail-closed. Para versão incompatível, retorna HTTP `422` com `asset_event.unsupported_version`.

## Critérios de aceite

A sessão pode ser considerada tecnicamente aprovada quando:

- todos os checks retornarem `PASS`;
- os dois tenants forem diferentes e o acesso cruzado for negado;
- os correlation IDs estiverem presentes nas evidências e logs do ambiente;
- replay do mesmo envelope/eventId não duplicar efeito;
- versão incompatível falhar fechado;
- indisponibilidade do Motor não interromper o núcleo operacional do Despacho;
- não houver escrita direta entre bancos;
- rollback operacional estiver disponível conforme `inventory-r1-rollback.md`.

## Segurança e restrições

- executar somente em homologação;
- usar credenciais temporárias e de menor privilégio;
- desabilitar `ASSET_INVENTORY_HOMOLOGATION_ENABLED` ao concluir a sessão;
- não executar `db:migrate` ou `db:push` em produção;
- não criar grants produtivos;
- não usar tenant real sem autorização;
- não considerar este harness uma autorização de deploy;
- evidências devem ser anexadas ao issue/release correspondente antes da decisão final de produção.

## CI

A suíte automatizada usa servidor HTTP local/mocks e valida apenas o comportamento do harness e do adaptador. O CI não realiza chamadas ao Motor real nem ao Despacho externo.

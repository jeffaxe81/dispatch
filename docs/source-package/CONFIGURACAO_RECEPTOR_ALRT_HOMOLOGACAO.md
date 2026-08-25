# Configuração pendente — Receptor ALRT em homologação

O endpoint `POST /api/integrations/alrt/events` foi preparado para receber somente o evento `alert.received` do Despacho ALRT. Ele permanece **desativado por padrão** e não cria ocorrências automaticamente nesta etapa.

## Estado seguro padrão

Sem as variáveis abaixo, a rota devolve `503 ALRT_INGRESS_DISABLED`. Esse comportamento é intencional e impede que qualquer origem externa faça testes ou envie dados antes da homologação autorizada.

| Variável | Valor permitido para homologação | Situação atual |
|---|---|---|
| `ALRT_INGRESS_MODE` | `homologacao` | Não configurada; receptor desativado |
| `ALRT_INGRESS_API_KEY` | Chave aleatória de pelo menos 32 caracteres, trocada por canal seguro com o ALRT | Não configurada; nenhum segredo real armazenado |

## Pré-requisitos para habilitar a homologação

1. O ALRT confirma que consegue disparar HTTP `POST` usando o cabeçalho `X-ALRT-API-Key`, ou informa o nome de cabeçalho que deverá substituir o padrão proposto.
2. As equipes validam o contrato `CONTRATO_ENTRADA_ALRT_AXE.md` e fornecem um payload de teste anonimizando qualquer dado desnecessário.
3. O responsável autorizado fornece o segredo de homologação por canal seguro; ele deve ser configurado como variável de ambiente, nunca em código ou arquivo versionado.
4. O primeiro teste usa `source.environment = homologacao` e recebe resposta `202` ou `200` em caso de duplicidade.
5. A análise dos registros auditáveis confirma assinatura, idempotência, correlação e inexistência de despacho automático.

## Verificação de prontidão autenticada

Após a chave ser configurada, o ALRT pode testar `GET /api/integrations/alrt/health` com o mesmo cabeçalho `X-ALRT-API-Key`. Uma resposta `200` com `{"status":"ready","mode":"homologacao"}` confirma apenas que a chave de homologação foi aceita; ela não processa alertas e não cria registros. Sem chave válida, a rota responde `401`; enquanto a homologação estiver desativada, responde `503`.

## Limites da preparação atual

- A rota só aceita ambiente `homologacao`.
- Somente `alert.received` é aceito.
- Corpo JSON é limitado a 256 KB.
- Contatos, anexos, arquivos, Base64, segredos, localização contínua e atualizações de situação não fazem parte do receptor.
- O evento é registrado na fila `alrt_incoming_events` e auditado; a transformação em ocorrência operacional exigirá uma fase posterior de processamento homologado.

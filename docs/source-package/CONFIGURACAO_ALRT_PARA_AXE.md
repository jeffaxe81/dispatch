# Configuração de envio ALRT → AXE Dispatch

Use esta configuração no cadastro de destino/webhook de saída do **Despacho ALRT**. Ela substitui qualquer destino anterior que contenha `/central-despacho`.

## Destino de homologação

| Campo no ALRT | Valor a configurar |
|---|---|
| Nome | `AXE Dispatch — Homologação` |
| Ativo | Sim, somente para homologação |
| URL de destino | `https://dispatchapp-dmbshjft.manus.space/api/integrations/alrt/events` |
| Método | `POST` |
| Content-Type | `application/json` |
| Timeout | `15 segundos` |
| Tentativas em erro transitório | `3` |
| Backoff sugerido | `5 s`, `15 s`, `45 s` |

> Não use `/central-despacho`, `/eventos` nem um caminho relativo. O AXE só recebe alertas pelo caminho completo informado acima.

## Autenticação e cabeçalhos

Configure os valores de credencial no cofre seguro do ALRT, nunca diretamente em campos de texto exibidos ou em logs.

| Cabeçalho | Valor |
|---|---|
| `X-ALRT-API-Key` | Variável segura `AXE_API_KEY` — usar a mesma API key configurada no AXE para homologação |
| `X-Timestamp` | Timestamp UTC atual em ISO 8601, por exemplo `2026-08-22T14:30:00.000Z` |
| `X-Correlation-Id` | UUID gerado pelo ALRT por tentativa de evento |
| `X-Signature` | `sha256=<assinatura HMAC-SHA256>` |

Caso o ALRT possua um campo separado para API key, associe-o ao cabeçalho **`X-ALRT-API-Key`**. Não use token Bearer, cookie de sessão, autenticação de interface ou a URL do painel administrativo.

## Assinatura HMAC obrigatória

Armazene o segredo compartilhado em uma variável segura chamada, por exemplo, `AXE_HMAC_SECRET`. O valor deve ser igual ao segredo de homologação configurado no AXE.

```text
string_assinada = X-Timestamp + "." + corpo_JSON_bruto_em_UTF8
assinatura_hex = HMAC_SHA256(AXE_HMAC_SECRET, string_assinada)
X-Signature = "sha256=" + assinatura_hex
```

O corpo usado na assinatura deve ser exatamente o corpo enviado, sem reformatação posterior do JSON. Se o ALRT alterar espaços, ordem, quebras de linha ou campos depois de calcular a assinatura, o AXE responderá `401 INVALID_SIGNATURE`.

## Envelope de alerta

O envio deve respeitar o perfil `1.0` e usar ambiente `homologacao`.

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_alrt_<uuid>",
  "eventType": "alert.received",
  "occurredAt": "2026-08-22T14:30:00.000Z",
  "source": {
    "system": "despacho-alrt",
    "environment": "homologacao"
  },
  "correlationId": "<mesmo-valor-de-X-Correlation-Id>",
  "idempotencyKey": "alrt:alert:<identificador>:<versao>",
  "data": {
    "alert": {
      "externalId": "54891",
      "category": "Alerta urbano",
      "priority": "alta",
      "description": "Descrição operacional do alerta.",
      "address": "Endereço do alerta",
      "latitude": -27.0976,
      "longitude": -48.9104,
      "reportedAt": "2026-08-22T14:29:30.000Z",
      "sourceStatus": "novo"
    }
  }
}
```

## Resultado esperado

| Resposta do AXE | Interpretação no ALRT |
|---:|---|
| `202` com `status: RECEIVED` | Recebido para a fila de homologação. Não reenviar. |
| `200` com `status: DUPLICATE` | Evento já havia sido recebido. Não reenviar como novo. |
| `400` | Corrigir JSON, envelope ou correlação antes de reenviar. |
| `401` | Corrigir API key, timestamp ou assinatura HMAC. |
| `429` | Aguardar o valor de `Retry-After` e reenviar a mesma chave de idempotência. |
| `503` | Aguardar e reenviar; confirmar se a homologação permanece autorizada. |

## Checklist antes de salvar

| Verificação | Esperado |
|---|---|
| Destino | URL termina em `/api/integrations/alrt/events` |
| Método | `POST` |
| Autenticação | Header `X-ALRT-API-Key`, sem login de interface |
| Assinatura | HMAC-SHA256 sobre `timestamp.corpoBruto` |
| Ambiente | `homologacao` |
| Idempotência | `eventId` e `idempotencyKey` exclusivos |
| Operação AXE | Somente recepção e auditoria; sem abertura automática de ocorrência |

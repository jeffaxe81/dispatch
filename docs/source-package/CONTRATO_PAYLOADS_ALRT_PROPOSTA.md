# Proposta de contrato de eventos — AXE Dispatch × Despacho ALRT

**Versão proposta:** 1.0  
**Finalidade original:** referência para integração bidirecional futura  
**Estado:** rascunho técnico; depende da validação do Despacho ALRT  
**Formato:** JSON sobre HTTPS

> O primeiro piloto passou a ser unidirecional, do Despacho ALRT para o AXE Dispatch. Portanto, o contrato aplicável à homologação inicial está em [`CONTRATO_ENTRADA_ALRT_AXE.md`](./CONTRATO_ENTRADA_ALRT_AXE.md). Os fluxos de saída descritos neste documento permanecem apenas como referência futura.

## 1. Envelope comum

Todo evento, em qualquer direção, deve utilizar um envelope estável. O parceiro não deve inferir a ação apenas pelo conteúdo de `data`, nem aceitar eventos sem identificador, data/hora e versão de esquema.

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_01JQ9H7SEFSQ4NZK4E4X4X8Q5A",
  "eventType": "incident.created",
  "occurredAt": "2026-08-22T00:00:00.000Z",
  "source": {
    "system": "axe-dispatch",
    "environment": "homologacao"
  },
  "correlationId": "corr_oco-20260822-000123",
  "idempotencyKey": "axe:incident:OCO-20260822-000123:created:v1",
  "data": {}
}
```

| Campo | Obrigatório | Regra proposta |
|---|---:|---|
| `schemaVersion` | Sim | Versão do contrato, inicialmente `1.0` |
| `eventId` | Sim | Identificador global único; não pode ser reutilizado |
| `eventType` | Sim | Um dos tipos enumerados neste documento |
| `occurredAt` | Sim | Data/hora em UTC no formato ISO 8601 |
| `source.system` | Sim | `axe-dispatch` ou `despacho-alrt` |
| `source.environment` | Sim | `homologacao` no piloto e `producao` somente após aceite |
| `correlationId` | Sim | Identificador para encadear criação, atualização e retorno entre sistemas |
| `idempotencyKey` | Sim | Chave determinística por ação, usada para impedir duplicidade |
| `data` | Sim | Objeto específico do tipo de evento |

O receptor deve reter `eventId` e `idempotencyKey` pelo período acordado na homologação. Quando receber uma chave já processada, deve devolver confirmação idempotente, sem criar nova ocorrência, novo despacho ou nova atualização.

## 2. Cabeçalhos HTTP propostos

| Cabeçalho | Uso |
|---|---|
| `Content-Type: application/json` | Formato obrigatório do corpo |
| `X-Event-Id` | Repetição de `eventId` para correlação de borda |
| `X-Event-Type` | Repetição de `eventType` para roteamento explícito |
| `X-Request-Timestamp` | Timestamp usado para validar a janela de recebimento |
| `X-Signature` | Assinatura HMAC do corpo bruto, se esse for o mecanismo aceito pelo parceiro |
| `Idempotency-Key` | Repetição da chave de idempotência |

O mecanismo final de autenticação não deve ser presumido. Se o ALRT utilizar OAuth 2.0, mTLS ou outro padrão, os cabeçalhos serão ajustados à documentação do parceiro. Chaves e assinaturas nunca devem entrar no corpo JSON, em logs, telas, auditoria ou exportações.

## 3. Tipos de evento para o piloto

| Tipo | Direção | Uso | Piloto inicial |
|---|---|---|---:|
| `incident.created` | AXE → ALRT | Registrar ocorrência encaminhada | Sim |
| `incident.updated` | AXE → ALRT | Atualizar campos operacionais aprovados | Sim, após criação |
| `incident.status_changed` | AXE → ALRT | Comunicar mudança de situação | Sim, após criação |
| `incident.assignment_changed` | AXE → ALRT | Comunicar equipe/viatura vinculadas | Opcional |
| `incident.cancelled` | AXE → ALRT | Comunicar cancelamento | Sim, se o parceiro suportar |
| `alert.received` | ALRT → AXE | Receber alerta externo para triagem | Somente em homologação controlada |
| `alert.status_changed` | ALRT → AXE | Registrar retorno operacional do parceiro | Somente após mapeamento de estados |
| `attachment.available` | Ambos | Disponibilizar evidência por referência controlada | Não no piloto inicial |

## 4. Payload de ocorrência enviado pelo AXE Dispatch

O objeto `incident` representa o núcleo da ocorrência. Os campos de contato, localização precisa e evidências ficam fora do perfil inicial de envio.

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_01JQ9H7SEFSQ4NZK4E4X4X8Q5A",
  "eventType": "incident.created",
  "occurredAt": "2026-08-22T00:00:00.000Z",
  "source": { "system": "axe-dispatch", "environment": "homologacao" },
  "correlationId": "corr_oco-20260822-000123",
  "idempotencyKey": "axe:incident:OCO-20260822-000123:created:v1",
  "data": {
    "incident": {
      "externalReference": "OCO-20260822-000123",
      "category": "Alerta urbano",
      "priority": "alta",
      "status": "triagem",
      "origin": "central",
      "description": "Resumo operacional aprovado para compartilhamento.",
      "createdAt": "2026-08-22T00:00:00.000Z",
      "updatedAt": "2026-08-22T00:00:00.000Z"
    }
  }
}
```

| Campo em `incident` | Tipo | No piloto | Observação |
|---|---|---:|---|
| `externalReference` | string | Sim | Código estável de correlação; não deve ser reciclado |
| `category` | string | Sim | Tipificação de negócio; o mapeamento será aprovado entre sistemas |
| `priority` | enum | Sim | `baixa`, `media`, `alta` ou `critica` |
| `status` | enum | Sim | Situação atual conforme a tabela de mapeamento |
| `origin` | enum | Sim | `central`, `telefone`, `chat`, `video`, `sensor`, `agente` ou `integracao` |
| `description` | string | Sim, resumida | Limite e política de conteúdo definidos em homologação; sem segredos ou dados não necessários |
| `createdAt` / `updatedAt` | datetime | Sim | UTC em ISO 8601 |
| `location` | objeto | Não por padrão | Requer aprovação específica para endereço, coordenadas e precisão |
| `requester` | objeto | Não | Dados pessoais somente após aprovação de finalidade e acesso |
| `assignment` | objeto | Opcional | Equipe e viatura somente quando o parceiro realmente precisar |
| `attachments` | array | Não | Não usar Base64; consultar seção de evidências |

## 5. Mudança de situação, vínculo e cancelamento

Para atualizações, o payload deve informar o estado anterior e o novo estado. O receptor não deve aplicar uma transição que não esteja permitida em seu próprio ciclo de vida.

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_01JQ9JBKZ34B1ZY9FJ05HDBJZH",
  "eventType": "incident.status_changed",
  "occurredAt": "2026-08-22T00:08:00.000Z",
  "source": { "system": "axe-dispatch", "environment": "homologacao" },
  "correlationId": "corr_oco-20260822-000123",
  "idempotencyKey": "axe:incident:OCO-20260822-000123:status:triagem:aguardando_despacho:v1",
  "data": {
    "incidentReference": "OCO-20260822-000123",
    "previousStatus": "triagem",
    "status": "aguardando_despacho",
    "note": "Pronta para despacho após triagem."
  }
}
```

| Situação AXE Dispatch | Significado operacional | Próximas situações permitidas |
|---|---|---|
| `triagem` | Registro em qualificação inicial | `aguardando_despacho`, `cancelada` |
| `aguardando_despacho` | Aguardando definição de recurso | `despachada`, `cancelada` |
| `despachada` | Recurso foi acionado | `aceita`, `aguardando_despacho`, `cancelada` |
| `aceita` | Equipe aceitou o atendimento | `em_atendimento`, `aguardando_despacho`, `cancelada` |
| `em_atendimento` | Atendimento em execução | `pausada`, `concluida`, `cancelada` |
| `pausada` | Atendimento temporariamente interrompido | `em_atendimento`, `cancelada` |
| `concluida` | Atendimento encerrado | Nenhuma |
| `cancelada` | Registro cancelado | Nenhuma |

## 6. Payload de alerta recebido pelo AXE Dispatch

O ALRT deve usar este formato ao criar um alerta ou solicitar atualização. A entrada será validada, registrada e inicialmente encaminhada para revisão; ela não deve gerar despacho automático no primeiro piloto.

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_alrt_8e8d7ef8-7688-4db8-a4e5-aabc7cd5cb4a",
  "eventType": "alert.received",
  "occurredAt": "2026-08-22T00:15:00.000Z",
  "source": { "system": "despacho-alrt", "environment": "homologacao" },
  "correlationId": "alrt-54891",
  "idempotencyKey": "alrt:alert:54891:created:v1",
  "data": {
    "alert": {
      "externalId": "54891",
      "category": "Alerta urbano",
      "priority": "alta",
      "description": "Resumo do alerta recebido pelo parceiro.",
      "reportedAt": "2026-08-22T00:14:45.000Z",
      "location": {
        "address": "Informar apenas se aprovado",
        "latitude": -27.0976,
        "longitude": -48.9104
      }
    }
  }
}
```

O campo `location` é condicional: no piloto, o parceiro deve enviar apenas referência geral ou omitir o objeto, salvo se a equipe aprovar o compartilhamento de endereço e coordenadas para aquele evento. Se as coordenadas forem enviadas, latitude deve estar entre `-90` e `90`, e longitude entre `-180` e `180`.

## 7. Resposta HTTP esperada

Eventos devem ser aceitos de forma assíncrona, evitando que uma operação lenta do destinatário imponha timeout ao parceiro.

```json
{
  "receiptId": "rcpt_01JQ9JQ9CY8ZK61ME6G2MMN45R",
  "eventId": "evt_alrt_8e8d7ef8-7688-4db8-a4e5-aabc7cd5cb4a",
  "status": "accepted",
  "receivedAt": "2026-08-22T00:15:01.220Z"
}
```

| Status HTTP | Significado | Conduta do remetente |
|---:|---|---|
| `202` | Evento aceito para processamento | Aguardar resultado por consulta, callback ou log de integração |
| `200` | Evento aplicado imediatamente | Registrar confirmação |
| `400` | Envelope ou JSON inválido | Não repetir até corrigir o contrato/payload |
| `401` / `403` | Autenticação ou escopo inválido | Interromper tentativas e revisar credencial |
| `409` | Duplicidade ou conflito de estado | Consultar correlação antes de novo envio |
| `422` | Dados válidos em JSON, mas inviáveis na regra de negócio | Corrigir mapeamento ou encaminhar para revisão |
| `429` | Limite de taxa | Respeitar `Retry-After` e reduzir cadência |
| `5xx` | Falha temporária do destino | Aplicar retry limitado e dead-letter se exceder o limiar |

## 8. Regras de segurança e validação

1. Aceitar somente `application/json` por HTTPS e limitar o tamanho do corpo conforme o contrato.
2. Validar assinatura, timestamp e nonce antes de desserializar ou persistir o evento de entrada.
3. Validar o schema e rejeitar propriedades críticas desconhecidas, tipos incorretos, `eventType` não suportado ou datas inválidas.
4. Bloquear eventos repetidos usando `eventId` e `idempotencyKey`; registrar a confirmação sem reaplicar efeitos.
5. Nunca permitir que uma atualização externa pule transições de situação do AXE Dispatch; mudanças críticas devem ser enviadas à fila de revisão durante o piloto.
6. Mascarar campos sensíveis em logs. Tokens, contatos, URLs assinadas, documentos, payloads extensos e coordenadas precisas não devem ser exibidos integralmente.
7. Não enviar anexos em Base64. Evidências, se aprovadas posteriormente, usarão referência de objeto, link temporário e autorização individual.
8. Manter uma chave de desligamento por conexão e por tipo de evento; seu acionamento interrompe novos envios, preservando auditoria e itens em fila.

## 9. Campos que o sistema **não deve receber** no piloto

O receptor não deve aceitar, no primeiro fluxo produtivo, os itens abaixo. Eles devem causar rejeição ou encaminhamento para revisão, conforme a política acordada.

| Tipo de conteúdo | Tratamento no piloto |
|---|---|
| Senhas, chaves, tokens, certificados ou segredos | Rejeitar e alertar o responsável técnico |
| Arquivo binário ou Base64 de foto/documento | Rejeitar |
| Dados biométricos ou documento pessoal | Rejeitar até análise específica |
| Evidência sem referência autorizada | Rejeitar |
| Localização em tempo real contínua | Rejeitar; requer fluxo dedicado e autorização adicional |
| Mudança de status incompatível com o ciclo atual | Rejeitar com `422` ou encaminhar para revisão |

## 10. Checklist para validar com o Despacho ALRT

- O ALRT aceita o envelope `schemaVersion`, `eventId`, `eventType`, `occurredAt`, `correlationId` e `idempotencyKey`?
- Quais eventos são realmente suportados em cada direção?
- Como o parceiro autentica chamadas e assina webhooks?
- Há ambientes distintos de homologação e produção?
- Qual é o SLA de resposta, timeout e política de retry?
- Como o ALRT confirma recebimento assíncrono e como expõe falhas?
- Qual identificador externo deve ser mantido para reconciliação?
- Quais campos são obrigatórios, proibidos ou precisam de transformação?
- Como o parceiro trata dados pessoais, localização e evidências?
- Quem aprova mudanças de contrato e quem pode acionar a contingência?

# Contrato de entrada — Despacho ALRT → AXE Dispatch

**Versão proposta:** 1.0  
**Direção do piloto:** unidirecional, do **Despacho ALRT** para o **AXE Dispatch**  
**Finalidade:** receber alerta externo, validá-lo e criar uma ocorrência em **triagem**  
**Estado:** proposta para homologação; ainda não existe endpoint produtivo ativo

> O ALRT será a origem do evento. O AXE Dispatch será o receptor, responsável por autenticar, validar, eliminar duplicidades, registrar auditoria e criar a ocorrência em triagem. O piloto não devolve eventos ao ALRT, não executa despacho automático e não transmite anexos, contatos ou segredos.

## 1. Evento aceito no primeiro piloto

O único tipo de evento aceito na primeira homologação será `alert.received`. Ele representa um novo alerta do ALRT que deve se tornar uma ocorrência no AXE Dispatch.

| Evento | Direção | Ação no AXE Dispatch | Situação |
|---|---|---|---|
| `alert.received` | ALRT → AXE | Cria ocorrência com origem `integracao` e situação `triagem` | Permitido no piloto |
| `alert.updated` | ALRT → AXE | Atualiza alerta já correlacionado | Posterior; depende de tabela de correlação |
| `alert.cancelled` | ALRT → AXE | Solicita cancelamento de ocorrência correlacionada | Posterior; exige regra operacional aprovada |
| `attachment.available` | ALRT → AXE | Referência controlada a evidência | Fora do piloto |
| Qualquer outro | ALRT → AXE | Sem ação | Rejeitar com erro de contrato |

## 2. Envelope obrigatório

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_alrt_8e8d7ef8-7688-4db8-a4e5-aabc7cd5cb4a",
  "eventType": "alert.received",
  "occurredAt": "2026-08-22T00:15:00.000Z",
  "source": {
    "system": "despacho-alrt",
    "environment": "homologacao"
  },
  "correlationId": "alrt-54891",
  "idempotencyKey": "alrt:alert:54891:created:v1",
  "data": {
    "alert": {}
  }
}
```

| Campo | Obrigatório | Regra |
|---|---:|---|
| `schemaVersion` | Sim | Inicialmente, `1.0` |
| `eventId` | Sim | Identificador único do evento; não pode ser reutilizado |
| `eventType` | Sim | Deve ser exatamente `alert.received` no piloto |
| `occurredAt` | Sim | Data/hora UTC em ISO 8601 |
| `source.system` | Sim | Deve ser `despacho-alrt` |
| `source.environment` | Sim | `homologacao` até a aprovação formal de produção |
| `correlationId` | Sim | Identificador estável do alerta no ALRT |
| `idempotencyKey` | Sim | Chave determinística para impedir criação duplicada |
| `data.alert` | Sim | Objeto do alerta descrito abaixo |

## 3. Payload mínimo que o AXE Dispatch deve receber

Como a ocorrência atual do AXE Dispatch exige categoria, prioridade, descrição, endereço, latitude e longitude, esses campos são obrigatórios para que o receptor possa criar o registro sem inventar informação.

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_alrt_8e8d7ef8-7688-4db8-a4e5-aabc7cd5cb4a",
  "eventType": "alert.received",
  "occurredAt": "2026-08-22T00:15:00.000Z",
  "source": {
    "system": "despacho-alrt",
    "environment": "homologacao"
  },
  "correlationId": "alrt-54891",
  "idempotencyKey": "alrt:alert:54891:created:v1",
  "data": {
    "alert": {
      "externalId": "54891",
      "category": "Alerta urbano",
      "priority": "alta",
      "description": "Queda de árvore bloqueando parcialmente a via.",
      "address": "Rua Exemplo, 100 — Centro",
      "latitude": -27.0976,
      "longitude": -48.9104,
      "reportedAt": "2026-08-22T00:14:45.000Z",
      "sourceStatus": "new"
    }
  }
}
```

| Campo em `data.alert` | Tipo | Obrigatório | Tratamento no AXE Dispatch |
|---|---|---:|---|
| `externalId` | string | Sim | Mantido como referência externa para correlação e deduplicação |
| `category` | string | Sim | Mapeado para a categoria da ocorrência; máximo acordado de 160 caracteres |
| `priority` | enum | Sim | Aceita: `baixa`, `media`, `alta`, `critica` |
| `description` | string | Sim | Descrição operacional; sem segredos, Base64 ou conteúdo não relacionado |
| `address` | string | Sim | Endereço ou referência operacional para atendimento |
| `latitude` | decimal | Sim | Deve estar entre `-90` e `90` |
| `longitude` | decimal | Sim | Deve estar entre `-180` e `180` |
| `reportedAt` | datetime | Sim | Data/hora UTC informada pela origem |
| `sourceStatus` | string | Não | Estado próprio do ALRT, preservado apenas como contexto; não muda diretamente o ciclo do AXE |

Ao receber uma mensagem válida, o AXE Dispatch definirá internamente `origin = integracao` e `status = triagem`. Isso garante que um alerta externo não seja despachado, aceito, concluído ou cancelado automaticamente.

## 4. Dados que não devem entrar no piloto

| Dado | Regra do piloto |
|---|---|
| Nome, telefone, e-mail ou documento de solicitante | Não enviar |
| Fotos, vídeos, PDFs, Base64 ou qualquer arquivo binário | Não enviar |
| Token, senha, chave, certificado ou assinatura | Nunca no corpo JSON |
| Localização em fluxo contínuo | Não enviar |
| Equipe, viatura ou decisão de despacho | Não enviar; a decisão ocorre no AXE Dispatch |
| Situação que pule etapas operacionais | Não enviar; eventos de atualização serão avaliados depois |

## 5. Autenticação e validações obrigatórias

O mecanismo de autenticação definitivo precisa ser confirmado pelo ALRT. A proposta mínima é assinatura HMAC do corpo bruto ou outro mecanismo equivalente que permita verificar origem e integridade.

| Controle | Regra proposta |
|---|---|
| Transporte | HTTPS obrigatório |
| Tipo de conteúdo | `Content-Type: application/json` |
| Assinatura | `X-Signature` ou mecanismo equivalente, validado antes do processamento |
| Tempo | `X-Request-Timestamp` dentro da janela acordada |
| Idempotência | Rejeitar ou confirmar sem repetir efeitos quando `eventId` ou `idempotencyKey` já existirem |
| Schema | Rejeitar tipo de evento não permitido, campo obrigatório ausente ou formato inválido |
| Tamanho | Limitar corpo JSON; anexos não são aceitos |
| Auditoria | Registrar origem, correlação, resultado, latência e erro sanitizado |

## 6. Respostas que o AXE Dispatch deve retornar

O receptor deve responder rapidamente e processar o evento pela fila, evitando timeout no ALRT.

```json
{
  "receiptId": "rcpt_01JQ9JQ9CY8ZK61ME6G2MMN45R",
  "eventId": "evt_alrt_8e8d7ef8-7688-4db8-a4e5-aabc7cd5cb4a",
  "status": "accepted",
  "receivedAt": "2026-08-22T00:15:01.220Z"
}
```

| HTTP | Situação | Conduta do ALRT |
|---:|---|---|
| `202` | Aceito para processamento | Não reenviar; acompanhar correlação por mecanismo acordado |
| `200` | Aplicado imediatamente, se isso for acordado | Registrar confirmação |
| `400` | JSON ou envelope inválido | Corrigir payload; não repetir cegamente |
| `401` / `403` | Falha de autenticação ou escopo | Suspender envio e revisar credencial/assinatura |
| `409` | Evento duplicado ou conflito | Não criar novo alerta; consultar correlação |
| `422` | Regra de negócio inválida | Corrigir categoria, prioridade, localização ou mapeamento |
| `429` | Limite de requisições | Respeitar `Retry-After` |
| `5xx` | Falha temporária | Repetir com política limitada e idempotente |

## 7. Sequência de homologação

1. O ALRT disponibiliza endpoint de homologação, método de assinatura/autenticação e exemplo de payload.
2. O AXE cria endpoint de entrada ainda desativado para produção, com validação de assinatura e registro de auditoria.
3. O ALRT envia um alerta de teste com todos os campos mínimos.
4. O AXE devolve `202` e cria uma ocorrência em `triagem`, sem despacho automático.
5. São testados evento duplicado, assinatura inválida, coordenadas inválidas, prioridade desconhecida e indisponibilidade temporária.
6. Os responsáveis aprovam o dicionário de campos, limites, retenção, operação de falhas e chave de desligamento.
7. Somente então o fluxo passa para produção limitada, ainda restrito a `alert.received`.

## 8. Informações que o Despacho ALRT precisa confirmar

- método de autenticação e assinatura disponível;
- possibilidade de enviar o `eventId`, `correlationId` e `idempotencyKey` propostos;
- política de retry e timeouts;
- ambiente de homologação e IPs/faixas de origem, se houver;
- campos obrigatórios próprios e limites de tamanho;
- responsável técnico para testes e reconciliação;
- se `externalId` é único e imutável no ciclo de vida do alerta.

# Contrato de homologação: ALRT → AXE Dispatch

**Versão do perfil:** 1.0  
**Direção:** Despacho ALRT → AXE Dispatch  
**Finalidade:** receber e persistir alertas para homologação, sem criar ocorrências, atribuições ou despachos de campo automaticamente.

## Endpoint

| Item | Valor |
|---|---|
| Método | `POST` |
| Caminho | `/api/integrations/alrt/events` |
| Conteúdo | `application/json` |
| Ambiente aceito | `homologacao` |
| Resposta para evento novo | `202 Accepted` |
| Resposta para repetição idempotente | `200 OK` |

O receptor só aceita tráfego se o modo de homologação, a API key e o segredo HMAC estiverem configurados por variáveis seguras. Sem estes requisitos, responde `503 ALRT_INGRESS_DISABLED`.

## Cabeçalhos obrigatórios

| Cabeçalho | Descrição |
|---|---|
| `X-ALRT-API-Key` | Chave de API da homologação. `X-API-Key` é aceito apenas para compatibilidade explícita. |
| `X-Timestamp` | Data ISO 8601 em UTC. `X-Request-Timestamp` é aceito apenas para compatibilidade explícita. |
| `X-Signature` | Assinatura `sha256=<hex>` calculada sobre o corpo bruto. |
| `X-Correlation-Id` | Identificador rastreável. Quando ausente, o AXE gera um UUID. |

## Geração de assinatura

```text
assinatura = "sha256=" + HMAC_SHA256(ALRT_HMAC_SECRET, X-Timestamp + "." + corpo_bruto_utf8)
```

O AXE compara a assinatura em tempo constante. A assinatura, a API key e o segredo HMAC nunca são incluídos em logs, auditorias ou respostas.

## Envelope aceito

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt_...",
  "eventType": "alert.received",
  "occurredAt": "2026-08-22T13:30:00.000Z",
  "source": { "system": "despacho-alrt", "environment": "homologacao" },
  "correlationId": "opcional-quando-enviado-no-header",
  "idempotencyKey": "alerta-unico",
  "data": {
    "alert": {
      "externalId": "54891",
      "category": "Alerta urbano",
      "priority": "alta",
      "description": "Descrição operacional",
      "address": "Endereço",
      "latitude": -27.0976,
      "longitude": -48.9104,
      "reportedAt": "2026-08-22T13:29:00.000Z"
    }
  }
}
```

Campos desconhecidos, tipos incompatíveis, coordenadas fora de faixa e versões de esquema diferentes são rejeitados. Caso header e envelope tragam correlações divergentes, o AXE responde `400 CORRELATION_MISMATCH`.

## Segurança e respostas

| Situação | Código | Resposta |
|---|---:|---|
| JSON inválido | 400 | `INVALID_JSON` |
| Envelope inválido | 400 | `INVALID_PAYLOAD` |
| Correlação divergente | 400 | `CORRELATION_MISMATCH` |
| API key, timestamp ou HMAC inválidos | 401 | Código específico de segurança |
| Payload grande | 413 | `PAYLOAD_TOO_LARGE` |
| Limite temporário | 429 | `RATE_LIMITED` e `Retry-After` |
| Receptor indisponível | 503 | `INGRESS_UNAVAILABLE` ou `ALRT_INGRESS_DISABLED` |

Todas as respostas contêm `success` e `correlationId`. O timestamp é aceito em janela configurável, limitada a uma hora; o padrão é cinco minutos. A limitação de recepção é configurável por minuto e devolve `Retry-After` somente em indisponibilidade temporária.

## Idempotência e auditoria

Os valores `eventId` e `idempotencyKey` são únicos no repositório de eventos recebidos. Repetições retornam uma resposta válida com status `DUPLICATE`, sem novo processamento. Para novos eventos, o AXE persiste o digest SHA-256 do corpo, correlação, origem, horário, conteúdo operacional mínimo e estado `recebido`, além de registrar auditoria.

> A persistência representa uma fila de homologação. Nenhum evento recebido cria ocorrência, altera situação, atribui recursos ou despacha equipes até que os critérios de homologação e a autorização administrativa sejam concluídos.

## Uso no Workflow Builder

O editor visual disponibiliza o nó **Receber dados externos** (`trigger.external_data`) para representar o ponto de entrada de um parceiro e o marcador **Início da trilha** (`trail.start`) para indicar, de forma explícita, o começo da sequência acompanhada no canvas. Para o ALRT, a composição recomendada é:

```text
Receber dados externos (Despacho ALRT, homologação)
  → Início da trilha
  → Transformar dados ou Preencher ocorrência
  → Fim da trilha
```

O gatilho externo exige aplicação de origem, conexão de referência, tipo de evento e ambiente `homologacao`. Ele não abre portas de rede no workflow, não substitui a validação do receptor HTTP e não provoca a criação automática de ocorrências. A recepção continua protegida por API key, HMAC, timestamp, idempotência e auditoria.

## Log de teste de recebimento

A área **Integrações → Logs** possui o painel **Log de teste de recebimento externo**. Cada chamada ao receptor gera uma linha de teste para `202` (recebido), `200` (duplicado) ou rejeições como `400 INVALID_PAYLOAD`, `401 INVALID_API_KEY`, `401 INVALID_SIGNATURE`, `401 INVALID_TIMESTAMP`, `429 RATE_LIMITED` e `503` de bloqueio administrativo ou indisponibilidade.

O painel mostra somente data, código HTTP, correlação, origem declarada, tipo de evento quando validado e diagnóstico. API keys, assinaturas HMAC, corpo bruto, segredo e payload digest não são exibidos nem gravados nesse log. Todas as linhas indicam que os efeitos automáticos continuam desativados na homologação.

Em 22 de agosto de 2026, uma tentativa técnica controlada sem timestamp foi exibida no painel com `401 INVALID_TIMESTAMP`, correlação `axe-ui-log-teste-20260822`, origem `despacho-alrt`, evento não validado e efeitos automáticos `Não`. A inspeção visual confirmou que o diagnóstico é compreensível e que nenhum segredo, assinatura ou corpo bruto é apresentado.

## Revisão humana para criar ocorrência

Quando uma trilha publicada contém **Receber dados externos → Início da trilha → Criar ocorrência**, e o nó de ocorrência está configurado com o modo **Exigir revisão antes de criar**, a recepção validada cria apenas uma prévia em **Integrações → Revisões externas**. Essa prévia apresenta os campos mapeados, o workflow que a originou e a correlação técnica; ela não cria ocorrência, altera situação, atribui equipe ou viatura, notifica operadores nem despacha recursos.

A criação só acontece após um usuário com a permissão `occurrences.create` conferir a prévia e acionar **Confirmar e criar ocorrência**. A confirmação cria a ocorrência de forma transacional, atualiza o estado do evento recebido e registra auditoria da prévia e da ocorrência resultante. A opção de descartar encerra uma prévia sem efeito operacional.

## Configuração segura

| Variável | Uso |
|---|---|
| `ALRT_INGRESS_MODE` | Deve ser `homologacao` somente durante o teste autorizado. |
| `ALRT_INGRESS_API_KEY` | API key de homologação. |
| `ALRT_INGRESS_HMAC_SECRET` | Segredo HMAC-SHA256 de homologação. |
| `ALRT_TIMESTAMP_TOLERANCE_SECONDS` | Janela de timestamp; padrão `300`. |
| `ALRT_RATE_LIMIT` | Limite de recepções por minuto; padrão `60`. |

As variáveis de produção devem ser independentes das de homologação. A ativação produtiva permanece bloqueada até haver contrato confirmado, credenciais próprias, teste ponta a ponta, monitoramento e chave de desligamento aprovada por Administrador.

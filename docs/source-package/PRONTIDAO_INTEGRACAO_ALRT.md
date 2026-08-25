# Prontidão para integração produtiva ALRT → AXE

**Atualizado em:** 22 de agosto de 2026  
**Direção inicial aprovada:** Despacho ALRT → AXE Dispatch  
**Aprovador indicado:** perfil Administrador

## Evidência disponível

A central pública do Despacho ALRT disponível em `https://despachoalrt-hjwc4f8q.manus.space/` solicita autenticação para exibir configurações, simulações e histórico. A pesquisa pública não localizou documentação oficial do contrato de webhook ou API de eventos do parceiro. Assim, não existe evidência suficiente para habilitar recepção produtiva de eventos com segurança.

## Estado atual

| Item | Estado | Regra aplicada |
|---|---|---|
| Conexão de referência | Homologação | Não entrega HTTP e continua `simulation_only` |
| Workflow de triagem | Simulação | Nenhuma ocorrência, atribuição ou despacho real é criado |
| Aprovação operacional | Definida | Administradores deverão aprovar futuras ativações |
| Contrato de evento | Pendente | Evento, campos, versão, assinatura e política de reenvio não confirmados |
| Credencial produtiva | Pendente | Nenhum segredo ativo ou persistido nesta aplicação |

## Controle administrativo implementado

A tela de Conexões apresenta o botão **Pré-aprovar produção** apenas para a referência ALRT e informa que somente Administradores podem registrar essa decisão. A pré-aprovação não ativa HTTP, não altera o modo `simulation_only` e mantém `externalRequestsEnabled: false`; ela apenas gera uma evidência auditável de que a próxima etapa pode ser homologada. A inspeção visual em desktop e móvel confirmou que o aviso de bloqueio e o controle ficam visíveis sem comprometer a navegação.

## Análise do receptor existente

O AXE já expõe o receptor de homologação `POST /api/integrations/alrt/events` e a prontidão `GET /api/integrations/alrt/health`. A implementação atual valida envelope estrito `1.0`, chave em `X-ALRT-API-Key`, timestamp em `X-Request-Timestamp`, tamanho máximo de payload, coordenadas, ambiente de homologação e idempotência persistida. Também devolve `202` para evento novo, `200` para duplicado, `400` para envelope inválido e `503` quando está desativado.

Para atender integralmente o contrato anexado, ainda serão adicionados HMAC-SHA256 em corpo bruto, cabeçalhos de correlação compatíveis, resposta de JSON inválido estruturada, limitação temporária com `429`/`Retry-After`, campos configuráveis de tolerância e limite, documentação OpenAPI e a separação explícita entre recepção e processamento homologado. O modo permanece desativado até que os segredos de homologação sejam configurados por canal seguro.

## Matriz de compatibilidade atualizada

| Requisito | ALRT | AXE | Estado |
|---|---|---|---|
| Envelope estrito | Perfil 1.0 | Schema Zod estrito, sem campos silenciosos | Implementado |
| API key | `X-ALRT-API-Key` | Validação em tempo constante; compatibilidade explícita com `X-API-Key` | Implementado |
| HMAC | SHA-256 previsto | `X-Signature` sobre `timestamp.rawBody` | Implementado |
| Timestamp | UTC | `X-Timestamp`, janela configurável | Implementado |
| Correlation ID | Disponível | Recebido, gerado quando ausente e propagado | Implementado |
| JSON inválido | Protegido | `400 INVALID_JSON` estruturado | Implementado |
| Idempotência | Retry possível | Unicidade por `eventId` e `idempotencyKey` | Implementado |
| Rate limit | Respeita `429` | `429 RATE_LIMITED` com `Retry-After` | Implementado |
| Fila e auditoria | Evento assíncrono | Persistência `recebido` e auditoria; sem efeito operacional | Implementado |
| Aprovação | Administrador | Gate auditável antes de receber tráfego | Implementado |
| Teste ponta a ponta ALRT | Necessário | Aguardando API key válida e disparo do parceiro | Pendente |

## Homologação autorizada em 22 de agosto de 2026

A pré-aprovação foi registrada com auditoria para o perfil Administrador na conexão `despacho-alrt-homologacao`. O modo do receptor foi habilitado exclusivamente para `homologacao`. Após reinício, a consulta de prontidão sem API key retornou `401`, confirmando que o serviço está ativo, mas continua protegido por autenticação. O endpoint não executa efeitos operacionais: eventos válidos somente são persistidos na fila de homologação e no log de auditoria.

## Verificação HTTPS assinada

Em 22 de agosto de 2026, um evento técnico de homologação foi enviado por HTTPS ao endpoint público com API key, `X-Timestamp`, `X-Signature` HMAC-SHA256 e `X-Correlation-Id`. A resposta foi `202 RECEIVED`. O evento `evt_hml_b567db02-021e-4227-8937-beb619598c7e` foi registrado com a correlação `axe-hml-9a294960-25c2-444b-944a-1a350fe65c62`, estado `recebido`, auditoria `received` e sem ocorrência criada. Esta verificação comprova o contrato técnico do receptor; o disparo de confirmação pela aplicação ALRT permanece necessário para encerrar a homologação do parceiro.

Após o retorno `401 INVALID_API_KEY` do ALRT, a API key de homologação foi sincronizada novamente por campo seguro e a implantação foi reaplicada. Um novo evento técnico assinado foi aceito com `202 RECEIVED`, confirmando que o receptor publicado reconhece a credencial vigente. A etapa seguinte é o reenvio originado pelo ALRT para validar a mesma credencial no parceiro.

## Pré-requisitos para ativação

Antes de liberar qualquer webhook ou efeito operacional, devem ser validados o endpoint de recepção, o esquema versionado do evento, autenticação forte, idempotência, lista de IPs se aplicável, limites de reenvio, dados permitidos, cenários de erro, monitoramento e uma chave de desligamento administrada. A primeira liberação deve manter ações não aprovadas bloqueadas por padrão.

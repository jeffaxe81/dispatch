# Plano de piloto produtivo — AXE Dispatch × Despacho ALRT

**Status:** proposta técnica; não aprovada para produção  
**Direção do piloto:** unidirecional, do Despacho ALRT para o AXE Dispatch  
**Parceiro informado:** [Despacho ALRT](https://despachoalrt-hjwc4f8q.manus.space/)  
**Estado do AXE Dispatch:** Integrações & Workflows permanece em **SIMULAÇÃO / MOCK** até a homologação formal.

> O objetivo do piloto é receber alertas do ALRT com segurança, rastreabilidade e reversibilidade. Ele iniciará com o menor conjunto de dados necessário para validar identidade, entrega, idempotência e criação em triagem. Dados de contato, evidências e qualquer fluxo de saída permanecem fora do escopo até nova aprovação.

## 1. Premissas e bloqueios atuais

O parceiro exige autenticação para acessar suas configurações e o portal público não expõe contrato de API, webhooks ou autenticação. Por esse motivo, ainda não é possível definir endpoint, método de autorização, formatos de payload, limites ou confirmação de suporte a callbacks.

| Item | Situação atual | Condição para avançar |
|---|---|---|
| Contrato de API | Não disponível publicamente | OpenAPI, documentação autenticada ou exemplos de requisição e resposta |
| Webhooks | Não confirmado | Evento, URL de callback, assinatura, política de retry e prevenção de repetição |
| Autenticação | Não confirmada | OAuth 2.0, chave de API, mTLS ou assinatura HMAC documentados |
| Ambiente de homologação | Não confirmado | URL isolada, credencial de teste e dados não produtivos |
| Dados “completos” | Não classificados | Matriz aprovada por finalidade, campo, sentido e perfil de acesso |

## 2. Fluxos propostos para a entrada de alertas

O piloto deve trabalhar com identificadores estáveis e separar eventos de criação, atualização e situação. Cada mensagem precisa ter um identificador único, data/hora em UTC, origem, versão de esquema e chave de idempotência.

| Fluxo | Origem → destino | Objetivo | Critério de sucesso inicial |
|---|---|---|---|
| F1 — Alerta recebido | ALRT → AXE Dispatch | Criar ocorrência em triagem a partir de alerta parceiro | Validação de assinatura, deduplicação e criação em triagem |
| F2 — Atualização de alerta | ALRT → AXE Dispatch | Atualizar alerta previamente correlacionado | Fluxo futuro, após tabela de correlação e mapeamento de estados |

O primeiro piloto deve usar somente **F1 — Alerta recebido**, porque permite validar autenticação de entrada, contrato, log e idempotência. Todo alerta válido entra em `triagem`, sem despacho automático.

## 3. Matriz de dados e minimização

A solicitação de “todos os dados” foi interpretada como objetivo de cobertura, e não como autorização para transmissão irrestrita. Cada classe precisa de finalidade, base operacional, retenção e destinatário definidos antes da ativação.

| Classe | Exemplos no AXE Dispatch | Piloto inicial | Requisito para habilitação posterior |
|---|---|---|---|
| Identificação operacional | Código da ocorrência, ID externo, categoria, prioridade, situação, datas | Permitida, quando exigida pelo fluxo | Contrato de esquema e idempotência |
| Contexto operacional | Descrição resumida, órgão, equipe, prefixo de viatura | Restrita ao mínimo necessário | Finalidade documentada e mascaramento nos logs |
| Localização | Endereço, latitude, longitude, precisão | Não habilitar por padrão | Necessidade comprovada, acesso limitado e retenção definida |
| Dados pessoais | Solicitante, telefone, e-mail, identificadores pessoais | Não habilitar no piloto | Revisão de privacidade, perfis autorizados e proteção em trânsito e repouso |
| Evidências | Fotos, documentos, PDFs e metadados | Não habilitar no piloto | Consentimento/justificativa aplicável, antivírus, links temporários, controle de download e rastreabilidade |
| Segredos e credenciais | Chaves, tokens, assinaturas | Nunca no payload ou log | Cofre de segredos, rotação e privilégio mínimo |

Evidências não devem ser incluídas em Base64 no payload de eventos. Caso aprovadas, devem ser disponibilizadas por mecanismo de arquivo controlado, com URL temporária, autorização por objeto, expiração curta e auditoria de acesso.

## 4. Controles técnicos obrigatórios

| Camada | Controle mínimo para o piloto |
|---|---|
| Transporte | HTTPS com TLS atual; rejeição de HTTP simples |
| Entrada no AXE | Assinatura HMAC ou token com escopo, timestamp, nonce, prevenção de replay e limite de requisições |
| Credenciais | Cofre de segredos; nenhum valor real em tela, banco, código, auditoria ou exportação |
| Integridade | ID de evento, chave de idempotência, versão de contrato e verificação de esquema |
| Confiabilidade | Fila persistida, retry exponencial limitado, dead-letter e reprocessamento autorizado |
| Observabilidade | Correlação por `eventId`, estado de entrega, latência, erro sanitizado e painel de falhas |
| Reversibilidade | Chave de desligamento por conexão e por fluxo; desligamento não apaga auditoria nem fila |
| Governança | Dono operacional, dono técnico, responsável do parceiro e aprovador de segurança definidos |

## 5. Sequência de homologação

1. **Contrato e acesso.** O parceiro fornece documentação, credenciais de homologação, eventos suportados, limites e contato técnico.
2. **Mapeamento.** As equipes aprovam o dicionário de campos, regras de categoria, estados permitidos e tratamento de conflitos.
3. **Entrada controlada.** O parceiro envia um alerta de teste assinado; o AXE valida e o cria em triagem, sem despacho automático.
4. **Falhas e contingência.** São testados timeout, assinatura inválida, payload fora do contrato, repetição, indisponibilidade e dead-letter.
5. **Aprovação de piloto.** Responsáveis técnico, operacional e de segurança assinam o aceite com escopo, horários, limites e critério de reversão.
6. **Produção limitada.** O primeiro recorte produtivo recebe somente `alert.received` com campos aprovados, monitoramento reforçado e chave de desligamento disponível.

## 6. Critérios de aceite para produção limitada

O piloto só poderá avançar quando todos os itens abaixo estiverem comprovados em homologação.

| Critério | Evidência esperada |
|---|---|
| Autenticação válida | Credencial com escopo mínimo e teste positivo/negativo registrado |
| Entrega confiável | Confirmação de recebimento, idempotência e reconciliação de pelo menos um evento de cada tipo aprovado |
| Proteção de dados | Matriz de campos aprovada; logs sem segredos e sem conteúdo desnecessário |
| Tratamento de falhas | Timeout, retry, dead-letter e desligamento testados |
| Auditoria | Origem, destino, evento, operador, correlação e resultado consultáveis |
| Operação | Responsáveis e procedimento de contingência divulgados |

## 7. Informações ainda necessárias do Despacho ALRT

Para transformar esta proposta em implementação, são indispensáveis os seguintes itens do parceiro:

- documentação OpenAPI ou endpoints completos de homologação e produção;
- autenticação exigida e processo de emissão, escopo, expiração e rotação de credenciais;
- eventos de webhook, assinaturas, IPs de origem, política de retries e limites de taxa;
- exemplos reais anonimizados de payloads de criação, atualização e retorno;
- comportamento esperado para mensagens duplicadas, fora de ordem ou parcialmente válidas;
- responsável técnico, responsável operacional e canal de suporte durante a homologação.

O formato detalhado de envelope, evento, campos e respostas está documentado em [`CONTRATO_ENTRADA_ALRT_AXE.md`](./CONTRATO_ENTRADA_ALRT_AXE.md).

## 8. Decisão pendente

Nenhuma conexão produtiva será ativada até que o contrato autenticado do parceiro seja verificado e os responsáveis aprovem o escopo de dados do primeiro fluxo. O caminho imediato recomendado é: **F1 — Alerta recebido em homologação, com dados operacionais mínimos e criação em triagem**.

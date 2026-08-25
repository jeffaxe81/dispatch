# Guia operacional: evento externo com revisão humana

**Fluxo:** Despacho ALRT → AXE Dispatch  
**Ambiente atual:** homologação controlada  
**Objetivo:** transformar um alerta autenticado em uma prévia revisável e criar uma ocorrência somente após confirmação humana autorizada.

> Este fluxo não atribui equipe ou viatura, não altera ocorrências existentes, não envia notificações externas e não despacha recursos automaticamente. A criação da ocorrência é sempre uma decisão explícita do operador autorizado.

## 1. Verificar a conexão de homologação

Em **Integrações → Conexões**, confirme que a referência **Despacho ALRT — Eventos** está ativa para `homologacao`. Essa conexão é apenas a identificação do parceiro dentro do AXE; ela não efetua chamadas de saída. A autorização administrativa, a API key, a assinatura HMAC, o timestamp, a correlação, a idempotência e o rate limit continuam sendo validados pelo receptor de entrada.

| Verificação | Resultado esperado | Onde conferir |
|---|---|---|
| Ambiente | `homologacao` | Conexões e cabeçalho do evento |
| Receptor | `POST /api/integrations/alrt/events` | Contrato ALRT → AXE |
| Segurança | API key, HMAC e timestamp válidos | Log de teste de recebimento |
| Efeito inicial | Apenas evento e prévia; nenhuma ocorrência | Revisões externas |

## 2. Abrir ou criar a trilha no Workflow Builder

Em **Integrações → Workflows**, abra o workflow **ALRT → revisão humana de ocorrência** ou crie um workflow equivalente. O workflow deve permanecer identificado como **SIMULAÇÃO / MOCK** enquanto a homologação está em andamento. A publicação e ativação da trilha autorizam somente a formação de prévias, não uma automação de despacho.

## 3. Configurar “Receber dados externos”

Adicione o nó **Receber dados externos** e informe os campos abaixo. Esses dados identificam de forma determinística qual evento recebido deve ser associado à trilha.

| Campo do nó | Valor para o ALRT |
|---|---|
| Aplicação de origem | `despacho_alrt` |
| Conexão de referência | `despacho-alrt-homologacao` |
| Tipo de evento | `alert.received` |
| Ambiente | `homologacao` |

Não configure `producao` neste nó. O receptor HTTP continua sendo a única porta de entrada: o nó não abre URLs, não aceita segredos e não realiza chamadas externas.

## 4. Delimitar a trilha

Conecte o gatilho ao nó **Início da trilha**. Esse marcador deixa explícito o início do caminho auditável e precisa receber a conexão do gatilho. Ao final, use o nó **Fim da trilha**, sem saídas. A sequência recomendada é a seguinte:

```text
Receber dados externos
  → Início da trilha
  → Revisar antes de criar ocorrência
  → Fim da trilha
```

## 5. Preparar a ocorrência para revisão

No nó **Criar ocorrência**, selecione **Exigir revisão antes de criar**. Mapeie a categoria, a prioridade, a descrição, o endereço, a latitude e a longitude para os dados do alerta. Para o contrato ALRT, use os tokens abaixo.

| Campo da prévia | Token recomendado |
|---|---|
| Categoria | `{{alert.category}}` |
| Prioridade | `{{alert.priority}}` |
| Descrição | `{{alert.description}}` |
| Endereço | `{{alert.address}}` |
| Latitude | `{{alert.latitude}}` |
| Longitude | `{{alert.longitude}}` |
| Origem | `integracao` |
| Solicitante | `Despacho ALRT` |

O AXE não permite publicar uma revisão humana sem descrição, endereço e coordenadas mapeados. Assim, a pessoa revisora vê a informação operacional mínima antes de decidir.

## 6. Salvar, validar e ativar a trilha

Use **Salvar versão** para registrar uma nova versão auditável. Em seguida, corrija eventuais avisos de configuração, publique e ative o workflow. A trilha configurada para homologação permanece com a automação real controlada como bloqueada; essa marca impede a transformação deste desenho em despacho automático.

## 7. Verificar o recebimento e a prévia

Quando o ALRT enviar um evento assinado corretamente, o receptor retorna `202 RECEIVED` para um evento novo ou `200 DUPLICATE` para uma repetição idempotente. Consulte **Integrações → Logs** para verificar a tentativa sanitizada e abra **Integrações → Revisões externas** para conferir a prévia criada.

Se um alerta chegar durante uma transição de publicação e constar apenas no log, abra ou atualize a fila de revisões. O AXE reconcilia eventos recebidos após a publicação da trilha ativa que ainda não possuem prévia. Eventos recebidos antes da publicação não são recuperados automaticamente, evitando que dados históricos entrem no fluxo por engano.

| Situação da prévia | Significado | Próxima ação |
|---|---|---|
| `pendente` | O evento foi aceito e aguarda decisão humana. | Conferir dados e decidir. |
| `confirmada` | Uma ocorrência foi criada pelo operador autorizado. | Acompanhar a ocorrência pela Central. |
| `descartada` | A prévia foi encerrada sem criar ocorrência. | Consultar a auditoria se necessário. |

## 8. Revisar e criar a ocorrência

Um usuário com a permissão `occurrences.create` abre a prévia, confere tipificação, prioridade, descrição, endereço e coordenadas e seleciona **Revisar e criar**. A tela apresenta uma confirmação explícita antes do comando definitivo. Após a confirmação, o AXE cria a ocorrência em transação única, relaciona a prévia e o evento de origem, atualiza o estado do evento para `processado` e grava auditoria.

O comando não atribui recursos. Caso seja necessário acionar uma equipe ou viatura, essa decisão deve ocorrer depois, pela Central e pelas permissões operacionais próprias.

## Diagnóstico rápido

| Sintoma | Causa provável | Ação segura |
|---|---|---|
| Nenhuma prévia aparece | Workflow inativo, não publicado ou configuração do gatilho divergente. | Confira conexão, ambiente, tipo de evento e publicação. |
| `401 INVALID_TIMESTAMP` | Relógio do parceiro fora da janela aceita. | Sincronize o relógio em UTC e reenvie com novo timestamp e assinatura. |
| `401 INVALID_API_KEY` ou `401 INVALID_SIGNATURE` | Credencial ou cálculo HMAC divergente. | Compare a configuração no canal seguro; não cole segredos em logs ou telas. |
| Evento repetido retorna `200 DUPLICATE` | O `eventId` ou a chave de idempotência já foi recebido. | Não reenvie como novo; mantenha a mesma correlação para rastreio. |
| Botão de confirmação indisponível | Falta da permissão `occurrences.create`. | Solicite a revisão do perfil e do escopo a um Administrador. |

## Evidências de auditoria

O Log de operações preserva a recepção do evento, a criação da prévia, a confirmação ou descarte da revisão e, quando houver confirmação, a criação da ocorrência. O painel de testes exibe somente metadados necessários para diagnóstico e nunca apresenta API key, HMAC, corpo bruto ou segredo.

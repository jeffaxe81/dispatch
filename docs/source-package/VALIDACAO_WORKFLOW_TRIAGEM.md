# Validação do workflow de triagem de iluminação

**Data:** 22 de agosto de 2026  
**Workflow:** `triagem de iluminação`  
**Versão validada:** v7

## Diagnóstico confirmado

A versão anterior mantinha a conexão invertida: o nó de despacho apontava para o gatilho manual. Isso deixava o despacho sem entrada e impedia que a estrutura representasse um fluxo executável de forma coerente. Além disso, não havia execução persistida na fila, indicando que a configuração do canvas não havia sido acionada pelo fluxo de execução manual.

## Correção aplicada

Foi criada a versão v5, auditada, com a direção correta:

```text
Execução manual → despacho de carro
```

O editor agora sinaliza como erro conexões que entram em um gatilho, nós sem entrada e nós inacessíveis. O executor também passa a seguir a direção das conexões, em vez da ordem visual dos nós no canvas.

## Verificação visual

A tela `/integracoes/workflows/120001` apresentou a versão v5, a conexão partindo de **Execução manual** para **despacho de carro**, o estado de validação positivo e o botão explícito **Executar simulação**. O botão redireciona a execução concluída para a fila de Execuções. Todos os efeitos permanecem internos e simulados: não há alteração de equipe, viatura, ocorrência ou serviço externo.

## Execução confirmada

Foi executada uma simulação controlada na versão v5, registrada como **execução #90001**. O resultado foi `concluida`, com duas etapas na ordem esperada: **Execução manual** e, em seguida, **despacho de carro**. O resultado persistido informou `externalRequests: 0`; portanto, a validação não acionou o Despacho ALRT, não criou ocorrência real e não alterou recursos de campo.

## Notificação, falha e histórico

A versão v6 acrescentou o nó **Feedback visual de despacho**, conectado após o despacho simulado. O editor apresentou os controles **Executar simulação** e **Testar falha**, além do histórico persistido no próprio workflow. A falha controlada foi exercitada até o limite: as execuções #120001 e #120002 ficaram em `falha`, enquanto a #120003 foi preservada em `dead_letter` na terceira tentativa. A inspeção desktop e móvel confirmou que os controles, o canvas, as conexões e os cartões de histórico permanecem legíveis e alcançáveis, sem qualquer chamada externa.

## Trilha, ocorrência e automação protegida

A versão v7 torna a sequência explícita no canvas:

```text
Execução manual → Início da trilha → Preencher ocorrência de iluminação → despacho de carro → Feedback visual de despacho → Fim da trilha
```

O nó de ocorrência expõe o mapeamento de categoria, prioridade, situação, origem, solicitante, contato, descrição, endereço, latitude, longitude, equipe e viatura. Nesta versão, a configuração permanece apenas como referência simulada e nenhum registro operacional é criado.

O painel **Automação real controlada** registra a intenção de disparar por alerta de integração e a conexão de referência `despacho-alrt-eventos`; porém, a definição persiste com `activationStatus: bloqueada`, `requiresApproval: true` e modo de execução `simulacao`. A inspeção desktop e móvel de 22 de agosto de 2026 confirmou a legibilidade dos novos controles, dos marcadores e do aviso de bloqueio. Não houve chamadas externas, criação de ocorrência ou alteração de recursos de campo.

## Inspeção do editor após os novos nós

Em 22 de agosto de 2026, a pré-visualização da rota `/integracoes/workflows/120001` não localizou o workflow no contexto da sessão de pré-visualização e exibiu a mensagem “Workflow não encontrado”. A validação dos novos blocos foi mantida por tipagem e testes automatizados do servidor e do editor. A limitação é específica da massa de dados ou sessão do preview e não representa uma chamada externa nem alteração operacional.

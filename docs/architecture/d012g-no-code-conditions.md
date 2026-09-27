# D-012G — Condições No-Code

## Estado

- G1 — contrato e avaliador puro: GREEN, checkpoint `checkpoint/d012g-g1-green-20260927`.
- G2 — validação de definição: GREEN, checkpoint `checkpoint/d012g-g2-green-20260927`.
- G3 — máquina de estados: GREEN, checkpoint `checkpoint/d012g-g3-green-20260927`.
- G4 — persistência/runtime: GREEN, checkpoint `checkpoint/d012g-g4-green-20260927`.
- G5 — hardening: GREEN, checkpoint `checkpoint/d012g-g5-green-20260927`.

## Contrato de decisão

O nó `decision.condition` é declarativo. Sua configuração contém:

- `condition`: expressão válida pelo contrato G1;
- `trueTargetNodeId`: destino quando a expressão for verdadeira;
- `falseTargetNodeId`: destino quando a expressão for falsa.

Os destinos devem ser explícitos e distintos.

## Regra de publicação

Na publicação, um `decision.condition` deve:

1. possuir uma condição estruturalmente válida;
2. declarar os destinos verdadeiro e falso;
3. possuir exatamente duas conexões de saída;
4. ter as saídas correspondentes aos dois destinos declarados;
5. falhar fechado quando a configuração for ambígua ou inconsistente.

A G2 apenas valida a definição. Ela não avalia a condição, não lê dados externos e não altera o runtime.

## Limites

- sem JavaScript, SQL, shell ou `eval`;
- sem migration;
- sem alteração de domínio produtor;
- sem deploy;
- sem grants;
- execução da decisão fica reservada à G3/G4.


## Resolução de decisão no runtime puro

A G3 adiciona resolução determinística de `decision.condition` na máquina de estados.

A resolução:
- exige instância em estado `running`;
- lê a configuração congelada do nó;
- valida que as duas arestas correspondem aos destinos verdadeiro/falso;
- avalia a expressão usando somente `WorkflowConditionContext`;
- rejeita campos não incluídos em `exposedFields`;
- preserva `correlationId` na transição;
- não consulta banco nem domínio externo.

A persistência do contexto e da auditoria fica reservada à G4. A validação de CI da G3 é executada contra `main`, preservando o PR empilhado após o gate.


## Persistência e contexto autorizado

A G4 conecta a decisão ao runtime persistido sem consultar os domínios produtores.

O contexto é reconstruído exclusivamente de `workflowExecutions.inputData` da própria instância congelada:

- `input.*`: dados de entrada persistidos da instância;
- `event.*`: campos de primeiro nível do payload de evento persistido;
- `meta.eventId`, `meta.eventType` e `meta.producer`: metadados persistidos do evento.

Campos internos como `simulation` e o objeto bruto `payload` não são expostos diretamente. O conjunto `exposedFields` é derivado apenas das chaves namespaced disponibilizadas ao avaliador.

A função persistida de resolução:

1. valida o escopo de tenant já associado à instância;
2. carrega a versão congelada e o nó atual;
3. reconstrói o grafo validado, incluindo a configuração `decision.condition`;
4. avalia a condição com o contexto persistido;
5. persiste o novo nó/status na mesma transação;
6. cria tarefa apenas se o destino exigir etapa humana;
7. registra auditoria `workflow_instance.decision` com o mesmo `correlationId`.

Não há leitura direta de Formulários, Inventário ou Ocorrências e não foi adicionada migration.


## Hardening G5

O contexto persistido passa a considerar explicitamente o `triggerType` da execução:

- `manual`: todos os campos de entrada, exceto o marcador interno `simulation`, são expostos somente sob `input.*`; nomes como `payload` ou `eventId` permanecem dados manuais e não recebem semântica de evento;
- `event:*`: dados comuns permanecem sob `input.*`, o payload persistido é exposto sob `event.*` e os metadados autorizados sob `meta.*`;
- qualquer outro `triggerType` falha fechado;
- o sufixo de `event:*` deve corresponder ao `eventType` persistido;
- payload de evento deve ser objeto válido;
- o contexto possui limite explícito de 200 campos expostos.

As proteções anteriores de G1 continuam válidas para números finitos, datas ISO-8601, campos ausentes/não expostos, operadores em allowlist e profundidade máxima da expressão. O isolamento por tenant continua sendo aplicado pelo carregamento congelado da instância antes de qualquer resolução persistida.

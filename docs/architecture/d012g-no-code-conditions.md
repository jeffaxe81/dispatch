# D-012G — Condições No-Code

## Estado

- G1 — contrato e avaliador puro: GREEN, checkpoint `checkpoint/d012g-g1-green-20260927`.
- G2 — validação de definição: GREEN, checkpoint `checkpoint/d012g-g2-green-20260927`.
- G3 — máquina de estados: em validação.

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

A persistência do contexto e da auditoria fica reservada à G4.

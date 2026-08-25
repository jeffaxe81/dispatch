# Desenho de controle de acesso dinâmico

## Objetivo

O módulo de acesso substituirá a dependência exclusiva de `operationalRole` por um modelo de **papéis dinâmicos, permissões granulares e escopos organizacionais**. O campo atual será preservado durante a transição para que rotas e registros existentes continuem operando enquanto os vínculos dinâmicos são configurados.

## Compatibilidade de perfis

| Perfil atual | Papel padrão dinâmico | Compatibilidade preservada |
|---|---|---|
| `administrador` | Administrador | Administração de recursos, usuários e operação da organização |
| `supervisor` | Supervisor | Supervisão, redistribuição e intervenções operacionais |
| `despachador` | Despachador | Fila, despacho, acompanhamento de equipes e prioridade |
| `operador` | Operador | Registro e encaminhamento inicial de ocorrências |
| `agente` | Agente de Campo | Atuação somente em recursos e ocorrências atribuídos |
| Não existente | Super Administrador, Gestor, Auditor e Consulta | Novos papéis configuráveis após migração |

## Modelo RBAC com escopo

| Camada | Responsabilidade |
|---|---|
| Papel | Agrupa permissões de negócio, como `occurrences.create` ou `users.disable` |
| Permissão | Define uma ação mínima sobre um recurso |
| Vínculo de usuário | Associa um usuário a um ou mais papéis ativos, com prazo opcional |
| Escopo | Limita o papel a organização, regional, unidade, departamento, grupo ou equipe |
| Política de servidor | Verifica atividade, permissão e escopo antes de executar qualquer procedure |

## Princípios de segurança

O cliente somente ajusta visibilidade. A autorização efetiva permanece no servidor. Usuários inativos não podem operar. Papéis padrão são protegidos contra remoção e alterações de papéis, permissões, escopos e ativações geram auditoria. O modelo não executa exclusão física de usuários, preservando rastreabilidade.

## Estratégia de migração

As novas tabelas serão criadas de forma não destrutiva. Em seguida, papéis e permissões padrão serão cadastrados sem alterar os usuários existentes. No primeiro acesso, as verificações dinâmicas poderão usar o papel legado como compatibilidade; depois de vinculado um papel dinâmico, as permissões explícitas passam a prevalecer. A remoção do campo legado somente poderá ser considerada após homologação integral.

## Convivência com regras operacionais legadas

Toda procedure operacional exige uma **permissão dinâmica**. O campo `operationalRole` não concede uma nova permissão quando existe vínculo dinâmico ativo; ele é somente a compatibilidade de migração para contas ainda não vinculadas a um papel. As validações legadas de agente, ocorrência criada pelo próprio operador e equipe vinculada permanecem como **restrições complementares de propriedade**, nunca como substitutas da checagem RBAC. Isso evita que uma permissão ampla permita, por engano, que um agente atue fora de sua própria equipe.

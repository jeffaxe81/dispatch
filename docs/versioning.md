# Política de versionamento

## Convenção

O Dígitro Dispatch utiliza **Versionamento Semântico**. A versão oficial é declarada em `package.json`, enquanto `CHANGELOG.md` registra a descrição funcional de cada release. Cada release deve também possuir um checkpoint recuperável com a mesma versão nas notas de alteração.

## Procedimento de release

| Etapa | Ação | Evidência |
|---|---|---|
| Planejamento | Registrar requisitos no `todo.md` | Itens verificáveis e responsáveis definidos |
| Implementação | Desenvolver em alterações compatíveis e cobertas por testes | Verificação de tipos e testes aprovados |
| Classificação | Escolher MAJOR, MINOR ou PATCH | Impacto de compatibilidade analisado |
| Registro | Atualizar `package.json` e `CHANGELOG.md` | Versão e mudanças descritas |
| Recuperação | Criar checkpoint com a versão no título | Identificador de versão disponível no histórico |
| Aceite | Executar homologação do fluxo alterado | Registro de aprovação operacional |

> Alterações de banco, permissões, auditoria ou escopo de acesso exigem uma revisão explícita de compatibilidade e um plano de reversão antes da release.

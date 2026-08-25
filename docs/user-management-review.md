# Revisão do módulo de usuários

## Diagnóstico aplicado

O identificador técnico `openId` era exibido como alternativa ao nome quando a identidade corporativa retornava dados incompletos. A interface agora evita essa exposição: prioriza o nome de exibição, usa o nome corporativo quando disponível e mostra um estado explícito de identidade pendente quando não houver dado nominal confiável. Também foi incluído o pré-cadastro manual, com perfil e escopo inicial, além da vinculação automática por e-mail corporativo no primeiro login.

## Melhorias priorizadas

| Prioridade | Melhoria | Benefício esperado | Próxima ação recomendada |
|---|---|---|---|
| Alta | Criar a permissão dinâmica `users.create`, separada de `users.edit`. | Aplica menor privilégio a quem pode pré-cadastrar pessoas. | Adicionar a permissão ao catálogo, à matriz de papéis e trocar a autorização da procedure de criação. |
| Alta | Garantir unicidade de e-mail corporativo e identificador institucional no banco. | Evita cadastros concorrentes e vinculações ambíguas no primeiro login. | Criar a migração após saneamento de registros duplicados existentes. |
| Média | Criar uma fila de pré-cadastros pendentes de primeiro acesso. | Permite acompanhar quem ainda não vinculou a identidade corporativa. | Adicionar filtros por situação, data de criação e ação de cancelamento/desativação. |
| Média | Impedir atribuições RBAC ativas duplicadas para o mesmo usuário, papel e escopo. | Reduz permissões redundantes e simplifica auditoria. | Validar antes da inserção e incluir índice único composto apropriado. |
| Média | Ampliar a busca administrativa para matrícula e identificador institucional com paginação consistente. | Facilita localização de equipes de campo e recursos corporativos. | Ajustar a consulta com `left join` nos perfis ou índice de busca dedicado. |
| Baixa | Tornar MFA obrigatório por perfil de risco e apresentar situação de convite/onboarding. | Melhora governança de contas administrativas e de supervisão. | Definir política por perfil e integrar com o provedor corporativo de autenticação. |

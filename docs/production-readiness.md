# Preparação para produção

## Situação da primeira entrega

Esta entrega disponibiliza uma base operacional com autenticação, perfis por função, ocorrências, equipes, viaturas, atribuições, eventos, auditoria, consulta periódica no cliente e geolocalização consentida. O banco ativo é o relacional gerenciado do projeto, compatível com MySQL/TiDB. A modelagem prioriza entidades e relações compatíveis com uma futura migração para PostgreSQL, mas a conexão atual **não é PostgreSQL**.

| Área | Implementado nesta versão | Validação pendente antes de piloto |
|---|---|---|
| Ocorrências | Criação, edição, fila, despacho, aceite, atendimento, pausa, conclusão, cancelamento e CSV | Exercício de cenário completo com a operação responsável |
| Segurança | Autenticação, autorização no servidor para cinco perfis e visibilidade condicional no cliente | Revisão dos usuários, equipes e papéis reais da instituição |
| Auditoria | Inserções transacionais para criação, edição, status, despacho, aceite, recusa, equipe, viatura, perfil e localização | Imutabilidade reforçada no nível do banco após migração para PostgreSQL |
| Mapa | Componente Google Maps com marcadores por prioridade e posição de equipe | Conectividade com o provedor, validação de quota e teste em rede corporativa |
| Localização | Uso consentido da Browser Geolocation API enquanto o aplicativo está aberto | Política de retenção, termo de uso, precisão aceitável e teste de dispositivos de campo |
| Atualização | Polling do cliente a cada 10 segundos para painel, ocorrências e Kanban | Ajuste de intervalo conforme volume, consumo e criticidade da central |

## Geolocalização e privacidade

O agente controla o compartilhamento por um interruptor visível no Aplicativo Agente. A captura é iniciada pela API de geolocalização do navegador e as posições são enviadas somente para a equipe vinculada ao usuário autenticado. O rastreamento não depende de tarefa periódica no servidor e não deve ser interpretado como rastreamento em segundo plano: em navegadores, o comportamento pode variar quando o aplicativo é minimizado, o dispositivo reduz energia ou a conexão é interrompida.

Antes do piloto, a instituição deve definir em norma interna quem pode consultar localização, por quanto tempo posições são retidas, como o agente é informado, qual é o canal de suporte e quando a localização deve ser desativada. O acesso a posições deve seguir o princípio do menor privilégio e passar por revisão dos responsáveis de segurança e privacidade.

## Auditoria

As mutações de negócio são implementadas em transações e não existem procedures da aplicação para atualizar ou remover linhas de `audit_logs`. O banco gerenciado baseado em TiDB não aceita triggers de bloqueio nesta configuração; por isso, a imutabilidade no banco ainda não possui proteção nativa nesta primeira versão. Para uma exigência de auditoria inviolável, a recomendação é concluir a migração para PostgreSQL e aplicar uma política de banco que bloqueie `UPDATE` e `DELETE`, além de usar um usuário de aplicação sem privilégios de alteração da trilha.

## Entrada em produção

| Etapa | Responsável sugerido | Evidência de conclusão |
|---|---|---|
| Cadastrar equipes, viaturas e usuários reais | Administrador operacional | Cadastros revisados e perfis vinculados |
| Definir categorias e protocolo de encerramento | Supervisão | Procedimento operacional aprovado |
| Testar mapas e localização em rede e aparelhos reais | TI e agentes | Relatório de aceite de conectividade e precisão |
| Decidir retenção, privacidade e auditoria | Segurança, jurídico e DPO | Política aprovada e comunicada |
| Realizar exercício simulado sem dados pessoais | Central e campo | Registro de tempos, erros e ajustes |
| Migrar para PostgreSQL, se exigido | Engenharia e DBA | Migração validada e plano de reversão documentado |

> A publicação deve ocorrer somente depois da validação operacional e da criação de um checkpoint da versão aprovada. O ambiente de implantação pode ser acionado pelo botão **Publish** da interface do projeto.

# Arquitetura operacional do Dispatch

## Objetivo

O Dispatch registra e acompanha ocorrências desde a abertura até o encerramento, incluindo despacho, aceite em campo, posição das equipes e auditoria. A primeira versão utiliza o banco relacional gerenciado do projeto e mantém convenções SQL portáveis para PostgreSQL: identificadores numéricos, datas em UTC, chaves estrangeiras explícitas, enumerações controladas e dados flexíveis em JSON.

## Domínio

| Entidade | Responsabilidade | Dados principais |
|---|---|---|
| Usuário operacional | Identidade, perfil e acesso | Nome, e-mail, perfil, situação operacional |
| Equipe | Unidade de atendimento em campo | Código, nome, órgão, disponibilidade, jornada |
| Viatura | Recurso associado a uma equipe | Prefixo, placa, tipo, situação, equipe atual |
| Ocorrência | Registro central do atendimento | Código, prioridade, situação, tipificação, origem, solicitante e coordenadas |
| Despacho | Associação auditável entre ocorrência e equipe | Equipe, despachador, data, aceite, recusa e motivo |
| Posição | Telemetria recebida do agente/equipe | Latitude, longitude, precisão, velocidade, captura e recebimento |
| Evento | Cronologia compreensível da ocorrência | Tipo, situação anterior/atual, ator, descrição e metadados |
| Auditoria | Prova imutável de alterações | Recurso, ação, antes, depois, ator, IP e data |

## Ciclo de vida da ocorrência

```text
Triagem → Aguardando despacho → Despachada → Aceita → Em atendimento → Concluída
                  ↘ Cancelada          ↘ Retorna a aguardando despacho
Em atendimento ↔ Pausada
```

Cada transição é validada no servidor, gera um evento de cronologia e gera um registro de auditoria. Uma ocorrência concluída ou cancelada não pode retornar ao fluxo sem ação explícita de reabertura autorizada.

## Perfis e permissões

| Perfil | Pode executar | Restrições principais |
|---|---|---|
| Operador | Criar, consultar e completar dados iniciais | Não designa equipes nem encerra ocorrências |
| Despachador | Priorizar, designar equipes e retornar despacho recusado à fila | Não administra usuários ou cadastros globais |
| Agente | Consultar atribuições próprias, aceitar/recusar, atualizar atendimento e enviar localização consentida | Não acessa ocorrências de outras equipes nem altera prioridade |
| Supervisor | Monitorar todos os dados, ajustar prioridade, reatribuir e encerrar mediante justificativa | Não administra credenciais ou perfis globais |
| Administrador | Administrar perfis, equipes, viaturas, parâmetros e todas as ocorrências | Ações administrativas também são auditadas |

## Dados de localização

A localização é obtida no dispositivo do agente apenas após consentimento explícito e enquanto o compartilhamento estiver ativo. O cliente usa a API de geolocalização para receber atualizações e envia posições autenticadas ao servidor. O backend registra a posição recebida e determina a última posição por equipe; não há agendador no servidor para rastreamento.

## Atualização automática

O painel, lista de ocorrências, Kanban, equipes e aplicativo agente utilizam consultas periódicas do cliente. A aplicação não depende de temporizadores persistentes no servidor. Em ambiente de produção, o intervalo deve ser configurável e adaptado ao perfil: menor para despachadores e agentes ativos, maior para supervisão e consultas históricas.

## Segurança e auditoria

Todas as mutações passam por procedures autenticadas e autorização baseada em perfil no servidor. A interface oculta controles não autorizados, mas a decisão final é sempre do backend. Eventos de ocorrência e logs de auditoria são inseridos na mesma transação da alteração de negócio. Valores de localização são tratados como dado pessoal operacional e devem ter retenção, acesso mínimo e rastreabilidade definidos antes do piloto.

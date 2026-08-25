# Revisão técnica — Aplicativo Agente

**Data da revisão:** 2026-08-20  
**Escopo:** estado da versão 1.9.0 do AXE Dispatch.

## Conclusão

O Aplicativo Agente está **coerente como primeiro módulo web de campo**: restringe acesso a usuários com papel operacional de agente e equipe vinculada; apresenta somente ocorrências atribuídas à equipe; permite aceite, recusa e evolução do atendimento; exige nota com no mínimo três caracteres para alterações de situação; e permite geolocalização voluntária enquanto o navegador estiver aberto.

O módulo ainda **não está completo para operação móvel crítica ou contínua**. Ele deve ser tratado como uma base de piloto supervisionado, não como substituto imediato de um aplicativo nativo de campo com operação offline, notificações e captura de evidências.

## Evidências de coerência implementada

| Área | Evidência observada | Avaliação |
|---|---|---|
| Controle de acesso | `AgentPage.tsx` bloqueia usuários que não sejam agentes ou que não tenham equipe. O backend também exige usuário ativo, escopo da equipe e pertencimento à própria equipe. | Adequado para a base atual. |
| Isolamento de ocorrências | A procedure `incidents.list` força o filtro de equipe para o papel `agente`; as verificações de leitura rejeitam ocorrência de equipe diferente. | Adequado. |
| Transição operacional | Aceite/recusa passam por atribuição pendente; iniciar, pausar, retomar e concluir exigem transição válida, permissão e nota. | Adequado, com ressalvas de concorrência. |
| Localização | A geolocalização é opt-in, usa API nativa do navegador, informa erros e aplica cadência mínima de 20 segundos. | Adequado para navegador aberto. |
| Auditoria | Transições, respostas de despacho e localização são registradas no backend existente. | Adequado. |
| Responsividade | A rota foi inspecionada em desktop e móvel. O acesso indevido é apresentado de forma compreensível. | Adequado. |

## Lacunas e prioridades

| Prioridade | Recomendação | Justificativa operacional |
|---|---|---|
| P0 | Definir proprietário individual do atendimento e regras de tomada/devolução de despacho. | A atribuição atual é por equipe; dois agentes da mesma equipe podem disputar o mesmo atendimento sem uma posse individual explícita. |
| P0 | Criar estados de conectividade, fila local e reconciliação após reconexão. | A solução depende de navegador e rede ativa; atualizações e posição podem falhar em área de campo sem sinal. |
| P1 | Incluir notificação de novo despacho e alerta de prazo de aceite. | A atualização atual é por consulta periódica; não há mecanismo de aviso imediato ao agente. |
| P1 | Adicionar detalhe da ocorrência com histórico, contatos, anexos/evidências e registro de chegada. | A tela atual mostra resumo e endereço, mas não oferece o contexto completo de atendimento de campo. |
| P1 | Oferecer ação de rota/navegação e visualização do mapa de destino. | Reduz alternância manual entre aplicativos e melhora o deslocamento operacional. |
| P2 | Separar o Aplicativo Agente em experiência PWA ou aplicativo móvel dedicado. | Permite continuidade em segundo plano, melhor controle de permissão e estratégia offline mais robusta. |
| P2 | Evoluir o registro de localização com nível de precisão, bateria, última transmissão e política de retenção. | Melhora transparência, qualidade do dado e governança de privacidade. |

## Validação realizada

A revisão considerou `AgentPage.tsx`, `useAgentLocation.ts`, `authorization.ts`, procedures de ocorrências e localização, além da inspeção visual desktop/móvel. A verificação de tipos e a suíte automatizada foram executadas com sucesso: **75 testes aprovados em 27 arquivos**. O teste atual de geolocalização cobre a cadência de envio; ainda não há teste de interface completo do fluxo de aceite, transição e retomada offline.

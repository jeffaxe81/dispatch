# Plano de validação em campo

## Objetivo

Este plano deve ser executado antes do piloto operacional, com contas, equipes e viaturas reais cadastradas. Ele não cria dados demonstrativos e não substitui a validação técnica da implementação já concluída.

| Cenário | Procedimento | Critério de aceite |
|---|---|---|
| Google Maps | Abrir a Central em rede corporativa e móvel, criar uma ocorrência com coordenadas e confirmar o marcador por prioridade | O mapa carrega, centraliza os marcadores e mantém o painel utilizável caso o provedor fique indisponível |
| Geolocalização | Vincular um agente a uma equipe, aceitar um despacho, habilitar o compartilhamento e movimentar-se em área externa | A central recebe posições recentes com precisão compatível com a operação e registra a auditoria de localização |
| Privacidade | Desativar o interruptor de compartilhamento e sair do aplicativo | O envio deixa de ocorrer; a interface informa o estado ao agente |
| Jornada | Iniciar e encerrar jornada pela equipe vinculada | Os horários mudam corretamente e há auditoria da ação |
| Despacho | Criar, atribuir, aceitar, atender, pausar e concluir uma ocorrência | Cada transição é autorizada pelo perfil e aparece na cronologia e auditoria |
| Rede | Desconectar e reconectar o dispositivo | O aviso offline aparece; após a reconexão a central indica retomada da sincronização automática |

> O navegador não é um mecanismo de rastreamento em segundo plano garantido. O compartilhamento deve ser validado nos aparelhos reais e mantido aberto durante a operação. Para rastreamento contínuo em segundo plano, a organização deve contratar uma etapa posterior com aplicativo móvel nativo e política de privacidade apropriada.

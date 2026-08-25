# Avaliação inicial — Integração AXE Dispatch × Despacho ALRT

**Data da observação:** 22 de agosto de 2026  
**Sistema parceiro informado:** `https://despachoalrt-hjwc4f8q.manus.space/`

## Evidência de acesso público

O endereço do parceiro apresenta a tela **Central de Alertas Urbanos** e exige autenticação para acessar configurações, simulações e histórico operacional. A superfície pública não expõe, até este momento, documentação de API, contrato OpenAPI, endpoints, webhooks, esquema de autenticação ou política de dados.

> Esta observação não confirma inexistência de integração. Ela confirma apenas que os contratos necessários não estão disponíveis sem autenticação.

## Implicação para o piloto bidirecional

Nenhum tráfego produtivo deve ser habilitado enquanto não forem verificados, em ambiente autenticado ou por documentação do fornecedor, os seguintes pontos:

| Controle | Evidência necessária |
|---|---|
| API de saída e entrada | Especificação dos endpoints, métodos, payloads, limites e respostas |
| Autenticação | Método, escopos mínimos, rotação e revogação de credenciais |
| Webhooks | Assinatura, prevenção de repetição, política de tentativas e IPs de origem |
| Dados sensíveis | Classificação de endereço, contatos, localização e evidências; finalidade e retenção |
| Confiabilidade | Idempotência, timeouts, fila, dead-letter, reconciliação e chave de desligamento |
| Governança | Responsáveis técnicos e operacionais, trilha de auditoria e aprovação de homologação |

## Estado atual

O AXE Dispatch continua em **SIMULAÇÃO / MOCK**. A fase atual é de descoberta e desenho do piloto; nenhuma chamada externa, credencial ou webhook produtivo foi ativado.

## Bloqueio de descoberta autenticada

Nas verificações realizadas em 22 de agosto de 2026, a autenticação necessária para continuar a navegação permaneceu pendente na tela de entrada de conta. Nenhuma credencial foi inserida ou alterada. Portanto, ainda não foi possível confirmar o contrato interno de integrações do parceiro.

Para concluir esta etapa, o responsável autorizado deve autenticar a sessão e abrir a área de **Configurações**, **API**, **Integrações** ou **Webhooks**, ou disponibilizar a documentação técnica por mensagem.

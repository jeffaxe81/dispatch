# Validação da conexão de homologação do Despacho ALRT

**Data:** 22 de agosto de 2026  
**Estado do cadastro:** ativo para homologação, com `simulation_only = true` e entrega externa desativada.

## Resultado de persistência

O cadastro `despacho-alrt-homologacao` foi reativado com a URL `https://despachoalrt-hjwc4f8q.manus.space/eventos`, ambiente `homologacao`, referência de autenticação pendente e `externalRequestsEnabled = false`. A operação foi registrada em auditoria.

## Observação de interface

A tentativa de validação visual no caminho `/integrations/connections` retornou 404, indicando que esse não é o caminho registrado no roteador do portal. A validação visual deve usar a rota de Conexões definida em `client/src/App.tsx`; isso não altera o estado persistido da conexão.

## Limite preservado

Mesmo marcada como ativa para homologação, a conexão não executa chamadas HTTP, não envia eventos ao parceiro e não possui credencial ativa.

## Validação visual concluída

A rota correta, `/integracoes/conexoes`, apresentou o cadastro **Despacho ALRT — Eventos** em desktop e móvel. O selo **ATIVA PARA HOMOLOGAÇÃO**, a URL de referência, o botão de reativação e as ações de edição e exclusão permaneceram visíveis e utilizáveis nos dois tamanhos de tela. O aviso de ambiente protegido continua explícito e informa que entregas HTTP permanecem desativadas.

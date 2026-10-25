# Pré-verificação offline — Inventário externo / AXE Dispatch

Esta entrega da branch de validação adiciona uma barreira **antes de qualquer acesso de rede** ao ensaio de homologação Inventário ↔ Despachador. É somente preparação: não executa o ensaio, não aprova liberação, não altera a main.

## Configuração do GitHub Environment homologation

Configurar, **depois de confirmar que são sistemas exclusivos de homologação**:

- Variable HOMOLOGATION_ALLOWED_HOSTS: nomes DNS exatos, separados por vírgula, dos hosts permitidos para ASSET_MOTOR_BASE_URL e DISPATCH_BASE_URL. Sem esquema, portas ou curingas; nunca usar hostname de produção.
- Variables ASSET_MOTOR_BASE_URL, DISPATCH_BASE_URL: HTTPS, sem query, credenciais ou fragmento; seus hosts precisam estar na lista exata.
- Variables HOMOLOGATION_TENANT_A e HOMOLOGATION_TENANT_B: distintas.
- Variables HOMOLOGATION_USER_ID e HOMOLOGATION_INCIDENT_REFERENCE: exclusivamente dados sintéticos de homologação.
- Optional variable HOMOLOGATION_TIMEOUT_MS: inteiro entre 1000 e 30000, padrão 3000.
- Secret HOMOLOGATION_AUTH_TOKEN: token apenas do ambiente de homologação; mínimo privilégio.
- Input de workflow_dispatch confirm: digitar a expressão exata AUTHORIZE_INVENTORY_HOMOLOGATION em **cada execução manual**.

Os requisitos já existentes na issue #97 continuam válidos: feature flag habilitada somente no ambiente isolado, endpoint de evento protegido, logs correlationId e execução manual exclusivamente da main.

## Contrato e segurança

O código scripts/inventory-external-preflight.mjs valida os parâmetros sem abrir sockets, enviar requisições nem imprimir tokens, URLs, tenants ou outros valores. Falhas imprimem somente código fixo INVENTORY_PREFLIGHT_*. O preflight roda antes do ensaio tanto no workflow manual quanto na própria função de execução, para evitar bypass via invocação direta.

Teste offline (sem acesso externo):

    node --test scripts/inventory-external-preflight.test.mjs

Não se deve considerar a aprovação do preflight como prova de que o DNS é confiável, de que o endpoint não é produção ou de que credenciais são suficientes; a confirmação administrativa do environment é uma etapa independente e obrigatória. Não disparar o workflow da main antes de sua aprovação e dos endpoints reais autorizados.

A evidência final continua pendente nos gates DISPATCH-REAL-02 e na issue #192. O resultado operacional segue NO_GO até os três gates externos serem efetivamente comprovados.

## Compatibilidade com o harness unitário existente

O harness exportado mantém a possibilidade de testes locais com servidor HTTP sintético exclusivamente em NODE_ENV=test, quando **ambos os destinos** são HTTP loopback 127.0.0.1 com porta explícita. Esta exceção é restrita à suíte local e não permite destino remoto; URLs externas passam obrigatoriamente pela validação de autorização. O workflow de homologação real continua protegido pelas verificações offline e pela confirmação manual.

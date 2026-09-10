# Motor de Ativos / Inventário — Plano de Microentregas

> **Execução:** cada microentrega deve usar TDD, checkpoint, revisão, evidência e commit próprio. A implementação poderá usar execução orientada a subagentes quando disponível ou execução inline, mas cada gate é independente.

**Goal:** construir o Motor de Ativos como produto separado e integrá-lo ao Sistema de Despacho por REST/eventos, mantendo prontuário completo, histórico auditável, geolocalização e ausência de gravação cruzada em bancos.

**Architecture:** o Motor de Ativos possui domínio e persistência próprios. O Despacho atua como consumidor por contratos versionados: REST para consultas/comandos e eventos para mudanças. O prontuário é formado por registros históricos relacionados ao ativo e apresentado por timeline, mapa, busca e indicadores.

**Spec:** `docs/superpowers/specs/2026-09-10-inventory-assets-engine-design.md`

## Global Constraints

- Motor de Ativos e Sistema de Despacho são produtos separados.
- Cada produto é dono do seu banco.
- É proibida gravação direta do Despacho no banco do Motor de Ativos e vice-versa.
- Consultas e comandos usam REST versionado; mudanças relevantes usam eventos versionados.
- Tenant, autenticação, autorização, auditoria, correlação e idempotência são obrigatórios nos contratos críticos.
- Histórico do ativo é aditivo e auditável.
- ICP-Brasil permanece módulo separado; o Motor de Ativos apenas referencia/consome sua saída quando necessário.
- Nenhuma microentrega autoriza automaticamente migration real, deploy, grants produtivos ou merge em `main`.
- Funcionalidades fora do desenho aprovado entram em backlog, sem implementação automática.

---

## Estratégia de execução

O trabalho fica dividido em três trilhas que convergem progressivamente:

1. **Motor de Ativos — domínio e prontuário:** propriedade do ativo, histórico e evidências.
2. **Experiência de Inventário:** busca, mapa, detalhe, timeline e indicadores.
3. **Integração com Despacho:** contratos REST/eventos e referências entre produtos.

Cada microentrega deve terminar utilizável/testável de forma isolada; nenhuma depende de um “big bang” final.

## Microentrega 0 — Fundação, contratos e isolamento

**Peso:** 5%

**Objetivo:** provar a separação arquitetural antes de implementar regras de negócio.

**Entregáveis:**
- fronteira explícita Motor de Ativos × Despacho;
- contrato de identidade de tenant e usuário;
- envelope de erro e correlação;
- convenção de versionamento REST;
- envelope canônico de eventos do ativo;
- teste arquitetural que falha se houver acesso direto ao banco do outro produto;
- checklist de segurança, observabilidade, rollback e documentação.

**Gate:** contratos aprovados e testes arquiteturais GREEN. Nenhuma tabela de produção aplicada.

## Microentrega 1 — Identidade e cadastro técnico do ativo

**Peso:** 8%

**Objetivo:** criar o núcleo mínimo para registrar e consultar um ativo dentro do tenant correto.

**Entregáveis:**
- identidade interna do ativo;
- cadastro técnico;
- estado/versionamento inicial do cadastro;
- consulta individual;
- criação e alteração por comando autenticado;
- auditoria de criação/alteração;
- testes de tenant, autorização, entrada inválida e concorrência básica.

**Gate:** cadastro técnico consultável e nenhuma escrita fora do tenant.

## Microentrega 2 — Versionamento e histórico do cadastro

**Peso:** 7%

**Objetivo:** tornar as alterações do ativo reconstruíveis e auditáveis.

**Entregáveis:**
- versão/snapshot histórico do cadastro;
- autoria, instante e motivo/origem da alteração;
- comparação entre versões;
- eventos de criação/alteração;
- regressão garantindo que atualização não apaga o histórico anterior.

**Gate:** evolução do ativo pode ser reconstruída sem depender de logs externos.

## Microentrega 3 — Geolocalização e mapa

**Peso:** 7%

**Objetivo:** localizar ativos espacialmente e tornar a informação consumível pelo Despacho.

**Entregáveis:**
- localização associada ao ativo;
- consulta por área/posição conforme contrato;
- visualização dos ativos no mapa do Inventário;
- acesso ao detalhe a partir do mapa;
- testes de coordenadas inválidas, tenant e resposta geográfica.

**Gate:** ativo pode ser localizado e aberto pelo mapa sem duplicar o estado operacional do Despacho.

## Microentrega 4 — Busca e listagem operacional

**Peso:** 6%

**Objetivo:** tornar o inventário pesquisável para operação e manutenção.

**Entregáveis:**
- listagem paginada;
- busca por dados do cadastro técnico;
- filtros compatíveis com os dados já aprovados;
- ordenação estável;
- autorização/tenant em todas as consultas;
- tela responsiva de pesquisa/listagem.

**Gate:** operador autorizado localiza um ativo sem percorrer o mapa ou conhecer seu ID interno.

## Microentrega 5 — Timeline e prontuário consolidado

**Peso:** 8%

**Objetivo:** oferecer a visão cronológica central do ativo.

**Entregáveis:**
- modelo canônico de item de timeline;
- agregação do histórico técnico e relacionamentos aprovados;
- origem, autor, data/hora e tipo de cada registro;
- ordenação cronológica determinística;
- tela de detalhe com timeline;
- testes de histórico vazio, grande volume, ordenação e isolamento por tenant.

**Gate:** o prontuário pode ser entendido pela timeline sem consulta direta a tabelas internas.

## Microentrega 6 — Fotos, documentos, laudos e assinaturas

**Peso:** 7%

**Objetivo:** incorporar evidências documentais ao prontuário sem colocar binários no histórico principal.

**Entregáveis:**
- metadados de arquivos e referência de storage;
- fotos de antes/depois;
- documentos e laudos;
- referência de assinatura;
- hash, autoria e origem;
- validação de tipo/tamanho e hook de verificação de arquivo;
- timeline das evidências;
- testes de upload, falha de storage, hash, autorização e tenant.

**Gate:** evidência só aparece como válida após persistência segura; ICP-Brasil continua externo.

## Microentrega 7 — Inspeções e checklists

**Peso:** 7%

**Objetivo:** registrar verificações estruturadas sobre o ativo.

**Entregáveis:**
- registro de inspeção;
- referência ao checklist aplicado;
- respostas e resultado histórico;
- autoria/data/local quando fornecidos pelo fluxo operacional;
- anexos vinculáveis;
- publicação na timeline;
- testes de integridade e imutabilidade do registro finalizado.

**Gate:** inspeções finalizadas permanecem auditáveis e relacionadas ao ativo correto.

## Microentrega 8 — Peças, custos e garantias

**Peso:** 7%

**Objetivo:** completar a trilha de manutenção aprovada no prontuário.

**Entregáveis:**
- registro histórico de peças/componentes;
- custos relacionados ao atendimento/manutenção;
- garantias e seus documentos/referências;
- vínculo com evento/ordem/inspeção quando existir;
- timeline e totalizadores necessários aos indicadores;
- testes de valores, tenant, histórico e autorização.

**Gate:** manutenção pode ser auditada sem transformar o Motor de Ativos em ERP financeiro.

## Microentrega 9 — Relacionamentos entre ativos

**Peso:** 5%

**Objetivo:** permitir navegar entre ativos relacionados sem criar acoplamento estrutural rígido.

**Entregáveis:**
- vínculo ativo → ativo;
- tipo de relacionamento registrado de forma explícita;
- consulta de relacionados;
- prevenção de vínculo inválido e fora do tenant;
- exibição no detalhe/timeline quando aplicável.

**Gate:** relações não permitem atravessar tenant e não exigem consulta SQL externa.

## Microentrega 10 — Ocorrências e ordens do Despacho no prontuário

**Peso:** 7%

**Objetivo:** ligar operação de campo ao ativo mantendo ownership de cada produto.

**Entregáveis:**
- referência estável de ocorrência/ordem/atividade;
- contrato REST para criar/consultar relacionamento autorizado;
- item correspondente na timeline do ativo;
- navegação segura entre Inventário e Despacho;
- testes provando ausência de gravação direta no banco do Despacho;
- idempotência para repetição do mesmo comando.

**Gate:** uma ocorrência pode ser relacionada a um ativo e consultada pelos dois produtos via contrato.

## Microentrega 11 — Telemetria e eventos do ativo

**Peso:** 6%

**Objetivo:** registrar telemetria aprovada sem transformar o prontuário em depósito indiscriminado de eventos.

**Entregáveis:**
- contrato de entrada de telemetria;
- correlação com o ativo;
- validação/versionamento do payload;
- regras de registro histórico/timeline para telemetria relevante;
- eventos de mudança do ativo;
- idempotência, retry e observabilidade do consumo/publicação;
- testes de duplicidade, ordem, payload inválido e tenant.

**Gate:** repetição do mesmo evento não duplica histórico e falhas são diagnosticáveis.

## Microentrega 12 — Indicadores do Inventário

**Peso:** 5%

**Objetivo:** expor indicadores derivados exclusivamente dos dados do prontuário aprovado.

**Entregáveis:**
- consultas agregadas do inventário;
- indicadores de histórico/manutenção compatíveis com os registros existentes;
- filtros de tenant/escopo;
- painel responsivo;
- testes de consistência entre detalhe e agregados.

**Gate:** indicador pode ser rastreado até registros do prontuário; nenhuma métrica inventada fora dos dados existentes.

## Microentrega 13 — Cliente REST do Motor no Sistema de Despacho

**Peso:** 5%

**Objetivo:** permitir que o Despacho pesquise e consulte ativos sem conhecer seu banco.

**Entregáveis:**
- porta de integração `AssetInventoryClient` no Despacho;
- adaptador REST versionado;
- timeouts e falha controlada;
- propagação de correlação e identidade autorizada;
- mocks para testes e desenvolvimento;
- contrato para busca, detalhe, localização e relacionamento com ocorrência/ordem.

**Gate:** Despacho funciona com mock e com contrato HTTP sem importação de entidades de persistência do Motor.

## Microentrega 14 — Experiência do ativo dentro do Despacho

**Peso:** 4%

**Objetivo:** contextualizar ativos na operação sem duplicar o módulo de Inventário.

**Entregáveis:**
- pesquisa/seleção de ativo no fluxo operacional aprovado;
- resumo contextual do ativo;
- abertura do prontuário completo no produto responsável;
- localização do ativo no contexto do mapa quando disponível;
- exibição de ocorrência/ordem vinculada;
- estados loading/empty/error/retry sem interromper o núcleo do Despacho.

**Gate:** indisponibilidade do Motor de Ativos degrada apenas funções de inventário e não paralisa o Despacho.

## Microentrega 15 — Consumo de eventos pelo Despacho

**Peso:** 4%

**Objetivo:** atualizar contexto operacional a partir de mudanças relevantes sem polling obrigatório ou escrita cruzada.

**Entregáveis:**
- consumidor versionado de eventos do ativo;
- deduplicação/idempotência;
- correlação e auditoria;
- comportamento fail-closed para eventos inválidos;
- atualização apenas de referências/cache/projeções autorizadas;
- testes de replay, duplicidade e evento desconhecido.

**Gate:** evento não altera automaticamente regra crítica do Despacho sem decisão explícita do domínio do Despacho.

## Microentrega 16 — Segurança, observabilidade e regressão final

**Peso:** 2%

**Objetivo:** consolidar os gates transversais antes de qualquer release.

**Entregáveis:**
- matriz de permissões proposta, sem grants automáticos;
- auditoria de comandos e alterações;
- logs/métricas/correlação dos contratos;
- testes de isolamento entre tenants;
- testes de autorização negativa;
- testes de contrato REST/eventos;
- carga mínima dos fluxos críticos;
- verificação de dependências e build;
- manual operacional e plano de rollback.

**Gate:** todos os checks GREEN; grants, migrations reais, deploy e merge continuam aguardando autorização explícita.

## Distribuição do progresso

| Microentrega | Peso |
| --- | ---: |
| M0 Fundação/contratos | 5% |
| M1 Cadastro técnico | 8% |
| M2 Versionamento/histórico | 7% |
| M3 Geolocalização/mapa | 7% |
| M4 Busca/listagem | 6% |
| M5 Timeline/prontuário | 8% |
| M6 Evidências/documentos | 7% |
| M7 Inspeções/checklists | 7% |
| M8 Peças/custos/garantias | 7% |
| M9 Relacionamentos | 5% |
| M10 Ocorrências/ordens | 7% |
| M11 Telemetria/eventos | 6% |
| M12 Indicadores | 5% |
| M13 Cliente REST no Despacho | 5% |
| M14 UX dentro do Despacho | 4% |
| M15 Eventos no Despacho | 4% |
| M16 Hardening/release | 2% |
| **Total** | **100%** |

## Ordem recomendada

`M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10 → M11 → M12 → M13 → M14 → M15 → M16`

M13 pode iniciar após estabilização dos contratos de M0/M1/M3, usando mocks, mas sua homologação final depende dos endpoints reais correspondentes. M14 e M15 nunca podem criar dependência de disponibilidade do Motor para manter o núcleo do Despacho funcionando.

## Gate de início da implementação

Este documento autoriza planejamento e preparação de execução. O primeiro passo de código será a **M0 — Fundação, contratos e isolamento**, em branch própria e com teste arquitetural antes da implementação. A execução não deve iniciar silenciosamente: deve registrar o checkpoint e o head de base antes do primeiro teste.
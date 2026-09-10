# Motor de Ativos / Inventário — Design Aprovado

**Status:** APROVADO pelo responsável do projeto em 2026-09-10  
**Produto:** Motor de Ativos / Inventário, separado do Sistema de Despacho  
**Registro no repositório:** `jeffaxe81/dispatch` apenas para especificação e contrato de integração  
**Base do registro:** `main` em `4a7c8bc2168e1fc536803acc8bcc157135e2d19a`

## 1. Objetivo

Disponibilizar um produto/épico separado para manter o prontuário técnico e histórico de ativos físicos ou lógicos relacionados à operação, permitindo que o Sistema de Despacho consulte e relacione esses ativos sem assumir a propriedade dos dados do inventário.

## 2. Limite arquitetural aprovado

- O Motor de Ativos é separado do Sistema de Despacho.
- O Motor de Ativos é dono do seu próprio banco e do estado dos ativos.
- O Sistema de Despacho não grava diretamente no banco do Motor de Ativos.
- Consultas e comandos entre produtos são realizados por APIs REST versionadas.
- Mudanças relevantes no estado/histórico do ativo são publicadas como eventos.
- Integrações devem respeitar autenticação, autorização, auditoria, correlação, idempotência e versionamento de contratos.
- O Despacho mantém apenas referências necessárias para vincular ocorrências, ordens e histórico operacional ao ativo; não replica o prontuário completo.

## 3. Prontuário do ativo

O prontuário aprovado deve reunir, no mesmo histórico lógico:

- cadastro técnico;
- geolocalização e visualização em mapa;
- fotos de antes e depois;
- inspeções;
- checklists;
- ordens de serviço e ocorrências relacionadas;
- peças e componentes relacionados ao atendimento/manutenção;
- custos associados;
- garantias;
- documentos e laudos;
- assinaturas relacionadas aos registros;
- telemetria recebida para o ativo;
- versões e alterações históricas do cadastro;
- relacionamentos entre ativos;
- indicadores;
- busca;
- timeline visual consolidando os eventos do prontuário.

Assinaturas fazem parte do prontuário como evidência/referência. Quando houver necessidade de assinatura digital ICP-Brasil, o Motor de Ativos deverá consumir o módulo de assinatura já desacoplado, sem incorporar a lógica ICP-Brasil ao seu núcleo.

## 4. Integração com o Sistema de Despacho

A integração deve permitir ao Despacho:

- localizar e consultar ativos;
- abrir o detalhe/prontuário do ativo quando necessário;
- relacionar uma ocorrência ou ordem/atividade de campo a um ativo;
- recuperar geolocalização e informações necessárias ao contexto operacional;
- registrar comandos autorizados por API quando a operação exigir atualização do prontuário;
- receber eventos de mudanças relevantes para atualização de telas, histórico ou automações controladas.

O Despacho nunca deve escrever diretamente nas tabelas do Motor de Ativos.

## 5. Experiência de uso aprovada

A experiência do módulo deve priorizar:

- pesquisa/listagem de ativos;
- visualização georreferenciada;
- detalhe do ativo com prontuário completo;
- timeline visual do histórico;
- navegação para ocorrências/ordens relacionadas;
- acesso a evidências, documentos, fotos, inspeções e checklists;
- indicadores e filtros de busca.

A interface deve seguir o padrão visual já adotado na plataforma Axesistemas e permanecer responsiva.

## 6. Segurança e governança

- autenticação obrigatória;
- autorização por papel/permissão e escopo;
- isolamento entre empresas/tenants;
- trilha de auditoria para alterações relevantes;
- proteção de documentos, imagens e evidências;
- validação de arquivos e limites de upload;
- logs e correlação para chamadas REST e eventos;
- falha fechada quando escopo, identidade, contrato ou vínculo não puderem ser validados;
- testes automatizados e regressão para contratos críticos.

## 7. Regras de histórico

- O histórico deve ser aditivo e auditável.
- Alterações do cadastro precisam preservar versões ou snapshots suficientes para reconstruir a evolução do ativo.
- Fotos, documentos, laudos, inspeções, checklists, custos, peças, assinaturas e telemetria devem aparecer na timeline sem perder sua origem.
- Ocorrências e ordens permanecem propriedade de seus produtos de origem; o Motor de Ativos guarda o relacionamento e a referência necessária ao prontuário.

## 8. Escopo deliberadamente separado

Não faz parte do núcleo do Motor de Ativos:

- lógica de despacho de equipes;
- motor universal de eventos;
- regras de telefonia/telecom;
- implementação interna de ICP-Brasil;
- gravação cruzada direta em bancos de outros produtos;
- consultas SQL cruzadas entre produtos.

Essas capacidades são integradas exclusivamente por contratos de API/eventos quando necessárias.

## 9. Critérios de sucesso do primeiro ciclo

O primeiro ciclo é considerado funcional quando for possível cadastrar/consultar um ativo, recuperar sua localização, visualizar o prontuário e timeline, anexar evidências e registros históricos, relacioná-lo a ocorrência/ordem do Despacho por contrato e comprovar que nenhum produto grava diretamente no banco do outro.

## 10. Diretriz de implementação

A implementação será dividida em microentregas independentes, cada uma com TDD, revisão, checkpoint, documentação e evidência de testes. Nenhuma microentrega autoriza automaticamente migration em banco real, deploy, concessão de permissões produtivas ou merge em `main`; esses gates continuam dependentes de autorização explícita.
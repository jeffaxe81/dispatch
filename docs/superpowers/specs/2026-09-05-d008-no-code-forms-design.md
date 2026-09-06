# D-008 — Formulários Dinâmicos / No-Code — Design

Data: 2026-09-05
Status: design aprovado em conversa; aguardando revisão formal da especificação antes do plano de implementação
Base: `main` em `2ebdec3b8627bb2fbb09ad6422119f243756a790`
Branch: `feature/d008-no-code-forms`
Checkpoint: `checkpoint/pre-d008-forms-20260905`

## 1. Objetivo

Criar um motor corporativo reutilizável de formulários dinâmicos/no-code para toda a plataforma, com primeira entrega integrada ao Despacho. O D-008 deve permitir criar, versionar, publicar, preencher, consultar e auditar formulários sem acoplar o motor a um único fluxo operacional.

A primeira integração funcional cobre Ocorrências e Ordens/Atividades de Campo. O desenho deve permitir consumidores futuros, como CRM, Portal do Cidadão, Inventário/Ativos e outros módulos, sem duplicação do motor.

## 2. Princípios aprovados

- Motor de formulários corporativo e reutilizável.
- Primeira entrega integrada a Ocorrências e Ordens/Atividades de Campo.
- Versões publicadas são imutáveis; qualquer alteração gera nova versão.
- Respostas históricas permanecem vinculadas exatamente à versão preenchida.
- Evoluções não necessárias à entrega atual entram no Backlog do Produto, sem prazo.
- Modo offline completo não faz parte do D-008; a arquitetura não deve inviabilizá-lo futuramente.
- ICP-Brasil será módulo separado e desacoplado.
- Assinatura simples desenhada na tela é evidência do formulário e não deve ser apresentada como assinatura digital ICP-Brasil.
- O formulário não altera automaticamente estados críticos do Despacho nesta entrega.
- Reutilizar autenticação, RBAC e auditoria da plataforma; não criar subsistemas paralelos.

## 3. Abordagens consideradas

### A. Schema JSON puro

Definição e respostas integralmente em JSON. É simples para o designer, mas reduz governança relacional, indexação e capacidade de consulta operacional.

### B. Modelo totalmente relacional

Campos, opções e respostas normalizados em tabelas. Favorece consultas SQL, porém aumenta complexidade de versionamento e torna layouts/regras do designer mais rígidos.

### C. Modelo híbrido — selecionado

Metadados relacionais para identidade, versão, publicação, permissões, vínculos e auditoria; schema versionado em JSON para campos/layout/regras; respostas preservadas em representação versionada, com atributos operacionais relevantes extraídos/indexados quando necessário.

Essa abordagem equilibra flexibilidade no-code, integridade histórica, pesquisa operacional e evolução futura.

## 4. Componentes

### 4.1 Catálogo de formulários

Responsável pela identidade lógica do formulário, nome, descrição, estado, escopo e vínculos permitidos.

Estados mínimos: rascunho, publicado/ativo e desativado. Desativação não remove versões nem respostas históricas.

### 4.2 Versionamento e publicação

Cada publicação cria uma versão imutável. Edição ocorre somente em rascunho/nova versão. Respostas sempre registram o identificador da versão efetivamente apresentada ao usuário.

Publicar, desativar e demais operações administrativas relevantes são auditadas.

### 4.3 Designer No-Code

Componentes iniciais aprovados:

- texto curto;
- texto longo;
- número;
- moeda;
- data;
- hora/data-hora;
- seleção única;
- seleção múltipla;
- checkbox;
- sim/não;
- endereço;
- localização/geoposição;
- foto/imagem;
- arquivo/anexo;
- assinatura simples na tela;
- campos calculados básicos;
- seções;
- instruções/texto de apoio.

Configurações iniciais incluem obrigatoriedade, máscaras, limites e validações compatíveis com cada componente.

### 4.4 Runtime de preenchimento

Renderiza a versão publicada, valida no cliente para usabilidade e obrigatoriamente no servidor para integridade. Mantém estados operacionais de preenchimento como não iniciado, em preenchimento, enviado e corrigido/revisado quando aplicável.

### 4.5 Submissões e revisões

Cada submissão deve possuir identificador próprio, tenant/empresa, formulário, versão, autor, timestamps, estado, vínculos operacionais e localização quando aplicável.

Correções não sobrescrevem silenciosamente a evidência anterior. Devem preservar autor, data/hora, motivo, valores anteriores e novos valores em trilha auditável.

### 4.6 Anexos

Arquivos não ficam embutidos no JSON principal da resposta. São armazenados/referenciados separadamente com metadados, hash/integridade, tipo, tamanho, autor e controle de acesso.

### 4.7 Integração operacional

Na primeira entrega, um formulário publicado pode ser associado a:

- tipo de ocorrência;
- ocorrência;
- ordem/atividade de campo;
- agente/equipe responsável;
- etapa/status operacional, quando aplicável ao vínculo;
- ativo relacionado, quando a referência já existir;
- localização;
- anexos/evidências.

O Despacho pode exigir o preenchimento de um formulário e acompanhar seu estado. O D-008 pode emitir eventos de domínio, mas não fecha ocorrência nem executa transições críticas automaticamente nesta entrega.

### 4.8 Contrato de eventos

Eventos de domínio devem ser desacoplados do motor, permitindo consumo posterior pelo Motor de Eventos/Workflow e integrações. Exemplos conceituais: formulário publicado, submissão iniciada, submissão enviada, submissão corrigida e formulário desativado.

Nenhum consumidor futuro deve ser necessário para que o D-008 funcione nesta release.

## 5. RBAC, escopo e auditoria

O D-008 reutiliza o RBAC existente. As capacidades devem ser separáveis para, no mínimo:

- criar/editar rascunho;
- publicar versão;
- desativar formulário;
- preencher;
- consultar respostas;
- corrigir/revisar quando autorizado;
- exportar;
- administrar formulários.

O modelo deve estar preparado para isolamento por tenant/empresa e, quando aplicável, escopo por equipe/perfil. Publicação, desativação, correção e ações administrativas sensíveis devem produzir auditoria com identidade, timestamp e contexto.

## 6. Segurança

- Autenticação e autorização verificadas no servidor.
- Isolamento por tenant conforme arquitetura da plataforma.
- Validação de payload no servidor, independentemente da validação do navegador.
- Controle de tipo e tamanho de anexos.
- Preparação para varredura/proteção contra conteúdo malicioso em anexos.
- Rate limiting onde o endpoint/superfície justificar.
- Não confiar em campos de identidade/tenant enviados pelo cliente quando puderem ser derivados da sessão/contexto autenticado.
- Auditoria de operações sensíveis.
- Evitar exposição de dados entre escopos/tenants.

## 7. Retenção e integridade histórica

A interface operacional normal não exclui fisicamente respostas históricas. Desativar um formulário não apaga submissões. Correções criam histórico auditável.

Políticas avançadas de retenção, anonimização/LGPD, legal hold e descarte controlado ficam no Backlog do Produto quando não forem requisito obrigatório da primeira entrega. A implementação atual não deve impedir a introdução dessas políticas.

## 8. Preparação para ICP-Brasil

ICP-Brasil não faz parte do núcleo D-008. O D-008 fornecerá um ponto de extensão para que uma submissão finalizada possa futuramente gerar uma representação documental estável, identificada por versão e hash. O futuro módulo ICP-Brasil consumirá esse artefato sem depender das estruturas internas do designer.

Assinatura simples capturada no formulário permanece classificada como evidência gráfica/aceite simples e não como assinatura digital ICP-Brasil.

## 9. Fluxo principal

1. Usuário autorizado cria formulário em rascunho.
2. Configura componentes e validações no designer.
3. Usuário com permissão de publicação publica uma versão imutável.
4. A versão é associada ao contexto operacional permitido.
5. Operador/agente abre a ocorrência ou atividade e recebe a versão publicada correspondente.
6. Runtime apresenta e valida o formulário.
7. Servidor revalida e persiste submissão, vínculos e anexos.
8. Submissão gera auditoria e evento de domínio.
9. Despacho consulta o estado da submissão sem transferir ao D-008 a responsabilidade por transições críticas.
10. Correções autorizadas preservam histórico em vez de sobrescrever evidência.

## 10. Tratamento de erros

- Schema inválido não pode ser publicado.
- Submissão incompatível com a versão deve ser rejeitada com erro estruturado.
- Falha em anexo não deve produzir submissão aparentemente completa quando o anexo for obrigatório.
- Falha em consumidor externo/evento não deve corromper a submissão confirmada; integração deve seguir o padrão de eventos/retry existente quando disponível.
- Acesso fora do tenant/escopo deve falhar de forma segura.
- Versão publicada não pode ser modificada in-place.
- Conflitos de revisão devem ser detectados; nenhuma correção pode apagar silenciosamente outra alteração.

## 11. Estratégia de testes

A implementação deverá seguir TDD e preservar os gates existentes.

Cobertura mínima planejada:

- criação/edição de rascunho;
- validação de schema;
- publicação e imutabilidade;
- criação de nova versão;
- renderização/validação dos componentes iniciais;
- submissão válida e inválida;
- vínculo com ocorrência e atividade;
- RBAC por capacidade;
- isolamento de tenant/escopo;
- auditoria de publicação/desativação/correção;
- anexos, limites e integridade;
- preservação de histórico/revisões;
- eventos de domínio;
- regressão do Despacho existente;
- TypeScript;
- security regression gate;
- build.

Nenhuma implementação será considerada concluída apenas por relatório; os gates deverão ser executados e verificados antes de qualquer pedido de merge.

## 12. Fora do escopo / Backlog do Produto — sem prazo

- modo offline completo e sincronização avançada;
- lógica condicional complexa;
- fórmulas avançadas;
- repetidores/tabelas dinâmicas avançadas;
- criação de formulários por IA;
- OCR e reconhecimento automático de documentos;
- automações/workflow avançado;
- mudança automática de estados críticos do Despacho por resposta de formulário;
- integrações adicionais além das necessárias à primeira entrega;
- políticas avançadas de retenção/anonimização/legal hold/descarte;
- assinatura digital ICP-Brasil propriamente dita;
- evoluções adicionais identificadas durante implementação que não sejam necessárias aos critérios de aceite atuais.

## 13. Critérios de aceite arquiteturais

D-008 estará apto à homologação quando:

1. O designer cria um formulário usando os componentes iniciais aprovados.
2. Uma versão pode ser publicada e se torna imutável.
3. Alteração posterior gera nova versão sem alterar respostas históricas.
4. Ocorrências e Ordens/Atividades de Campo podem receber formulário publicado.
5. Usuário autorizado preenche e envia resposta validada no servidor.
6. Despacho consegue consultar o estado do preenchimento.
7. RBAC impede operações não autorizadas.
8. Escopo/tenant impede leitura ou alteração indevida entre contextos.
9. Correções preservam histórico e justificativa/auditoria.
10. Anexos possuem controle de acesso, metadados e integridade.
11. Eventos de domínio são emitidos sem acoplar o D-008 ao Workflow futuro.
12. Assinatura simples não é confundida com ICP-Brasil.
13. Testes automatizados, TypeScript, security gate e build ficam GREEN antes da integração.
14. Nenhum deploy, migration em banco real ou grant automático ocorre sem autorização explícita.

## 14. Controles de entrega

- Desenvolvimento isolado na branch `feature/d008-no-code-forms`.
- Checkpoint inicial preservado em `checkpoint/pre-d008-forms-20260905`.
- Alterações de banco, se necessárias, serão somente artefatos/migrations versionados até autorização explícita para aplicação real.
- Não fazer merge em `main` sem aprovação explícita após gates GREEN.
- Produzir relatório final do que foi implementado, testado, documentado e deixado em backlog.
- A pendência administrativa da v2.16.0 permanece separada na Issue #43 e não bloqueia o desenvolvimento do novo ciclo.
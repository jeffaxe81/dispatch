# D-005 — Prova de backup e restauração

**Data:** 30 de agosto de 2026

**Produto:** Sistema de Despacho

**Situação:** produto em produção

**Base validada:** versão 1.15.4, checkpoint D-004

**Branch de trabalho:** `chore/backup-restore-proof`

**Situação desta especificação:** desenho aprovado; implementação e prova real pendentes

## 1. Contexto atual

O Sistema de Despacho possui banco gerenciado compatível com MySQL/TiDB e armazenamento gerenciado para evidências e avatares. O banco guarda os registros operacionais e também as chaves que apontam para os arquivos.

As referências de arquivos atualmente identificadas são:

- `incident_evidence.storage_key`, para evidências de ocorrências;
- `user_profiles.avatar_storage_key`, para avatares de usuários.

Restaurar somente o banco pode deixar referências para arquivos inexistentes. Restaurar somente os arquivos pode gerar objetos órfãos ou sem vínculo com os registros operacionais. Banco e arquivos precisam, portanto, ser tratados como um único conjunto de recuperação.

O repositório não contém atualmente um procedimento executável de backup e restauração. A documentação de portabilidade informa que banco, arquivos, segredos, build e publicação são fornecidos pela plataforma gerenciada. O ambiente de desenvolvimento disponível também não possui cliente MySQL/TiDB, Docker, credenciais de banco nem credenciais do armazenamento real.

Consequentemente, testes automatizados com adaptadores isolados podem ser construídos sem infraestrutura externa, mas uma recuperação real só pode ser declarada comprovada em um ambiente não produtivo compatível com o provedor.

## 2. Objetivo

Criar um processo controlado, verificável e documentado para:

1. capturar banco e arquivos como um conjunto coerente;
2. restaurar esse conjunto em ambiente isolado;
3. detectar corrupção, ausência de arquivos e perda de relacionamentos;
4. medir o tempo da recuperação;
5. produzir evidências auditáveis do resultado;
6. impedir que uma restauração parcial seja confundida com uma recuperação válida.

As metas operacionais provisórias são:

- **RPO de uma hora:** em um desastre, a perda máxima pretendida é de até uma hora de dados;
- **RTO de duas horas:** a recuperação pretendida deve disponibilizar o serviço em até duas horas.

Essas metas serão confirmadas ou ajustadas após medir volume, duração e custo no provedor real.

## 3. Divisão da entrega

### D-005A — Automação e prova controlada

- criar contratos e adaptadores isolados;
- gerar dados sintéticos representativos;
- produzir pacote e manifesto de recuperação;
- executar restauração destrutiva apenas em destino descartável;
- validar falhas com testes automatizados;
- produzir runbook e modelo de relatório.

Essa fase comprova a lógica e a segurança do processo, mas não comprova o comportamento específico do provedor.

### D-005B — Homologação em infraestrutura real não produtiva

- usar banco MySQL/TiDB temporário e armazenamento não produtivo;
- executar exportação, destruição do destino, restauração e verificação reais;
- medir RPO, RTO, volume e custo;
- confirmar snapshots, versionamento, criptografia e retenção do provedor;
- registrar evidências sem dados pessoais ou credenciais.

O D-005 somente será declarado **recuperação comprovada** após aprovação do D-005B.

### D-005C — Ativação operacional

- configurar agenda, retenção, permissões e alertas no ambiente autorizado;
- realizar exercício periódico de recuperação;
- obter aprovação humana antes de qualquer promoção de ambiente restaurado.

A ativação não ocorrerá automaticamente ao concluir o código.

## 4. Opções avaliadas

| Abordagem | Vantagem | Risco ou limite | Decisão |
|---|---|---|---|
| Somente mecanismos do provedor | Menor código próprio e operação simplificada | Cria dependência sem evidência portátil suficiente | Não será usada isoladamente |
| Scripts próprios para tudo | Maior portabilidade | Duplica funções do provedor e aumenta risco operacional | Rejeitada como estratégia principal |
| Estratégia híbrida gradual | Combina recursos nativos, manifesto independente e prova verificável | Exige homologação das duas camadas | **Escolhida** |

A estratégia escolhida usa snapshots ou exportações nativas quando disponíveis e mantém, no projeto, os contratos, o manifesto, os verificadores, os testes e o runbook. Assim, o sistema não tenta reconstruir internamente um mecanismo de banco que o provedor já executa melhor, mas também não aceita a simples existência de um backup como prova de recuperação.

## 5. Arquitetura

O processo será administrativo e não será exposto como endpoint público ou tela do produto.

### Componentes

1. **Orquestrador:** coordena backup, restauração, validação e relatório.
2. **Adaptador de banco:** encapsula a ferramenta ou operação nativa de exportação e restauração.
3. **Adaptador de arquivos:** localiza, exporta e restaura somente os objetos referenciados.
4. **Manifesto:** descreve o pacote e permite verificar sua integridade sem conter segredos.
5. **Verificador:** compara conteúdo esperado e restaurado e decide aprovação ou reprovação.
6. **Relatório de evidências:** registra execução, duração, resultado e falhas sanitizadas.

Cada componente terá contrato próprio para permitir testes com adaptadores controlados e substituição futura do provedor sem alterar o fluxo de negócio.

## 6. Pacote e manifesto de recuperação

O pacote será uma unidade imutável formada por:

- exportação lógica ou snapshot materializado do banco;
- arquivos referenciados pelo banco;
- manifesto versionado;
- hashes SHA-256 dos artefatos;
- metadados necessários para validação.

O manifesto deverá registrar:

- identificador e horário do backup em UTC;
- versão da aplicação e versão do formato do manifesto;
- versão ou identificação do esquema do banco;
- origem lógica e destino lógico, sem URLs ou credenciais;
- contagens de tabelas e registros críticos;
- chaves lógicas dos arquivos, tamanho e hash;
- hash do export do banco;
- estado final do pacote: completo ou inválido.

Senha, token, URL assinada, `DATABASE_URL`, chave do armazenamento e conteúdo pessoal não serão incluídos no manifesto ou nos logs.

## 7. Fluxo de backup

1. validar configuração e permissões antes de ler dados;
2. registrar versão, horário e destino lógico;
3. obter uma visão consistente do banco;
4. exportar o banco pela ferramenta autorizada;
5. localizar as referências de arquivos no conjunto exportado;
6. copiar os objetos referenciados;
7. calcular tamanho e hash de banco e arquivos;
8. comparar contagens e referências;
9. fechar o manifesto como completo somente após todas as verificações;
10. produzir relatório sanitizado.

No exercício isolado, o conjunto de dados ficará sem novas gravações durante a captura. Em produção, a consistência dependerá de snapshot coordenado do provedor. Se esse recurso não existir, a alternativa autorizada será uma janela de manutenção controlada. O projeto não fingirá consistência entre capturas realizadas em momentos incompatíveis.

## 8. Fluxo de restauração

1. exigir destino explicitamente classificado como não produtivo e descartável;
2. validar manifesto e todos os hashes antes de alterar o destino;
3. exigir que o destino esteja vazio ou tenha autorização explícita de substituição;
4. restaurar o banco;
5. restaurar os arquivos;
6. preservar as chaves originais quando o provedor permitir;
7. quando novas chaves forem obrigatórias, criar mapeamento antigo-novo e atualizar apenas o banco restaurado;
8. executar verificações estruturais, referenciais e funcionais;
9. gerar relatório aprovado ou reprovado;
10. manter ambiente reprovado isolado para diagnóstico, sem promoção automática.

O adaptador atual de armazenamento pode gerar uma nova chave ao gravar um objeto. Por isso, a preservação nativa de chaves será preferida. O remapeamento será usado somente em destino isolado e deverá ser transacional ou reversível.

## 9. Tratamento de erros

O processo adotará o princípio de falha segura:

- pacote parcial será marcado como inválido;
- hash divergente interromperá a restauração antes da promoção;
- objeto ausente identificará o registro lógico relacionado;
- erro de banco não será mascarado como sucesso de arquivos;
- falha de arquivo não será mascarada como sucesso de banco;
- timeout produzirá código de saída diferente de zero;
- nova tentativa não reutilizará silenciosamente artefato parcial;
- nenhuma falha acionará escrita ou exclusão em produção;
- limpeza de ambiente com falha exigirá decisão administrativa posterior.

Mensagens públicas e relatórios serão sanitizados. Informações técnicas adicionais poderão ser mantidas em log restrito, mas nunca incluirão credenciais, URLs assinadas ou conteúdo dos arquivos.

## 10. Segurança e retenção

### Controles obrigatórios

- criptografia em trânsito e em repouso;
- credencial de leitura separada da credencial de restauração;
- privilégio mínimo e acesso administrativo auditado;
- segredos fornecidos somente por variáveis protegidas;
- backups fora do repositório Git;
- relatório sem dados pessoais;
- aprovação humana antes de promover uma restauração;
- preferência por cópia imutável ou protegida contra exclusão acidental.

### Política inicial recomendada

| Frequência | Retenção inicial |
|---|---:|
| Horária | 24 horas |
| Diária | 30 dias |
| Mensal | 12 meses |
| Exportação independente criptografada | Mensal |

Essa política é uma recomendação de partida, não uma ativação automática. Antes de produção, volume, custo, obrigação legal e capacidades do provedor serão medidos. Alterações de retenção serão registradas como decisão operacional.

## 11. Estratégia de testes

### Dados sintéticos mínimos

- usuário e perfil com avatar;
- ocorrência;
- despacho e equipe;
- evidência com arquivo;
- registros de auditoria;
- relacionamentos entre os registros.

### Testes unitários

- criação e validação do manifesto;
- hashes corretos e divergentes;
- contagens e referências ausentes;
- mapeamento de chaves antigas para novas;
- sanitização de logs e relatórios;
- timeout, nova tentativa e pacote parcial;
- proteção contra destino produtivo.

### Testes de contrato e integração controlada

- adaptador de banco recebe e devolve artefatos pelo contrato definido;
- adaptador de arquivos preserva conteúdo e hash;
- orquestrador reprova qualquer componente incompleto;
- restauração em destino vazio reconstrói o conjunto sintético;
- remoção proposital de um arquivo é detectada;
- alteração proposital de um artefato é detectada.

### Exercício real não produtivo

1. carregar o conjunto sintético em MySQL/TiDB e armazenamento temporários;
2. executar backup completo;
3. apagar somente o destino descartável autorizado;
4. restaurar o pacote;
5. consultar ocorrência, despacho e auditoria;
6. recuperar avatar e evidência;
7. comparar hashes e relacionamentos;
8. medir duração e produzir evidências.

## 12. Critérios de aprovação

O exercício será aprovado somente se:

- banco for restaurado sem erro;
- registros e relacionamentos críticos forem preservados;
- nenhum arquivo referenciado estiver ausente;
- hashes dos arquivos e do export forem idênticos;
- auditoria permanecer íntegra;
- nenhuma credencial aparecer em artefatos ou relatórios;
- falhas parciais forem detectadas e retornarem erro;
- restauração respeitar o RTO provisório de duas horas;
- o ponto recuperado for compatível com o RPO provisório de uma hora;
- o relatório registrar responsável, data, duração, versão e resultado.

Passar testes com adaptadores simulados permite concluir o D-005A. Somente um exercício real não produtivo aprovado permite concluir o D-005B e declarar a recuperação comprovada.

## 13. Dependências externas

O desenho e a implementação isolada não exigem ação do responsável pelo produto. Para o D-005B serão necessários, por canal seguro:

- `DATABASE_URL` de banco MySQL/TiDB não produtivo e descartável;
- credenciais de armazenamento não produtivo;
- ferramenta ou API autorizada de exportação/restauração do provedor;
- confirmação das capacidades de snapshot, versionamento, retenção e criptografia;
- autorização explícita para destruir somente o destino temporário.

Credenciais não serão solicitadas por conversa, commit, documento ou Pull Request. Na ausência dessas dependências, a automação poderá ser entregue, mas o D-005 permanecerá identificado como não comprovado em infraestrutura real.

## 14. Documentação e evidências

Serão produzidos:

- decisão arquitetural D-005;
- plano de implementação;
- runbook de backup;
- runbook de restauração;
- checklist do exercício;
- modelo de relatório de evidências;
- registro no changelog;
- instruções de diagnóstico e retorno.

O relatório distinguirá explicitamente: automação validada, prova isolada aprovada, homologação do provedor aprovada e ativação produtiva. Nenhum estado intermediário será chamado de “backup garantido”.

## 15. Versionamento e checkpoints

- base de retorno: `checkpoint/d004-v1.15.4`;
- checkpoint anterior ao desenho: `checkpoint/d005-pre-design`;
- branch: `chore/backup-restore-proof`;
- commits separados para especificação, testes, implementação e documentação;
- bundle local antes da implementação;
- versão candidata `1.15.5` somente após validação do escopo implementado;
- Pull Request inicialmente em rascunho;
- nenhum merge, deploy, exclusão de dados ou ativação automática.

Se a implementação falhar, a branch pode ser abandonada e a base 1.15.4 permanece intacta. Backups de dados não serão armazenados no GitHub.

## 16. Fora do escopo

- restauração diretamente sobre produção;
- agendamento produtivo antes da homologação;
- recuperação multirregião;
- retenção indefinida;
- decisão jurídica definitiva de retenção;
- substituição desnecessária dos mecanismos nativos do provedor;
- interface pública ou administrativa na aplicação;
- envio de alertas e painel de observabilidade, tratados no D-010;
- mudanças funcionais em ocorrências, despacho ou equipes.

## 17. Resultado esperado

Ao final do D-005B, o Sistema de Despacho terá evidência repetível de que banco e arquivos podem ser reconstruídos juntos em ambiente seguro. O produto deixará de depender apenas da afirmação de que “existe backup” e passará a ter uma recuperação testada, medida, documentada e auditável.

# Adendo ao Prompt Master — execução com agentes paralelos

Data: 05/09/2026. Diretriz solicitada e aprovada por Jefferson Machado.
Identificador: AXE-PM-AD-001.
Versão documental: 1.0.0.
Escopo: trabalho nos módulos da plataforma Axesistemas, incluindo o Projeto Despacho.
Status: adendo independente; ainda não incorporado a uma versão canônica identificada do Prompt Master.

## Versionamento e rastreabilidade

- Preservar versões anteriores e registrar toda alteração com versão, data, motivo, responsável pela aprovação e evidências aplicáveis.
- Usar MAJOR.MINOR.PATCH: MAJOR para alteração incompatível nas diretrizes; MINOR para nova diretriz compatível; PATCH para correções editoriais sem mudança de regra.
- A numeração 1.0.0 refere-se exclusivamente a este adendo. Não reiniciar, substituir ou presumir a numeração histórica do Prompt Master completo.
- Quando a fonte canônica do Prompt Master for identificada, incorporar este adendo preservando seu identificador e histórico; registrar a versão de destino e a referência ao commit quando houver publicação autorizada no Git.
- Documentação sem mudança de código exige revisão de integridade, coerência e preservação das regras. Alterações executáveis exigem os testes pertinentes antes de aprovação/publicação. Não apresentar revisão documental como teste do software.
- Esta versão está registrada documentalmente; não representa commit, merge ou deploy no repositório.

## Histórico de alterações

| Versão | Data | Alteração | Aprovação |
| --- | --- | --- | --- |
| 1.0.0 | 05/09/2026 | Formalização do adendo de agentes paralelos, bloqueio após falhas e controle de versões; preservação das regras anteriormente registradas. | Jefferson Machado, nesta conversa. |

## Regra obrigatória

Utilizar agentes em paralelo quando houver tarefas independentes e capacidade disponível. A paralelização acelera preparação, testes e documentação, mas nunca antecipa aprovação ou publicação antes dos testes OK. Não criar agentes ociosos nem executar em paralelo tarefas que dependam do resultado uma da outra.

## Responsabilidades

- Coordenador: define escopo, dependências, responsáveis e versão candidata; consolida resultados, resolve conflitos e autoriza avanço técnico somente com evidências.
- Agente de testes: executa validações aplicáveis, registra comandos, ambiente, resultados e identificação exata da versão testada; informa falhas e limitações sem declarar aprovação parcial como total.
- Agente de Git: enquanto os testes executam, inspeciona diferenças e prepara mensagem de commit, referência do CP, descrição do Draft PR e plano de publicação. Não efetua commit, push ou registro de aprovação antes da liberação do coordenador após testes OK. Não modifica o conteúdo em teste.
- Agente de documentação: prepara em paralelo changelog, checkpoint, evidências e atualização do Prompt Master; mantém resultados como pendentes até receber evidências aprovadas. Não declara conclusão antecipadamente.
- Agentes adicionais: implementação e revisão independente, quando justificadas, com áreas e arquivos exclusivos.

## Controle de concorrência e aprovação

1. Definir um responsável por arquivo e um único responsável por operações Git. Evitar escritas simultâneas no mesmo arquivo, índice, branch ou diretório de build. Usar isolamento compatível com o ambiente e as permissões disponíveis.
2. Congelar a árvore candidata antes dos testes. Identificar a árvore de conteúdo ou digest; quando já houver commit, registrar também seu SHA. A árvore publicada deve ser exatamente a validada.
3. Executar o conjunto aplicável: testes automatizados, regressões, segurança, TypeScript/lint, build e verificação de migrations. Segurança que exige ausência de dist deve ocorrer antes do build, nunca simultaneamente a ele.
4. Testes e preparações independentes podem ocorrer em paralelo. Qualquer falha, conflito ou validação obrigatória ausente bloqueia aprovação e publicação; corrigir e repetir as verificações pertinentes antes do avanço.
5. Consolidar documentação e alterações antes da liberação final. Qualquer mudança no conteúdo validado invalida a aprovação anterior até nova avaliação e revalidação adequada. Evidências devem corresponder à versão final, não a um SHA anterior.
6. Somente após testes OK e conferência do coordenador, permitir commit/publicação dentro da autorização concedida pelo usuário. Registrar CP, escopo, versão, resultados e limitações. Manter documentação rastreável à versão aprovada.
7. Após push, verificar o SHA remoto e o CI correspondente. CI pendente ou vermelho não permite declarar entrega validada. Falhas de permissão exigem parada e autorização; não contornar controles.
8. Aprovação técnica não equivale a autorização de merge, deploy ou alteração da main. Preservar Draft PR e main enquanto não houver autorização específica. CI verde não substitui homologação funcional, testes de banco real ou validação operacional que ainda estejam pendentes.

## Fluxo resumido

Preparação de Git + documentação preliminar + testes independentes → consolidação da versão candidata → testes OK e revisão → aprovação técnica → commit/publicação autorizada → CI do SHA remoto → registro final de evidências.

Se houver falha: retornar à correção e revalidação, sem avançar a aprovação.

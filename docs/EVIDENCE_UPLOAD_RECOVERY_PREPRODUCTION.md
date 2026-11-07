# Evidências — protocolo de upload e recuperação (somente pré-produção)

## Objetivo
Não perder o registro de uma tentativa quando o upload externo ocorrer, mas a
gravação do anexo no MySQL falhar. **Este protocolo NÃO exclui objetos do storage
automaticamente** e não afirma que todos os órfãos já foram eliminados.

## Fluxo
1. Validar arquivo, sessão JWT ativa, vínculo do agente com a equipe, fase da
   ocorrência e (na rota tenant-aware) organização no MySQL; bloquear usuário,
   sessão, ocorrência e escopo relevante durante a transação.
2. Gerar UUID v4 e chave de storage exclusiva. Registrar a chave na tabela
   `incident_evidence_upload_attempts` como `reserved` **antes do PUT**.
3. Fazer PUT apenas na chave pré-reservada. A chave é determinística e não
   reescrita por um sufixo aleatório posterior à reserva.
4. Em segunda transação, repetir as validações sob `FOR UPDATE` e, se forem
   válidas, gravar `incident_evidence`, evento, auditoria e mover a tentativa
   para `committed` no mesmo commit.
5. Se PUT ou commit falhar, mover `reserved → cleanup_required` com o melhor
   esforço. Falha do banco pode impedir a mudança de estado; a linha `reserved`
   continua preservada e deve ser tratada como **possível** objeto remoto.
6. Apenas linhas de `incident_evidence` confirmadas são expostas por
   `listIncidentEvidence` e pelo proxy privado de objetos.

## Conciliação
A tabela de tentativas **não possui FK com ocorrência/usuário** para que a
exclusão operacional da ocorrência não apague o histórico de reconciliação.
Ao excluir permanentemente uma ocorrência, a transação marca as reservas
ligadas a ela como `cleanup_required` e cria registros de conciliação para
evidências legadas que ainda não tinham ledger. O vínculo no MySQL pode ser
apagado por cascade, mas a referência necessária para verificar o objeto
externo permanece. Essa mudança **não equivale a expurgo do arquivo remoto**.
Estados:

- `reserved`: PUT pendente, falhou ou ocorreu antes de uma interrupção.
  Verificar reservas antigas; não presumir ausência do objeto remoto.
- `cleanup_required`: erro identificado após a reserva; verificar e descartar
  objeto externo apenas por processo autorizado e após confirmação.
- `committed`: o registro de evidência, o evento e a auditoria foram gravados.

Consulta **somente leitura**, usada como exemplo, sujeita a janela operacional:

```sql
SELECT attempt_id, incident_id, actor_user_id, state, created_at, updated_at
FROM incident_evidence_upload_attempts
WHERE (state = 'cleanup_required' OR
  (state = 'reserved' AND updated_at < NOW() - INTERVAL 15 MINUTE))
ORDER BY updated_at ASC
LIMIT 100;
```

Não imprimir a chave privada `storage_key` em telemetria genérica. Para uma
limpeza efetiva, confirmar primeiro o contrato de exclusão do provedor Forge,
as permissões, a idempotência e a proteção contra exclusão de chave já
referenciada por `incident_evidence`. Registrar motivo, operador, resultado e
janela de retenção. **Não ativar limpeza automática antes disso.**

## Consulta administrativa de conciliação — somente leitura

A procedure tRPC `settings.evidenceRecovery({page, pageSize, state})` exige usuário
operacional autenticado e autorização de **Super Administrador**. A consulta
aceita página 1..10.000 e de 1 a 100 registros por página, com ordenação por
data de última atualização e ID da tentativa. Ela retorna somente o número
da tentativa, ocorrência, usuário/equipe, estado, datas, existência da
ocorrência e existência da referência de evidência. **Não retorna storageKey,
URL assinada, conteúdo do arquivo nem autoriza exclusão de objetos.**

Condições de inclusão no relatório:
- `cleanup_required`: sempre necessita verificação humana.
- `reserved`: somente se a última atualização tiver mais de 15 minutos;
  pode ser um upload em andamento ou um objeto remoto parcialmente gravado.
- `committed`: somente quando a referência a
  `incident_evidence` não existir, o que indica possível divergência.

A flag `hasEvidenceReference` deve ser conferida antes de qualquer operação
de limpeza; a presença de referência **bloqueia remoção física**. O resultado
é uma fila de investigação, não uma instrução ou autorização para apagar
arquivos. Logs gerais não devem incluir identificadores privados do storage.

## Interface administrativa

A página `/administracao/conciliacao-evidencias` está disponível no menu
**Conciliação de evidências** apenas para o Super Administrador e também pelo
atalho em **Configurações gerais**. A página faz uma segunda checagem de
permissão no frontend para evitar renderizar dados enquanto a sessão é
revalidada; a proteção efetiva é feita **no backend** pela procedure tRPC.

Filtros paginados de servidor:
- `all`: todos os registros elegíveis para revisão;
- `cleanup_required`: falhas ou exclusões já sinalizadas;
- `stale_reserved`: reservas anteriores à janela mínima de 15 minutos;
- `missing_reference`: upload concluído sem referência no banco.

É possível atualizar os dados e navegar por páginas de 10, 25, 50 ou
100 registros. A interface funciona em telas estreitas e exibe apenas
identificadores administrativos, situação, motivo e datas. **Não há botão de
exclusão, URL de storage, chave privada, ação de correção ou suposta
confirmação de remoção remota.** Indicadores são relativos ao filtro
selecionado, não à quantidade total de objetos armazenados no provedor.

## CI de concorrência entre processos e falha no PUT sintético

A validação `Local auth session MySQL 8.4 smoke (isolated)` também executa
`scripts/security/session-cross-process-probe.ts` em processos Node.js
**separados**, cada um com seu próprio pool Drizzle, compartilhando apenas
o banco MySQL descartável `dispatch_auth_ci`.

O processo principal registra uma sessão, dois subprocessos verificam a
autenticação em paralelo, a sessão é revogada no banco compartilhado e novos
subprocessos confirmam que o mesmo JWT não é mais aceito. O JWT trafega
somente pela entrada padrão privada dos subprocessos, nunca por argumento
de linha de comando, URL, log nem artefato de testes.

Em outro cenário, um subprocesso reserva uma chave de evidência no banco
e simula uma interrupção abrupta **durante o PUT sintético**. O processo
principal comprova que a reserva permanece como `reserved` sem referência
publicada e que o relatório passa a apresentá-la como `stale_reserved`
após vencer a janela de 15 minutos. Os dados sintéticos são descartados ao
fim do teste. Não há chamadas a um provedor externo nem objeto real apagado.

**Escopo e limite:** subprocessos independentes não substituem duas
instâncias reais do servidor HTTP, balanceador, cookies reais do navegador,
conexões TLS, restart durante upload físico ou política de retenção do
storage. Homologação operacional desses itens continua pendente.

## Homologação HTTP com duas instâncias isoladas

O workflow `local-auth-session-mysql.yml` agora também executa
`scripts/security/session-http-dual-node-smoke.ts`. O teste usa dois
processos Node.js independentes com Express, o `rootRouter` tRPC real e
`createContext` real, unidos por um proxy HTTP round-robin que escuta
**somente em 127.0.0.1**. Ambos compartilham o MySQL 8.4 descartável de CI
e a mesma chave JWT gerada apenas para essa execução.

O teste exercita endpoints HTTP reais: `auth.me` anônimo,
`auth.login` com cookie, `auth.me` no outro nó,
`settings.evidenceRecovery` com privilégio e resposta sem `storageKey`,
`auth.logout` em um nó e revogação observada no outro, bloqueio da
consulta após logout, novo login e reinício de um dos processos. Após
o reinício, a sessão válida deve continuar acessível por ambos os nós.

**Limite:** estes são adaptadores HTTP reais do projeto em subprocessos de
CI, não duas instâncias da distribuição de produção atrás de um balanceador
corporativo. Ainda não exercitam TLS, proxy externo, cookies `Secure`,
storage real, arquivos volumosos, deploy, failover de infraestrutura ou
retention/expurgo LGPD. Nenhum backend externo nem arquivo real é usado.

## HTTP real contra armazenamento local descartável (CI)

O script `scripts/security/storage-http-mysql-smoke.ts` estabelece um serviço
HTTP que escuta exclusivamente em `127.0.0.1:8765` e implementa os mesmos
dois passos HTTP usados pelo cliente de storage atual: solicitação de URL
pré-assinada e `PUT` de bytes. O serviço mantém os bytes somente na memória
do processo de teste. Rejeita HTTP `DELETE` e não representa nem acessa o
provedor Forge real.

Os cenários incluem:
- Presign HTTP válido, `PUT` com bytes e MIME de PDF e publicação atômica
  da evidência, evento, auditoria e estado `committed`;
- Erro HTTP 503 antes da URL de upload: o ledger preserva a tentativa
  `cleanup_required` mesmo quando nenhum objeto foi recebido;
- Erro HTTP 503 **após persistir os bytes**: o objeto pode existir sem
  vínculo de evidência, por isso `cleanup_required` permanece até análise;
- Revogação de sessão durante um `PUT` HTTP concluído: a publicação da
  evidência deve ser bloqueada pela segunda verificação transacional;
- Nova tentativa com JWT já revogado não deve chegar ao provedor nem
  criar nova reserva;
- O relatório administrativo exibe somente indicadores/IDs internos,
  jamais a chave privada do objeto ou URL assinada.

Regras de isolamento: somente `CI=true`, `NODE_ENV=test`, banco
`dispatch_auth_ci` em `127.0.0.1`, segredo JWT de teste e credenciais
sintéticas do provider. Todos os registros são descartados após cada
execução; nenhum blob remoto é alterado.

**Limite:** esse teste usa tráfego HTTP real, mas o provedor é uma
implementação local de teste, não o Forge real. Portanto não comprova
permissões do provedor, semântica de exclusão, retenção, autenticação
contra o serviço externo ou expurgo de dados.

## Homologação ainda necessária
- Queda do processo antes/depois do PUT e antes/depois do commit.
- Duas instâncias de backend, mudança simultânea de sessão/perfil/tenant,
  encerramento/exclusão concorrente da ocorrência.
- Storage real apenas em ambiente de homologação (com objetos descartáveis).
- Política LGPD, retenção, expurgo, auditoria e restauração/rollback.
- Medição de latência e limites de tentativas para evitar requisições em excesso.

Nenhum teste desta mudança deve acionar storage ou banco operacional; o smoke
MySQL usa Forge sintético interceptado em localhost sem rede externa.

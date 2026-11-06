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

## Homologação ainda necessária
- Queda do processo antes/depois do PUT e antes/depois do commit.
- Duas instâncias de backend, mudança simultânea de sessão/perfil/tenant,
  encerramento/exclusão concorrente da ocorrência.
- Storage real apenas em ambiente de homologação (com objetos descartáveis).
- Política LGPD, retenção, expurgo, auditoria e restauração/rollback.
- Medição de latência e limites de tentativas para evitar requisições em excesso.

Nenhum teste desta mudança deve acionar storage ou banco operacional; o smoke
MySQL usa Forge sintético interceptado em localhost sem rede externa.

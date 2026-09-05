# Evidência do exercício de recuperação — D-005B

> Não registrar credenciais, URLs de banco, hostnames, tokens, URLs assinadas, chaves com nomes pessoais ou conteúdo dos arquivos.

## Identificação

| Campo               | Valor sanitizado                 |
| ------------------- | -------------------------------- |
| Run ID              |                                  |
| Data/hora UTC       |                                  |
| Responsável         |                                  |
| Versão da aplicação |                                  |
| Versão do esquema   |                                  |
| Origem lógica       | ambiente sintético não produtivo |
| Destino lógico      | ambiente descartável             |
| Resultado           | aprovado / bloqueado / falho     |

## Pacote

| Medida                                  | Valor |
| --------------------------------------- | ----: |
| Tamanho criptografado total             |       |
| Artefatos de banco                      |       |
| Objetos referenciados                   |       |
| Hash SHA-256 do export criptografado    |       |
| Hash SHA-256 do manifesto criptografado |       |

## Banco e objetos

| Verificação           | Esperado | Obtido | Estado |
| --------------------- | -------: | -----: | ------ |
| Usuários              |          |        |        |
| Perfis                |          |        |        |
| Equipes               |          |        |        |
| Ocorrências           |          |        |        |
| Atribuições           |          |        |        |
| Evidências            |          |        |        |
| Auditoria             |          |        |        |
| Invariantes quebrados |        0 |        |        |
| Objetos ausentes      |        0 |        |        |
| Hashes divergentes    |        0 |        |        |

## Objetivos de recuperação

| Indicador |  Meta provisória | Medido | Estado |
| --------- | ---------------: | -----: | ------ |
| RPO       | até 3.600.000 ms |        |        |
| RTO       | até 7.200.000 ms |        |        |

## Verificação funcional somente leitura

- [ ] Login com conta sintética.
- [ ] Ocorrência sintética acessível.
- [ ] Atribuição e auditoria preservadas.
- [ ] Avatar restaurado acessível.
- [ ] Evidência restaurada acessível.
- [ ] Nenhuma ocorrência ou despacho real criado.

## Falhas e diagnóstico sanitizado

Registre somente estágio, categoria, impacto e próxima ação segura. Não copie stack traces ou valores de ambiente.

## Capacidades e custo do provedor

| Item                                   | Evidência sanitizada |
| -------------------------------------- | -------------------- |
| Snapshot consistente                   |                      |
| Versionamento de objetos               |                      |
| Imutabilidade/proteção contra exclusão |                      |
| Criptografia gerenciada                |                      |
| Retenção disponível                    |                      |
| Volume medido                          |                      |
| Custo estimado                         |                      |

## Aprovação humana

| Papel                     | Nome | Decisão | Data UTC |
| ------------------------- | ---- | ------- | -------- |
| Operador responsável      |      |         |          |
| Responsável técnico       |      |         |          |
| Aprovador da continuidade |      |         |          |

Uma aprovação D-005B não autoriza D-005C, produção, agenda ou retenção automática.

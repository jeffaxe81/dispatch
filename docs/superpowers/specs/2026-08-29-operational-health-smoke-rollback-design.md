# D-004 — Saúde operacional, smoke test e rollback

**Data:** 29 de agosto de 2026

**Produto:** Sistema de Despacho

**Situação:** produto em produção

**Base validada:** versão 1.15.3, checkpoint D-003

**Branch de trabalho:** `chore/health-readiness-rollback`

## 1. Contexto atual

A versão 1.15.3 possui instalação reproduzível, suítes locais separadas e integração contínua aprovada no GitHub. O projeto ainda não possui um contrato HTTP geral para que balanceadores, plataformas de hospedagem e operadores diferenciem processo vivo de aplicação pronta.

Existem dois controles que não substituem esse contrato:

- `system.health` é um procedimento público tRPC que apenas devolve `ok: true` e exige o protocolo tRPC;
- `/api/integrations/alrt/health` mede exclusivamente a prontidão do receptor ALRT e possui autenticação própria.

A inicialização valida configuração de produção e tenta garantir o administrador local antes de abrir a porta. Depois de iniciado, entretanto, o processo pode continuar respondendo mesmo se banco ou armazenamento perderem disponibilidade.

A documentação conteinerizada cita `Dockerfile` e `docker-compose.yml`, mas esses artefatos não estão presentes na linha Git atual. O D-004 não inventará uma infraestrutura de implantação. O procedimento de rollback será independente do fornecedor e essa inconsistência ficará explícita na documentação.

## 2. Objetivo

Criar três controles complementares:

1. **liveness:** confirma que o processo HTTP está vivo;
2. **readiness:** confirma que o processo pode atender usando banco e armazenamento;
3. **smoke test pós-publicação:** verifica de fora os dois contratos e a página inicial.

Também será criado um procedimento seguro para retornar a aplicação ao último checkpoint, sem tratar reversão de aplicação como restauração de dados.

## 3. Escopo

### Incluído

- `GET /health/live` sem autenticação;
- `GET /health/ready` sem autenticação;
- consulta leve de banco para readiness;
- leitura real de objeto sentinela no armazenamento;
- timeouts e respostas sanitizadas;
- cabeçalho para impedir cache dos healthchecks;
- porta exata em produção e busca de alternativa somente em desenvolvimento;
- smoke test externo, sem login e sem gravação de dados;
- documentação de provisionamento da sentinela;
- runbook de rollback da aplicação;
- testes automatizados;
- changelog, decisão técnica e versão 1.15.4;
- checkpoints local e remoto após validação real.

### Não incluído

- criação automática do objeto sentinela;
- gravação ou exclusão de arquivo durante healthcheck;
- credenciais no repositório;
- painel de monitoramento;
- alertas ou serviço externo de uptime;
- Dockerfile, Compose, Kubernetes ou configuração de provedor;
- deploy automático;
- rollback automático;
- reversão de migrações;
- restauração de banco ou bucket;
- alteração do contrato `system.health` ou da saúde do ALRT.

Backup e restauração de dados pertencem ao D-005.

## 4. Opções avaliadas

| Abordagem | Vantagem | Risco/limite | Decisão |
|---|---|---|---|
| Processo e banco | Simples e barato | Não comprova evidências e fotos | Rejeitada pela decisão de escopo |
| Banco e objeto sentinela | Verifica banco, credencial, gateway e leitura real | Bucket indisponível retira toda a aplicação do tráfego | **Escolhida** |
| Apenas URL assinada | Não precisa de objeto permanente | Pode aprovar sem ler o objeto | Rejeitada |
| Gravação a cada probe | Verifica escrita real | Gera resíduos e não há exclusão na abstração atual | Rejeitada |
| Publicação com rollback automático | Resposta rápida a regressões | Depende de infraestrutura ausente e pode reverter incorretamente dados | Adiada |

## 5. Contratos HTTP

### 5.1 Liveness

`GET /health/live` responde `200` enquanto o servidor Express consegue processar requisições.

Resposta:

```json
{
  "status": "alive"
}
```

Esse endpoint não consulta banco, armazenamento, ALRT, OAuth ou outros serviços. Ele não inclui versão, hostname, ambiente, timestamp, stack trace ou configuração.

### 5.2 Readiness aprovada

`GET /health/ready` executa os checks de banco e armazenamento em paralelo, cada um com limite de dois segundos.

Resposta `200`:

```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "storage": "ok"
  }
}
```

### 5.3 Readiness recusada

Se qualquer dependência falhar, exceder o tempo ou estiver sem configuração, a resposta será `503`:

```json
{
  "status": "not_ready",
  "checks": {
    "database": "failed",
    "storage": "ok"
  }
}
```

Os únicos valores públicos serão `ok` e `failed`. A resposta não exibirá URL de banco, chave de objeto, URL assinada, credencial, mensagem do fornecedor ou erro interno.

Ambos os endpoints usarão `Cache-Control: no-store` e aceitarão somente `GET` pelo contrato documentado.

## 6. Verificações de dependência

### 6.1 Banco

O check obterá a conexão pela abstração existente e executará `SELECT 1`. Ausência de conexão, erro ou timeout resulta em `failed`.

O limite de resposta será aplicado por uma camada de timeout. Como a biblioteca atual não expõe cancelamento da consulta nesse ponto, a Promise subjacente pode terminar depois que o endpoint já respondeu. Esse limite será documentado e poderá ser refinado quando a conexão for transformada em pool explicitamente configurável.

### 6.2 Armazenamento

A variável `STORAGE_HEALTHCHECK_KEY` indicará um objeto permanente, por exemplo `health/ready.txt`. O arquivo deverá conter ao menos um byte e ser criado uma única vez pela operação no mesmo armazenamento usado pelas evidências.

O check deverá:

1. recusar chave vazia;
2. solicitar uma URL de leitura assinada pela abstração existente;
3. fazer `GET` com `Range: bytes=0-0` e sinal de cancelamento de dois segundos;
4. aceitar somente resposta `200` ou `206`;
5. cancelar o corpo após confirmar a resposta;
6. nunca persistir a URL nem devolvê-la ao cliente.

Isso verifica configuração, credencial, gateway e leitura do objeto sem criar resíduos.

### 6.3 Concorrência e frequência

Os dois checks rodam em paralelo para que falhas não somem seus tempos. A primeira versão não terá cache interno: a configuração do monitor deve usar intervalo mínimo recomendado de dez segundos. Cache ou single-flight só será introduzido se métricas demonstrarem volume relevante.

## 7. Inicialização e porta

Em produção, a aplicação deve escutar exatamente `PORT`, com padrão `3000`. Se a porta estiver ocupada, a inicialização falhará e o processo encerrará com erro visível no log.

Em desenvolvimento, a busca pelas próximas portas continuará permitida para preservar a experiência local.

Essa diferença é importante porque um balanceador configurado para a porta 3000 não descobriria silenciosamente que a aplicação mudou para 3001.

## 8. Smoke test pós-publicação

Será criado um script executável por `pnpm smoke:post-deploy`.

Configuração:

- `SMOKE_BASE_URL`: obrigatória e aceita somente `http` ou `https`;
- `SMOKE_TIMEOUT_MS`: opcional, padrão de cinco segundos e limite máximo de trinta segundos.

Ordem:

1. consultar `/health/live` e exigir `200` com `status: alive`;
2. consultar `/health/ready` e exigir `200` com os dois checks `ok`;
3. consultar `/` e exigir resposta `2xx` com conteúdo HTML;
4. encerrar com código zero somente se as três etapas passarem.

O script não recebe usuário, senha, cookie, token ou credencial administrativa. Ele não cria ocorrência, upload, auditoria ou qualquer dado operacional.

## 9. Rollback da aplicação

O runbook será independente da plataforma e usará artefatos imutáveis ou checkpoints Git. A sequência será:

1. interromper a promoção da versão defeituosa;
2. registrar versão atual, motivo e evidência do smoke test;
3. confirmar compatibilidade das migrações antes de voltar a aplicação;
4. selecionar o último checkpoint aprovado;
5. republicar o artefato anterior pelo mecanismo autorizado da plataforma;
6. validar liveness, readiness e smoke test;
7. confirmar login e um fluxo operacional somente leitura;
8. registrar responsável, horário e resultado;
9. manter a versão defeituosa isolada para diagnóstico.

Nenhum comando genérico apagará contêiner, volume, banco ou bucket. Se uma release contiver migração incompatível, o rollback da aplicação será bloqueado até revisão do plano de dados. O D-004 não executará rollback real.

## 10. Arquitetura interna

As responsabilidades serão separadas:

- módulo de saúde: executa checks e normaliza apenas `ok`/`failed`;
- rotas HTTP: traduz o resultado para `200` ou `503`;
- adaptador de banco: consulta leve usando a conexão atual;
- adaptador de armazenamento: gera URL e lê um byte da sentinela;
- script de smoke: consumidor externo dos contratos;
- inicialização: registra rotas e escolhe porta conforme ambiente.

As funções de check aceitarão dependências injetáveis nos testes. Assim, testes não acessam banco, armazenamento ou rede reais.

## 11. Tratamento de erros e logs

- falhas retornam diagnóstico público sanitizado;
- detalhes do erro podem ser registrados no servidor sem credenciais ou URLs assinadas;
- liveness não deve falhar por dependência externa;
- readiness nunca responde `200` parcialmente;
- timeout é classificado como falha da dependência;
- exceções não tratadas são convertidas em `503`, sem stack trace na resposta;
- probes bem-sucedidos não geram log a cada chamada para evitar ruído;
- transições para falha/recuperação ficam como evolução de observabilidade do D-010.

## 12. Estratégia de testes

A implementação seguirá TDD.

### Testes das rotas

- liveness retorna `200` sem chamar dependências;
- readiness retorna `200` quando os dois checks passam;
- readiness retorna `503` se banco falhar;
- readiness retorna `503` se armazenamento falhar;
- duas falhas simultâneas aparecem sanitizadas;
- respostas usam `no-store` e não contêm segredos/URLs/stack.

### Testes dos checks

- banco executa consulta leve;
- banco ausente e timeout falham;
- storage exige a chave sentinela;
- storage aceita `200` e `206`;
- storage rejeita erro HTTP, timeout e URL vazia;
- leitura usa somente o primeiro byte e não grava dados.

### Testes de inicialização

- produção mantém a porta configurada;
- desenvolvimento pode escolher alternativa;
- porta inválida é rejeitada.

### Testes do smoke

- fluxo completo aprovado;
- liveness inválida falha com etapa identificada;
- readiness `503` falha com etapa identificada;
- raiz não HTML falha;
- URL e timeout inválidos falham antes da rede.

### Regressão geral

- instalação congelada;
- segurança;
- TypeScript;
- suíte local completa;
- pré-validação de integração;
- build;
- smoke contra servidor controlado;
- workflow real do GitHub.

## 13. Documentação e versionamento

- especificação e plano de implementação;
- decisão `D004-operational-health-smoke-rollback.md`;
- runbook operacional de rollback;
- correção do documento conteinerizado para não afirmar que artefatos ausentes fazem parte do pacote;
- changelog didático;
- versão 1.15.4, por ser evolução operacional compatível;
- checkpoint local, bundle verificado e branch remota `checkpoint/d004-v1.15.4`;
- Pull Request sem merge ou deploy automático.

## 14. Critérios de aceite

O D-004 estará concluído quando:

- os dois contratos HTTP estiverem documentados e cobertos por testes;
- liveness nunca depender de banco ou armazenamento;
- readiness exigir banco e leitura real da sentinela;
- falhas e timeouts resultarem em `503` sanitizado;
- produção não escolher porta alternativa;
- smoke test validar os três pontos sem credenciais ou escrita;
- rollback distinguir aplicação de dados e não usar comandos destrutivos genéricos;
- instalação, segurança, TypeScript, testes e build passarem;
- o GitHub executar o workflow com sucesso;
- documentação e versão 1.15.4 estiverem coerentes;
- checkpoints local e remoto estiverem recuperáveis;
- `main`, banco e produção permanecerem inalterados sem autorização.

## 15. Riscos e trade-offs

- A indisponibilidade do armazenamento retirará toda a aplicação do tráfego, conforme decisão aprovada.
- Uma sentinela removida acidentalmente causará `503`; o runbook ensinará provisionamento e diagnóstico.
- Probes frequentes geram chamadas ao armazenamento; o intervalo mínimo recomendado é dez segundos.
- O timeout de banco limita a resposta, mas não cancela a Promise subjacente com a abstração atual.
- O smoke sem login não comprova autenticação completa; o teste de login existente continua separado e exige credenciais próprias.
- O rollback de aplicação pode ser incompatível com migrações futuras; cada release com alteração de dados precisa de decisão específica.
- A documentação Docker antiga não corresponde aos arquivos presentes; o D-004 corrigirá a afirmação, mas não escolherá uma plataforma de deploy.

## 16. Retorno desta mudança

Se os novos controles causarem regressão, o Pull Request não será mesclado. A branch poderá ser comparada ou descartada, mantendo `checkpoint/d003-v1.15.3` como base aprovada. Como o D-004 não altera banco nem dados, o retorno de desenvolvimento consiste em remover as novas rotas, o script e a documentação da branch, preservando todo o histórico Git.

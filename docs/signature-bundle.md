# AXE Despacho + Assinatura — pacote opcional (fundação técnica)

O repositório `jeffaxe81/axesistemas-signature-service` é incorporado
ao **mesmo pacote de instalação** do Despacho, mas roda como um contêiner
separado com versão independente. A Central de Alertas continua sendo
também opcional; não é requisito para iniciar a Assinatura.

## Limite funcional atual — importante

O commit do serviço de assinatura
`945cbccfb99ef7d96eed9886ca4a7ad80639ed35` inicializa `buildApp()` **sem injeção**
de `SignatureService`, `resolveAuthIdentity` e dependências de consentimento.
Portanto, o contêiner oferece **apenas** o endpoint `GET /health`.
Não existe API produtiva pronta para assinatura de documentos com este
empacotamento. O aplicativo Despacho não ganha um botão de assinatura,
não recebe assinaturas automáticas e não compartilha sessões/credenciais.

O serviço tem modelos e contratos para identidade, consentimento e assinatura
mas os adapters `FAKE` de teste e PKI fake não têm valor jurídico, e não
são habilitados no runtime empacotado. **Não** declarar conformidade
ICP-Brasil, Gov.br, PAdES/CAdES/XAdES ou validade de assinatura digital
sem integração efetiva e avaliação jurídica/segurança.

O serviço já possui schema/migrations PostgreSQL versionadas, mas a
configuração atual do `src/index.ts` não instancia repositório nem conexão
ao banco: **este pacote não instala um banco PostgreSQL inutilizado nem
aplica migrações automaticamente**. Quando os adapters persistentes
forem habilitados, criar Postgres isolado, migrações explícitas e backup
com gate próprio de homologação, sem usar o MySQL do Despacho ou Alertas.

## Instalação independente do módulo assinatura

Pré-requisitos: Docker Compose v2, Docker BuildKit e acesso ao GitHub para
obter a revisão pinada de `axesistemas-signature-service`.

```bash
cp .env.example .env
cp .env.signature.example .env.signature
# Defina as credenciais obrigatórias do Despacho no arquivo .env
docker compose --env-file .env --env-file .env.signature \
  -f docker-compose.yml -f compose.signature.yml \
  --profile signature config --quiet
docker compose --env-file .env --env-file .env.signature \
  -f docker-compose.yml -f compose.signature.yml \
  --profile signature up --build -d
curl --fail http://127.0.0.1:3004/health
```

A API interna, visível na rede `signature-api-net`, estará em
`http://signature-app:3000`, mas contém **apenas** health no bootstrap
atual. O host expõe `127.0.0.1:3004` — não há acesso direto pela rede externa
nem compartilhamento do banco. Para qualquer futura funcionalidade,
exigir identidade autenticada, autorização por tenant, TLS, trilha de
auditoria, consentimento, confirmação explícita antes de assinar e
provedor de confiança apropriado.

## Instalação dos três módulos em conjunto

```bash
cp .env.alerts.example .env.alerts
# Edite as senhas do .env.alerts e .env do Despacho
docker compose --env-file .env --env-file .env.alerts --env-file .env.signature \
  -f docker-compose.yml -f compose.alerts.yml -f compose.signature.yml \
  --profile alerts --profile signature config --quiet
docker compose --env-file .env --env-file .env.alerts --env-file .env.signature \
  -f docker-compose.yml -f compose.alerts.yml -f compose.signature.yml \
  --profile alerts --profile signature up --build -d
```

| Módulo | Serviço | Porta do host | Desacoplamento |
|---|---|---|---|
| Despacho | `app` | `3000` (configurável) | Principal |
| Alertas | `alerts-app` | `127.0.0.1:3003` | Serviço e MySQL separados |
| Assinatura | `signature-app` | `127.0.0.1:3004` | Serviço independente, ainda sem API de assinatura ativa |

`signature-api-net` permite integração futura autenticada entre
Despacho e assinatura, sem fazer com que o Despacho dependa da saúde
do serviço adicional. Pare-o com
`docker compose ... --profile signature stop signature-app`.
O arquivo `.env.signature` e o checkout local `.modules/signature/`
estão ignorados pelo Git.

## Homologação realizada pelo pacote

O workflow `signature-bundle.yml` executa:
- testes estruturais com Node;
- validação do Compose isolado e da combinação com Alertas;
- construção do contêiner na revisão fixada;
- inicialização sem subir Despacho e sem Alertas;
- `GET /health` com HTTP 200;
- `POST /v1/signature-requests` devolvendo 404 (API fechada até integrar
  dependências reais);
- inspeção de logs e limpeza dos contêineres de CI.

Este é o **empacotamento técnico**, não homologação de um sistema de
assinaturas jurídicamente apto para produção.

## Próximas entregas para assinatura real

Precisam ser implementadas separadamente: provider de confiança homologado;
authn/authz com tenant fail-closed; repositório persistente PostgreSQL;
armazenamento seguro de documentos; carimbo do tempo e validação de
assinatura; consentimento rastreável; proteção contra replay; tratamento
de documentos sensíveis e revisão de LGPD. Somente depois habilitar API
produtiva, integração de UI/fluxo operacional, testes e implantação.

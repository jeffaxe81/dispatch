# D-006 — Módulo iFrame Responsivo e Aplicações Incorporadas

**Status:** Planejado  
**Prioridade:** Alta para arquitetura; implementação após o fechamento da GIS-1  
**Origem:** documentação de integração responsiva via iFrame do NEO Interact

## 1. Objetivo

Adicionar ao AXE Dispatch um módulo genérico e seguro para incorporar aplicações web externas dentro da interface da plataforma, inicialmente preparado para integração com o NEO Interact.

O módulo deve permitir que o operador utilize a aplicação integrada sem abandonar o contexto do despacho, preservando navegação, permissões, auditoria e experiência responsiva.

## 2. Escopo funcional


## 2.0 Aplicação de referência homologável — NEO Interact

Para a primeira implementação do módulo, considerar:

- **URL do iFrame:** `https://gscprj.saas.digitro.cloud/neo/`
- **Origin autorizado para postMessage:** `https://gscprj.saas.digitro.cloud`
- **Permissões inicialmente previstas:** `camera; microphone; clipboard-write`
- **Largura inicial:** `100%`
- **Altura inicial de referência:** `800px`
- **Modo inicial:** página completa, com suporte a expansão.

Importante: o caminho `/neo/` pertence ao `src` do iframe, mas não faz parte de `event.origin`. A validação de origem deverá usar correspondência exata com `https://gscprj.saas.digitro.cloud`.

Exemplo de configuração de referência:

```ts
export const neoInteractEmbeddedApp = {
  id: "neo-interact",
  name: "NEO Interact",
  src: "https://gscprj.saas.digitro.cloud/neo/",
  origin: "https://gscprj.saas.digitro.cloud",
  width: "100%",
  defaultHeight: 800,
  allow: "camera; microphone; clipboard-write",
  enabled: true,
};
```


### 2.1 Aplicações incorporadas

Criar uma área administrativa para cadastrar aplicações permitidas, contendo no mínimo:

- nome da aplicação;
- URL HTTPS de incorporação;
- origem autorizada para `postMessage`;
- status ativo/inativo;
- altura inicial;
- largura padrão de 100%;
- limites mínimos e máximos de tamanho;
- permissões do iframe;
- política de sandbox;
- perfis e escopos autorizados;
- modo de abertura: painel principal, painel lateral ou tela dedicada;
- timeout de carregamento;
- mensagem de contingência.

A primeira aplicação de referência será o NEO Interact.

### 2.2 Componente responsivo

O componente de iframe deve:

- ocupar 100% da largura disponível;
- adaptar-se ao container do AXE Dispatch;
- usar altura inicial configurável, com 800 px como referência inicial do exemplo fornecido;
- aceitar redimensionamento solicitado pela aplicação incorporada;
- limitar o tamanho recebido ao viewport/container para impedir overflow;
- funcionar em desktop e mobile;
- oferecer modo tela cheia quando a aplicação externa exigir área maior;
- manter loading, erro e fallback visíveis;
- preservar navegação e acessibilidade do AXE Dispatch.

A responsividade do container não deve ser confundida com a responsividade interna da aplicação incorporada. Se a aplicação externa possuir largura mínima própria, o AXE Dispatch deve respeitar esse limite ou adotar tela cheia/aviso de compatibilidade.

## 3. Comunicação via postMessage

O contrato inicial deve suportar comunicação bidirecional.

### Mensagem enviada pelo AXE Dispatch

```json
{
  "type": "init",
  "timestamp": 0
}
```

### Mensagem recebida inicialmente

```json
{
  "type": "TOGGLE_IFRAME_SIZE",
  "isExpanded": true,
  "width": 1200,
  "height": 800
}
```

Regras obrigatórias:

- validar `event.origin` por correspondência exata;
- nunca usar `*` como destino de `postMessage` em produção;
- validar a estrutura de `event.data` antes do processamento;
- ignorar tipos de mensagem desconhecidos;
- nunca executar código recebido;
- não aceitar URL, script ou HTML arbitrário por mensagem;
- aplicar limites de largura e altura antes de alterar o DOM;
- registrar erros e violações sem gravar conteúdo sensível.

A validação deve utilizar schema tipado, preferencialmente Zod, seguindo o padrão existente no projeto.

## 4. Segurança

### 4.1 Allowlist de destinos

Operadores não poderão informar URLs arbitrárias em tempo de execução.

Somente aplicações previamente cadastradas por administrador poderão ser carregadas.

Cada aplicação deve possuir:

- URL HTTPS;
- origem exata;
- configuração de permissões;
- política de sandbox;
- perfis autorizados.

### 4.2 CSP e proteção contra clickjacking

Antes de homologar qualquer aplicação externa, verificar:

- se a aplicação permite incorporação por CSP `frame-ancestors`;
- se não existe `X-Frame-Options` incompatível;
- se a CSP do AXE Dispatch libera somente os hosts aprovados em `frame-src`;
- se cookies e sessão funcionam no contexto incorporado.

### 4.3 Permissões do navegador

Para NEO Interact, a documentação de referência utiliza:

```text
camera; microphone; clipboard-write
```

Essas permissões devem ser concedidas apenas às aplicações que realmente necessitarem delas.

### 4.4 Sessão e autenticação

A incorporação por iframe não será tratada como SSO automático.

A homologação deverá confirmar:

- método de login;
- persistência de sessão;
- comportamento de cookies SameSite/Secure;
- restrições de cookies de terceiros dos navegadores;
- logout;
- expiração;
- necessidade ou não de federação/SSO.

Nenhum token de autenticação deverá ser enviado em URL ou mensagem `postMessage` sem um protocolo específico previamente aprovado.

## 5. Integração com RBAC e multi-tenant

O módulo deve respeitar o RBAC existente.

Separar permissões mínimas:

- visualizar aplicação incorporada;
- abrir em tela cheia;
- configurar aplicações;
- habilitar/desabilitar aplicação;
- alterar origem/URL/permissões.

Na evolução multi-tenant, cada tenant deverá possuir sua própria lista de aplicações habilitadas e configurações, sem compartilhamento indevido de URL, sessão ou permissões.

## 6. Auditoria e observabilidade

Registrar eventos administrativos e técnicos relevantes:

- criação/alteração/desativação de integração;
- tentativa de acesso sem privilégio;
- falha de carregamento;
- timeout;
- origem de mensagem rejeitada;
- mensagem inválida;
- entrada/saída de modo expandido.

Não registrar:

- senha;
- token;
- conteúdo de conversas;
- payload sensível da aplicação externa.

## 7. UX proposta

### Menu

`Integrações > Aplicações incorporadas`

### Uso operacional

Uma aplicação poderá ser vinculada a:

- menu lateral;
- ocorrência;
- painel do despachador;
- painel do agente;
- tela dedicada.

Para NEO Interact, a evolução recomendada é permitir que o operador mantenha o despacho em uma área da tela e o atendimento omnichannel em outra, aproveitando o conceito já previsto de uso em telas de tamanhos diferentes.

## 8. Modos de layout

Preparar o componente para:

1. **Página completa** — iframe ocupa o conteúdo principal;
2. **Painel lateral** — aplicação externa ao lado da ocorrência/mapa;
3. **Dock inferior** — adequado para console de comunicação;
4. **Tela cheia** — usado quando a aplicação incorporada solicitar expansão;
5. **Janela desacoplada** — evolução futura para operações em dois monitores.

A primeira implementação deve entregar Página completa + Tela cheia. Os demais modos podem ser evoluções posteriores.

## 9. Critérios de aceitação da primeira entrega

- aplicação cadastrada somente por usuário autorizado;
- URL e origem validadas;
- iframe com largura 100%;
- altura configurável;
- comunicação `postMessage` tipada;
- `TOGGLE_IFRAME_SIZE` funcional;
- limites de tamanho impedem overflow;
- desktop e mobile validados;
- loading, timeout e erro implementados;
- câmera/microfone apenas quando habilitados;
- origem inválida ignorada e auditada;
- URL arbitrária bloqueada;
- testes unitários de mensagens e sizing;
- teste visual desktop/mobile;
- teste de CSP/configuração;
- documentação de homologação do provedor.

## 10. Fases

### D-006A — Fundação do componente

- modelo de configuração;
- RBAC;
- componente `EmbeddedApplicationFrame`;
- schemas das mensagens;
- allowlist;
- sizing responsivo;
- erros/loading;
- testes.

### D-006B — Homologação NEO Interact

- URL/origem de homologação;
- login e sessão;
- câmera/microfone;
- comunicação `postMessage`;
- expansão/redução;
- desktop/mobile;
- logout e expiração.

### D-006C — Layout operacional avançado

- painel lateral;
- dock;
- associação com ocorrência;
- contexto de atendimento;
- dois monitores/janela desacoplada.

## 11. Dependências externas

Para a homologação NEO, será necessário confirmar:

- confirmar que a URL informada `https://gscprj.saas.digitro.cloud/neo/` é a URL definitiva do ambiente a ser homologado;
- confirmar que a origem permitida é `https://gscprj.saas.digitro.cloud`;
- headers CSP/X-Frame-Options;
- política de cookies;
- contrato definitivo de `postMessage`;
- largura mínima suportada pela interface NEO;
- comportamento de autenticação;
- permissões de câmera e microfone.

## 12. Fora do escopo inicial

- reimplementar a interface NEO dentro do AXE Dispatch;
- capturar DOM interno do iframe;
- acessar conteúdo cross-origin;
- executar JavaScript recebido da aplicação externa;
- compartilhar credenciais entre aplicações;
- substituir integrações API quando API for necessária para dados de negócio.



## 13. Implementação D-006A — Fundação validada em 03/09/2026

A fundação funcional foi implementada na branch `feature/d006a-embedded-app-foundation`, mantendo o PR #10 em rascunho e sem merge/deploy.

### Entregue

- contrato tipado em `shared/embeddedApplications.ts`;
- allowlist inicial contendo somente o NEO Interact;
- URL `https://gscprj.saas.digitro.cloud/neo/`;
- origin exato `https://gscprj.saas.digitro.cloud`;
- componente `EmbeddedApplicationFrame`;
- `width=100%` e altura inicial de 800 px;
- limites de expansão por container, `maxWidth`, `minHeight` e `maxHeight`;
- `postMessage` sem wildcard, validando origin, source e schema;
- mensagem `init` enviada exclusivamente ao origin autorizado;
- recepção de `TOGGLE_IFRAME_SIZE`;
- permissões declarativas `camera; microphone; clipboard-write`;
- loading, timeout, erro e retry;
- consulta de aplicações protegida por `integrations.view`;
- rota `/integracoes/aplicacoes-incorporadas`;
- entrada no catálogo de Integrações.

### Evidência de qualidade

Commit funcional validado: `354d6a8396605117a0ca6bc840034fbaa5f7720e`.

- **Qualidade #14:** sucesso — instalação congelada, segurança, TypeScript, testes locais e build;
- **GIS visual #9:** sucesso — confirma que a evolução D-006A não regrediu a homologação GIS existente;
- testes específicos novos validam URL/origin, bloqueio de HTTP/origin com path, payload desconhecido, allow explícito, sizing e rejeição de mensagem de origem inválida.

### Pendências deliberadamente separadas

A fundação não conclui a homologação externa do NEO. Permanecem para D-006B:

- verificar CSP `frame-ancestors` e `X-Frame-Options`;
- verificar sessão, login, logout e cookies em iframe;
- validar câmera/microfone no navegador;
- homologar comportamento real de `TOGGLE_IFRAME_SIZE`;
- criar evidência visual desktop/mobile específica do iframe;
- validar a experiência operacional lado a lado com ocorrência/mapa.

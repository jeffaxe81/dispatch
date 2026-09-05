# CP-016 — Qualificação de Equipes para Despacho

Data: 05/09/2026  
Status: desenho aprovado para revisão; implementação ainda não autorizada  
Versão do aplicativo preservada: 1.15.5

## Objetivo

Completar a elegibilidade operacional do CP-016 com requisitos explícitos de habilidade e região, validade configurável da localização e decisão exclusivamente no servidor. Uma equipe só poderá ser apresentada ou atribuída quando satisfizer todos os requisitos aplicáveis da ocorrência, além da jornada e presença já validadas.

## Decisões

### Requisitos da ocorrência

Adicionar de forma aditiva a `incidents`:

- `required_skills` JSON, representado como `string[] | null`;
- `region_code` `varchar(80)`, anulável.

`null` e lista vazia significam que a ocorrência não exige habilidades. `region_code = null` significa que a ocorrência não restringe região. Registros existentes permanecem válidos sem backfill obrigatório.

Não deduzir habilidade a partir de `category`, nem região a partir de `address`. Essas informações podem futuramente sugerir valores, mas não serão autoridade para impedir ou autorizar despacho.

### Configuração de localização

Usar `general_setting_entries` com:

- `section = "dispatch"`;
- `setting_key = "locationFreshnessSeconds"`;
- valor inteiro entre 30 e 86.400;
- padrão efetivo de 300 segundos quando não houver entrada ativa.

A configuração será lida no servidor. Alteração futura pela interface administrativa deverá exigir privilégio de superadministrador e gerar auditoria. Este incremento implementará o contrato de leitura e validação; não adicionará uma nova tela administrativa.

### Normalização

Habilidades e região serão comparadas por códigos normalizados:

1. remover espaços nas extremidades;
2. converter para minúsculas;
3. aceitar apenas letras ASCII minúsculas, números, ponto, hífen e sublinhado;
4. rejeitar código vazio ou maior que 80 caracteres;
5. remover habilidades duplicadas após normalização.

Não remover acentos implicitamente. Um valor como `manutenção` é inválido; o código correspondente deverá ser cadastrado explicitamente como `manutencao`. Isso evita equivalências silenciosas.

### Localização recente

Usar o snapshot de `teams.lastLatitude`, `teams.lastLongitude` e `teams.lastLocationAt`, alimentado transacionalmente por `recordTeamLocation`. Uma localização é válida somente quando:

- latitude e longitude existem e formam coordenada geográfica válida;
- `lastLocationAt` existe;
- o instante não está no futuro além de 30 segundos de tolerância;
- sua idade não excede `locationFreshnessSeconds` no instante da decisão.

Uma localização ausente, inválida, futura além da tolerância ou expirada torna a equipe inelegível.

## Regra de correspondência

Uma equipe é qualificada quando todas as condições forem verdadeiras:

1. escopo e permissões do solicitante permitem visualizar/usar a equipe;
2. equipe ativa;
3. jornada iniciada, não encerrada e não pausada;
4. sessão de jornada associada à presença está aberta;
5. presença mais recente é `available` e `availableForDispatch = true`;
6. todas as `requiredSkills` da ocorrência pertencem a `operational_presence.skills`;
7. a região coincide quando a ocorrência possui `regionCode`;
8. a localização da equipe é válida e recente.

A comparação de habilidades usa semântica **todas**, não **qualquer uma**. Habilidades adicionais da equipe não prejudicam a elegibilidade.

Quando a ocorrência não restringe habilidades ou região, esses dois critérios são satisfeitos; a localização recente permanece obrigatória.

## Arquitetura e fluxo

### Unidade pura

Evoluir `evaluateDispatchEligibility` para receber os valores concretos da ocorrência, presença e localização, produzindo `{ eligible, reasons }`. A função continuará sem acesso a banco e retornará razões distintas para escopo, jornada, disponibilidade, status, habilidade, região e localização.

### Consulta de candidatos

Criar consulta de candidatos que recebe `incidentId` e o usuário autenticado:

1. carrega ocorrência e configuração de validade;
2. aplica o escopo autorizado no servidor;
3. carrega equipes ativas com sua presença mais recente e snapshot de localização;
4. avalia cada equipe pela unidade pura;
5. retorna somente elegíveis para ranqueamento por distância/ETA.

O cliente poderá escolher entre candidatos retornados, mas não enviará indicadores como `scopeAllowed`, `skillAllowed`, `regionAllowed` ou `hasFreshLocation` como fonte de verdade.

### Atribuição transacional

`assignTeamToIncident` repetirá todas as verificações sob bloqueio das linhas relevantes. O objetivo é impedir que uma equipe se torne inelegível entre a listagem e a atribuição.

Em caso de sucesso, a transação existente continuará criando atribuição, atualizando ocorrência/equipe, registrando evento e auditoria e mudando a presença para `busy`. Em qualquer falha, nenhuma dessas gravações poderá permanecer.

### API

Adicionar procedimento autenticado para consultar candidatos por `incidentId`. Preservar `assertPermission` e `assertTeamScope`; não ampliar privilégios. O procedimento de atribuição existente continuará sendo a autoridade final.

O endpoint atual que recebe candidatos arbitrários para `rankCandidates` poderá permanecer como cálculo geográfico auxiliar, mas não deverá ser apresentado como lista autorizada para despacho.

## Erros e auditoria

Rejeições de atribuição usarão mensagem operacional genérica para o cliente: `Equipe não elegível para despacho.` As razões detalhadas poderão ser registradas em metadados de diagnóstico autorizados, sem expor dados de outra organização.

Uma tentativa rejeitada antes de qualquer mudança não criará atribuição, evento de ocorrência nem auditoria de sucesso. Não registrar coordenadas completas em novos logs de rejeição.

## Banco e migration

A migration deve ser aditiva:

- adicionar somente `required_skills` e `region_code` a `incidents`;
- não remover, renomear ou tornar obrigatório campo existente;
- não apagar ou transformar dados históricos;
- manter snapshot e journal do Drizzle coerentes;
- aplicar com sucesso sobre banco novo e sobre fixture representando esquema anterior com dados.

Não criar tabela de catálogo de habilidades ou regiões neste incremento. Catálogos administrativos constituem evolução separada.

## Testes e aprovação

Seguir RED → GREEN → regressão. Cobertura mínima:

- normalização, duplicatas e códigos inválidos;
- todas as habilidades exigidas presentes;
- uma habilidade ausente;
- região igual, diferente e não exigida;
- coordenadas ausentes ou inválidas;
- localização recente, expirada e futura;
- padrão de 300 segundos e configuração válida;
- configuração fora dos limites ou de tipo incorreto usa erro explícito, sem fallback silencioso;
- consulta de candidatos respeita escopo e não confia em flags do cliente;
- atribuição direta repete os critérios dentro da transação;
- mudança concorrente de disponibilidade não cria atribuição parcial;
- migration em banco novo e upgrade de fixture com dados preservados;
- segurança, TypeScript, testes completos e build.

Aprovação desta etapa requer evidências do SHA remoto exato. CI verde não equivale a homologação operacional, merge ou deploy.

## Compatibilidade, implantação e rollback

- Preservar versão 1.15.5 até decisão formal de release.
- Ocorrências antigas continuam carregando com requisitos nulos.
- Clientes antigos podem criar ocorrências sem os novos campos.
- Rollback da aplicação pode deixar as colunas aditivas sem uso; não removê-las em rollback emergencial.
- Não alterar `main`, fazer merge ou deploy como parte desta especificação.

## Fora do escopo

- cadastro administrativo de catálogos de habilidades e regiões;
- geofencing ou descoberta automática de região por coordenadas;
- roteamento externo e cálculo de ETA além do serviço existente;
- teste de carga distribuído;
- tela administrativa da validade da localização;
- estratégia multi-tenant completa além do escopo autorizado já existente.

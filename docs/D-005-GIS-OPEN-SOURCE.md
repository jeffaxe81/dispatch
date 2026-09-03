# D-005 — Arquitetura GIS Open Source e Despacho Georreferenciado

## 1. Objetivo

Definir a evolução do AXE Dispatch para uma arquitetura GIS aberta, desacoplada de fornecedor, preparada para despacho por proximidade, rotas, ETA, trilhas, geolocalização em tempo real, camadas temáticas e futuras funções de inteligência operacional.

Este documento substitui a dependência conceitual de um provedor proprietário único por uma camada de abstração GIS.

## 2. Princípios arquiteturais

1. O mapa não deve conhecer regras de negócio do despacho.
2. O domínio de ocorrências, equipes e viaturas não deve depender de APIs específicas de mapas.
3. Rotas, geocodificação e renderização devem possuir adaptadores substituíveis.
4. A solução inicial deve priorizar componentes open source.
5. O sistema deve continuar funcional mesmo quando um serviço externo de rota estiver indisponível.
6. A arquitetura deve permanecer preparada para multiempresa e migração futura de banco.
7. Geolocalização deve ser consentida, auditável e limitada ao escopo operacional autorizado.
8. Toda evolução relevante deve ser coberta por testes e checkpoint Git recuperável.

## 3. Stack de referência

| Camada | Tecnologia inicial | Responsabilidade |
|---|---|---|
| Base cartográfica | OpenStreetMap | Dados cartográficos |
| Renderização web | Leaflet | Visualização do mapa |
| Rotas/ETA | OSRM | Roteamento inicial |
| Alternativa de rotas | GraphHopper | Adaptador alternativo |
| Heatmap | Leaflet.heat | Densidade de ocorrências |
| Dados espaciais | GeoJSON | Contrato geográfico padrão |
| Geolocalização | Browser Geolocation API | Captura consentida de posição |
| Comunicação em tempo real | WebSocket/SSE | Atualização de posição e status |
| Persistência inicial | Banco relacional atual | Registro operacional |
| Banco alvo futuro | PostgreSQL/PostGIS | Consultas espaciais avançadas |

## 4. Arquitetura lógica

```text
[Frontend Dispatch]
      |
      +-- Map UI / Leaflet
      |
      +-- GIS Client Service
              |
              +-- Map Provider Adapter
              +-- Route Provider Adapter
              +-- Geolocation Adapter
              +-- GeoJSON Serializer
              |
          [Dispatch API]
              |
              +-- Occurrence Service
              +-- Team/Vehicle Service
              +-- Location Service
              +-- Routing Service
              +-- Proximity Service
              +-- Audit Service
              |
          [Persistence]
              |
              +-- Current relational DB
              +-- Future PostgreSQL/PostGIS
```

## 5. Contratos mínimos

### 5.1 Posição

```ts
type GeoPoint = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt: string;
};
```

### 5.2 Rota

```ts
type RouteRequest = {
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints?: GeoPoint[];
  profile?: "car" | "bike" | "foot";
};

type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: GeoJSON.LineString;
  provider: string;
};
```

### 5.3 Provedor de rotas

```ts
interface RouteProvider {
  calculateRoute(request: RouteRequest): Promise<RouteResult>;
}
```

O domínio não deve chamar OSRM ou GraphHopper diretamente.

## 6. Evolução funcional

### Fase GIS-1 — Base operacional

- OSM + Leaflet como visualização padrão.
- Marcadores de ocorrências, equipes e viaturas.
- posição atual da equipe.
- rota ocorrência → equipe/viatura.
- ETA calculado.
- despacho por proximidade.
- exibição da equipe mais próxima.
- contrato GeoJSON.
- adapter de rota.
- testes unitários do adapter.
- fallback visual caso o motor de rotas esteja indisponível.

### Fase GIS-2 — Operação avançada

- heatmap de ocorrências.
- clusters de marcadores.
- geofencing.
- histórico de posições.
- replay de trajeto.
- trilhas GPX/GeoJSON.
- filtros por período, prioridade e tipo.
- camadas temáticas.
- dashboards geográficos.

### Fase GIS-3 — Inteligência operacional

- previsão de demanda por região.
- sugestão automática de reposicionamento de equipes.
- balanceamento territorial.
- recomendação de despacho considerando ETA, prioridade e carga.
- detecção de áreas críticas.
- otimização multiocorrência.

## 7. Proximidade

A primeira versão pode utilizar distância geodésica para pré-seleção de equipes e depois consultar o motor de rotas apenas para as melhores candidatas.

Fluxo recomendado:

```text
Ocorrência
   ↓
Equipes disponíveis
   ↓
Filtro por distância geodésica
   ↓
Top N candidatas
   ↓
Cálculo real de rota/ETA
   ↓
Ranking operacional
   ↓
Sugestão ao despachador
```

Isto reduz chamadas ao motor de rotas e evita acoplamento desnecessário.

## 8. Tempo real

A versão atual utiliza polling. A evolução deve introduzir um canal de atualização em tempo real para:

- posição de equipes;
- alteração de status de ocorrência;
- aceite/recusa;
- início e término de atendimento;
- disponibilidade de viaturas;
- atualização de ETA quando necessário.

Polling deve permanecer temporariamente como fallback.

## 9. Banco de dados

A implementação GIS não deve obrigar a migração imediata do banco atual.

Regras:

- armazenar latitude/longitude em formato portátil;
- evitar SQL geoespacial proprietário espalhado pelo código;
- concentrar consultas espaciais em um repositório/adaptador;
- manter migração futura para PostgreSQL/PostGIS como evolução;
- preparar `tenant_id` nas novas entidades quando houver evolução multiempresa;
- não misturar lógica GIS diretamente nas tabelas de autenticação.

## 10. Multiempresa

Toda nova entidade GIS deverá ser desenhada para futura segregação por tenant.

Entidades candidatas:

- equipes;
- viaturas;
- ocorrências;
- posições;
- geofences;
- camadas;
- configurações de mapa;
- provedores de rota;
- políticas de retenção.

O escopo de tenant deverá ser aplicado no backend, e não somente na interface.

## 11. Resiliência

O mapa deve continuar permitindo consulta operacional caso o serviço de rota esteja indisponível.

Fallback mínimo:

1. manter mapa e marcadores;
2. manter posição mais recente conhecida;
3. exibir distância aproximada;
4. informar indisponibilidade de ETA;
5. permitir despacho manual;
6. registrar a falha do provedor;
7. tentar novamente sem bloquear o fluxo principal.

A futura camada offline/local poderá utilizar armazenamento local controlado para dados mínimos de operação e sincronização posterior, sem transformar o navegador em fonte de verdade.

## 12. Segurança e privacidade

- geolocalização somente após consentimento;
- transmissão autenticada;
- acesso por perfil;
- escopo de equipe/tenant;
- registro de auditoria;
- retenção configurável;
- limitação de precisão quando o caso de uso permitir;
- nenhuma exposição pública de histórico de localização;
- segregação entre posição operacional atual e histórico.

## 13. Critérios de aceite do D-005

O desenho será considerado implementável quando:

- o frontend não depender diretamente de Google Maps;
- existir uma interface de provider de mapas/rotas;
- OSM + Leaflet puder ser ativado como provider padrão;
- OSRM estiver encapsulado por adapter;
- houver cálculo de rota e ETA;
- houver ranking por proximidade;
- os contratos geográficos utilizarem GeoJSON;
- testes cobrirem sucesso, timeout e indisponibilidade do provedor;
- a operação manual continuar funcionando sem rota;
- a solução não introduzir dependência que inviabilize PostgreSQL/PostGIS ou multiempresa.

## 14. Ordem de implementação recomendada

1. Criar abstrações GIS.
2. Isolar o componente atual de mapas.
3. Adicionar Leaflet + OSM.
4. Implementar marcadores.
5. Implementar adapter OSRM.
6. Implementar rota e ETA.
7. Implementar proximidade.
8. Adicionar tempo real.
9. Adicionar heatmap/cluster.
10. Criar testes e homologação de campo.
11. Criar checkpoint.
12. Somente então avaliar retirada definitiva do provider anterior.

## 15. Regra de transição

O provider atual não deve ser removido antes que a solução OSM/Leaflet esteja validada por testes automatizados e homologação funcional.

A troca deve ocorrer por configuração, permitindo rollback imediato durante a fase de transição.

## 16. Próximo documento

Após o D-005, o próximo artefato recomendado é o **D-006 — Arquitetura de Tempo Real, Telemetria e Operação Offline**, cobrindo WebSocket/SSE, sincronização, perda de conectividade, filas locais, reconciliação e rastreabilidade.


## Reconciliação com o checkpoint D-005A — 03/09/2026

A GIS-1 foi reconciliada sobre a base segura `checkpoint/d005a-v1.15.5` sem substituir nem apagar a branch GIS original. A linha combinada está preservada em `checkpoint/d005a-gis1-reconciled-20260903` e no PR draft #8.

### Portões de qualidade aprovados

Na execução GitHub Actions **Qualidade #6** foram aprovados:

- instalação com lockfile congelado e pnpm canônico via Corepack;
- verificação de segurança;
- TypeScript;
- suíte local completa, incluindo os testes GIS incorporados à configuração D-005A;
- build de produção.

### Limites desta evidência

- não houve merge nem deploy;
- não houve uso de banco, storage ou credenciais de produção;
- as suítes de integração/recovery que dependem de infraestrutura real permanecem separadas;
- a homologação visual GIS-1 em desktop/mobile continua pendente antes do fechamento funcional.


## Homologação visual GIS-1 — 03/09/2026

A última pendência da GIS-1 foi validada com um harness isolado que importa o **mesmo componente `OperationalMap` usado pela aplicação**, sem duplicar a implementação funcional.

### Cenário homologado

- provider em modo `automatic`, resolvido para OpenStreetMap/Leaflet;
- 3 ocorrências com prioridades distintas;
- 2 equipes posicionadas;
- 1 rota em GeoJSON `LineString`;
- desktop em 1440×900;
- mobile em 390×844.

### Resultado automatizado

O workflow **GIS visual homologation #1** concluiu com sucesso no commit `02e36fd217819a916369c95897ac2e87031e4e34`.

Controles automáticos aprovados:

- Leaflet inicializado no DOM;
- atribuição OpenStreetMap presente;
- contagem operacional esperada renderizada;
- geometria da rota exibida;
- ausência de overflow horizontal em desktop e mobile;
- capturas PNG e DOM final gerados.

Pacote de evidência GitHub Actions:

- artefato: `gis-1-visual-homologation`;
- artifact id: `9904314714`;
- digest: `sha256:e77a4918bf8dbdea7a5f571f13a3af66ffd9996699c67cb53f888d9f094d4880`.

### Revisão das capturas

A revisão das imagens confirmou:

- desktop: mapa OSM carregado, marcadores de ocorrências/equipes visíveis e rota desenhada corretamente;
- mobile: cartões empilhados, mapa ajustado à largura da viewport e navegação vertical sem estouro lateral;
- a continuação inferior do mapa no telefone ocorre por rolagem vertical normal, sem recorte horizontal do conteúdo.

### Regressão completa

O workflow **Qualidade #9** também concluiu com sucesso na mesma revisão do PR de homologação, preservando instalação congelada, segurança, TypeScript, testes locais e build.

### Limites

Esta homologação é visual e funcional em ambiente controlado. Não representa deploy em produção, não usa banco/storage reais e não autoriza merge automático.

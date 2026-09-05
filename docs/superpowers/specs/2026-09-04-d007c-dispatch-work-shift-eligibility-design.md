# D-007C — Elegibilidade de Jornada no Despacho

## Objetivo

Integrar a jornada de trabalho D-007A/B ao fluxo de seleção de equipes do despacho, garantindo que somente equipes operacionalmente elegíveis sejam encaminhadas ao ranking GIS/OSRM.

A D-007C deve atuar **antes de qualquer cálculo de rota**, preservando o GIS como mecanismo de ranking somente entre candidatos já elegíveis.

## Base imutável

A implementação deve partir exclusivamente de:

- `checkpoint/d007b-work-shift-schedules-20260904`
- SHA `be9b63e9e62f9e28620bb1fa753b89fdef5242f5`

A D-007B permanece imutável. A D-007C deve usar suas APIs, contratos e tabelas sem alterar o significado histórico já homologado.

## Escopo da Release 1.0

A D-007C faz parte do fechamento do núcleo operacional da Release 1.0. Durante sua implementação não devem ser abertos novos épicos funcionais paralelos.

O objetivo desta fase é fechar o despacho principal com jornada, elegibilidade e ranking geográfico de forma previsível e auditável.

## Regra principal de elegibilidade da equipe

O despacho continua sendo orientado a **equipes**.

Uma equipe é considerada elegível quando possuir **pelo menos um integrante elegível** no instante da avaliação.

Não é exigido que todos os integrantes estejam em jornada para que a equipe seja candidata, evitando retirar uma equipe inteira por indisponibilidade individual de um único membro.

A decisão deve preservar quais integrantes tornaram a equipe elegível e quais integrantes foram descartados.

## Pipeline obrigatório

O pipeline do despacho deve seguir esta ordem:

1. receber equipes candidatas;
2. resolver os membros vinculados a cada equipe;
3. avaliar a elegibilidade de jornada de cada membro;
4. consolidar a elegibilidade da equipe;
5. separar equipes elegíveis e inelegíveis;
6. encaminhar **somente equipes elegíveis** ao pré-ranking por distância geodésica;
7. encaminhar somente o subconjunto previsto ao OSRM;
8. ordenar o resultado final por ETA e distância, conforme regra GIS já homologada.

Uma equipe inelegível **não pode provocar chamada ao OSRM**.

## Critérios de elegibilidade individual

A avaliação individual deve considerar, nesta ordem conceitual:

1. usuário ativo e operacionalmente vinculado à equipe;
2. planejamento D-007B aplicável ao instante, quando existir;
3. sessão real D-007A aberta/encerrada e seu estado;
4. exceções de escala D-007B;
5. compatibilidade legada durante a transição.

### Elegível

Um integrante é elegível quando:

- está dentro de uma janela planejada válida ou em chamada extra/substituição válida; e
- possui sessão real compatível com trabalho ativo; e
- não está pausado nem encerrado; ou
- não possui planejamento D-007B ainda, mas possui sessão D-007A ativa válida durante o período de transição.

### Inelegível

Os motivos de inelegibilidade devem ser estruturados e auditáveis.

Códigos mínimos:

- `OUTSIDE_PLANNED_SHIFT` — fora da janela planejada;
- `SHIFT_NOT_STARTED` — dentro da janela planejada, mas sem início de jornada real;
- `SHIFT_PAUSED` — jornada real pausada;
- `SHIFT_ENDED` — jornada real já encerrada;
- `DAY_OFF` — folga/exceção impeditiva;
- `LEAVE` — afastamento/exceção impeditiva;
- `NO_ACTIVE_WORK_SHIFT` — sem planejamento aplicável e sem sessão real ativa no modo legado;
- `USER_INACTIVE` — usuário operacional inativo;
- `NOT_TEAM_MEMBER` — vínculo de equipe inválido para o candidato avaliado.

Os códigos devem ser estáveis para consumo por UI, auditoria e futuras regras de despacho.

## Compatibilidade D-007A sem escala D-007B

Durante a transição, a ausência de uma escala D-007B **não torna automaticamente o usuário inelegível**.

Se não existir planejamento D-007B aplicável, a plataforma deve consultar a sessão real D-007A:

- sessão ativa e não pausada → elegível;
- sessão pausada → `SHIFT_PAUSED`;
- sessão encerrada/ausente → `NO_ACTIVE_WORK_SHIFT`.

Esse fallback é transitório, mas necessário para preservar compatibilidade operacional sem obrigar migração imediata de todos os usuários para D-007B.

## Contratos de domínio

Criar uma camada de domínio específica, independente do GIS:

```ts
export type DispatchEligibilityReason =
  | "OUTSIDE_PLANNED_SHIFT"
  | "SHIFT_NOT_STARTED"
  | "SHIFT_PAUSED"
  | "SHIFT_ENDED"
  | "DAY_OFF"
  | "LEAVE"
  | "NO_ACTIVE_WORK_SHIFT"
  | "USER_INACTIVE"
  | "NOT_TEAM_MEMBER";

export type DispatchMemberEligibility = {
  userId: number;
  teamId: number;
  eligible: boolean;
  reason?: DispatchEligibilityReason;
  plannedStartAt?: Date | null;
  plannedEndAt?: Date | null;
  sessionId?: number | null;
};

export type DispatchTeamEligibility<TCandidate> = {
  candidate: TCandidate;
  eligible: boolean;
  eligibleMembers: DispatchMemberEligibility[];
  ineligibleMembers: DispatchMemberEligibility[];
};
```

A implementação concreta pode ajustar nomes de tipos, mas deve preservar essa separação entre decisão individual, decisão da equipe e ranking GIS.

## Serviço de elegibilidade

Criar um serviço dedicado, por exemplo:

- `server/dispatchEligibilityService.ts`
- `server/dispatchEligibilityService.test.ts`

Responsabilidades:

- resolver elegibilidade individual;
- consolidar elegibilidade por equipe;
- retornar candidatos elegíveis e inelegíveis;
- preservar razões estruturadas;
- não conhecer OSRM nem calcular distância.

O serviço GIS existente (`rankTeamCandidates`) não deve ser responsável por regras de jornada.

## Loader/adapter de dados

Criar um port de leitura dedicado para evitar acoplamento direto do domínio ao Drizzle.

Operações mínimas esperadas:

- listar membros ativos por `teamId`;
- obter sessão real atual D-007A por usuário;
- resolver planejamento D-007B por usuário/instante;
- obter exceções efetivas já consolidadas via serviço D-007B quando necessário.

Preferir reutilizar o runtime/serviço D-007B existente em vez de duplicar cálculo 12x36 ou precedência de exceções.

## Integração com o GIS

O GIS continua recebendo apenas `CandidateTeamPoint[]` elegíveis.

A composição deve ocorrer antes da chamada:

```ts
const eligibility = await evaluateDispatchCandidates(...);
const ranked = await rankTeamCandidates(
  incident,
  eligibility.eligibleCandidates,
  routeProvider,
  maxRouteCandidates,
);
```

O retorno ao consumidor deve incluir tanto o ranking quanto os candidatos descartados por jornada.

Exemplo conceitual:

```ts
{
  rankedCandidates: [...],
  ineligibleCandidates: [
    {
      teamId: 10,
      reasons: [
        { userId: 21, reason: "SHIFT_NOT_STARTED" },
        { userId: 22, reason: "SHIFT_PAUSED" }
      ]
    }
  ]
}
```

## Contrato tRPC

A evolução preferencial é manter `gis.rankCandidates` compatível para clientes atuais e introduzir um contrato de despacho que componha elegibilidade + GIS.

Nome recomendado:

- `dispatch.rankEligibleCandidates`

Entrada mínima:

- ocorrência (`latitude`, `longitude`);
- lista de equipes candidatas;
- instante de avaliação opcional apenas para testes/administrativo, usando `now` do servidor em produção.

Saída:

- `rankedCandidates`;
- `ineligibleCandidates` com razões estruturadas;
- `evaluatedAt`.

Se a composição puder ser feita sem romper clientes atuais, `gis.rankCandidates` permanece intacto e continua testado como serviço geográfico puro.

## Segurança e escopo

A nova procedure deve:

- exigir usuário autenticado e ativo;
- exigir permissão compatível com leitura/despacho de ocorrências;
- validar que as equipes candidatas estão dentro do escopo autorizado do usuário;
- nunca aceitar `userId` arbitrário do cliente como prova de associação à equipe;
- resolver associação de membros no servidor.

Nenhuma nova permissão é necessária inicialmente se as permissões existentes de despacho já cobrirem o fluxo. Caso surja necessidade real, uma nova permissão deve ser apenas catalogada, sem grants automáticos.

## Auditoria e explicabilidade

A D-007C não precisa criar uma nova tabela de auditoria na primeira versão.

Entretanto, o resultado da decisão deve ser determinístico e conter informação suficiente para que o despacho registre posteriormente:

- instante da avaliação;
- equipe candidata;
- membros avaliados;
- membros elegíveis;
- razões de descarte.

A UI poderá mostrar mensagens como:

- “Equipe Alfa não considerada: jornada não iniciada.”
- “Equipe Bravo não considerada: todos os integrantes disponíveis estão fora da escala.”

## Tratamento de falhas

### Falha do planejamento D-007B

Se houver erro técnico ao resolver planejamento de um usuário, não assumir elegibilidade silenciosamente. A equipe deve ser tratada de forma fail-closed para aquele membro e o erro deve ser propagado/registrado de forma observável.

### Falha do OSRM

Permanece a regra GIS existente: candidato elegível pode continuar no resultado por distância geodésica com `routeError` quando o OSRM falhar.

### Equipe sem membros

Equipe sem membros ativos é inelegível.

### Equipe com membros mistos

Se pelo menos um membro estiver elegível, a equipe permanece elegível; os demais motivos são preservados como contexto.

## Testes obrigatórios

A implementação deve seguir RED → GREEN → regressão.

Cenários mínimos:

1. equipe com um membro ativo em jornada → elegível;
2. equipe com um elegível e um pausado → elegível;
3. todos fora da escala → inelegível e nenhuma chamada ao OSRM;
4. dentro da escala, mas jornada não iniciada → `SHIFT_NOT_STARTED`;
5. jornada pausada → `SHIFT_PAUSED`;
6. jornada encerrada → `SHIFT_ENDED` ou fallback correspondente;
7. `day_off` → `DAY_OFF`;
8. `leave` → `LEAVE`;
9. `replacement_shift`/`extra_call` válida → elegível;
10. usuário sem D-007B, mas com sessão D-007A ativa → elegível por compatibilidade;
11. usuário sem D-007B e sem sessão ativa → `NO_ACTIVE_WORK_SHIFT`;
12. equipe sem membros ativos → inelegível;
13. equipe fora do escopo do ator → rejeição antes de GIS;
14. somente equipes elegíveis são passadas a `rankTeamCandidates`;
15. OSRM nunca é chamado para equipe inelegível;
16. falha de OSRM não reverte a elegibilidade já aprovada.

## Regressões obrigatórias

Ao final da D-007C devem permanecer verdes:

- segurança;
- TypeScript;
- suíte Vitest completa;
- build;
- testes D-007A/B;
- GIS visual homologation;
- NEO external compatibility;
- NEO workspace visual homologation.

## Fora de escopo

Não implementar nesta fase:

- folha de pagamento;
- eSocial;
- biometria;
- fechamento administrativo de ponto;
- relatórios/alertas administrativos completos da D-007D;
- otimização multiobjetivo avançada de despacho;
- redistribuição automática de equipe;
- IA de seleção de candidatos;
- novos épicos fora do fechamento da Release 1.0.

## Critério de aceite da D-007C

A D-007C será considerada concluída quando:

- a elegibilidade for resolvida antes do GIS/OSRM;
- equipes inelegíveis nunca forem roteadas;
- uma equipe for elegível com pelo menos um membro elegível;
- razões de inelegibilidade forem estruturadas e estáveis;
- compatibilidade D-007A sem escala D-007B estiver preservada;
- escopo/autorização forem validados server-side;
- testes obrigatórios estiverem verdes;
- os quatro gates finais estiverem verdes no mesmo SHA;
- existir checkpoint imutável próprio da D-007C;
- PR permanecer Draft, sem merge/deploy, até autorização explícita.

## Sequência de fechamento da Release 1.0

Após a D-007C, a prioridade permanece:

1. D-007D — administração/ajustes/relatórios/alertas essenciais de jornada;
2. fechamento de fluxos ponta a ponta do despacho;
3. regressão operacional e visual completa;
4. testes de carga e estabilidade do núcleo;
5. revisão final de segurança e configuração de produção;
6. instalação/implantação documentada;
7. checkpoint candidato a Release 1.0;
8. homologação final antes de qualquer merge/deploy.

Nenhum novo épico funcional deve interromper essa sequência, salvo correção crítica ou requisito bloqueador da própria Release 1.0.

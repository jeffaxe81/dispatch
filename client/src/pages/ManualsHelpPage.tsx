import DashboardLayout from "@/components/DashboardLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { BookOpenCheck, CarFront, CircleHelp, ClipboardCheck, ClipboardList, ExternalLink, FileText, KeyRound, LifeBuoy, Radio, Search, Send, ShieldCheck, Star, UsersRound, Workflow, Wrench, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

export const manualEntries = [
  {
    id: "integracoes",
    title: "Manual de Integrações & Workflows",
    badge: "Visão geral",
    icon: BookOpenCheck,
    description: "Entenda as áreas de Workflows, Execuções, Conexões, Webhooks, Credenciais, Logs e OpenAPI.",
    summary: "O módulo foi criado para modelar, validar e testar processos antes de qualquer integração produtiva.",
    steps: ["Defina o processo, os responsáveis e os campos que precisam ser tratados.", "Cadastre referências técnicas, modele o workflow e valide o grafo no editor visual.", "Publique somente após revisão e execute testes controlados na fila simulada.", "Revise etapas, logs sanitizados e a auditoria antes de propor integração real."],
    note: "Todas as áreas atuais permanecem em SIMULAÇÃO / MOCK: não há chamadas externas, webhooks publicados ou armazenamento de segredos.",
  },
  {
    id: "revisao-evento-externo",
    title: "Guia: Revisar evento externo e criar ocorrência",
    badge: "ALRT → AXE",
    icon: ClipboardCheck,
    description: "Configure a trilha homologada, confira a prévia e confirme a ocorrência somente após revisão humana autorizada.",
    summary: "O alerta autenticado forma uma prévia revisável; nenhuma equipe, viatura ou despacho é acionado automaticamente.",
    steps: ["Em Integrações > Conexões, confira a referência Despacho ALRT — Eventos em homologação e o receptor seguro configurado.", "No Workflow Builder, conecte Receber dados externos → Início da trilha → Criar ocorrência → Fim da trilha.", "No gatilho externo, use despacho_alrt, despacho-alrt-homologacao, alert.received e homologacao.", "No nó Criar ocorrência, selecione Exigir revisão antes de criar e mapeie categoria, prioridade, descrição, endereço, latitude e longitude para os tokens do alerta.", "Salve, valide, publique e ative a trilha; ela continua impedida de criar ocorrência automaticamente.", "Verifique Integrações > Logs e abra Integrações > Revisões externas para conferir a prévia pendente.", "Um usuário com occurrences.create confere os dados e usa Revisar e criar para criar a ocorrência com auditoria.", "Faça atribuição de equipe, viatura ou despacho somente depois, pelas telas e permissões operacionais próprias."],
    note: "A confirmação é explícita e auditável. Não compartilhe API keys, assinaturas HMAC ou payloads brutos durante a configuração ou o diagnóstico.",
  },
  {
    id: "triagem-critica",
    title: "Guia: Triagem de ocorrência crítica",
    badge: "Primeiro workflow",
    icon: Workflow,
    description: "Configure e valide o primeiro workflow de referência, com seis nós em sequência e teste controlado.",
    summary: "O fluxo descreve a intenção de reconhecer prioridade crítica, organizar dados, simular criação, despacho e aviso interno.",
    steps: ["Crie o rascunho Triagem de ocorrência crítica em Integrações > Workflows.", "Adicione Execução manual, Condição / IF, Transformar dados, Criar ocorrência, Simular despacho e Notificação simulada.", "Conecte os seis nós na ordem, salve, reabra o builder e confirme que as configurações foram preservadas.", "Publique em simulação, execute o caminho de sucesso e depois uma falha controlada para avaliar retry e dead-letter."],
    note: "A condição documenta e valida a regra, mas ainda não roteia dados reais; o executor atual registra etapas de forma determinística e simulada.",
  },
  {
    id: "ocorrencias",
    title: "Guia: Gestão de Ocorrências",
    badge: "Operação central",
    icon: ClipboardList,
    description: "Registre, localize, classifique, filtre, acompanhe e exporte a fila operacional com rastreabilidade.",
    summary: "Este guia orienta o ciclo inicial da ocorrência desde o registro qualificado até o acompanhamento do atendimento.",
    steps: ["Use Nova ocorrência e informe tipificação, prioridade, origem, endereço, coordenadas e descrição inicial; os dados obrigatórios iniciam a auditoria.", "Use Minha posição somente com consentimento para preencher latitude e longitude; confira endereço e referência antes de criar o registro.", "Filtre por código, tipificação, endereço, situação ou prioridade para localizar a fila relevante e abra a linha para acompanhar o detalhe.", "Acompanhe as transições autorizadas do ciclo de vida e a equipe vinculada; perfis de despacho, supervisão e administração podem exportar o recorte em CSV."],
    note: "A criação e as mudanças de ciclo são auditáveis. Registre informações objetivas, necessárias para o atendimento e compatíveis com o escopo operacional da equipe.",
  },
  {
    id: "aplicativo-agente",
    title: "Guia: Aplicativo Agente",
    badge: "Atendimento em campo",
    icon: Radio,
    description: "Receba o despacho, atualize o atendimento, compartilhe localização consentida e anexe evidências pelo celular ou desktop.",
    summary: "O Aplicativo Agente concentra as ações de campo para pessoas com perfil Agente de Campo, equipe vinculada e permissões efetivas.",
    steps: ["Confirme que sua conta está ativa, possui o perfil Agente de Campo, está vinculada a uma equipe e tem as permissões de visualizar e transicionar ocorrências.", "Quando receber um despacho, aceite-o para iniciar a operação ou recuse-o com o motivo adequado; novas atribuições são atualizadas na própria tela.", "Para iniciar, pausar, retomar ou concluir, escreva uma atualização operacional com pelo menos três caracteres antes de confirmar a mudança de situação.", "Compartilhe localização somente durante o atendimento ativo e com autorização do dispositivo; a posição é atualizada enquanto o aplicativo estiver aberto e a opção permanecer ligada.", "Em atendimentos aceitos, em andamento ou pausados, envie até 10 evidências por lote: JPEG, PNG, WEBP ou PDF de até 8 MB por arquivo."],
    note: "Cada anexo e transição é auditado. Não envie documentos sem relação com o atendimento e desligue a localização ao concluir ou interromper a atividade de campo.",
  },
  {
    id: "equipes",
    title: "Guia: Equipes",
    badge: "Recursos de campo",
    icon: UsersRound,
    description: "Cadastre equipes homologadas, acompanhe disponibilidade, jornada, viatura vinculada e última posição recebida.",
    summary: "A área de Equipes organiza os recursos humanos e operacionais que podem receber despachos dentro de seus escopos autorizados.",
    steps: ["Administradores com `teams.manage` devem cadastrar código, nome, órgão e, quando aplicável, organização e unidade da equipe.", "Confira a situação operacional antes de despachar: Disponível, Em deslocamento, Em atendimento, Pausada ou Indisponível.", "Vincule a equipe à viatura adequada e revise o cartão para confirmar jornada, última posição e disponibilidade esperada.", "No cartão da equipe, registre Iniciar, Pausar, Retomar e Encerrar. O agente de campo vinculado à própria equipe também pode operar esse ciclo conforme as permissões vigentes.", "Confira a situação da jornada, horário de início, pausas acumuladas e tempo líquido. Cada mudança é registrada no Log de operações.", "Mantenha os dados de escopo e disponibilidade atualizados, pois eles sustentam a leitura da central de despacho e o acesso do Agente de Campo."],
    note: "A jornada operacional não altera sozinha a situação de disponibilidade da equipe. Atualize a situação operacional separadamente quando houver um impedimento real de atendimento.",
  },
  {
    id: "viaturas",
    title: "Guia: Viaturas",
    badge: "Gestão de frota",
    icon: CarFront,
    description: "Cadastre a frota, associe viaturas às equipes e mantenha a situação operacional atualizada.",
    summary: "A área de Viaturas centraliza a identificação e a disponibilidade da frota vinculada ao atendimento das equipes.",
    steps: ["Acesse Viaturas com perfil administrativo; a gestão da frota é restrita a administradores para preservar a consistência do recurso operacional.", "Cadastre prefixo, placa, tipo e, se houver, modelo. Selecione uma equipe vinculada apenas quando o recurso estiver efetivamente alocado.", "Use as situações Operacional, Em manutenção ou Indisponível para retratar a condição real da viatura.", "Confira no cartão o prefixo, o tipo, a placa, o modelo e a equipe relacionada antes de alterar a situação.", "Mantenha a viatura em manutenção ou indisponível durante qualquer impedimento; só retorne a Operacional após a liberação responsável."],
    note: "O prefixo e a placa são identificadores únicos. Alterações de frota devem ser feitas por administrador autorizado e sempre refletir a disponibilidade real do veículo.",
  },
] as const;

// Mirrors DEFAULT_ACCESS_ROLES in server/accessCatalog.ts — kept in sync
// manually since the two run in different bundles. The permission catalog
// itself is not duplicated here: it's fetched live from
// trpc.help.permissionGlossary, since it can grow as custom permissions
// are added through Perfis e acessos.
export const defaultProfileEntries = [
  { code: "administrador", name: "Administrador", description: "Acesso completo à solução: usuários, perfis, configurações gerais, integrações e todos os recursos operacionais." },
  { code: "supervisor", name: "Supervisor", description: "Acompanha ocorrências, equipes e relatórios, com autoridade para intervir no atendimento e revisar a auditoria." },
  { code: "despachador", name: "Despachador", description: "Registra ocorrências e despacha equipes e viaturas para atendimento." },
  { code: "agente_campo", name: "Agente de Campo", description: "Atende, em campo, as ocorrências despachadas para a equipe vinculada." },
  { code: "agente_seguranca", name: "Agente de Segurança", description: "Acompanha ocorrências e a auditoria com foco em segurança operacional, sem despachar recursos." },
] as const;

export const faqEntries = [
  { id: "permissoes-workflow", question: "Não vejo os botões de criar, publicar ou executar um workflow.", answer: "O acesso é definido pelo perfil e pelas permissões efetivas. Solicite a revisão em Administração > Perfis e Permissões, considerando `workflow.create`, `workflow.edit`, `workflow.activate` ou `workflow.execute`, conforme a ação necessária." },
  { id: "simulacao-workflow", question: "Uma execução simulada modifica ocorrências ou envia mensagens?", answer: "Não. A execução registra etapas, logs e auditoria internos. Ela não cria ocorrência operacional, não atribui equipes ou viaturas e não transmite e-mail, webhook ou chamada HTTP a fornecedores." },
  { id: "dead-letter", question: "O que fazer quando uma execução chega a dead-letter?", answer: "Abra os detalhes, identifique o ponto que precisa ser ajustado no desenho do workflow e corrija-o antes de um novo reprocessamento autorizado. O histórico anterior permanece preservado para auditoria." },
  { id: "ocorrencia-coordenadas", question: "Quais dados são necessários para registrar uma ocorrência?", answer: "Informe tipificação, prioridade, origem, local, latitude, longitude e descrição inicial. Solicitante e contato podem complementar o registro quando disponíveis e pertinentes ao atendimento." },
  { id: "ocorrencia-exportacao", question: "Quem pode exportar a lista de ocorrências?", answer: "A exportação CSV é disponibilizada aos papéis operacionais de Despachador, Supervisor e Administrador. O arquivo respeita o recorte de busca e filtros selecionados." },
  { id: "agente-bloqueio", question: "Por que não consigo abrir o Aplicativo Agente?", answer: "Verifique se a conta está ativa, se o perfil é Agente de Campo, se há equipe vinculada e se as permissões `occurrences.view` e `occurrences.transition` foram concedidas no escopo correto. A tela informa qual requisito está ausente." },
  { id: "agente-localizacao", question: "Quando a localização do agente é compartilhada?", answer: "Somente quando existe atendimento ativo, o agente ativa a opção de compartilhamento e o navegador ou dispositivo concede permissão. O envio é interrompido ao desligar a opção ou fechar o aplicativo." },
  { id: "agente-evidencias", question: "Quais anexos posso enviar durante o atendimento?", answer: "Cada lote aceita até 10 arquivos JPEG, PNG, WEBP ou PDF, com até 8 MB por item. O sistema valida cada arquivo, informa o resultado individual e mantém a auditoria do envio." },
  { id: "equipes-situacao", question: "Quem pode alterar a situação e a jornada de uma equipe?", answer: "Usuários com `teams.manage` podem atualizar a situação e toda a jornada operacional. O Agente de Campo vinculado à própria equipe pode iniciar, pausar, retomar ou encerrar a jornada pelos controles disponíveis, respeitando o ciclo atual. A jornada não muda automaticamente a situação operacional da equipe." },
  { id: "viaturas-acesso", question: "Quem pode cadastrar ou mudar a situação de uma viatura?", answer: "A área de Viaturas é restrita a administradores. Eles podem cadastrar a frota, vincular equipe e alternar entre Operacional, Em manutenção e Indisponível." },
] as const;

export function normalizeHelpText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export function filterManualEntries(query: string) {
  const normalizedQuery = normalizeHelpText(query);
  if (!normalizedQuery) return manualEntries;
  return manualEntries.filter(manual => normalizeHelpText([manual.title, manual.badge, manual.description, manual.summary, ...manual.steps, manual.note].join(" ")).includes(normalizedQuery));
}

export function filterFaqEntries(query: string) {
  const normalizedQuery = normalizeHelpText(query);
  if (!normalizedQuery) return faqEntries;
  return faqEntries.filter(faq => normalizeHelpText(`${faq.question} ${faq.answer}`).includes(normalizedQuery));
}

function suggestionStatusLabel(status: string) {
  return ({ pendente: "Pendente", avaliada: "Em avaliação", publicada: "Publicada", recusada: "Não publicada" } as Record<string, string>)[status] ?? status;
}

function favoriteMetadata(contentType: "manual" | "faq", contentId: string) {
  if (contentType === "manual") {
    const manual = manualEntries.find(entry => entry.id === contentId);
    return manual ? { title: manual.title, kind: "Guia" } : null;
  }
  const faq = faqEntries.find(entry => entry.id === contentId);
  return faq ? { title: faq.question, kind: "FAQ" } : null;
}

export function ManualsHelpContent() {
  const [selectedManualId, setSelectedManualId] = useState<(typeof manualEntries)[number]["id"]>("integracoes");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestionQuestion, setSuggestionQuestion] = useState("");
  const [suggestionDetail, setSuggestionDetail] = useState("");
  const utils = trpc.useUtils();
  const favorites = trpc.help.favorites.list.useQuery(undefined, { retry: false });
  const suggestions = trpc.help.suggestions.listMine.useQuery(undefined, { retry: false });
  const permissionGlossary = trpc.help.permissionGlossary.useQuery(undefined, { retry: false });
  const addFavorite = trpc.help.favorites.add.useMutation({ onSuccess: () => { void utils.help.favorites.list.invalidate(); toast.success("Item adicionado aos favoritos."); }, onError: error => toast.error(error.message) });
  const removeFavorite = trpc.help.favorites.remove.useMutation({ onSuccess: () => { void utils.help.favorites.list.invalidate(); toast.success("Item removido dos favoritos."); }, onError: error => toast.error(error.message) });
  const createSuggestion = trpc.help.suggestions.create.useMutation({ onSuccess: () => { setSuggestionQuestion(""); setSuggestionDetail(""); void utils.help.suggestions.listMine.invalidate(); toast.success("Sugestão registrada para avaliação."); }, onError: error => toast.error(error.message) });
  const filteredManuals = useMemo(() => filterManualEntries(searchQuery), [searchQuery]);
  const filteredFaqs = useMemo(() => filterFaqEntries(searchQuery), [searchQuery]);
  const permissionsByResource = useMemo(() => (permissionGlossary.data ?? []).reduce<Record<string, NonNullable<typeof permissionGlossary.data>>>((groups, permission) => ({ ...groups, [permission.resource]: [...(groups[permission.resource] ?? []), permission] }), {}), [permissionGlossary.data]);
  const selectedManual = filteredManuals.find(manual => manual.id === selectedManualId) ?? filteredManuals[0];
  const SelectedIcon = selectedManual?.icon;
  const resultCount = filteredManuals.length + filteredFaqs.length;
  const favoriteKeys = new Set((favorites.data ?? []).map(favorite => `${favorite.contentType}:${favorite.contentId}`));
  const favoriteEntries = (favorites.data ?? []).flatMap(favorite => {
    const item = favoriteMetadata(favorite.contentType, favorite.contentId);
    return item ? [{ ...favorite, ...item }] : [];
  });
  const favoriteBusy = addFavorite.isPending || removeFavorite.isPending;

  const toggleFavorite = (contentType: "manual" | "faq", contentId: string) => {
    if (favoriteKeys.has(`${contentType}:${contentId}`)) removeFavorite.mutate({ contentType, contentId });
    else addFavorite.mutate({ contentType, contentId });
  };

  const renderFavoriteButton = (contentType: "manual" | "faq", contentId: string, label: string) => {
    const isFavorite = favoriteKeys.has(`${contentType}:${contentId}`);
    return <Button type="button" variant="ghost" size="icon" disabled={favoriteBusy} onClick={() => toggleFavorite(contentType, contentId)} className={`h-9 w-9 shrink-0 ${isFavorite ? "text-amber-600 hover:bg-amber-50 hover:text-amber-700" : "text-slate-400 hover:bg-sky-50 hover:text-sky-700"}`} aria-label={`${isFavorite ? "Remover" : "Adicionar"} ${label} ${isFavorite ? "dos" : "aos"} favoritos`} title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}><Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} /></Button>;
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-8">
      <header className="flex flex-col gap-5 rounded-2xl bg-[radial-gradient(circle_at_82%_6%,rgba(45,212,191,.25),transparent_30%),linear-gradient(112deg,#082f49,#0f766e)] px-6 py-7 text-white shadow-lg shadow-slate-900/10 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl"><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100"><LifeBuoy className="h-3.5 w-3.5" /> Base de conhecimento operacional</div><h1 className="mt-3 text-3xl font-semibold tracking-tight">Manuais e Ajuda</h1><p className="mt-2 text-sm leading-6 text-cyan-50/90">Encontre orientações práticas para operar o AXE Dispatch, registrar ocorrências, atuar em campo e gerenciar recursos operacionais.</p></div>
        <Badge className="w-fit border border-cyan-100/35 bg-white/10 px-3 py-1.5 text-cyan-50 hover:bg-white/10">{manualEntries.length} guias operacionais</Badge>
      </header>

      <Card className="border-sky-100 bg-sky-50/45 shadow-sm"><CardContent className="p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-950">Pesquisar na central de ajuda</h2><p className="mt-1 text-sm text-slate-600">Busque por assunto, ação, permissão, situação operacional ou tipo de anexo.</p></div><span aria-live="polite" className="text-xs font-medium text-sky-800">{resultCount} resultado(s) encontrado(s)</span></div><div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-sky-700" aria-hidden="true" /><Input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} className="h-10 border-sky-200 bg-white pl-9 pr-10 shadow-sm focus-visible:ring-sky-600" placeholder="Ex.: anexos, localização, prioridade, equipes ou viaturas" aria-label="Buscar tópicos nos manuais e dúvidas frequentes" />{searchQuery && <Button type="button" variant="ghost" size="icon" onClick={() => setSearchQuery("")} className="absolute right-1 top-1 h-8 w-8 text-slate-500 hover:bg-sky-50 hover:text-sky-800" aria-label="Limpar busca"><X className="h-4 w-4" /></Button>}</div></CardContent></Card>

      <Card className="border-amber-200 bg-amber-50/55 shadow-sm"><CardContent className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Star className="h-4 w-4 fill-amber-500 text-amber-500" /><div><h2 className="font-semibold text-amber-950">Meus favoritos</h2><p className="mt-1 text-sm text-amber-900/80">Salvos somente para sua conta, para acesso rápido aos assuntos mais consultados.</p></div></div><Badge variant="outline" className="border-amber-200 bg-white/60 text-amber-800">{favoriteEntries.length} salvo(s)</Badge></div>{favorites.isLoading ? <p className="mt-4 text-sm text-amber-900/70">Carregando favoritos...</p> : favoriteEntries.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">{favoriteEntries.map(item => <div key={item.id} className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white/70 px-3 py-2"><Badge variant="secondary" className="shrink-0 bg-amber-100 text-[10px] text-amber-900">{item.kind}</Badge><button type="button" onClick={() => { if (item.contentType === "manual") { setSelectedManualId(item.contentId as (typeof manualEntries)[number]["id"]); document.getElementById("leitura-guiada")?.scrollIntoView({ behavior: "smooth", block: "start" }); } else document.getElementById("duvidas-frequentes")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-amber-950 hover:underline">{item.title}</button>{renderFavoriteButton(item.contentType, item.contentId, item.title)}</div>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-amber-200 bg-white/55 p-4 text-sm text-amber-900/80">Use a estrela em um guia ou pergunta frequente para montar sua lista pessoal de acesso rápido.</p>}</CardContent></Card>

      <section aria-label="Manuais disponíveis" className="space-y-3"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-950">Guias operacionais</h2><p className="mt-1 text-sm text-slate-500">Selecione um guia para abrir seu roteiro resumido.</p></div>{searchQuery && <Badge variant="outline" className="border-slate-200 text-slate-600">Filtro ativo</Badge>}</div><div className="grid gap-4 lg:grid-cols-2">{filteredManuals.map(manual => { const Icon = manual.icon; const selected = manual.id === selectedManual?.id; return <div key={manual.id} className={`group flex rounded-2xl border p-5 text-left shadow-sm transition-all ${selected ? "border-sky-300 bg-sky-50/70 shadow-sky-900/5" : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/45"}`}><button type="button" onClick={() => setSelectedManualId(manual.id)} aria-pressed={selected} className="flex min-w-0 flex-1 items-start gap-4 text-left focus:outline-none"><span className={`rounded-xl p-3 ${selected ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-sky-100 group-hover:text-sky-700"}`}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-base text-slate-950">{manual.title}</strong><Badge variant="secondary" className="bg-slate-100 text-[10px] font-medium text-slate-600">{manual.badge}</Badge></span><span className="mt-2 block text-sm leading-6 text-slate-600">{manual.description}</span><span className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-sky-700">Ler orientação <ExternalLink className="h-3.5 w-3.5" /></span></span></button>{renderFavoriteButton("manual", manual.id, manual.title)}</div>; })}{!filteredManuals.length && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500 lg:col-span-2">Nenhum guia corresponde à busca. Tente palavras como “ocorrência”, “campo”, “evidências”, “equipe” ou “viatura”.</div>}</div></section>

      {selectedManual && SelectedIcon && <Card id="leitura-guiada" className="scroll-mt-20 border-slate-200 shadow-sm"><CardContent className="p-0"><div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><span className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><SelectedIcon className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-950">{selectedManual.title}</h2><Badge variant="outline" className="border-sky-200 text-sky-800">Leitura guiada</Badge></div><p className="mt-1 text-sm leading-6 text-slate-600">{selectedManual.summary}</p></div></div><div className="flex items-center gap-1">{renderFavoriteButton("manual", selectedManual.id, selectedManual.title)}<Button variant="outline" size="sm" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="w-fit gap-2"><FileText className="h-4 w-4" />Ver no topo</Button></div></div><ol className="grid gap-3 p-5 md:grid-cols-2">{selectedManual.steps.map((step, index) => <li key={step} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-sm leading-6 text-slate-700"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-sky-700 shadow-sm">{index + 1}</span><span>{step}</span></li>)}</ol><div className="mx-5 mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><p><strong>Atenção operacional.</strong> {selectedManual.note}</p></div></CardContent></Card>}

      <section id="privilegios-e-perfis" aria-label="Privilégios e perfis" className="scroll-mt-20 space-y-3">
        <div><h2 className="font-semibold text-slate-950">Privilégios e perfis</h2><p className="mt-1 text-sm text-slate-500">Os 5 perfis padrão do AXE Dispatch e o que cada privilégio libera. Perfis padrão são protegidos; administradores podem duplicá-los em Administração &gt; Perfis e Permissões para criar variações personalizadas.</p></div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">{defaultProfileEntries.map(profile => <Card key={profile.code} className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-sky-700" /><h3 className="text-sm font-semibold text-slate-950">{profile.name}</h3></div><p className="mt-2 text-xs leading-5 text-slate-600">{profile.description}</p></CardContent></Card>)}</div>
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-5">
          <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-sky-700" /><div><h3 className="font-semibold text-slate-950">Glossário de privilégios</h3><p className="mt-1 text-sm text-slate-500">O que cada permissão libera, agrupado por área do sistema.</p></div></div>
          {permissionGlossary.isLoading && <p className="mt-4 text-sm text-slate-500">Carregando privilégios...</p>}
          {!permissionGlossary.isLoading && !(permissionGlossary.data ?? []).length && <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Nenhum privilégio cadastrado ainda.</p>}
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Object.entries(permissionsByResource).map(([resource, resourcePermissions = []]) => <section key={resource} className="rounded-xl border border-slate-200 p-4"><h4 className="mb-3 text-xs font-semibold uppercase tracking-[.13em] text-slate-500">{resource}</h4><dl className="space-y-2.5">{resourcePermissions.map(permission => <div key={permission.code}><dt className="font-mono text-xs font-medium text-slate-800">{permission.code}</dt><dd className="mt-0.5 text-xs leading-5 text-slate-600">{permission.description}</dd></div>)}</dl></section>)}</div>
        </CardContent></Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"><Card id="duvidas-frequentes" className="scroll-mt-20 border-slate-200 shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-2"><CircleHelp className="h-4 w-4 text-sky-700" /><div><h2 className="font-semibold text-slate-950">Dúvidas Frequentes</h2><p className="mt-1 text-sm text-slate-500">Respostas rápidas para questões recorrentes da central e da equipe de campo.</p></div></div><Accordion type="single" collapsible className="mt-3">{filteredFaqs.map(faq => <AccordionItem key={faq.id} value={faq.id}><div className="flex items-center gap-1"><AccordionTrigger className="flex-1">{faq.question}</AccordionTrigger>{renderFavoriteButton("faq", faq.id, faq.question)}</div><AccordionContent>{faq.answer}</AccordionContent></AccordionItem>)}</Accordion>{!filteredFaqs.length && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma dúvida frequente corresponde à busca atual.</p>}</CardContent></Card><Card className="border-emerald-200 bg-emerald-50/60 shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-emerald-700" /><h2 className="font-semibold text-emerald-950">Antes de atuar</h2></div><p className="mt-3 text-sm leading-6 text-emerald-950/80">Confirme o perfil, o escopo da equipe e a situação operacional. Use somente dados relevantes ao atendimento, registre atualizações objetivas e revise a auditoria quando houver dúvida sobre uma ação realizada.</p></CardContent></Card></section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-2"><Send className="h-4 w-4 text-sky-700" /><div><h2 className="font-semibold text-slate-950">Sugerir uma pergunta para a FAQ</h2><p className="mt-1 text-sm text-slate-500">Sua sugestão fica registrada como pendente para avaliação administrativa; ela não é publicada automaticamente.</p></div></div><form className="mt-5 grid gap-4" onSubmit={event => { event.preventDefault(); createSuggestion.mutate({ question: suggestionQuestion, detail: suggestionDetail || undefined }); }}><div className="grid gap-2"><label htmlFor="faq-suggestion-question" className="text-sm font-medium text-slate-800">Qual dúvida a equipe precisa responder?</label><Input id="faq-suggestion-question" value={suggestionQuestion} onChange={event => setSuggestionQuestion(event.target.value)} minLength={10} maxLength={280} required placeholder="Ex.: Como registrar a troca de viatura durante o atendimento?" /></div><div className="grid gap-2"><label htmlFor="faq-suggestion-detail" className="text-sm font-medium text-slate-800">Contexto opcional</label><Textarea id="faq-suggestion-detail" value={suggestionDetail} onChange={event => setSuggestionDetail(event.target.value)} maxLength={2000} rows={3} placeholder="Explique em qual tela ou etapa essa dúvida aparece." /></div><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">Mínimo de 10 caracteres. A sugestão gera registro auditável.</span><Button type="submit" disabled={createSuggestion.isPending || suggestionQuestion.trim().length < 10}>{createSuggestion.isPending ? "Enviando..." : "Enviar sugestão"}</Button></div>{createSuggestion.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{createSuggestion.error.message}</p>}</form></CardContent></Card><Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold text-slate-950">Minhas sugestões</h2><p className="mt-1 text-sm text-slate-500">Acompanhe as sugestões enviadas por sua conta.</p></div><Badge variant="outline" className="border-slate-200 text-slate-600">{suggestions.data?.length ?? 0}</Badge></div><div className="mt-4 space-y-2">{suggestions.isLoading && <p className="text-sm text-slate-500">Carregando sugestões...</p>}{(suggestions.data ?? []).slice(0, 5).map(suggestion => <div key={suggestion.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium leading-5 text-slate-800">{suggestion.question}</p><Badge variant="secondary" className="shrink-0 bg-slate-100 text-[10px] text-slate-600">{suggestionStatusLabel(suggestion.status)}</Badge></div>{suggestion.detail && <p className="mt-1.5 text-xs leading-5 text-slate-500">{suggestion.detail}</p>}</div>)}{!suggestions.isLoading && !(suggestions.data ?? []).length && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Ainda não há sugestões enviadas por sua conta.</p>}</div></CardContent></Card></section>
    </div>
  );
}

export default function ManualsHelpPage() { return <DashboardLayout><ManualsHelpContent /></DashboardLayout>; }

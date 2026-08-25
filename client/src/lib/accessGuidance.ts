export type AccessGuidance = {
  title: string;
  explanation: string;
  steps: string[];
};

export function getAccessGuidance(message?: string): AccessGuidance | null {
  if (!message) return null;
  const normalized = message.toLowerCase();
  if (normalized.includes("perfis padrão não permitem")) return { title: "Perfil padrão protegido", explanation: "Os perfis fornecidos pelo sistema preservam a matriz de permissões para manter o funcionamento e a segurança da operação.", steps: ["Crie uma cópia do perfil padrão usando o botão Duplicar.", "Atribua um código e nome próprios ao novo perfil local.", "Edite somente a cópia e depois vincule usuários a ela."] };
  if (normalized.includes("escopo informado")) return { title: "Escopo incompatível com o perfil", explanation: "O perfil exige um nível mínimo de escopo para que a autorização possa ser aplicada corretamente.", steps: ["Verifique o escopo padrão exibido no perfil selecionado.", "Para Organização, selecione uma organização; para Unidade, informe organização e unidade; para Equipe, selecione a equipe.", "Salve o vínculo novamente após completar os campos exigidos."] };
  if (normalized.includes("já existe uma permissão")) return { title: "Permissão local duplicada", explanation: "Cada código de permissão é único e deve representar uma ação específica da operação.", steps: ["Pesquise o código informado na lista de permissões.", "Reutilize a permissão existente se ela atender à necessidade.", "Caso seja uma ação nova, escolha outro recurso.ação, por exemplo relatorios.aprovar."] };
  if (normalized.includes("já existe um perfil")) return { title: "Perfil local duplicado", explanation: "Cada código de perfil identifica uma política de acesso exclusiva dentro da organização.", steps: ["Localize o perfil com este código na lista de perfis.", "Atualize ou duplique o perfil existente se ele for semelhante.", "Para uma política nova, informe um código local diferente, como coordenador_regional."] };
  if (normalized.includes("código da permissão")) return { title: "Código de permissão inválido", explanation: "Uma permissão local precisa seguir o padrão recurso.ação para ser identificável na matriz de acesso.", steps: ["Use somente letras minúsculas, números e sublinhado em cada parte.", "Separe recurso e ação com um único ponto, como viaturas.exportar.", "Preencha os campos Recurso e Ação com os mesmos valores usados no código."] };
  if (normalized.includes("permissão insuficiente")) return { title: "Permissão administrativa necessária", explanation: "Seu perfil atual não pode alterar a matriz de acessos.", steps: ["Solicite um perfil com a permissão roles.create ou roles.edit.", "Aguarde a vinculação ser aplicada por um administrador autorizado.", "Atualize a página e tente novamente."] };
  return { title: "Configuração não concluída", explanation: "A regra de segurança impediu a alteração para preservar a consistência dos acessos.", steps: ["Revise os campos preenchidos e a descrição do perfil.", "Verifique se o perfil ou a permissão já existem.", "Caso o problema continue, envie a mensagem apresentada a um Super Administrador."] };
}

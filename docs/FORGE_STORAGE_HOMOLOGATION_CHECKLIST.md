# AXE Despacho — aceite do storage Forge (homologação, sem produção)

**Status:** pendente de ambiente real de homologação do provedor. Os testes
atuais do PR #248 usam HTTP real contra um serviço **local descartável**,
não o Forge real. Não registrar senhas, tokens, URLs assinadas ou chaves de
objetos em issues, pull requests, prints, logs de CI ou planilhas.

## Condições de entrada

- Ambiente do provedor explicitamente classificado como **homologação**, sem
  objetos de clientes nem acesso operacional a produção.
- Identidade do projeto/tenant de testes e política de retenção aprovadas.
- Credenciais curtas e exclusivas de homologação disponibilizadas por canal
  seguro (secret manager), nunca em commit, shell history ou conversa.
- Revisão de permissões do usuário de serviço: apenas bucket/prefixo de teste,
  sem capacidade de remover objetos fora do escopo de teste.
- Arquivos gerados apenas para o ensaio, sem informação pessoal.

## Matriz de aceite

| ID | Verificação | Critério de aceite |
|---|---|---|
| FST-01 | `GET /v1/storage/presign/put` | A API aceita chave efêmera de teste e exige autenticação |
| FST-02 | `PUT` via URL assinada | Bytes reais do PDF descartável persistem com Content-Type correto |
| FST-03 | `GET /v1/storage/presign/get` | A API assina somente o objeto autorizado, sem expor a credencial de serviço |
| FST-04 | `GET` via URL assinada | Bytes retornados correspondem ao conteúdo enviado (hash SHA-256 local) |
| FST-05 | Sem autenticação | API de assinatura nega solicitação; proxy da aplicação responde 401 |
| FST-06 | Sem vínculo de evidência no banco | Proxy privado não assina nem redireciona um objeto órfão, mesmo existente |
| FST-07 | Sessão revogada ou equipe sem escopo | Proxy privado nega a operação antes de assinar URL de leitura |
| FST-08 | Objeto inexistente | Confirmar a semântica real (404 ou assinatura seguida de 404); não inferir existência pelo presign |
| FST-09 | Expiração, redirecionamento, logs e cache | Validar TTL da URL, origem HTTPS, ausência de vazamento de token e Cache-Control no proxy |
| FST-10 | Falha antes/depois do PUT | Reserva continua rastreável no MySQL e nenhum evento de evidência é publicado após falha |
| FST-11 | Retenção e LGPD | Confirmar prazos, política de backup, bloqueios de expurgo e auditoria aplicáveis |
| FST-12 | Exclusão física auditada | **NÃO EXECUTAR** antes de obter documentação oficial do endpoint/método, idempotência, escopo, permissões e aprovação de segurança |

## Evidências a registrar

Documentar, sem valores sensíveis: versão do provedor, identificador do
ambiente, data, código HTTP e tempo de cada operação, hash do arquivo
sintético, resultado de revogação/escopo, IDs internos de execução, decisão
do responsável de segurança e link para CI com dados filtrados.

## Bloqueios de liberação

1. Não ativar exclusão física automática ou manual pelo aplicativo enquanto
   FST-12 não tiver contrato documentado e homologação específica.
2. Não promover o PR #248 para produção sem migração `0026` ensaiada com
   backup, plano de reautenticação, monitoramento, rollback e revisão de
   acesso.
3. Não usar este roteiro para listar, ler ou excluir arquivos de clientes no
   ambiente operacional.
4. Um teste local verde não substitui as evidências de homologação real.

**Saída esperada:** aceite técnico assinado por responsável do ambiente e
responsável de segurança, com todos os itens aplicáveis comprovados.

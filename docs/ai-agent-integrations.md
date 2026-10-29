# Conectar agentes ao Study/OS

O servidor MCP do Study/OS só funciona enquanto o aplicativo desktop estiver aberto e escuta em `127.0.0.1:48731` por padrão. Cada cliente usa um token próprio; o banco guarda somente o hash. O token é mostrado uma vez ao gerá-lo.

## Configuração

1. Abra **Configurações → Integrações de IA** e ative o acesso MCP local.
2. Escolha Codex, Claude Code ou Antigravity e gere um token para esse cliente.
3. Copie o bloco de configuração mostrado pelo app para o arquivo MCP do cliente. Ele contém o endereço e o cabeçalho `Authorization: Bearer …`.
4. Reinicie ou reconecte o cliente. Instale também a skill `agent-skill/study-os/SKILL.md` se quiser orientações de fluxo; as ferramentas funcionam sem ela.
5. Revogue tokens individualmente na mesma tela. Desativar o MCP revoga todos os tokens.

## Arquivos locais usuais

Use a configuração gerada pelo Study/OS, pois os locais e formatos podem variar por versão do cliente.

- **Codex:** seção `mcp_servers.study_os` em `~/.codex/config.toml`.
- **Claude Code:** use `claude mcp add --transport http study_os http://127.0.0.1:48731/mcp` e configure o cabeçalho de autorização no cliente, ou adicione o bloco `mcpServers.study_os` ao arquivo de configuração suportado pela instalação.
- **Antigravity:** adicione o bloco `mcpServers.study_os` ao arquivo de configuração MCP indicado pela interface do Antigravity.

O bloco copiado pelo app é a fonte de verdade para o formato. Não compartilhe esse bloco: ele contém uma credencial local com permissão para editar dados de estudo.

## Skill

Copie `agent-skill/study-os/SKILL.md` para a pasta de skills do cliente (ou do projeto aberto no cliente) e reinicie/recarregue as instruções. A skill faz o agente pesquisar primeiro, evitar duplicatas, organizar etapas e justificar relações; ela não é necessária para chamar as ferramentas.

## Ferramentas

O servidor oferece busca, criação atômica de trilhas com etapas/tarefas/mapa, criação de mapas, conexões direcionadas, notas e pedidos de exclusão. Pedidos de exclusão ficam pendentes para aprovação no app. A porta pode ser configurada em **Integrações de IA**; se estiver ocupada, altere-a e tente novamente.

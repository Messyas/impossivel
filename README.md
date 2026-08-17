# impossivel - Aplicação Tauri + React + TypeScript

Este projeto é uma aplicação desktop desenvolvida utilizando **[Tauri v2](https://tauri.app/)**, **[React 19](https://react.dev/)**, **[TypeScript](https://www.typescriptlang.org/)** e **[Vite](https://vitejs.dev/)**.

---

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter os seguintes componentes instalados no seu ambiente de desenvolvimento:

1. **Node.js** (versão 18.x ou superior)
   - Baixe em: [nodejs.org](https://nodejs.org/)
   - Gerenciador de pacotes: `npm` (incluído no Node), `pnpm`, `yarn` ou `bun`.

2. **Rust**
   - Instale via **rustup**: [rustup.rs](https://rustup.rs/)
   - Verifique a instalação rodando no terminal: `rustc --version` e `cargo --version`.

3. **Dependências do Sistema para Tauri v2**
   - **Windows**:
     - Visual Studio C++ Build Tools (marcar a carga de trabalho *"Desenvolvimento para Desktop com C++"* durante a instalação).
     - [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (já incluso por padrão no Windows 10 e 11).
   - **macOS**:
     - Xcode Command Line Tools: `xcode-select --install`
   - **Linux**:
     - Pacotes de desenvolvimento do WebKitGTK e utilitários de build da sua distribuição (consulte os [Pré-requisitos do Tauri](https://v2.tauri.app/start/prerequisites/)).

---

## 🚀 Passo a Passo para Executar

### 1. Clonar / Acessar a pasta do Projeto

Acesse a pasta raiz do projeto no seu terminal:

```bash
cd impossivel
```

### 2. Instalar as Dependências

Instale os pacotes do frontend e do Tauri CLI:

```bash
npm install
```

*(Se estiver usando outro gerenciador de pacotes, pode executar `pnpm install`, `yarn install` ou `bun install`).*

### 3. Rodar em Modo de Desenvolvimento

Para iniciar o servidor frontend e abrir a aplicação desktop Tauri com suporte a Hot Reload:

```bash
npm run tauri dev
```

> **Nota:** Na primeira vez que você executar este comando, o Rust/Cargo fará o download e a compilação de todos os crates/dependências. Esse processo inicial pode levar alguns minutos.

---

## 📦 Compilar para Produção (Build)

Para gerar os arquivos executáveis e o instalador final do aplicativo:

```bash
npm run tauri build
```

Após o término da compilação, o instalador e o executável estarão disponíveis na pasta:
```
src-tauri/target/release/bundle/
```

---

## 📜 Scripts Disponíveis

No arquivo `package.json`, estão disponíveis os seguintes comandos:

| Comando | Descrição |
| :--- | :--- |
| `npm run tauri dev` | Inicia o servidor Vite e abre o app Tauri em modo de desenvolvimento. |
| `npm run tauri build` | Compila o projeto em Rust e gera o instalador/executável final. |
| `npm run dev` | Roda apenas a interface web (Vite) no navegador local. |
| `npm run build` | Compila o TypeScript e faz a build de produção dos arquivos estáticos da web. |
| `npm run preview` | Executa a pré-visualização local da build de produção do frontend. |

---

## 📁 Estrutura do Projeto

```text
impossivel/
├── src/                  # Interface do usuário (React 19 + TypeScript)
│   ├── assets/           # Imagens e recursos estáticos do React
│   ├── App.tsx           # Componente principal
│   ├── App.css           # Estilos CSS do aplicativo
│   └── main.tsx          # Ponto de entrada da aplicação React
├── src-tauri/            # Código Backend em Rust e configurações do Tauri
│   ├── src/              # Código fonte em Rust (main.rs, lib.rs)
│   ├── capabilities/     # Configuração de permissões e capacidades do app
│   ├── icons/            # Ícones do aplicativo para cada sistema
│   ├── Cargo.toml        # Dependências Rust do projeto
│   └── tauri.conf.json   # Configuração do aplicativo Tauri v2
├── public/               # Arquivos estáticos globais
├── package.json          # Dependências JavaScript/TypeScript e scripts
└── vite.config.ts        # Configurações do Vite
```

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Tauri v2, Rust
- **Estilização**: CSS3

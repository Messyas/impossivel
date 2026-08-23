# Benchmark de desempenho

O benchmark mede a aplicação de produção no Windows, sem ferramentas de desenvolvimento abertas. Ele inicia o executável, espera a primeira janela, acompanha o processo Tauri e seus processos filhos (incluindo o WebView) e salva os resultados.

## Executar

Primeiro gere uma versão de produção:

```powershell
npm run tauri:build
```

Em seguida, execute a coleta de dois minutos:

```powershell
npm run benchmark -- -DurationSeconds 120
```

O script encontra automaticamente o `.exe` mais recente em `backend/target/release`. Caso queira medir outro executável, informe o caminho:

```powershell
npm run benchmark -- -AppPath ".\backend\target\release\impossivel.exe" -DurationSeconds 120
```

Durante a coleta, navegue pelos fluxos que deseja comparar: To Do, Roadmaps, Contas, tabelas longas, gráficos e foco. Para deixar a aplicação aberta ao término, acrescente `-KeepOpen`.

## Resultados

Cada execução cria uma pasta em `artifacts/benchmarks/<data-hora>/` com:

- `summary.json`: tempo até a janela aparecer e médias/picos de CPU, memória privada e memória em uso.
- `samples.csv`: amostras por intervalo, úteis para abrir no Excel e visualizar crescimento de memória ou picos.

O percentual de CPU é normalizado pela quantidade de processadores lógicos: 100% significa que todos os núcleos lógicos foram utilizados durante a amostra.

## Cenários recomendados

Rode cada cenário ao menos três vezes, com os mesmos dados, e compare a mediana dos valores:

1. **Inicialização e repouso:** não interaja durante 60 segundos. Estabelece a linha de base.
2. **Navegação:** alterne entre todas as telas por dois minutos. Observa renderizações e descarregamento de telas.
3. **Listas grandes:** com centenas ou milhares de tarefas/contas, pagine, filtre e abra os menus de ações.
4. **Foco:** inicie, pause e retome uma sessão; mantenha a tela aberta por alguns minutos. A memória deve estabilizar após as animações.

Um aumento contínuo de memória privada após repetir o mesmo fluxo é um sinal para investigar vazamento. Picos curtos de CPU enquanto uma tela abre são normais; uso alto sustentado em repouso não é.

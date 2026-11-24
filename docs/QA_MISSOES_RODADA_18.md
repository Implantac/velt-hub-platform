# QA — Missões confiáveis, rodada 18

## Escopo e autorização

Desenvolvimento **local, não publicado**, escolhido em `velt_proxima_prioridade_18=desenvolvimento`. Base publicada17 `703f93ce5fe0afc93666a0a6cd8b5ed2c42ffa92`; checkout novo `velt-development-18`, conferido contra619 hashes da entrega publicada. O checkout antigo/dirty não foi resetado nem alterado. Referência de data desta conversa: 12/11/2026, America/Sao_Paulo; timestamps de sistema/provedor não substituem essa referência.

Nenhum push, commit de publicação, deploy, conector de banco, migration, variável remota ou credencial foi utilizado para executar esta rodada. O ambiente remoto permanece separado desta entrega. Não se adotaram laboratório10, fork, waiver, auditoria desativada ou aceite de risco.

## Contratos e comportamento

### Leitura

- GET autenticado exige membership com owner/admin/editor/viewer antes de consultar missões, com cliente do chamador; RLS não foi ampliada.
- Página de20, filtro `all` ou um dos quatro estados, total exato com o mesmo escopo/filtro; prioridade desc, criação desc e ID desc. ID elimina empates, não cria snapshot transacional entre páginas.
- Null, contagem ausente/incoerente, IDs repetidos, status/escopo incompatíveis e resposta malformada são erro, não zero. Schema validado no handler e novamente no cliente para a página solicitada.
- Offset desaparecido `PGRST103` só pode virar página fora da faixa após outro HEAD exato do mesmo filtro confirmar que o offset não tem mais registros; falha no count ou quantidade incompatível propaga erro. Outras falhas não entram nesse fallback.
- Página fora da faixa é diferente de workspace vazio e oferece volta explícita à primeira. Em erro de página posterior há a mesma saída. Voltar a uma página já visitada relê os dados; não apresenta cache antigo como confirmação suficiente para escrever.
- Contagens das quatro colunas pertencem somente à página atual. O total não é inferido da lista truncada. Navegação limitada a100.000 páginas, com aviso explícito e total preservado; use filtros para reduzir o conjunto.

### Escrita

- Criação: trim no título2–160 e descrição até2000, prioridade inteira0–10, estado inicial pendente e ator autenticado. Recibo completo obrigatório, incluindo workspace/título/descrição/prioridade/estado/ator; só então limpar o rascunho correspondente.
- Evento `MissionAssigned` é secundário. Falha/ausência/recibo inválido do evento não desfaz nem oculta a missão confirmada; retorna `eventRecorded:false` e não repete o insert. Não foi acrescentada uma trilha completa de auditoria para cada mudança de estado.
- Status: owner/admin/editor, ID/workspace/estado anterior e timestamp com a precisão original. O update só afeta a versão lida, retorna a linha e confere estado/escopo. Zero linhas ou conflito não retornam falso `ok:true`.
- O controle otimista é uma condição **desta API**. Não é migration, política de coluna, regra obrigatória para qualquer escrita REST direta ou garantia de exactly-once entre processos.
- Não há retry automático de POST, confirmação otimista fictícia ou geração de IA. Trava síncrona local cobre dois cliques antes do rerender.
- Resultado incerto mantém rascunho, bloqueia novas gravações e exige GET bem-sucedido mais checkbox/ação explícita de conferência. Releitura não prova que a ação falhou. Liberar ações não repete a anterior; uma criação deliberada nova pode duplicar missão.
- Recibo confirmado seguido de falha de GET continua sendo gravação confirmada. Limpa apenas o rascunho confirmado, mantém dados anteriores com aviso e pede retry de leitura, não de gravação.

### Contexto e experiência

- Página montada por usuário/workspace após membership reconhecida. Cache inclui usuário/workspace/filtro/página; formulário e feedback são locais à montagem, sem persistir rascunhos em storage.
- Respostas tardias não limpam novo formulário, exibem feedback antigo ou disparam outra consulta com identidade diferente. Invalidação de missões/dashboard fica no escopo e usa `refetchType:none`; Brain, provedores e IA não são acionados.
- Viewer sem formulário/ações; papel desconhecido ou falha de membership oculta dados, inclusive cache existente. Isso não é prova de revisão completa de revogação/segurança do produto.
- Quatro estados visíveis, inclusive dispensadas; podem voltar a pendente por escolha explícita. Concluída/dispensada são registros manuais, não execução ou resultado comprovado.
- PT/EN, radios e selects nativos, campos rotulados, alvos44px, quebra de texto longo e datas `America/Sao_Paulo`. Prazos já salvos são exibidos; esta rodada não acrescenta editor de prazo. Valores históricos de texto/prioridade são apresentados sem reescrever o banco.

## Evidências locais finais

| Gate                          | Resultado                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Node                          | 22.13.0                                                                             |
| Instalação                    | npm ci com lock intacto                                                             |
| Typecheck                     | PASS — 27.27s                                                                       |
| Lint                          | PASS — 18.02s                                                                       |
| Testes                        | **2.278/103 arquivos**, zero falhas — 29.93s                                        |
| Testes novos                  | **211 em quatro arquivos**                                                          |
| Build                         | Preset Vercel, PASS — 54s                                                           |
| Auditoria pública de produção | Exit0, zero achados reportados; lock intacto                                        |
| Navegador compilado           | **36 checks / 24 análises Axe**, zero violações detectadas nos estados selecionados |
| HTTP local anônimo            | **14 HTML / 25 assets**, zero erros                                                 |

O sandbox2GB usou heap local1536MB e swap temporário1536MB somente no build; o script removeu o swap ao terminar, sem alterar o build versionado de4GB.

Testes novos por arquivo:

- `src/features/missions/__tests__/missions-markup.test.ts`: **40**.
- `src/features/missions/__tests__/presentation.test.ts`: **32**.
- `src/lib/api/__tests__/missions-handlers.test.ts`: **75**.
- `src/lib/missions/__tests__/contracts.test.ts`: **64**.

### Método do navegador

Aplicação e SDK reais do build Vercel local, com Auth/RPC sintéticos interceptados por Playwright **somente no harness externo ao produto**. PT/EN ×320/1280; navegador em Asia/Tokyo para conferir datas São Paulo. Cobertura de leitura, criação, status, dispensadas, erros, cache, recuperação, double click, retorno tardio, viewer, membership desconhecida e paginação1205/20.

Os **16 POSTs de missões** foram interceptados, sem escrita remota. Foram interceptados36 reports CSP do cenário sintético; isso não equivale a certificar CSP limpa em produção. Não houve pageError, RPC inesperada, mutação inesperada ou tentativa HTTP externa inesperada. WebSockets foram fechados pelo harness; fetch do servidor foi negado e registrou zero tentativas. Esses guards não são um firewall para transportes arbitrários.

Axe cobre apenas24 estados selecionados, não certificação WCAG, teste manual completo de leitor de tela ou homologação real de Auth/RLS/Postgres/SMTP/IA/provedores. Shell HTML privado200 não é execução autenticada.

### Diagnósticos preservados

A primeira suíte focada teve duas expectativas sensíveis à ordem dos atributos HTML de um radio. Corrigiu-se o matcher para conferir os mesmos atributos independentemente da ordem, sem afrouxar o estado esperado; evidências em `history/initial-focused-tests`.

Após os primeiros gates completos, revisão da navegação identificou necessidade de reler uma página visitada depois de mudanças concorrentes. Ajustou-se `staleTime:0`, validou-se no build/navegador e reexecutaram-se os gates completos sobre os hashes finais. Evidências anteriores em `history/pre-pagination-refresh-fix` não são os resultados finais.

O Chromium inicialmente exigiu bibliotecas do sistema (`libnspr4`); as dependências do navegador foram instaladas no sandbox, sem alterar dependências ou lock do projeto.

## Limites e operação

Auditoria pública explícita `npm audit --omit=dev --audit-level=moderate --registry=https://registry.npmjs.org --json`: zero achados reportados, lock SHA256 `82539eb958951d9aed7233a40ac81b3a86091b5cb72ae874dcbe0d7cfa8e264a`. É uma observação do feed, **não prova de patch técnico para a pendência anterior**. Revisão de dependências e homologação real continuam abertas; sem liberação comercial irrestrita.

A publicação17 foi concluída antes desta rodada e seu CI aprovou aplicação/auditoria. Não há CI remoto ou deploy18: esses resultados não são inferidos dos testes locais. O pacote/patch18 destina-se a uma futura integração específica e autorizada sobre703f93c.

Os recibos, hashes, patch e capturas ficam fora do produto em `velt-qa/rodada-18`; o relatório de entrega registra a limpeza e a verificação do pacote. O `.env` local não é exportado; seu hash é preservado para confirmar que não mudou.

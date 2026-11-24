# VELT

**Um sistema operacional para a presença digital de quem está começando.**

VELT organiza os canais e o conteúdo de um pequeno negócio, oferece agendamento e adaptadores de publicação/coleta — e transforma os dados disponíveis em decisão: _onde eu estou, onde quero chegar, o que me impede, qual a próxima ação, vale mudar de direção?_ As operações externas dependem de configuração, autorização e homologação por provedor; a finalidade de portfólio não permite sucesso simulado.

O diferencial não é ser mais um agendador de posts. É ser a camada de **julgamento**: o produto audita cada publicação antes dela ir ao ar, aprende com o histórico da própria conta e mantém memória das decisões tomadas.

---

## Estado atual, sem marketing

### Integração GitHub25 — melhorias completas até a rodada24

Este conjunto reúne o desenvolvimento18–24 sobre a base publicada registrada703f93c, para integração na branch `main` de `Implantac/velt-hub-platform` e consumo pelo projeto Lovable conectado a ela. Dashboard/Brain15–16 já pertencem à base; não é apenas um laboratório ou patch parcial.

As seções18–24 abaixo registram **validações locais históricas antes desta integração**; seus avisos de “não publicado” descrevem aqueles encerramentos. Esta documentação não confirma sincronização/publicação no Lovable, resultado de CI/deploy ou disponibilidade de serviços reais: confira o commit e os checks correspondentes no GitHub e o estado no Lovable.

Inclui Missões, Saúde/Score, Coach, Navigator, Aprendizado, Skill Map e integração Skills do Brain Lab. Código da24 preservado: **4.056 testes/136arquivos**,88checks/64Axe locais sintéticos e28HTML/25assets no encerramento24, não homologação real. Auditoria geral ainda tem **sete moderados dev**; produção observada0 não encerra a manutenção. Dependências/locks/CI/ambiente/migrations não foram alterados nesta integração. [Escopo e operação](./docs/INTEGRACAO_GITHUB_RODADA_25.md).

### Evolução local 24 — Habilidades do Brain Lab integradas ao mapa (histórico)

Entrega acumulada18–24 **local, não publicada**. Skills do Brain Lab agora usa a mesma superfície, API nativa e estado pessoal por conta+workspace do Mapa de Habilidades, sem segundo formulário/escritor legado na UI conhecida. Links/abas/histórico preservam draft/recibo/trava neste runtime e revogam consentimento ao remontar; incerto continua exigindo GET+humano/descarte sem replay. Nota0–100 por teclado, base/recibo/CAS, ausência distinta de0/domínio e metadados não verificados preservados.

Deep-link `/app/brain-lab?tab=skills` não monta Twin; tablist manual com setas/Home/End para foco e Enter/Espaço para ativar. H1/h2/h3/IDs por contexto e15folhas novas PT/EN; demais conteúdos dos seis painéis não foram traduzidos/corrigidos. API legada Skills ainda existe no servidor, não foi corrigida/retirada; só o consumidor conhecido migrou.

**QA24:4.056 testes/136arquivos (206novos),88checks/64Axe,28HTML/25assets**, typecheck/lint/build aprovados,628src conferidos.39POSTs Skills e7GETs Twin de browser sintéticos, não homologação real ou certificação WCAG. Auditoria geral continua **sete moderados dev**, produção observada0, lock/CI iguais e sem waiver/aceite. Nenhum conector/push/deploy/banco remoto. [Método e limites](./docs/QA_BRAIN_LAB_SKILLS_RODADA_24.md).

### Evolução local23 — Skill Map com reavaliação explícita (histórico)

Entrega acumulada18–23 **local, não publicada**. Skill Map agora separa edição, revisão e consentimento; aceita nota inteira0–100 por teclado, trata ausência como “sem avaliação” e atualiza a mesma área por versão/recibo em vez de novo INSERT cego. Registro é pessoal por conta+workspace, inclusive viewer próprio. Metadados legados são preservados como não verificados; não é certificação/IA/resultado de negócio.

Draft/recibo temporários e trava por contexto, guard de identidade e resposta tardia sem alterar nova escolha; incerteza exige leitura+humano sem replay. API nativa dedicada, sem modificar os handlers/painel legado Brain Lab, migrations ou dependências. **QA23:3.850 testes/132 arquivos (390 novos),53 checks/31 Axe e26 HTML/25 assets**, typecheck/lint/build finais PASS; Auth/RPC de navegador sintéticos, não homologação real ou certificação WCAG. Auditoria geral continua **sete moderados dev**, produção observada0, sem waiver/aceite e lock/CI intactos. [Método e limites](./docs/QA_SKILL_MAP_RODADA_23.md).

### Evolução local22 — Trilhas de Aprendizado (histórico)

Entrega acumulada18–22 **local, não publicada**. Catálogo paginado e progresso pessoal por conta, revisão/consentimento, marcação explícita/versionada e recibo integral. Preserva IDs legados e mostra percentual manual sem certificar aprendizado ou resultados. Trava/intenção temporárias no remount; conta esperada verificada antes do RPC e no servidor; incerteza exige leitura e humano, sem replay. Nenhum curso/IA, migration ou dependência adicionados.

QA22: **3.460 testes/126 arquivos (286 novos),48 verificações/34 Axe e24 HTML/25 assets**, typecheck/lint/build locais aprovados. Auth/RPC de navegador sintéticos; não homologam serviços reais ou WCAG. Auditoria geral permanece **sete moderados dev**, produção observada zero, lock/CI intactos e sem aceite de risco. [Contratos, evidências e limites](./docs/QA_APRENDIZADO_RODADA_22.md).

### Evolução local21 — Navigator pessoal (histórico)

A entrega acumulada18–21 está validada **localmente, sem nova publicação**. Última publicação registrada17/base703f93c, não reconferida nesta rodada. Navigator agora tem primeiro uso navegável, revisão com respostas preenchidas, cache/draft por conta, gravação condicionada à versão e recibo completo, sem completar onboarding ocultamente. Roteiro geral por regras, não diagnóstico de crescimento ou IA. PT/EN, teclado,320/1280px e datas São Paulo.

QA21: **3.174 testes/120 arquivos (311 novos)**, typecheck/lint/build aprovados; **38 verificações/25 Axe** e **22 HTML/25 assets** locais. Auth/RPC do navegador são sintéticos, não homologação real ou certificação WCAG. Auditoria geral **não limpa: sete pacotes moderados dev numa cadeia minimatch**; produção observada zero, lock intacto. Sem fork/waiver/mudança de CI/aceite de risco. [Método, contratos, pendências e limites](./docs/QA_NAVIGATOR_RODADA_21.md).

A tabela e evidências antigas abaixo são contexto histórico por domínio; não significam nova homologação nesta rodada nem liberação comercial.

| Área                                | Situação neste estágio                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Publicação web e Supabase exclusivo | Portfólio funcional, em validação; não é liberação comercial                                                          |
| Autenticação, workspace e navegação | Bootstrap e cache por usuário; regressões de login/recarga/recuperação incluídas                                      |
| Perfil e equipe                     | Nome carregado/validado, save confirmado, rascunho preservado e consulta de membros sob RLS                           |
| Conteúdo                            | Criar/editar texto e URLs de mídia com persistência confirmada; salvar não publica; sem upload/carrossel              |
| Agendamento                         | Enqueue/cancelamento atômicos, checkpoints/reconciliação duráveis e revisão auditada sem reenvio                      |
| Interface e idioma                  | Fluxo principal pt-BR/en-US; tradução avançada ainda parcial                                                          |
| USE Brain                           | Regras determinísticas por padrão; não é IA generativa nem pesquisa de mercado ao vivo                                |
| Oportunidades globais               | Catálogo demonstrativo identificado na interface                                                                      |
| Publicadores sociais                | Código implementado para algumas plataformas; requer credenciais, aprovações e homologação real                       |
| Métricas e cron                     | Observação/data atômicas com recibo, merge diário e resultado parcial explícito; coleta externa exige homologação     |
| OAuth e Google Business             | Tentativas single-use, refresh versionado/lease e primeiro vínculo de unidade explícito; homologação externa pendente |
| RLS/RBAC                            | 133 novos checks reais OAuth/rollback e concorrência entre processos; rodadas anteriores históricas; não é pentest    |
| IA, Google login e SMTP             | Dependem de configuração/validação; Google login não é exibido sem opt-in                                             |
| Commerce Hub / RAG                  | Não implementados; não prometer como recursos disponíveis                                                             |

Veja [portfólio e checklist para clientes](./docs/PORTFOLIO_E_CLIENTES.md) para escopo e pendências. A [rodada 4 de reconciliação](./docs/QA_RECONCILIACAO_RODADA_4.md) registra 978 testes/61 arquivos, 87 novos checks SQL reais, 25 checks HTTP de reconciliação, 22 de regressão funcional e 22 de navegador, com 11 análises Axe sem violações detectadas. As cinco suítes SQL locais somaram 203 checks em uma execução focada PGlite. Os 116 checks SQL reais da [rodada 3](./docs/QA_FUNCIONAL_RODADA_3.md) são históricos, não um novo run remoto. São camadas de evidência diferentes; nenhuma equivale a homologação externa.

A [rodada 5 de credenciais OAuth](./docs/QA_OAUTH_RODADA_5.md) passou em **1.138 testes/66 arquivos**, **336 checks SQL locais/8 suítes**, **133 novos checks Supabase com rollback**, 25 checks runtime/12 interleavings, três disputas simultâneas entre processos e 12 checks de navegador/12 análises Axe sem violações detectadas. Tentativas single-use, refresh versionado e vínculo GBP explícito estão descritos no [manual operacional](./docs/CICLO_CREDENCIAIS_OAUTH.md). Auth/RLS e persistência são reais; respostas de provedor são sintéticas somente no harness externo. Fixtures removidas, nenhuma conexão/publicação social real. SHA/CI/deploy/smoke remotos continuam sendo evidência operacional separada.

A [rodada 6 de observações analíticas](./docs/QA_ANALYTICS_RODADA_6.md) passou em **1.242 testes/71 arquivos**, **424 checks SQL locais/9 suítes**, **87 novos checks PostgreSQL remotos/rollback**, 20 checks runtime/11 interleavings e 14 checks de navegador/12 análises Axe sem violações detectadas. Oito processos gravando a primeira observação e quatro atualizando a mesma linha preservaram unicidade e máximos. Snapshot/data são uma transação, recibos desconhecidos não geram retry e o resultado fica isolado por workspace. [Contrato e operação](./docs/OBSERVACOES_ANALITICAS.md). Providers são sintéticos somente no harness; homologação e publicação remota não são inferidas desses resultados.

A honestidade é um requisito de produto: a tela de Agendamento distingue configuração presente de conexão autorizada. A API exige pré-voo e conexão/token para enfileirar, mas isso não comprova validade atual do grant, aprovação do app ou visibilidade da publicação. Erros e resultados sem confirmação não são apresentados como sucesso.

---

## Começando

```bash
git clone https://github.com/Implantac/velt-hub-platform.git
cd velt-hub-platform
cp .env.example .env.local # preencha localmente; nunca versione segredos
npm ci
npm run dev               # http://localhost:8080
```

A base publicada registrada continha `.env` de configuração pública por compatibilidade com Vite. **A entrega local24 omite `.env` e credenciais**; configure seu próprio `.env.local` autorizado a partir do exemplo. A chave publishable/anon é pública por desenho e sujeita às políticas RLS; isso não autoriza expor chaves de servidor nem dispensa revisão do ambiente.

Nunca coloque segredos nesse arquivo: use apenas variáveis protegidas no ambiente
do servidor/deploy para service role, OAuth, IA, worker local e cron. `npm run
build` executa `scripts/check-env.mjs`, que bloqueia chaves Supabase privilegiadas
e nomes conhecidos de segredos de servidor em arquivos de ambiente versionados.
Esse guard é limitado a credenciais e nomes conhecidos; ainda recomendamos adicionar um scanner genérico de segredos ao CI.

### Segredos dos endpoints de cron

`POST /api/public/cron/scheduler-tick` e `POST /api/public/cron/analytics-sync`
aceitam **somente** `x-cron-secret`; uma chave publishable/anon nunca autentica
cron. Gere um valor aleatório com pelo menos 32 caracteres (por exemplo,
`openssl rand -hex 32`) e configure o mesmo valor como `CRON_SECRET` no ambiente
protegido do servidor e como segredo `velt_cron_secret` no Supabase Vault. Os dois
jobs em operação consultam o Vault pelo nome ao executar. Não inclua o valor em
SQL versionado, `.env`, `VITE_*` ou comandos compartilhados.

O projeto atual não usa `ALTER DATABASE` para configurar cron: essa operação foi
recusada no plano/conexão disponíveis. A migration antiga com `app.settings` é
histórica; não a reaplique sobre o agendamento do Vault. Consulte
[as notas de operação](./docs/PORTFOLIO_E_CLIENTES.md#banco-e-automações-existentes)
antes de instalar um ambiente novo.

Idiomas: **pt-BR** (padrão e língua de autoria) e **en-US**. O seletor mostra
apenas os que têm tradução — listar um idioma sem arquivo de tradução faz a
interface cair no inglês sem avisar. Para adicionar outro: um JSON em
`src/lib/i18n/locales/` e uma linha em `SUPPORTED_LANGUAGES`.

Requisitos: **Node 22 LTS, >=22.13 e <23**, alinhado com `.nvmrc`. O build usa heap de até 4 GB; prefira uma máquina com memória suficiente. Outras majors não foram homologadas nesta rodada.

### Scripts

```bash
npm run dev         # servidor de desenvolvimento
npm run build       # build de produção
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # vitest
npm run test:e2e    # login real + links/refresh/axe; exige VELT_QA_* no ambiente
npm run verify      # typecheck + lint + test + build
```

O [plano de melhorias e correções](./PLANO_MELHORIAS.md) registra o que já foi
aplicado e o que ainda depende de configuração de infraestrutura.

---

## Como o sistema pensa

```
Camada 1 — Interface (22 telas)
        │  pergunta ao Brain, nunca calcula sozinha
        ▼
Camada 2 — USE Brain (orquestrador)
        │  snapshot · ask · recommend · remember · timeline
        ▼
   6 engines puras: user · business · market · growth · opportunity · trust
        │
        ▼
Camada 3 — Memória (brain_memory_events · brain_snapshots · brain_answers)
```

E, em paralelo, o **motor de crescimento**, que é determinístico e roda em milissegundos:

| Módulo                     | O que faz                                                                                                  | Onde          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| `growth/platform-rules.ts` | Fonte única de verdade dos limites por plataforma: legenda, hashtags, mídia, proporção, janelas de horário | 8 plataformas |
| `growth/post-quality.ts`   | Pré-voo (bloqueadores/avisos), análise de gancho, prontidão para anúncio, reescritas sugeridas             | puro, testado |
| `growth/scheduling.ts`     | Melhor horário por engajamento **medido da própria conta**, com decaimento por espera e fallback honesto   | puro, testado |

### O loop fechado

```
conecta ──> pré-voo ──> agenda ──> publica na API real (5 redes + Google Business)
                                        │
                     memória <── Brain <── métricas medidas
```

O elo de medição (`lib/analytics/`) roda a cada 6h via pg_cron e sob demanda
("Medir agora"). Sem ele, o melhor horário ficaria em baseline para sempre e o
Brain não veria tendência nenhuma — foi o primeiro item do roadmap por isso.

### Por que "decay por espera" importa

Um algoritmo ingênuo responde "publique quinta às 19h" mesmo quando hoje é sexta e existe um horário razoável amanhã. O usuário ignora — e com razão. O motor multiplica a qualidade do slot por `0.92^dias_de_espera`, então uma janela só vale a pena se for realmente melhor. A recomendação sempre declara a fonte: `observed` (seus dados) ou `baseline` (padrão da plataforma).

---

## Pré-voo de conteúdo

Toda publicação passa por uma auditoria antes de entrar na fila:

- **Bloqueadores** (a publicação falharia na API): legenda acima do limite, mídia obrigatória ausente, título longo, plataforma sem publisher.
- **Avisos** (perde alcance): hashtags fora da faixa ideal, link em plataforma que não aceita link, gancho fraco ou longo demais.
- **Dicas**: parede de texto, emoji em excesso, "você sabia que…".

Cada achado traz **por que** e **como corrigir**. Nada é um número solto.

---

## Publicação

`src/lib/scheduler/publishers/` implementa as APIs reais:

- **Instagram** — container → status → publish → confirmação da mídia. Container pronto/publicado sem ID da mídia não é tratado como post público confirmado.
- **Facebook Page** — photo / video / feed por tipo de mídia.
- **YouTube** — sessão de upload resumível, com baixa do asset, guarda de tamanho e conferência de canal/processamento/visibilidade pública.
- **LinkedIn** — Posts API versionada (`LinkedIn-Version`), upload de imagem incluso. Confirmar pelo GET pode exigir permissão restrita além da escrita; sua ausência exige revisão, não reenvio.
- **TikTok** — Content Posting API em Direct Post, somente com `TIKTOK_DIRECT_POST=true` e app autorizada. Inbox não conta como publicação; conclusão exige status e ID público confirmado. IDs int64 não perdem precisão. Upload atual de chunk único até 64 MiB, não multipart completo.
- **Google Business Profile** — API v4 `localPosts`, com unidade explicitamente escolhida e estado atual Voice of Merchant. `summary` obrigatório, CTA opcional; `CALL` omite URL, `OFFER`/`EVENT` exigem calendário. Aceitação/processamento não equivale a publicação visível. Uma imagem HTTPS por post; as exigências adicionais do Google continuam sujeitas à homologação.

Camada de suporte:

- **Refresh de token em tempo de execução** (`oauth/refresh.server.ts`). Um post agendado para três semanas à frente quase nunca tem token válido na hora de publicar. Estratégia por provedor: `refresh_token` grant (Google, LinkedIn, TikTok) e troca por long-lived token (Meta).
- **Pré-checagem de mídia** (`scheduler/media.ts`): HTTPS público, formato identificável, vídeo onde só cabe imagem.
- **Erros normalizados** em `retryable` — o que não pode ser corrigido por retentativa vai direto para a dead letter queue, com motivo legível.

O contrato de resultados não usa ID gerado localmente como prova de publicação. Checkpoints tipados e tokens de execução protegem o limite de escrita. A reconciliação durável consulta a referência original com lease/backoff, sem outro create/upload/publish; resultado incerto sem referência segura exige revisão de owner/admin. Encerrar é decisão auditada, não prova de sucesso ou ausência, e não reenvia. Apenas tentativas comprovadamente anteriores ao envio/recusas explícitas seguem retry seguro. Consulte o [manual de recuperação](./docs/RECONCILIACAO_PUBLICACOES.md) antes de agir em um resultado incerto. Meta usa Graph `v24.0` por padrão, alterável por configuração; não é uma declaração de versão mais recente.

Para desenvolvimento explicitamente simulado (nunca na produção deste portfólio):

```bash
VELT_PUBLISHER_MODE=simulate npm run dev   # nada é publicado; logs deixam isso óbvio
```

---

## Link na bio

A única superfície anônima do produto — e por isso a que exige mais cuidado.

```
/bio/{slug}        página pública (SSR, indexável)
/bio/click/{id}    302 + registro do clique
/app/bio           editor (slug, tema, links, publicar)
```

Três decisões que parecem detalhe e não são:

1. **`anon` não tem `SELECT` nas tabelas `bio_*`.** Sem sessão não existe policy
   possível. A leitura é server-side com service-role, filtrando
   `is_published = true` no mesmo `where`. Um rascunho não é "escondido no
   front": ele não sai do banco.
2. **O destino do clique vem do banco por `id`, nunca da query string.** Aceitar
   o alvo como parâmetro tornaria `/bio/click/{id}?to=...` um open redirect
   assinado pelo nosso domínio. O endpoint responde `no-store` (um 302 em cache
   suprimiria todos os cliques seguintes) e `Referrer-Policy: no-referrer`.
3. **Contadores são SQL, não JS.** `view_count = view_count + 1` lido e reescrito
   em JavaScript perde eventos sob concorrência — e a página com pico é
   justamente a que precisa do número certo.

Privacidade: `bio_link_clicks` guarda **só o host** do referrer e a **família**
do device. Nem URL completa, nem user agent, nem IP.

---

## Coach de reescrita com IA

O diagnóstico é determinístico de propósito: roda em cada tecla, custa zero,
nunca inventa e pode ser testado. A IA entra depois, com uma permissão estreita —
propor uma frase melhor na voz daquele negócio.

**A regra: a IA sugere, o motor decide.** Toda proposta volta para o motor puro
antes de aparecer:

| Verificação              | Reprovado se                                 |
| ------------------------ | -------------------------------------------- |
| O problema citado sumiu? | o texto ainda abre com "Oi gente"            |
| Apareceu blocker novo?   | passou do limite de caracteres da plataforma |
| O score caiu?            | qualquer queda, mesmo de 1 ponto             |

Sugestão reprovada é descartada, não exibida com ressalva. O modelo também nunca
escreve o número do score — ele não é juiz do próprio trabalho.

Sem `LOVABLE_API_KEY` o painel não quebra: mostra o diagnóstico determinístico
completo e diz que a camada de IA está desligada.

---

## Trust OS: confiança com fonte verificável

Antes: o usuário descrevia o alvo, um modelo devolvia um score de risco. O
modelo só podia repetir o que o usuário já cria — e não tem como saber se um
CNPJ existe.

Agora:

| Fonte                                 | O que responde                                               | Chave   |
| ------------------------------------- | ------------------------------------------------------------ | ------- |
| [BrasilAPI](https://brasilapi.com.br) | Situação cadastral, data de abertura, porte, sócios, capital | Nenhuma |
| [RDAP](https://rdap.org)              | Registro e vencimento do domínio (Registro.br para `.br`)    | Nenhuma |

O score é determinístico e cada sinal carrega a evidência e a fonte. O dossiê
inclui o link para refazer a consulta.

**A distinção que sustenta o produto:** fonte fora do ar produz `insufficient`,
nunca `low`. "Não consegui verificar" e "verifiquei e é ruim" são respostas
diferentes, e a segunda acusa alguém. Um único risco duro (CNPJ baixado, domínio
vencido) derruba o veredito: bons sinais não fazem média com empresa fechada.

O que só uma pessoa pode checar continua explícito: **nenhum registro público diz
qual CNPJ opera qual site.** O produto pede essa conferência em vez de fingir
que fez.

---

## Relatório semanal

`GET /api/reports/weekly?workspaceId=…&format=pdf|csv`, com o Bearer token do
usuário. Nada é armazenado: os bytes existem durante a requisição.

A comparação é o ponto. Sete dias contra os sete anteriores, com a variação ao
lado de cada número. Semanas sem base de comparação mostram "novo" em vez de uma
porcentagem infinita, e uma semana sem atividade diz isso — não desenha um
gráfico vazio.

Os totais usam a última observação cumulativa por publicação externa × canal na janela, sem somar releituras; registros legados conservam fallback por conteúdo/canal. No dia UTC, novos contadores são máximos observados, com snapshot/data confirmados atomicamente. A comparação semanal não mede apenas interações ocorridas naquela semana e o alcance agregado não representa pessoas únicas entre canais. A metodologia acompanha os arquivos; veja [o contrato de coleta](./docs/OBSERVACOES_ANALITICAS.md).

O PDF é gerado por `pdf-lib` com fontes padrão (Helvetica cobre todo o pt-BR em
WinAnsi, verificado) e sem imagens externas: renderiza igual num servidor sem
rede e sem bucket. O CSV traz os mesmos números, para quem quiser conferir a
conta em vez de confiar no documento.

**Envio automático por e-mail não existe.** O card na tela diz isso. Depende de um
provedor transacional que ainda não está configurado.

### Feature flags

`src/lib/features/flags.ts`. Desligadas por padrão; só `"true"` liga.

| Flag                 | O que controla                                          | Estado                         |
| -------------------- | ------------------------------------------------------- | ------------------------------ |
| `VITE_FLAG_COMMERCE` | Commerce Hub (fornecedores, dropshipping, marketplaces) | **off** — nenhum módulo existe |

São flags de **build**: um módulo desligado não vai para o bundle do cliente e
sua rota responde como inexistente. A alternativa — flag de runtime por tenant —
seria melhor para liberar cedo, e pior para o que importa aqui: manter um módulo
desligado ainda custa caro em toda mudança futura. Ligar exige um deploy, e é
assim que deve ser enquanto o produto não existe.

---

## Segurança de dependências

Verificação local em 11/11/2026: `npm audit --omit=dev` encontrou **0 vulnerabilidades
em dependências de produção**; a auditoria completa encontrou 7 moderadas em
ferramentas de desenvolvimento (TypeScript ESLint/minimatch), sem alta ou crítica.
O resultado muda com o lockfile; reexecute a auditoria no CI em cada atualização.

Duas regras que o processo mostrou valerem a pena:

1. **Corrigir na versão que não force migração.** O patch do XSS existia em duas
   linhas: uma pedia `vite >= 8`. Subir o bundler num patch de segurança
   transforma uma correção de 20 minutos numa migração de build.
2. **Versões fixas onde o ecossistema exige.** `@tanstack/react-start` e
   `@tanstack/react-router` estão **fixados** (`1.168.60` / `1.170.41`), sem
   `^`: o `react-start` depende de uma versão exata do `react-router`, e um patch
   a mais cria dois `router-core` na árvore — o que quebra a tipagem de
   `server.handlers` em todas as rotas.

O lint isenta os arquivos **gerados** (`src/integrations/supabase/types.ts`,
`previewAuthStorage.ts`): eles são reescritos pelo gerador e reportavam 2.007
erros de formatação que ninguém pode corrigir à mão.

---

## Testes

```bash
npm run test
```

**1.242 testes em 71 arquivos** na rodada 6, cobrindo limites de plataforma, agendamento, permissões, métricas cumulativas/recibos, mídia, Brain, OAuth, relatórios, transporte HTTP e contratos de publicação. Parte usa mocks. As nove suítes SQL locais focadas passaram em 424 checks; 87 novos checks foram executados também no PostgreSQL remoto com rollback. Runtime compilado com Auth/RLS reais: 20 checks/11 interleavings; navegador: 14 checks e 12 análises Axe sem violações detectadas. Consulte [método, evidências e limites](./docs/QA_ANALYTICS_RODADA_6.md); são camadas diferentes e não substituem homologação externa, instalação limpa do histórico ou pentest.

---

## Arquitetura de código

```
src/
├── routes/                 TanStack Start (file-based); 24 rotas autenticadas
├── features/<dominio>/     components · hooks · constants por domínio (22)
├── lib/
│   ├── api/                server functions (auth + Zod)
│   ├── brain/              orquestrador + 6 engines puras
│   ├── growth/             motor de crescimento (puro + testado)
│   ├── scheduler/          dispatcher, publishers, mídia, contratos
│   ├── oauth/              providers, crypto, state, store, refresh
│   ├── bio/                validação pura · temas · leitura pública server-side
│   ├── analytics/          normalize · insights · sync (cron)
│   └── i18n/               pt-BR · en-US
└── components/             ui/ (shadcn) + app/
supabase/migrations/        17 migrations — schema, RLS, enums, RPCs, cron
```

Convenções que não devem ser quebradas:

1. **`*.server.ts`** = código que nunca pode vazar para o client (bundler recusa).
2. **Server functions**: sempre `requireSupabaseAuth` + validação Zod.
3. **Regras de plataforma** só em `growth/platform-rules.ts`. Nunca duplicar listas.
4. **Motores puros** não importam Supabase — recebem contexto, devolvem relatório. É o que os torna testáveis.

---

## Segurança

- RLS habilitada em todas as tabelas, escopo por workspace; eventos pessoais do Brain restritos ao próprio `user_id`.
- Tokens OAuth cifrados em repouso (AES-256-GCM, `OAUTH_TOKEN_ENC_KEY`).
- State de OAuth assinado por HMAC; cron autenticado exclusivamente por segredo dedicado, não pela chave publicável.
- `.env` versionado por compatibilidade deve conter só configuração pública; o guard bloqueia service-role e nomes conhecidos de segredos do servidor.
- Downloads server-side de mídia recusam hostnames locais/IP literais, redirecionamentos e corpos acima dos limites configurados. A defesa contra DNS rebinding depende também de regras de egress da infraestrutura.

---

## Débito conhecido

Rastreado, não escondido:

- ~110 `any` em fronteiras de dados (majoritariamente `brain/` e `dashboard/`). Tipagem progressiva planejada.
- Sem migrations para pgvector; a memória do Brain é textual.
- Métricas do TikTok ausentes: exige o escopo `video.list`, aprovado à parte.
- Posts do Google Business expiram em ~7 dias: a UI avisa, mas ainda não há
  lembrete automático de renovação.
- Commerce Hub sem implementação.
- Sem E2E (Playwright) — os testes cobrem lógica pura, não fluxo de UI.
- `/bio/{slug}` responde 200 quando o banco está inacessível (marcado `noindex`,
  com tela própria). O router não permite definir status por `throw new
Response` nem no `beforeLoad`; corrigir exigiria uma rota de servidor crua.

---

Construído sobre TanStack Start, React 19, Tailwind 4, Supabase e Lovable.

# VELT — portfólio agora, clientes depois

Atualizado em 12/11/2026. Este documento descreve o código, não certifica integrações externas nem substitui uma homologação de produção.

## Primeira rodada de melhorias (histórico; alterações posteriores abaixo)

- **Estado de workspace compartilhado:** `useSyncExternalStore`, persistência com tolerância a storage bloqueado, sincronização entre abas e validação da seleção contra memberships.
- **Sessão e links internos:** a área privada usa `ssr: false`, pois a sessão atual vive no navegador. Páginas públicas continuam com SSR. RPCs mantêm autenticação Bearer no servidor e RLS. Login preserva somente destinos internos `/app/*`, incluindo query e fragmento.
- **Logout:** remove a seleção e o cache privado. As consultas de perfil e memberships incluem o ID do usuário.
- **Primeiro uso:** painel de tarefas e progresso; a visão avançada permanece disponível, recolhida.
- **Onboarding:** criar workspace ou fechar o assistente não grava conclusão. Somente a ação final conclui; a marca criada atualiza o progresso do painel.
- **Conteúdo no celular:** formulário de rascunho primeiro, campos rotulados, salvar sem publicar, Studio opcional recolhido.
- **Estados honestos:** no aplicativo e na API editorial, mudanças manuais só aceitam rascunho/arquivado. Agendamento e publicação pertencem ao fluxo de entrega. Isso não é uma política de coluna do Postgres: acesso direto ao banco e permissões REST ainda precisam de revisão completa antes de clientes.
- **Idioma e acessibilidade:** fluxo principal de marcas/canais/conteúdo/agendamento traduzido em pt-BR/en-US, nomes acessíveis e correção dos contrastes reproduzidos. Outros módulos avançados ainda têm textos fixos.
- **Exemplos:** catálogo global de oportunidades identificado como demonstrativo; compatibilidade não é pesquisa de mercado ao vivo.
- **Metadados:** títulos próprios por módulo usando o helper compartilhado.
- **Configuração:** referências públicas do Supabase atualizadas, migration RLS já aplicada incorporada ao repositório, Node 22 LTS e heap de build de 4 GB.

## Segunda rodada de melhorias (histórico; agregação substituída na rodada 3)

- **Perfil confiável:** consulta compartilhada com chave por usuário, nome carregado no formulário, validação de 1 a 80 caracteres após trim e gravação confirmada pela linha retornada. Cabeçalho e cache recebem a confirmação do servidor; falhas preservam o rascunho.
- **Recuperação sem desmontagem:** uma falha de refresh de perfil/workspaces com dados válidos em cache não desmonta a área privada. O formulário informa a falha e permite nova tentativa sem sobrescrever a edição.
- **Equipe e privacidade:** correção do join PostgREST que não existia no schema. Membros e perfis são lidos separadamente com o cliente autenticado do chamador, sem service role, migration ou ampliação de RLS. Quando outro perfil não está visível, a interface explica a restrição e mostra um identificador abreviado; papéis são traduzidos. A tela é de consulta, não de convites ou administração de permissões.
- **Celular e idioma:** abas de Configurações em duas colunas em telas pequenas, alvos de 44 px e traduções pt-BR/en-US de perfil/equipe/análises.
- **Análises honestas:** erro do resumo e erro dos requisitos de coleta têm estados/retries próprios. Leituras de readiness verificam membership e propagam erros de canais, contagens e snapshots em vez de inventar zeros.
- **Capacidade não é homologação:** a lista de coletores vem do código implementado (Instagram, Facebook, YouTube e LinkedIn). TikTok e Google Business não são marcados como capazes de insights nesta versão. Um coletor implementado não comprova credencial válida nem aprovação do provedor; publicações `sim_` não contam como efetivas nos requisitos.
- **Snapshots e acessibilidade:** o indicador passa a se chamar coletas/snapshots, com ressalva de que somar coletas cumulativas pode repetir valores. Não houve deduplicação da agregação. Período usa radios nativos; tabelas equivalentes aos gráficos permitem leitura sem depender do desenho. Datas de coleta preservam o dia UTC e números seguem o idioma.
- **Relatórios:** PDF/CSV autenticados verificam status HTTP, MIME esperado, corpo não vazio e timeout de 30 segundos antes de iniciar o download. Arquivos permanecem em português; nenhum envio automático por e-mail é prometido.

A validação local desta rodada passou em typecheck, lint, 444 testes/43 arquivos, auditoria de dependências de produção e build Vercel. No artefato compilado local, 19 verificações de navegador e 9 estados com Axe passaram. Foram usados usuários/workspaces descartáveis com limpeza verificada; nenhum canal foi conectado e nenhum conteúdo foi publicado. As verificações selecionadas de isolamento não equivalem à revisão completa de RBAC/RLS. Consulte [o registro de QA da rodada 2](./QA_PORTFOLIO_RODADA_2.md) para método e limitações. O sucesso local não comprova publicação remota nem aprovação do CI remoto.

## Terceira rodada: integridade funcional

A finalidade de portfólio não reduz o requisito de persistência, permissões e operações verdadeiras. Esta rodada corrige o fluxo editorial e o agendamento, protege estados de entrega/owner/plano também no banco e amplia a validação com Auth/RLS reais.

- **Conteúdo e fila:** editor persistente de texto/mídia por URL, agendamento futuro para 1–20 canais e cancelamento atômico. Conteúdo/canal com jobs ativos protegidos. Alterações relacionadas invalidam os caches necessários; troca de workspace não carrega o rascunho nem os privilégios anteriores.
- **Papéis:** editor pode criar marca e editar conteúdo/Bio/agendamento, mas não gerenciar canais, excluir marca nem executar a fila. Viewer só consulta. API e banco impõem os limites; a conta master continua sendo owner do workspace, não superusuário do banco.
- **Falhas honestas:** erros HTTP não serializados não viram sucesso vazio; rejeições desconhecidas recebem mensagem legível. Formulários preservam valores para recuperação. Resultados sem confirmação/referências de tracking não são “publicado”.
- **OAuth/Bio:** state assinado e vinculado ao navegador, callback atômico com rechecagem de permissões, desconexão removendo ciphertext; links de contato validados e ordenação atômica. Não houve conexão social real.
- **Analytics/relatórios:** a ressalva da rodada 2 foi substituída por agregação da **última coleta por conteúdo × canal no período**. Coletas repetidas não são somadas; continuam cumulativas, não incrementos semanais/diários nem alcance de pessoas únicas.
- **Validação:** typecheck/lint/build, 712 testes/56 arquivos, 116 checks SQL no schema instalado, 22 checks HTTP autenticados e 31 de navegador. Os 16 estados selecionados de Axe terminaram sem violações detectadas. Fixtures removidas e fingerprints do workspace/membership reais preservados. Não é declaração de “100% funcional” nem homologação de provedores.

Detalhes históricos, sete migrations da rodada 3, método de isolamento e limites em [QA_FUNCIONAL_RODADA_3.md](./QA_FUNCIONAL_RODADA_3.md). A lacuna de mecanismo durável foi trabalhada na rodada 4 abaixo; homologação real continua pendente e não se deve reenviar sem verificar o provedor.

## Quarta rodada: reconciliação durável, sem falso publicado

- **Checkpoints e fencing:** limite de escrita aguardado no banco; execução/conta/referência upstream separados do post confirmado. Recuperação não reutiliza o token de uma tentativa comprovadamente não iniciada.
- **Consulta sem reenvio:** o ciclo consulta a referência original com lease, backoff e limites. Processamento/erro de leitura/referência incerta não viram sucesso nem outra publicação. Após limites, revisão owner/admin.
- **Intervenção auditada:** encerrar revisão exige nota e confirmação. Registra decisão/ator sem certificar publicação ou ausência e sem reenviar; novo agendamento é ação separada, com aviso de possível duplicidade.
- **Interface e proteção:** estados/filtros/referências/diálogo pt-BR/en-US, cooldowns e permissões; conteúdo/canal/identidade incertos protegidos contra alterações destrutivas ou reagendamento incompatível.
- **Validação selecionada:** 978 testes/61 arquivos, 87 novos checks SQL reais/rollback, 203 locais PGlite em cinco suítes, 25 checks HTTP de reconciliação + 22 de regressão, 22 de navegador e 11 análises Axe sem violações detectadas. Os 116 checks SQL reais da rodada 3 não foram reexecutados remotamente.
- **Isolamento:** Auth/RLS/persistência reais com fixtures removidas; respostas positivas de provedor somente em transporte sintético fora do app, sem conta/conexão/publicação externa real. Não é homologação de provedores nem liberação comercial.

Consulte [evidências e limites](./QA_RECONCILIACAO_RODADA_4.md) e [manual de recuperação](./RECONCILIACAO_PUBLICACOES.md). O resultado não é uma promessa de exactly-once em serviços externos ou de ausência de bugs. A finalidade de portfólio não permite operação vazia, falso sucesso ou mock em produção.

## Quinta rodada: ciclo de credenciais OAuth

- **Autorização única:** tentativa privada vinculada ao ator/workspace/provedor/marca/redirect/alvo/TTL; callback consome antes do exchange. Desconectar/excluir invalida tentativas da mesma plataforma, inclusive callbacks genéricos cujo ID externo ainda não era conhecido. Reconexão preserva conta e marca.
- **Renovação concorrente:** versão UUID, lease no Postgres, begin reconhecido e commit CAS; um único grant entre processos. Resposta tardia não desfaz disconnect/delete/reautorização. Commit sem reconhecimento usa recibo, não outro grant rotativo. Estado incerto exige reconexão explícita; busy/cooldown são transitórios.
- **Validação e analytics:** tokens/expiração/scope estritos; timeout, redirects recusados e corpos limitados no exchange/discovery. Erro analítico invalida somente a versão usada. Espera transitória de autorização não vira revisão permanente ou reenvio implícito da publicação.
- **Google Business:** primeiro vínculo agora persiste de fato, por escolha explícita, após descoberta/Voice of Merchant atual e RPC versionado. Unidade/histórico estabelecidos não são transferidos; agendamento exige vínculo confirmado. Erros não viram lista vazia nem sucesso falso.
- **QA selecionado:** typecheck/lint/build, 1.138 testes/66 arquivos, 336 checks SQL locais em oito suítes, 133 novos checks Supabase/rollback; 25 checks runtime/12 interleavings, três corridas de claim entre processos e 12 checks navegador/12 Axe sem violações detectadas. SSR público PT/EN separado da recarga CSR privada.
- **Isolamento e limites:** Auth/RLS/persistência reais, providers sintéticos somente em harness fora do app; fixtures removidas, job futuro cancelado sem tentativas, nenhuma conexão/publicação externa real. Owner/workspace reais e CI paralelo/main-only preservados. Publicação remota continua evidência separada.

Método em [QA_OAUTH_RODADA_5.md](./QA_OAUTH_RODADA_5.md), operação em [CICLO_CREDENCIAIS_OAUTH.md](./CICLO_CREDENCIAIS_OAUTH.md). Não é homologação de provedores, garantia de ausência de bugs nem liberação comercial.

## Sexta rodada: observações analíticas confirmadas

- **Concorrência no banco:** commit versionado por canal/token/job/post; uma observação por publicação externa e dia UTC, mesmo com conteúdo reutilizado. Merge por máximos no Postgres, sem soma de releituras ou SELECT/INSERT em processos concorrentes. `captured_at`, metadata e data do canal avançam na mesma transação.
- **Fronteiras reais:** snapshots SELECT-only para papéis de aplicação; data direta protegida inclusive contra service role e recorder legado sem EXECUTE. API exige owner/admin, RLS preserva a leitura por membership, e disconnect/refresh/reautorização/publicação alterada vencem resultados antigos.
- **Sem falso sucesso:** erro por post é visível; observação ausente não vira zero. Gravação sem recibo válido não é contada nem repetida automaticamente. Interface PT/EN diferencia completo/parcial/erro/vazio e não mostra toast de requisição de workspace anterior.
- **Capacidades honestas:** registry só contém coletores implementados. TikTok/Google Business per-post continuam indisponíveis, sem stubs operacionais; motivo explícito e execução mista parcial. Isso não é homologação dos quatro coletores disponíveis.
- **Consumidores:** analytics e relatório deduplicam pela publicação externa/canal, não apenas pelo conteúdo. PDF/CSV conferidos com valores persistidos e nota metodológica; recurso oculto por RLS/inexistente retorna o mesmo 404, UUID inválido 400 e ausência de autenticação 401.
- **Validação selecionada:** 1.242 testes/71 arquivos, 424 checks locais em nove suítes, 87 novos checks SQL remotos/rollback, 20 checks runtime/11 interleavings e 14 de navegador. Doze análises Axe sem violações detectadas; 8 + 4 processos reais nas disputas de observação. Auth/PostgREST/RLS reais, providers apenas sintéticos fora do produto, fixtures removidas e fingerprints reais preservados.

Detalhes em [QA_ANALYTICS_RODADA_6.md](./QA_ANALYTICS_RODADA_6.md) e contrato em [OBSERVACOES_ANALITICAS.md](./OBSERVACOES_ANALITICAS.md). Duas migrations aplicadas uma vez, 31 no total; código antigo não é compatível para coletar nesse schema. Não reabrir o recorder/DML para contornar atualização ou rollback. SHA/CI/deploy/smoke são provas operacionais separadas. O requisito de funcionamento completo continua vigente; essas evidências não encerram homologação externa, prontidão comercial ou revisão de todos os módulos.

## Sétima rodada: primeira etapa de experiência profissional

- **Público móvel:** cabeçalho com os dois destinos de acesso inteiros em 320px, seletor de idioma realmente compacto e hero móvel mais curto, sem retirar o aviso de portfólio ou alterar SSR/metadados.
- **Acesso:** região principal identificada em login/cadastro/recuperação; confirmação de cadastro usa o endereço informado e quebra endereços longos sem corte. A entrega real de e-mails não foi homologada por essa mudança.
- **Agendamento:** formulário antes da configuração técnica, orientação de próximo passo conforme papel/rascunho/canais e motivos específicos de bloqueio. Requisitos por plataforma e funcionamento da entrega continuam acessíveis em detalhes nativos por teclado. Configuração não certifica OAuth ou publicação; API/preflight/recibos e proteções do banco foram preservados.
- **Atividade acessível:** nome do sino inclui o contador visível de eventos recentes; não inventa leitura persistente de notificações.
- **QA local selecionado:** typecheck/lint/build, 1.306 testes/76 arquivos, auditoria de dependências de produção sem vulnerabilidades reportadas, 38 verificações públicas e 16 do agendamento com Auth/persistência reais em fixtures descartáveis. Mais quatro verificações de contrato visual da confirmação com resposta interceptada, sem cadastro/e-mail reais. Os 23 snapshots Axe selecionados terminaram sem violações detectadas; não são certificação WCAG.

Método, diagnósticos e limites em [QA_UX_RODADA_7.md](./QA_UX_RODADA_7.md). Nenhuma migration, conexão/postagem social ou coleta externa positiva foi executada. Upload seguro de mídia, calendário/fila móvel, contexto/fuso/tradução do cartão de melhor horário, suporte/documentos legais/equipe e comprovação operacional permanecem frentes posteriores. Publicação remota e limpeza final têm relatório próprio; sucesso local não as comprova.

## Rodada 13: acesso e recuperação para piloto assistido — evolução local

- **Sessão antes da senha:** link/flag não são autorização. Inicialização e usuário são conferidos antes do formulário e a identidade é revalidada antes da alteração; logout, troca de conta e retornos antigos não produzem sucesso nessa tela.
- **Recuperação sem beco sem saída:** link inválido oferece nova solicitação; indisponibilidade temporária oferece retry. Falha transitória do exchange inicial exige reinicialização explícita do SDK, sem replay manual de tokens.
- **Cadastro/confirmação:** mensagens neutras com o endereço submetido, destino de reenvio coerente com o envio, validação de nome compartilhada, erros inline e campos preservados. Intervalo local de e-mail não substitui limites de abuso no servidor.
- **Interface:** senha visível/oculta por controle rotulado, trava síncrona contra duplo envio, PT/EN e composição sob `features/auth`; metadados/SSR públicos e proteções privadas preservados.
- **QA:** 1.663 testes/91 arquivos, typecheck/lint/build aprovados; 76 checks no build real e 28 Axe sem violações detectadas nos estados selecionados; HTTP local com 6 combinações rota/idioma e 11 assets válidos. Respostas de Auth foram sintéticas somente no harness externo: não houve cadastro, envio de e-mail, alteração de senha, escrita no banco ou publicação social reais.
- **Limites e publicação:** rodada ainda não enviada ao GitHub/Vercel. Nova auditoria continua reprovada com 11 findings altos na árvore existente; nenhuma exceção/fork/alteração de dependência foi aplicada. SMTP, Auth real, CI condicionado e homologação comercial continuam pendentes.

Método, correção de fixture, CSP local e limites em [QA_ACESSO_RODADA_13.md](./QA_ACESSO_RODADA_13.md). Os resultados antigos de auditoria sem findings são históricos e não descrevem a auditoria atual.

## Rótulo de portfólio não é modo de simulação

`VITE_PORTFOLIO_MODE=true` exibe uma identificação pública e dentro do aplicativo. Não desativa autenticação, não remove RLS, não fornece credenciais públicas e não inventa métricas ou publicações.

`VITE_GOOGLE_AUTH_ENABLED` fica desligado por padrão. Só ative a opção de login Google depois de configurar e validar o provedor. Ela é independente das conexões de redes sociais.

`VELT_PUBLISHER_MODE=simulate` **não** deve ser usado na publicação atual. O flag de portfólio não altera esse valor.

## Regressão no navegador

A suíte abaixo usa login real em um contexto novo, sem inserir sessão ou workspace no storage. É uma verificação de leitura: não conecta redes, não cria conteúdo e não dispara publicações.

```bash
npm ci
npx playwright install --with-deps chromium
# Configure fora de arquivos versionados:
# VELT_QA_BASE_URL, VELT_QA_EMAIL, VELT_QA_PASSWORD
npm run test:e2e
```

Use conta de teste com onboarding concluído. `VELT_QA_DEVICE=desktop` ou `mobile` permite dividir a execução. Resultados ficam em `.qa-artifacts/` (ignorado pelo Git), ou em `VELT_QA_OUTPUT_DIR`. Capturas podem conter dados da conta: não publique relatórios de navegador sem revisão.

A suíte cobre contexto novo, retorno de login, acesso direto, recarga de cinco módulos, títulos, largura e axe em desktop/mobile. A auditoria de um estado vazio não cobre formulários preenchidos, todos os diálogos nem certifica WCAG. Uma jornada adicional de QA com usuário temporário foi usada para testar onboarding, CRUD, troca em duas abas e troca de conta; os recursos temporários foram removidos.

## Publicação e sincronização

Em 12/11/2026, após autorização pelo navegador com o GitHub CLI oficial, os dois commits de melhorias (`6a01104` e `4a60a71`) foram enviados ao `main` de `Implantac/velt-hub-platform`. O SHA remoto foi conferido depois do push. Não houve force-push nem reescrita do histórico.

As próximas publicações usam o código de `Implantac/velt-hub-platform`: um push no `main` aciona a integração Git nativa da Vercel no projeto existente. O checkout contém o `package.json` e o lockfile completos: a instalação normal é `npm ci --no-audit --no-fund`, seguida do build com Node 22 LTS e heap de até 4 GB. O resultado do deploy Git e o smoke público ficam registrados separadamente no relatório operacional da entrega; não são presumidos pelo sucesso dos testes unitários.

### Deploy automático do `main`

- O repositório conectado e a branch de produção continuam sendo `Implantac/velt-hub-platform` e `main`. O domínio público continua `https://velt-hub-platform.vercel.app`.
- A opção de criação de deploys pelo Git está habilitada no projeto. Eventos `repository_dispatch` continuam desabilitados; o fluxo usa o evento normal de push.
- `vercel.json` permite deploy automático somente para `main`: `"**": false` desabilita as demais branches, inclusive nomes com `/`, e `"main": true` libera a branch de produção. A regra verdadeira prevalece quando os padrões coincidem. Para habilitar previews no futuro, revise essa configuração explicitamente.
- O CI do GitHub continua executando typecheck, lint, testes, build e auditoria de dependências em paralelo ao deploy. **Esta configuração não faz a Vercel aguardar o CI** nem adiciona proteção de branch. Antes de liberar versões para clientes, homologue proteção do `main`, checks obrigatórios e promoção condicionada à aprovação.
- Confirme que o SHA no deploy concluído corresponde ao `main`, que o estado é `READY / PROMOTED` e que o domínio está associado. Faça o smoke público após a publicação. A ativação não é considerada validada apenas por salvar a configuração do projeto.
- Para interromper o gatilho, desabilite a criação de deploys Git no projeto. Um rollback emergencial pela Vercel não desfaz o Git: alinhe o repositório com um commit de reversão revisado, sem force-push, para que o próximo push não reintroduza a versão problemática.

A configuração usa a integração nativa; não adiciona token permanente ao GitHub Actions, deploy hook público ou segredo ao repositório.

### Histórico da publicação inicial por arquivos

Antes dessa autorização, a publicação inicial utilizou um snapshot de fontes, acompanhado de ZIP, patch e proveniência. Esse material é um registro histórico: a indicação de GitHub pendente naquele pacote antecede o push confirmado acima.

O bootstrap dessa publicação inicial restaura um arquivo de fontes em um bucket **privado** do Supabase exclusivo e confere seu SHA-256 antes de instalar o lockfile. As credenciais vêm somente do ambiente protegido da Vercel, nunca do pacote de código, e a URL de storage é fixa no projeto VELT.

O bucket `velt-deploy-sources` mantém os pacotes imutáveis necessários a rebuilds desse caminho antigo. Preserve-o enquanto houver dependência de rebuild/rollback dessas publicações. Ele não é uma biblioteca pública de mídia nem um recurso do produto.

A configuração condicional de instalação aceita os dois caminhos: quando existe `restore-velt-source.mjs`, ele precisa concluir com sucesso; em um checkout Git normal, sem esse arquivo, executa somente `npm ci`. Um deploy Git do repositório sincronizado não depende desse bucket.

Na sincronização inicial, o deploy pelo SHA foi disparado explicitamente, pois o gatilho automático estava desabilitado. A ativação do deploy automático foi autorizada em uma etapa posterior e usa o fluxo descrito acima. Publicações explícitas por SHA continuam possíveis e não comprovam, por si só, o funcionamento do gatilho.

## Banco e automações existentes

A migration `20261112143126_workspace_owner_returning_visibility.sql` já havia sido aplicada no Supabase exclusivo e está versionada. As sete migrations da rodada 3, `20261116113916_publication_reconciliation.sql` da rodada 4, `20261116151953_oauth_credential_lifecycle.sql` da rodada 5 e `20261116180947_atomic_analytics_observations.sql` / `20261116182153_retire_legacy_analytics_recorder.sql` da rodada 6 também foram aplicadas, chegando a **31** no ambiente auditado; nomes/testes em [rodada 3](./QA_FUNCIONAL_RODADA_3.md#migrations-desta-rodada), [rodada 4](./QA_RECONCILIACAO_RODADA_4.md#schema-e-operação-auditados), [rodada 5](./QA_OAUTH_RODADA_5.md#schema-e-operação) e [rodada 6](./QA_ANALYTICS_RODADA_6.md#schema-e-limpeza). Não reaplique essas migrations manualmente nesse projeto. Não desative RLS para corrigir bootstrap.

Os dois crons em operação usam um segredo do Vault chamado `velt_cron_secret`, não `ALTER DATABASE`. O segredo deve ser idêntico a `CRON_SECRET` no ambiente protegido do servidor. O comando do job consulta o Vault na execução e não contém o valor em texto.

- `velt-scheduler-tick`: a cada minuto, `POST /api/public/cron/scheduler-tick`.
- `velt-analytics-sync`: a cada 6 horas, `POST /api/public/cron/analytics-sync`.

Um HTTP 200 sem canais ou jobs não valida publicação nem coleta real. A leitura somente de metadados/histórico SQL da rodada 4 confirmou os dois jobs ativos, com 1440/4 disparos nas respectivas cadências na janela de 24 horas, sem falhas SQL. Isso não comprova status HTTP downstream, publicação ou coleta real; a auditoria não leu nem alterou segredos/comandos de cron.

Há uma limitação histórica de instalação: uma migration antiga tenta `ALTER TABLE` em tabela de Realtime que pertence ao Supabase. No provisionamento atual foi omitida somente essa instrução redundante, após confirmar que RLS já estava habilitada. A instalação limpa de todas as migrations pelo CLI ainda precisa de uma homologação específica. Não altere ownership para contornar isso.

## Checklist antes de distribuir a clientes

- [ ] Executar regressão pós-deploy, sem workarounds, em produção e em homologação isolada.
- [x] Sincronizar no GitHub os dois commits da primeira rodada; `main` conferido após o push em 12/11/2026.
- [ ] Homologar continuamente o fluxo completo de CI, instalação limpa e regressão pós-deploy para cada versão destinada a clientes.
- [ ] Validar instalação limpa das migrations e processo de backup/restauração.
- [x] Validar os fluxos centrais da rodada 3 com dois workspaces, dados sintéticos e owner/admin/editor/viewer, incluindo concorrência, Auth e RLS reais.
- [ ] Completar a revisão de todos os módulos/endpoints, revogação durante a sessão, convites e cenários comerciais multi-cliente; os testes selecionados não são pentest.
- [ ] Configurar e testar SMTP próprio, confirmação e recuperação de senha, limites e mensagens de abuso.
- [ ] Homologar um ciclo real em um canal de teste: autorização, expiração/refresh de token, mídia, agendamento, publicação, retentativa e coleta de métricas.
- [ ] Validar falhas de provedores e idempotência; nenhuma simulação pode ser apresentada como publicação real.
- [ ] Validar IA, limites de custo e tratamento de dados, sem executar geração automaticamente.
- [ ] Revisar permissões de storage, upload e egress para redes privadas; completar proteção contra DNS rebinding.
- [ ] Revisar LGPD, retenção/exclusão, termos, consentimentos e credenciais por ambiente/cliente.
- [ ] Concluir tradução dos módulos avançados e auditoria manual de teclado/leitor de tela.
- [x] Implementar o núcleo durável de reconciliação/revisão e validá-lo com banco real, concorrência e observações sintéticas — rodada 4.
- [x] Implementar tentativas OAuth single-use, refresh concorrente/versionado e primeiro vínculo GBP; validar com SQL/roles reais, processos independentes e navegador — rodada 5.
- [x] Persistir observações analíticas/data atomicamente, com merge/identidade no banco, recibo obrigatório e interface/relatórios sem falso sucesso; validar Auth/RLS/concorrência reais e navegador — rodada 6.
- [ ] Homologar reconciliação/recuperação externamente e sua operação contínua; não republicar automaticamente um item possivelmente aceito.
- [ ] Monitorar crons, filas paradas, erros, quotas e custo. Definir suporte e resposta a incidentes.
- [ ] Desligar o rótulo de portfólio somente quando a liberação comercial estiver aprovada.

A entrega desta rodada melhora estabilidade e apresentação. Não significa que todos os itens de prontidão comercial acima tenham sido executados.

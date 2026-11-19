# Rodada 15 — painel inicial confiável

## Estado da entrega

Evolução **local, validada e ainda não publicada**. Base: `2c32eff40f6d2c88eaaffd2e8eaf329b161066ab`, publicada na rodada 14. Antes de editar, 593 fontes foram conferidas contra o manifesto da revisão publicada e copiadas para um baseline separado.

Nenhum push, commit de publicação, deploy, migration, configuração remota, credencial, IA ou integração social foi alterado/executado nesta rodada. A aplicação continua usando Auth/RLS reais; as respostas sintéticas existem somente no harness externo de QA, não no produto.

## O que mudou

### Totais e prévias diferentes

- Marcas, canais e canais conectados usam contagens exatas no servidor, sem baixar uma lista potencialmente truncada para contar no navegador.
- Conteúdo é contado pelos seis estados do enum. O pipeline e o total usam essas contagens confirmadas, não uma amostra de linhas.
- Agendamentos futuros incluem somente jobs `pending` com `scheduled_at >= checkedAt`. O total exato e a lista de até cinco itens vêm da mesma consulta, com ordenação determinística por data/ID. A interface explica o recorte; itens vencidos, em execução, concluídos, cancelados ou com falha não entram nesse KPI.
- `null`, contagem inválida ou erro de consulta **não viram zero**. Zero continua válido quando foi efetivamente retornado.
- Missões prioritárias incluem somente `pending`/`in_progress`; concluídas e dispensadas não aparecem como pendentes.
- Cada leitura é feita com o cliente autenticado do chamador e escopo de workspace após membership explícita. Não foi adicionada service role nem alterada RLS.

As várias contagens de conteúdo são consultas independentes. Não se promete um snapshot transacional entre tabelas se os dados mudarem durante a leitura. O instante `checkedAt` fixa o corte dos agendamentos, não a versão de toda a base.

### Atualizar não é gerar análise

- **Atualizar dados** refaz somente as consultas GET ativas deste painel, por usuário e workspace. Não chama `brainSnapshot`, `brainRecommend`, `brainAskAll`, gateway de IA, fila ou provedor.
- **Abrir USE Brain** é navegação separada. Geração permanece uma ação explícita do módulo apropriado, não um efeito de abrir/atualizar o dashboard.
- O painel lê a pontuação e as cinco respostas **já salvas**. Ausência de análise tem estado próprio, sem desenhar uma pontuação zero. Datas de geração e expiração são visíveis; respostas expiradas são identificadas, não regeneradas silenciosamente.
- Diagnósticos de saúde propagam falhas de qualquer categoria. A média informa quantas das cinco categorias estão disponíveis, sem chamar uma média parcial de diagnóstico completo.
- Concorrentes, memória e avaliações usam totais exatos. A última avaliação é identificada como tal, em vez de usar a média de uma lista limitada como se representasse todo o histórico.

### Primeiro uso, falhas e acesso

- Marca e primeiro conteúdo são as **duas etapas essenciais**. Conectar uma rede é opcional e não impede concluir esse progresso.
- Na primeira configuração, o componente avançado só monta quando o usuário abre os detalhes. Fechar desmonta suas consultas; atualizar o painel fechado não dispara as leituras avançadas.
- Carga inicial, erro inicial, leitura confirmada e cache desatualizado são estados distintos. Falha de refresh mantém a última leitura com aviso e nova tentativa, em vez de apagar dados ou convertê-los em zero.
- Cada painel avançado tem seu estado/retry; uma falha de Skill Map não transforma concorrentes ou saúde em vazios.
- Cache inclui usuário e workspace. A troca remonta o escopo visual e descarta feedback de ações anteriores; retornos tardios não repõem dados de outra identidade/workspace.
- Papel desconhecido ou falha de membership ocultam o painel, inclusive após uma leitura anterior. Viewer pode consultar, mas não recebe convite para criar conteúdo/marca ou retomar o onboarding de edição. Gerenciamento de canais continua reservado a owner/admin.
- Essas verificações de UI não substituem a autenticação/RLS do servidor nem certificam todos os cenários de revogação dos demais módulos.

### Idioma, navegação e apresentação

- Rota do painel reduzida a composição em oito linhas, com `modulePageHead("dashboard")`; domínio em `src/features/dashboard`.
- Rótulos, estados, números e textos estáticos desta interface em PT/EN. Textos previamente salvos/gerados conservam seu idioma original, explicitado na interface.
- Datas no fuso IANA do produto, `America/Sao_Paulo`, inclusive com navegador configurado em outro fuso.
- Ações de conteúdo salvo/IA só viram links para destinos internos seguros `/app`; scripts, URLs externas e caminhos inválidos não são navegação do dashboard.
- Indicador de pontuação com nome acessível e IDs SVG exclusivos. Progresso e detalhes operáveis por teclado; não há estado verde afirmando saúde global do sistema sem verificação.
- SSR público, restauração de idioma após hidratação, metadados, plugin Lucide build-only, Node 22 e configurações Lovable/Nitro preservados.

## Verificações executadas

| Verificação            | Resultado local                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Node                   | 22.13.0                                                                                     |
| TypeScript             | Passou                                                                                      |
| ESLint                 | Passou, sem warnings                                                                        |
| Testes automatizados   | **1.878 testes em 95 arquivos**, 215 casos acrescentados                                    |
| Build de produção      | Preset Vercel aprovado, 53 segundos no executor local                                       |
| Navegador Chromium     | **39 verificações selecionadas**, PT/EN, 320/1280px                                         |
| Axe                    | **21 estados**, nenhuma violação detectada nas regras executadas                            |
| HTTP anônimo compilado | **10 combinações rota/idioma + 25 assets** válidos                                          |
| Auditoria de produção  | Duas consultas retornaram exit 0, **zero achados reportados**; ressalva de segurança abaixo |

O build local de aproximadamente 2GB de RAM usou heap de 1.536MB e swap temporário de 1.536MB, removido/desativado ao final. O comando e o heap versionados não foram alterados. A prévia de QA foi encerrada.

### Método e limites do navegador

O navegador executou o artefato compilado e o SDK reais. Auth e RPC foram interceptados **somente** no harness em `/home/user/velt-qa/rodada-15/dashboard-browser.mjs`, com identidades/dados sem validade real. O runner negou `fetch` no servidor; o harness interceptou HTTP externo e encerrou WebSockets do navegador. Essa barreira de QA não equivale a um firewall nem certifica bloqueio de transportes arbitrários. As capturas mostram dados fictícios, não os totais de uma conta real.

Os 39 checks cobrem primeiro uso, leitura adiada, Enter/Espaço nos detalhes, erro inicial, falha de refresh com cache, retry, leitura parcial por painel, viewer, papel desconhecido, membership com erro e corridas de troca de workspace/identidade. O navegador usou `Asia/Tokyo` para verificar o fuso explícito de São Paulo.

Foram observadas zero tentativas de escrita do dashboard, zero RPC inesperados, zero `pageErrors` e nenhuma requisição externa não prevista. A preferência de workspace foi alterada apenas no transporte sintético de um cenário. Os 22 POSTs CSP da execução final foram interceptados sem persistência; não certificam enforcement/coleta CSP.

Não houve Auth/RLS/Postgres remotos, e-mail, análise de IA, conexão social, envio de publicação ou coleta real nesta rodada. Testes de handlers recebem contexto pré-autenticado e builder sintético; não são prova de instalação limpa, isolamento RLS real, pentest ou certificação WCAG.

### Falhas intermediárias preservadas

- A suíte integral identificou uma chave base de plural ausente nas traduções. A chave foi acrescentada nos dois idiomas; o teste de cobertura não foi enfraquecido.
- Tipos das prévias vazias foram ajustados para refletir `null` corretamente, usando `.at(0)` e separando a consulta `maybeSingle` da validação do resultado, sem mascarar o tipo com um cast amplo.
- O harness inicial usou enquadramento Seroval inadequado na resposta. Corrigiu-se o harness para `fromJSON` na requisição e `toCrossJSONAsync` na resposta; não se alterou o transporte de produção.
- Duas asserções do harness foram corrigidas: esperar a chegada das consultas paralelas antes de conferi-las e não confundir a frase salva “this dashboard.” com uma chave de tradução ausente. Execuções anteriores e logs foram preservados.

## Auditoria: observação nova não é patch de segurança

O histórico das rodadas 13/14 registra exit 1 e 11 findings altos relacionados ao picomatch. Nesta rodada, tanto a consulta padrão quanto a consulta explícita a `https://registry.npmjs.org` retornaram exit 0/zero findings, **sem alteração de dependências ou lockfiles**. O lock continua contendo picomatch **4.0.7**.

A [página do advisory GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) consultada passou a apresentar “Withdrawn Advisory”, mantendo “Patched versions: None”. Entretanto, a própria página informa atualização/retirada em **18/11/2026**, posterior à data de referência desta conversa, **12/11/2026**. Essa inconsistência temporal foi registrada, não usada para concluir que uma correção foi publicada.

Portanto, **não se considera corrigido o risco técnico anterior apenas pelo retorno zero do feed**. A revisão da dependência e da evidência externa permanece pendente. Nenhum fork/protótipo foi integrado, nenhuma exceção de auditoria foi criada e o workflow/threshold permanecem intactos. O último CI remoto conhecido continua sendo o registro histórico da rodada 14; não houve nova execução remota nesta rodada.

## Rastreabilidade e futura integração

Evidências locais em `/home/user/velt-qa/rodada-15/`:

- `baseline.json` e `baseline-source/`: fontes anteriores, hashes e Git local herdado.
- `local-gates-final.json`, `tests-final.json`, `*-final.log`: gates e testes finais.
- `build-receipt.json`, `build-vercel.log`: build compilado local, não deploy remoto.
- `browser/result.json`, capturas e `dashboard-browser.log`: UI sintética selecionada.
- `http-local-smoke.json`: HTML/assets anônimos, não acesso autenticado.
- `npm-audit.json`, `npm-audit-public-registry.json`, `advisory-observation.json`: respostas e ressalva temporal.
- `source-manifest.json`, patch e `final-verification.json`: comparação e aplicação limpa da evolução sobre a base conferida.

O Git reidratado do diretório de trabalho aponta para um HEAD antigo com alterações herdadas; o antigo diretório release14 perdeu seus metadados Git na restauração. Não se deve publicar nenhum desses estados por pressuposição. Uma futura publicação deve obter a main remota correta, integrar o patch conferido, revalidar e só então publicar com autorização específica.

O resultado melhora a confiabilidade do painel para o **piloto assistido condicionado**. SMTP/recuperação real, ciclo de provedor, backup/restauração, LGPD, suporte, custos, revisão de segurança e liberação comercial continuam frentes próprias.

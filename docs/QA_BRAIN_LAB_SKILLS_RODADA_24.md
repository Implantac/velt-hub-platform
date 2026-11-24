# QA — Brain Lab / Habilidades · rodada 24

**Integração local validada, não publicada. Manutenção de dependências pendente.**

Referência da sessão: **12/11/2026, America/Sao_Paulo**. O relógio do ambiente é rotulado separadamente nos recibos e não altera a autoridade da sessão nem comprova atualidade remota. Entregas18–23 e seus recibos não foram reescritos.

## Base e escopo preciso

Base: ZIP23 selado, SHA-256 `76d7baf2ec4d8f474dbe82311d22757385b98ffcfcca10ee08fa757ba7a03b9e`,727 hashes de origem/726 fontes exportadas. As727 fontes do checkout23 foram conferidas e preservadas;24 foi materializada separadamente em `velt-development-24`. `.env` privado conferido por hash, untracked e não exportado. Git apenas local/sem remote.

O SkillsPanel antigo era o único consumidor de UI conhecido de `listSkillAssessments`/`upsertSkillAssessment` em `brain-evolution.functions.ts`. Mantinha score50 inicial sem base, notas próprias sem prefill integral, ausência como0, query sem conta e segundo caminho de gravação. O POST legado faz INSERT apesar de UNIQUE(user_id,workspace_id,area), não valida erro da leitura anterior e tenta eventos/cache Brain. A rodada23 corrigiu a rota nativa, não esse painel.

**Rodada24 migra somente o consumidor Skills do Brain Lab para o fluxo nativo compartilhado e melhora a navegação do contêiner.** Não modifica nem retira os exports da API legada; clientes externos/antigos ainda podem chamá-la. Não se alega correção global do servidor legado ou dos outros seis painéis. A seleção padrão continua Digital Twin e seu fluxo anterior permanece distinto.

## Uma superfície, um estado pessoal

- `SkillMapPage` e `SkillsPanel` são adapters finos para `SkillMapSurface`, respectivamente placement `page`/`panel`. Não têm useState de formulário, query/mutation ou transporte próprios.
- A superfície extrai a composição23, sem alterar bytes de `use-skill-map.ts`, account guard, presentation, operation-store, contratos, operações de servidor ou `skill-map.functions.ts`. Cache, draft, receipt e trava seguem as **mesmas chaves conta × workspace**, sem placement/rota na chave ou duplicação de escritor.
- API nativa `getSkillMap`/`saveSkillAssessment`, enum/método, GET completo/count exato, limites JSON/legado, base nullable integral, INSERT ou UPDATE CAS por ID/escopo/assessed_at, membership reconhecida inclusive viewer próprio, no-op e recibo integral permanecem os da23. Veja [contrato detalhado23](./QA_SKILL_MAP_RODADA_23.md).
- Mantidas revisão e confirmação explícitas, nota inteira0–100/step1 por teclado, zero válido e ausência distinta de0/domínio. Confidence/evidence antigos preservados como técnicos não calibrados/verificados, origem self declarada; notas exatamente vazias viram null e outros espaços não são aparados. Legados não são truncados silenciosamente no prefill.
- Salvar por qualquer local usa só a API nativa, sem eventos de memória Brain/invalidação de cache no banco/IA/onboarding/Score/Learning/recálculo oculto. Outros leitores poderão consultar o registro no futuro. Interface não interpreta score como melhoria comprovada, equipe avaliada, teste ou certificação.

## Composição, navegação e teclado

`SkillMapLocationHeader` preserva o PageHeader/h1 da rota completa. No painel, usa h2; cards/editor/feedback/erro usam h3, sem segundo h1. Esses componentes recebem headingAs opcional, mantendo h2 como default nativo. Cards do painel têm prefixo `brain-lab-skill`, os da página mantêm `skill`; inputs continuam com useId. IDs e relações aria-labelledby foram verificados em SSR/navegador.

Links explícitos entre mapa completo e Brain Lab indicam o mesmo mapa pessoal/contexto, não cópia, novo registro, execução de IA ou domínio da equipe. Navegar não grava nem reenvia. Draft/base/recibo/trava acompanham navegação nesse runtime, mas consentimento local é revogado no remount e exige conferência renovada. Sem persistência de draft em localStorage, reload, fechamento ou após GC5min inativa.

`brainLabSearch` aceita exclusivamente uma das sete abas conhecidas em `?tab=` e retorna apenas `{tab}`. Valor ausente/inválido, array, objeto, casing/espaços diferentes ou nome desconhecido retorna `twin`, preservando o default anterior; query não é comando ou permissão. Entrada direta `/app/brain-lab?tab=skills` monta Skills, **não Digital Twin nem abas inativas**. O head continua `modulePageHead("brain_lab")`.

`BrainLabFrame` contém somente apresentação/navegação, não fetch. Tablist rotulado/horizontal com roving tabindex: setas esquerda/direita fazem wrap, Home/End movem foco; não selecionam nem montam outra aba. Enter/Espaço/clique ativam explicitamente a aba na URL. Clicar na aba já ativa não remonta ou relê. Apenas o tab selecionado controla o único tabpanel, identificado pelo tab correspondente. Back do navegador restaura a seleção e draft, sem preservar consentimento ou reenviar.

15 folhas estáticas novas por idioma (`brainLabNavigation`11 + `skillMapIntegration`4), todas as anteriores incluindo99 `skillMapNative` preservadas. **Somente contêiner de navegação, contexto compartilhado e Skills são PT/EN nesta mudança**; os conteúdos dos outros painéis mantêm traduções/parcialidades anteriores e não foram alegados traduzidos/corrigidos.

## Pendência, incerteza e respostas tardias

O comportamento23 é reutilizado, não reimplementado:

1. Trava síncrona por conta+workspace bloqueia duplo clique e persiste por remount/links. Ledger guarda flags/referência, não payload privado de SSR; query desabilitada para rede guarda draft/base/recibo temporários.
2. POST incerto mantém draft/referência e impede salvar/descartar. GET automático de montagem/retorno não marca revisão deliberada como concluída e navegar não desbloqueia. É necessário GET deliberado válido, conferência humana renovada e descarte do draft antigo, sem replay/rebase.
3. Recibo confirmado permanece sucesso primário se o GET posterior falha ou é de outro estado; aviso é independente. Não há convite de repetir POST.
4. Pré-RPC confirma Auth esperada e servidor confirma accountId antes de query. Depois de unmount, handler antigo não inicia follow-up RPC; uma leitura própria da nova montagem é legítima e separada. Resposta antiga pode atualizar somente cache/flags originais e não apaga novo draft/consentimento de outra conta/workspace.
5. Uma requisição já enviada pode terminar sob a conta original; trocar visualmente aba/rota não promete cancelamento, rollback ou transação distribuída.

Browser reteve causalmente respostas: POST pendente Lab→página→Lab, saída total para Twin antes de liberar recibo e zero follow-up Skill GET; POSTA liberado com novo draft/consentimentoB; GET workspaceA liberado com draftB; GET de contaA no Lab liberado após mudar conta e navegar à páginaB. A nova escolha e consentimento permaneceram, sem RPC adicional indevido.

## Resultado observado no código final

| Camada                     | Resultado                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                    | Node22.13.0 /Chromium158.0.8127.18                                                                                                        |
| Testes completos finais    | **4.056 aprovados /136 arquivos /zero falhas**,206 novos em4 arquivos                                                                     |
| Focados                    | 596/596, incluindo390 regressões nativas de Skill Map23                                                                                   |
| Typecheck/lint finais      | PASS27,89s /21,95s                                                                                                                        |
| Build Vercel local         | PASS57s, heap1536MB/swap1536MB temporários; produto/CI intactos                                                                           |
| HTTP anônimo local         | **28 HTML /25 assets /zero erros**, PT/EN e deep-link Skills; shells privados não comprovam acesso autenticado                            |
| Navegador nativo regressão | **53 checks /31 Axe**, preservados no novo build                                                                                          |
| Navegador Lab/integração   | **35 checks /33 Axe**                                                                                                                     |
| Navegador combinado        | **88 checks /64 Axe**, zero violações detectadas/pageErrors/erros de harness/RPCs ou mutações inesperadas/requisições externas detectadas |
| Requisições sintéticas     | 39POSTs Skills (24regressão +15Lab),7GETs Digital Twin após seleção deliberada,154reports CSP interceptados                               |
| Preservação                | 628src iguais entre gates/build/HTTP/browser/final;611 outros src da23,31migrations e9 protegidos intactos                                |
| Cleanup                    | Preview parado,8080 fechada,swap0/arquivo temporário removido; saída compilada hasheada/removida                                          |

Ordem: full gates4056 antes do build, freeze628, build/HTTP/native+Lab browser no mesmo código e repetição dos gates finais4056; nenhuma alteração de src após o freeze. Somente documentação depois. Falhas QA iniciais594/596 foram expectativas equivocadas sobre disabled na etapa edit e seletor substring que confundiu CSS disabled:opacity com atributo; registros/fontes/logs preservados em history. Corrigir QA não exigiu alterar produto e nenhum PASS foi usado antes de repetir os testes.

Método: Vitest puro/SSR/handlers sintéticos (regressões preexistentes) e Chromium real sobre build Vercel, Auth/RPC exclusivamente no harness externo. Larguras320/1280px, PT/EN, timezone do browserAsia/Tokyo com datas SãoPaulo, teclado/foco, campos legados, viewer, segunda avaliação, sem-change, erro/stale/conflito/incerto, ida/volta por link/abas/histórico e respostas tardias retidas. As7leituras Twin foram fixtures externas após ativação deliberada; seu conteúdo/gravação e demais painéis não foram homologados. O harness nega ambos endpoints legados de Skills em qualquer chamada; nenhum foi observado.

Não há mock/modo demo incorporado ao produto. HTTP externo do browser interceptado, WebSockets fechados e fetch do servidor negado; isso não certifica firewall de todos os transportes. Axe não certifica WCAG. Nenhuma conta real, banco, SMTP, IA, provedor, geração, publicação social ou formulário externo foi exercitado.

## Limites preservados e pendências

Há somente estado atual por conta/workspace/área, não histórico imutável. UUID é referência/ID na criação, não ledger durável ou exactly-once. Trava não coordena abas/reload/processos/dispositivos. assessed_at não é versão universalmente monotônica e outros escritores podem não atualizá-lo; pré-leitura/CAS protegem esta API, não todos os clientes. Membership revalidada é preflight, não atomicamente ligada à política/mutação; RLS/precisão/concorrência Postgres reais não foram homologados e nenhuma migration/policy foi criada/aplicada.

`brain-evolution.functions.ts` e os outros seis painéis continuam **byte-idênticos**. As duas funções antigas de Skills ainda existem no servidor e precisam de estratégia coordenada para clientes desconhecidos/depreciação; remover o consumidor da UI não as torna seguras/indisponíveis. Digital Twin, Experimentos, Decisões, Anti-golpe, Conselho e Mentor têm limitações anteriores que não são resolvidas por nova navegação. Auth/shell/workspace/motores/Learning/Navigator/Coach/Score/Missões/Dashboard não foram modificados.

Auditoria24 pública: geralexit1, **sete pacotes moderados na cadeia dev/um advisory GHSA-g3hv-75wg-m249**. Instalação afetada observada minimatch10.2.5 aninhada em typescript-estree8.60.0; raiz minimatch3.1.5 é distinta. Produção omit=dev/audit-level=moderate retornouexit0/0 na observação. Lock SHA256 `82539eb958951d9aed7233a40ac81b3a86091b5cb72ae874dcbe0d7cfa8e264a` preservado. Sem fix forçado/fork/override/waiver/threshold ou CI alterados/aceite de risco. Zero em um recorte não encerra manutenção/revisão técnica; não houve payload DoS hostil ou prova completa de reachability.

Última publicação **registrada**17/base703f93c, não consultada24.18–24 locais. Nenhum conector/push/deploy/CI remoto/migration/banco/ambiente remoto alterado. Instalação limpa, Auth/RLS/Postgres/concorrência/SMTP/IA/provedor reais, backup/LGPD, legado e liberação comercial exigem homologação/autorização específicas.

Entrega allowlisted sem .env/credenciais/Git/dependências/runtime/cache/artefatos de deploy. Patches23→24 e18–24 sobre703f93c são alternativas, não aplicar ambos. Aplicação isolada e hashes/cleanup constam de patch-validation/final-verification; hash externo do ZIP evita autorreferência. Se recibo final está ausente/reprovado, não inferir entrega completa.

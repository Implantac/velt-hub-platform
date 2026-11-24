# QA — Trilhas de Aprendizado · rodada 22

**Desenvolvimento local validado, não publicado. Dependências em manutenção pendente.**

Referência de sessão: 12/11/2026, America/Sao_Paulo. Os timestamps do relógio do ambiente são identificados separadamente nos JSONs; não alteram a referência da sessão nem comprovam atualidade do remoto. Entregas18–21 e seus recibos permanecem imutáveis.

## Escopo e motivação

A entrega21 foi materializada em `velt-development-22` por 688 hashes de origem (687 fontes exportadas; `.env` omitido do pacote). Learning era uma rota com cache sem conta, falhas convertidas em listas vazias e alternância por UPSERT que ignorava erro da leitura anterior, aceitava IDs fora do catálogo e podia perder alterações concorrentes. A nova rota só compõe `features/learning` e mantém `modulePageHead("learning")`.

O catálogo é autenticado/global. **Progresso é pessoal de user_id × path_id, não workspace**; viewer pode alterar o próprio registro. Coluna workspace_id herdada é preservada em updates; novas linhas usam null. Nenhuma permissão sobre o workspace é concedida por isso.

## Leitura estrita e cache

- `listLearningPaths({page})`: GET, página20, count exato, ordem crescente difficulty/title/id. Null/undefined, contagem ausente/incompatível, duplicatas, milestone inválido/duplicado ou resposta parcial falham; não são catálogo vazio. Página desaparecida tem recuperação deliberada à primeira.
- `listMyProgress({accountId,pathIds})`: GET, 1–20 UUIDs únicos. A conta esperada precisa coincidir com a Auth do servidor **antes de consultar o banco**. SELECT por user_id do chamador e IDs pedidos, count exato; batch confere dono, escopo, IDs/linhas únicas e completude. Só um batch válido permite interpretar linha ausente como nenhuma marcação.
- Catálogo e progresso têm loading/erro/vazio/cache antigo distintos; erro de progresso não oculta catálogo nem inventa zero. Reler só faz GET. Retry1 é apenas de leitura; não existe retry de POST.
- Chaves incluem conta, página e conteúdo reconhecido do catálogo, sem workspace. Intenção/recibo transitórios ficam em query React Query desabilitada para rede, stale Infinity, GC de cinco minutos inativa; não há endpoint, localStorage ou persistência para essa query. Sobrevive remount no mesmo runtime, não reload/fechamento, logout com limpeza de cache ou expiração.

## Comando e recibo

`setMilestoneCompletion` recebe `{accountId,pathId,milestoneId,completed,expectedCatalog,expectedProgress,operationId}`. O antigo export `toggleMilestone` permanece com **o mesmo contrato novo e estrito**; o input antigo sem conta/estado/base é rejeitado antes de qualquer query. Clientes externos antigos precisam de atualização coordenada; não se simulou compatibilidade de toggle.

1. Conferir accountId contra Auth e owner/path da base esperada. Reler catálogo e conferir seu conteúdo reconhecido/ID do marco. Reler progresso pessoal, propagando erros; comparar todos os campos observados, inclusive arrays originais e versão em precisão integral.
2. Estado já escolhido é no-op sem escrever nem normalizar percentual/data legados. Na ausência confirmada, INSERT com ID igual à referência operationId, user_id autenticado, workspace_id null e datas de criação explícitas. Na atualização, UPDATE de marcos/percentual/data de conclusão somente, por user_id/path_id/id/updated_at exatos, com linha retornada obrigatória. Sem UPSERT/delete/service role/onboarding.
3. Preservar IDs desconhecidos na ordem original. Percentual = arredondamento de marcos atuais reconhecidos / total atual, ou0 com denominador0. O original salvo é exibido se divergente; não é corrigido na leitura. Marcar o último marco reconhecido grava data de conclusão; desmarcar limpa essa data. Um no-op não altera datas ou percentual.
4. Recibo confere referência, caminho, catálogo, modo, dono, arrays completos, percentual, ID/workspace/início e datas. Criação exige datas correspondentes ao instante informado e ID da operação. Update exige versão distinta, sem confundir timezone equivalente com avanço; microssegundos são conservados. Zero linhas ou resposta inválida não são sucesso.

O token de catálogo compara campos reconhecidos, não é hash criptográfico nem versão transacional do banco. `learning_paths` não tem updated_at; sem migration, sua edição por administrador/serviço entre SELECT e write não está atomicamente bloqueada. O CAS do progresso protege **esta API**, não clientes REST/legados ou todo escritor possível. Avanço e monotonicidade reais do trigger Postgres não foram homologados.

## Revisão, concorrência e identidade

- Selecionar marco abre revisão focada, com efeito e novo percentual, sem marcar/salvar ainda. Consentimento separado fica vinculado à leitura observada e é revogado por releitura/falha/mudança; base diferente bloqueia a ação, conservando rótulos e intenção originais. Não há rebase silencioso.
- Trava síncrona por conta sobrevive remount, retém somente flags/referência/feedback, não catálogo/progresso/IDs de marcos. Impede duplo clique local; não coordena reload, abas, dispositivos ou processos e não oferece exactly-once.
- Resultado incerto mantém intenção e referência, bloqueia nova gravação e pede GET válido + revisão humana. Liberar outra escolha **descarta explicitamente a intenção antiga**; não repete nem reconstrói automaticamente um POST.
- Recibo válido é sucesso primário. Falha/releitura indisponível após salvar é aviso separado, não orientação para salvar outra vez; intenção confirmada é limpa mesmo após remount. Retorno antigo só atualiza a chave da conta original.
- O QA reforçado identificou uma janela de invalidação global na troca de identidade: uma query antiga ainda observada podia sair usando o novo token. Corrigido **somente em Learning** por `learningAccountRequest`, que consulta a sessão atual antes de cada RPC, mais accountId obrigatório conferido no servidor em GET de progresso e POST, inclusive INSERT com base null. O guard pré-RPC não é uma autorização; a conferência do ator no servidor fecha uma troca posterior à checagem local.
- Browser final mantém catálogoB pendente, libera/aguarda respostaA e exige zero GETs de progressoB nessa janela; só então libera B. Também conserva intenção e consentimento B após reciboA tardio. Invalidação global/Auth/shell não foram modificados; consultas legítimas B podem ser repetidas pela invalidação existente.

## Experiência e honestidade

65 traduções estáticas novas por idioma, preservando todos os namespaces anteriores. Catálogo salvo fica no idioma original, escapado, sem URLs/HTML executáveis. Metas do catálogo não são promessa de audiência/vendas; nenhuma aula, certificação, aprendizado medido, IA ou resultado de negócio foi inventado. Marcas são autorrelato manual e não executam tarefas nem mudam Score, Skill Map, Navigator, Coach ou Brain.

Botões nativos com aria-pressed, progress rotulado, detalhes de registro, checkbox de consentimento e foco de revisão/cancelamento. Datas em America/Sao_Paulo; números0 e percentual legado175 continuam explícitos. Verificações móveis320/desktop1280 e browser em Asia/Tokyo não apresentaram overflow horizontal nos estados escolhidos. Isso não é auditoria WCAG completa.

## Evidência final

| Camada             | Resultado observado                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Node               | 22.13.0                                                                                                                                    |
| Typecheck          | PASS20,45s                                                                                                                                 |
| Lint               | PASS15,23s                                                                                                                                 |
| Testes             | **3.460 aprovados /126 arquivos /zero falhas**,286 novos em6 arquivos                                                                      |
| Build Vercel local | PASS54s; heap1536MB + swap1536MB temporários, sem mudar configuração do produto/CI                                                         |
| HTTP local anônimo | **24 HTML /25 assets /zero erros**, PT/EN, shells privados não são homologação autenticada                                                 |
| Browser compilado  | **48 verificações /34 varreduras Axe**, zero violações detectadas, pageErrors/RPCs/mutações inesperadas ou requisições externas detectadas |
| Escritas QA        | 25 POSTs Learning sintéticos/interceptados;78 reports CSP interceptados; nenhuma escrita real                                              |
| Integridade        | 602 hashes de src iguais entre gates/build/HTTP/browser;579 outros src da21,31 migrations e9 arquivos protegidos inalterados               |
| Limpeza            | Preview parado,8080 fechada, swap0, arquivo temporário removido, artefato compilado hasheado e removido                                    |

Método: Vitest com builder falso de Supabase/ServerFn, SSR de componentes e estado puro; Chromium158.0.8127.18 real sobre build compilado com Auth/RPC sintéticos no harness externo. Server fetch negado, HTTP externo de contexto interceptado, WebSockets fechados; não é certificação de firewall de todos os transportes. Nenhum mock/modo demo foi embutido no produto.

Casos: primeiro uso, criação/conclusão/desmarcação, keyboard/foco, duplo clique, viewer, legado/longo/HTML escapado, paginação45/20 e página removida, leitura pendente/erro/stale/estrangeira, catálogo alterado, conflito entre clientes, saved-but503, seis recibos inválidos, GET posterior falho, remount com intenção/save pendente e troca de conta com respostas tardias. Evidências pré-correção e erros iniciais de testes/harness estão preservados em history. O run3446 anterior NÃO valida o código final; o run final3460 inclui o guard e as checagens de conta.

## Dependências, publicação e limites externos

Auditoria geral22: exit1, **sete pacotes moderados numa cadeia dev**, minimatch10.2.5 sob estree8.60.0 e um advisory GHSA-g3hv-75wg-m249 no retorno público. Produção `--omit=dev --audit-level=moderate`: exit0/zero na observação. Lock SHA-256 `82539eb958951d9aed7233a40ac81b3a86091b5cb72ae874dcbe0d7cfa8e264a` intacto. Não houve fix forçado, override/fork/waiver, alteração de threshold/CI ou aceite de risco. Zero em produção não encerra manutenção técnica nem risco histórico.

Última publicação **registrada**17/base703f93c, não consultada22. Rodadas18–22 locais, sem conector/push/deploy/CI remoto/migration/alteração de ambiente ou banco. Auth/RLS/Postgres/concorrência/SMTP/IA/provedores reais, instalação limpa, backup/LGPD e liberação comercial continuam dependendo de homologação específica autorizada. UUID é referência (ID na criação), não ledger durável de idempotência; progresso substituível não é trilha imutável.

Pacote por allowlist, sem `.env`, credenciais, Git, dependências/runtime/cache ou artefatos de deploy. Patches incremental21→22 e cumulativo18–22 sobre703f93c são alternativas: não aplicar ambos. Conferências de aplicação isolada/hashes ficam em `patch-validation.json`/`final-verification.json` e o hash do ZIP no recibo externo; ausência/reprovação de recibo não pode ser tratada como entrega concluída.

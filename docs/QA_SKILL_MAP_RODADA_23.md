# QA — Skill Map · rodada23

**Desenvolvimento local validado, não publicado. Manutenção de dependências pendente.**

Referência da sessão:12/11/2026,America/Sao_Paulo. O relógio do ambiente tem timestamps separados nos JSONs e não altera a autoridade da sessão nem comprova atualidade do remoto. Entregas18–22 e seus recibos permanecem imutáveis.

## Base e defeitos tratados

Entrega22 materializada em `velt-development-23` por708 hashes de origem/707 fontes exportadas, ZIP SHA-256 `1aa52e8c774b9c3076343f8c6704d66d45e6253796d169c0ba3e0cf9369dece7`. As639 fontes ainda presentes no checkout22 foram conferidas sem modificação;69 ausentes no snapshot foram recuperadas somente em23 a partir do arquivo selado. `.env` privado foi conferido por hash, permanece fora do Git e não é exportado.

A rota antiga gravava ao soltar mouse/toque da régua, não por confirmação de teclado. Uma avaliação inexistente aparecia como0 e podia produzir a mensagem de domínio geral sem dados. O handler legado chamado `upsertSkillAssessment` fazia INSERT apesar de UNIQUE(user_id,workspace_id,area), impedindo uma segunda avaliação; ignorava erro da pré-leitura e tentava eventos/cache secundários.

**A rota nativa agora usa API dedicada `skill-map.functions.ts`.** O arquivo `brain-evolution.functions.ts`, seus exports/consumidores do Brain Lab e os demais motores não foram alterados. Não se afirmou correção global do fluxo legado: revisar o painel de Skills do Brain Lab continua uma frente distinta. A rota de composição preserva `modulePageHead("skill_map")`/SSR e o shell existente.

## Escopo e leitura completa

Skill Map é pessoal **por conta × workspace × área**, diferente do Learning global por conta. A tabela contém somente um registro atual por área, não um histórico. Membership reconhecida owner/admin/editor/viewer permite ler e gerir o próprio registro; viewer não passa a avaliar membros da equipe ou editar recursos de equipe.

`getSkillMap({accountId,workspaceId})`, GET autenticado:

- Conferir conta esperada contra a Auth do servidor antes de qualquer query; confirmar membership reconhecida com filtros de user_id/workspace_id.
- SELECT pessoal por user_id/workspace_id, count exato, ordem crescente area/id e limite10. `area` é enum no PostgreSQL, portanto a ordem de consulta segue o enum, não uma ordenação linguística; os dez cards usam uma ordem de apresentação fixa independente dela.
- Resposta `{accountId,workspaceId,total,items,checkedAt}` estrita. Count0–10 precisa ser igual ao número de linhas, áreas/IDs únicos, campos/datas e escopo de todas as linhas válidos. Null/undefined, batch parcial, duplicata, foreign row, área desconhecida ou count ausente não são vazio nem zero.
- Nota é inteiro0–100. Campos técnicos originais são preservados: confidence finito sem presumir calibração/faixa, source até2.000 caracteres e notas originais até50.000. Evidence é JSON válido até65.536 caracteres serializados,8.000 nós e profundidade24. Excedentes/malformados falham fechados, sem truncar ou ignorar uma linha. São limites de validação da API, não novas restrições gerais do banco.
- Ausência por área só é inferida após snapshot completo válido. Loading/erro inicial/vazio confirmado/cache antigo/releitura têm estados distintos. GET nunca grava; retry1 apenas de leitura.

## Edição, revisão e comando

Escolher área abre editor focado. Nota começa em branco na ausência, ou no valor integral salvo, inclusive0. Observações e metadados anteriores são preservados no prefill, mesmo quando o texto herdado exige redução deliberada ao limite novo. Input numérico nativo0–100/step1 suporta teclado; digitar/setas não gravam. Enter na edição abre a revisão, não envia a autoavaliação ao servidor.

Revisão mostra base, nota desejada, observações, substituição e efeitos. Um checkbox separado confirma a leitura observada; releitura/falha/mudança/retorno à edição ou remount revogam o consentimento. Dados iguais já `self` não convidam a salvar outra vez. Base diferente bloqueia salvar e só pode ser substituída por **descartar rascunho e carregar registro atual**, sem rebase ou POST automático.

`saveSkillAssessment` recebe `{accountId,workspaceId,area,score,notes,expected,operationId}`:

1. Input estrito: área conhecida, nota inteira0–100, notes string até500 ou null, base completa nullable e UUID. Só o campo de observações exatamente vazio vira null no editor; outros espaços/textos são mantidos. Caller não controla source/confidence/evidence no comando.
2. Conferir ator e escopo da base, membership, reler registro pessoal/área por `maybeSingle` propagando erro. Null explícito é ausência; undefined não. Comparar todos os campos reconhecidos da base, incluindo notas exatas, origem, confidence, evidence semanticamente por objeto (ordem de arrays conservada) e assessed_at em precisão integral.
3. Base diferente é rejeitada. Estado idêntico já `self` retorna no-op sem write/nova data ou normalização. Antes de mutação, revalidar membership e recusar nova data de assessed_at no mesmo instante da base.
4. Ausência confirmada: INSERT com id=operationId, user_id autenticado, workspace/área explícitos, nota/notas, source=`self`, confidence=0.5 técnico não calibrado, evidence={}, assessed_at do servidor. Corrida de primeira criação depende do UNIQUE já existente; não vira UPSERT.
5. Atualização: somente score,notes,source=`self`,assessed_at, por **id/user_id/workspace_id/area/assessed_at exatos**, com linha retornada obrigatória. confidence/evidence anteriores não são enviados no patch nem apagados. Mudança de origem é mostrada antes de consentir; esses campos técnicos preservados não validam a nova nota.
6. Sem UPSERT/delete, evento de memória, invalidação de cache Brain no banco, onboarding, IA, Score/Learning ou recálculo oculto. Invalidar cache local nativo e dashboard-skills da mesma conta/workspace usa refetchType none, sem RPC cruzado automático. Outros módulos poderão ler o registro futuramente; snapshots/recomendações já salvos não são recalculados.

## Recibo e limites de versão

Recibo estrito `{operationId,accountId,workspaceId,area,mode,recordedAt,assessment}`. Conferir referência, modo created/updated/unchanged, ator/escopo, nota/notas/origem, ID, confidence/evidence preservados e data nova correspondente ao instante informado. Criação exige UUID da operação/defaults técnicos; update mantém ID anterior e versão distinta. No-op exige data de escrita null e registro integralmente igual. Zero linhas, receipt vazio/foreign/truncado ou metadados divergentes não são sucesso.

Instantes com timezone equivalente são iguais; microssegundos diferentes não são truncados por Date.parse. A API usa assessed_at como versão observada e grava data do servidor, sem prometer monotonicidade global de relógio ou uma versão de banco irreutilizável. Outros clientes podem editar campos sem atualizar essa data; pré-leitura/CAS não são homologação de todos os escritores ou garantia contra todo ABA. Membership é preflight revalidada, não atomicamente vinculada à mutação/política existente; RLS não foi alterada nem homologada. Nenhuma migration foi criada/aplicada.

UNIQUE de origem significa substituição, não histórico imutável. UUID é ID na criação/referência na atualização, **não ledger durável de idempotência/exactly-once**. Trava local não coordena reload/abas/processos/dispositivos. Essas limitações não foram aceitas como risco comercial por inferência.

## Estado transitório, falhas e identidade

- Cache de dados e query de view por userId/workspaceId. View contém draft/base/recibo temporários, com query desabilitada para rede, stale Infinity, GC5min inativa e sem localStorage/persistência. Sobrevive à navegação/remount no mesmo runtime, não reload, fechamento, limpeza de sessão ou expiração. O shell compartilhado não foi modificado.
- Ledger síncrono por par conta/workspace contém somente flags/referência/feedback; não notas, áreas, scores, evidence ou payload privado de SSR. Impede duplo clique local e conserva pendência/incerteza após remount.
- Falha/resultado incerto conserva draft e referência, sem retry de POST, e bloqueia salvar/descartar. Liberar outra escolha requer GET válido deliberado, comparação humana e consentimento que **descarta o draft antigo sem reenviar/rebasear**. Um GET falho ou mero remount não desbloqueia a operação.
- Recibo válido é sucesso primário. Falha do GET posterior ou GET válido de estado diferente não apaga o recibo nem sugere repetir a gravação. Dados da leitura atual e recibo da gravação têm papéis separados; aviso só é removido após conferência de leitura apropriada.
- `skillAccountRequest` consulta a sessão antes de cada RPC; expected account é conferida também no servidor para fechar troca de token posterior. Query antiga não pode ser despachada sob conta nova; resposta em voo é aceita somente no cache/flags originais. Completar sob outra conta/workspace não limpa sua escolha/consentimento nem inicia segundo RPC do handler antigo após unmount. Uma requisição já enviada sob AuthA pode terminar paraA; não se promete cancelar/rollback por troca visual de contexto.

## Bug encontrado no navegador e correção validada

O run inicial3checks/3Axe revelou que “Voltar para editar” podia retornar imediatamente à revisão. O probe causal registrou clique type=button Back e, após reconciliação do mesmo formulário, submit involuntário do novo controle Review. Não houve POST extra porque consentimento era revogado.

Correção: formulário com identidade distinta por etapa e cancelamento explícito do default no Back. Regressão SSR de formulário/controles e navegador verificam edição restaurada, nota/notas mantidas e consentimento revogado ao revisar novamente. `back-step-diagnosis-final.json` mostra só clique, nenhum submit e input numérico restaurado. O run3848 anterior, build/HTTP e freeze620 anteriores são **históricos**; após a correção, suíte3850, freeze novo e build/HTTP/browser completos foram repetidos. Falha inicial de seletor QA (botão mudava corretamente para Salvando…) e expectativa de horário inglês12h também estão preservadas em history; não foram usadas para alterar produto indevidamente.

## Experiência e resultados finais

99 folhas estáticas novas por idioma, mantendo todos os namespaces anteriores. Dez áreas com ausência explícita, contagens de registradas/sem avaliação/faixa80–100, notas0/100 e datas SãoPaulo. Faixas0–29/30–79/80–100 são organização visual da escala, não domínio real, teste, certificação ou promessa de crescimento. Campos salvos são escapados, sem HTML/URLs de evidence executáveis; valores técnicos e textos legados não são “evidências verificadas”.

| Camada                   | Resultado observado                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                  | Node22.13.0 /Chromium158.0.8127.18                                                                                                        |
| Typecheck/lint finais    | PASS29,02s /23,83s                                                                                                                        |
| Testes finais            | **3.850 aprovados /132 arquivos /zero falhas**,390 novos em6 arquivos                                                                     |
| Focused final            | 390/390                                                                                                                                   |
| Build Vercel local       | PASS58s; heap1536MB+swap1536MB temporários, configuração produto/CI intacta                                                               |
| HTTP local anônimo       | **26 HTML /25 assets /zero erros**, PT/EN; shells privados não comprovam acesso autenticado                                               |
| Navegador compilado      | **53 checks /31 Axe**, zero violações detectadas/pageErrors/erros de harness/RPCs ou mutações inesperadas/requisições externas detectadas |
| Escritas de navegador QA | 24POSTs Skill Map sintéticos/interceptados;91reports CSP interceptados; nenhum write real                                                 |
| Integridade              | 620 src iguais entre gates/build/HTTP/browser;597 outros src da22,31 migrations e9 arquivos protegidos inalterados                        |
| Limpeza                  | Dois previews parados,8080 fechada, swap0, arquivo temporário removido, artefatos compilados hasheados/removidos                          |

Método: Vitest de contratos/builders Supabase e ServerFn falsos/estado puro/SSR; Chromium real sobre build compilado com Auth/RPC sintéticos no harness externo. Browser em Asia/Tokyo, larguras320/1280px, PT/EN, fluxos de teclado/foco, textos legados extensos, viewer, reavaliação, incerteza/recibos inválidos, conflitos, remounts e respostas tardias por conta/workspace. O transporte externo de contexto é interceptado, WebSockets fechados e fetch do servidor negado; isso não certifica firewall de todos os transportes nem WCAG. Nenhum mock/modo demonstração foi incorporado ao produto.

## Dependências e fronteiras externas

Auditoria geral23: exit1, **sete pacotes moderados numa cadeia dev**, minimatch10.2.5 no caminho aninhado sob typescript-estree8.60.0 e um advisory GHSA-g3hv-75wg-m249 no retorno público. A instalação raiz minimatch3.1.5 é distinta e não foi confundida com a afetada. Produção `--omit=dev --audit-level=moderate`: exit0/zero na observação. Lock SHA-256 `82539eb958951d9aed7233a40ac81b3a86091b5cb72ae874dcbe0d7cfa8e264a` intacto. Sem fix forçado/fork/override/waiver, mudança de threshold/CI ou aceite de risco. Zero num recorte não encerra mitigação/revisão técnica histórica; não houve payload DoS hostil ou prova completa de reachability.

Última publicação **registrada**17/base703f93c, não consultada23. Rodadas18–23 locais; nenhum conector/push/deploy/CI remoto/migration/alteração de ambiente ou banco. Auth/RLS/Postgres/concorrência/SMTP/IA/provedores reais, instalação limpa, backup/LGPD, Brain Lab legado e liberação comercial precisam de homologação específica autorizada.

Pacote por allowlist, sem `.env`, credenciais, Git, dependências/runtime/cache ou artefatos de deploy. Patches incremental22→23 e cumulativo18–23 sobre703f93c são alternativas, não aplicar ambos. Aplicações isoladas/hashes e limpeza constam dos recibos finais `patch-validation.json`/`final-verification.json`; o hash do ZIP fica no recibo externo para evitar autorreferência. Ausência/reprovação de recibo não pode ser tratada como entrega concluída.

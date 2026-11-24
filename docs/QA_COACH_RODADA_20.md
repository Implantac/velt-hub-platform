# QA — Coach · rodada 20

## Entrega e alcance

**Desenvolvimento local validado, não publicado.** Continuação da entrega19 sobre a última publicação registrada17/`703f93ce5fe0afc93666a0a6cd8b5ed2c42ffa92`. O estado remoto não foi reconferido nesta rodada. Fontes em `velt-development-20`; entregas18/19 preservadas, sem reescrever seus ZIPs ou recibos.

Nenhum conector Supabase/Vercel, Git remoto, push, deploy, banco real, migration, alteração de RLS/ambiente/configuração/credencial, SMTP, IA ou provedor real foi usado. Os três dotfiles omitidos pelo snapshot foram recuperados **somente em20** pelo ZIP19 verificado. `.env` foi preservado localmente por hash e não integra o pacote.

| Verificação final         | Resultado                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| Node                      | 22.13.0; dependências instaladas pelo lock existente                                            |
| Typecheck                 | PASS · 29,92 s                                                                                  |
| ESLint                    | PASS · 17,84 s                                                                                  |
| Vitest completo           | **2.863 testes / 114 arquivos / zero falhas** · 32,33 s                                         |
| Novos testes              | **310 / seis arquivos**                                                                         |
| Build Vercel local        | PASS · 46 s; configuração versionada preservada                                                 |
| Chromium no app compilado | **37 verificações / 24 varreduras Axe**, sem violações detectadas nos estados escolhidos        |
| Experiência               | PT/EN; 320/1280 px; navegador em Asia/Tokyo e datas em São Paulo                                |
| Smoke HTTP anônimo local  | **20 HTML / 25 assets / zero erros**, somente GET                                               |
| Integridade               | **564 hashes de src** iguais nos gates/build/browser/HTTP; nove arquivos protegidos inalterados |
| Dependências de produção  | Feed público reportou zero; lock inalterado; revisão técnica histórica não encerrada            |

O sandbox tem2GB. O build usou heap local1536MB e swap temporário1536MB, removido após o build, sem mudar `package.json`, locks, CI, Vite ou Vercel. Preview encerrado; artefato compilado só é removido após registrar seus hashes e verificar as evidências.

## Problemas concretos corrigidos

1. Os dois geradores de `coach_recommendations` dispensavam recomendações abertas **antes** de salvar o novo lote. Ambos agora usam o mesmo fluxo aditivo e estrito. Falha de fonte/insert/recibo não descarta histórico e um lote confirmado nunca dispara fechamento em massa.
2. `updateRecommendation` retornava sucesso sem confirmar linha alterada. Agora exige ID/workspace, ambos os estados abertos e o `updated_at` exato lido, retorna uma única linha e confere seu estado/timestamp. Zero linhas, conflito, resposta vazia ou escopo errado não são sucesso.
3. Leituras convertiam falhas/ausência de resposta em listas vazias e ocultavam o limite das prévias. Agora recomendações e jornada têm GETs próprios, count exato e páginas20 com predicados/escopo idênticos aos totais.
4. Sugestões antigas incluíam promessas comerciais sem base e a interface atribuía personalização à jornada. O novo lote é identificado como **regras sobre registros internos**, não IA, previsão, medida de audiência, receita ou prova de publicação.

## Fronteiras, acesso e contratos

- Todo GET/POST passa por Auth middleware e membership reconhecida **antes** da consulta de domínio. owner/admin/editor/viewer leem; apenas owner/admin/editor geram ou registram estado manual. UI também falha fechada; esconder botões não substitui a API nem RLS.
- Os testes de handlers usam contexto pré-autenticado sintético. Declaração do middleware e guardas são verificadas, **não o ciclo real de autenticação ou políticas Postgres**. Políticas/grants/migrations existentes não mudaram.
- `CoachService.listRecommendations` agora retorna uma página, não array. `listJourney` é o novo GET. Geração exige `batchId`; atualização exige `expectedUpdatedAt`. A rota/componente foram migrados juntos e não foram encontrados outros consumidores desses exports Coach no código.
- A entrada legada `BrainCoreService.brainRecommend` exige o mesmo contrato de lote e delega ao mesmo fluxo seguro. Um chamador antigo que envie só workspace falha na validação **antes de ler/escrever**, em vez de manter o comportamento destrutivo. É mudança deliberada de contrato; clientes externos/desatualizados exigem integração coordenada. Não há promessa de compatibilidade com chamadores desconhecidos.
- Somente o handler `brainRecommend` mudou no core, além dos imports de delegação. `brainSnapshot`, `brainAsk`, `brainAskAll`, `brainRemember`, `brainTimeline` e `brainOpportunities` foram comparados byte a byte com19 e preservados. Motores/carregadores/IA/Brain nativo da16 e matemática/adaptador de Saúde/Score da19 permanecem iguais. Nenhum desses outros endpoints foi executado para esta QA.
- O Coach novo não monta o realtime amplo legado. O hook compartilhado existente também marca os novos caches Coach como antigos, sem refetch automático. Invalidações de gravação são limitadas às chaves do usuário/workspace original e aos painéis dependentes; não geram análise/IA.

## Leituras honestas e história preservada

As recomendações usam filtros `open`, `completed`, `dismissed`, `conflicted` e `all`. “Concluída”/“dispensada” exigem apenas seu timestamp, sem o oposto; conflito mostra **os dois** e não é reaberto ou resolvido automaticamente. Datas legadas e textos originais são preservados. Prioridade numérica decimal legada é aceita, não promovida a score de desempenho.

A página de recomendações ordena criação decrescente, prioridade decrescente e ID decrescente; jornada, criação e ID decrescentes. Cada lista lê no máximo20 registros e tem limite de navegação100.000 páginas sem reduzir o total exato para esse limite. Totais/linhas podem mudar sob concorrência: não é snapshot transacional nem garantia de paginação sem deslocamento entre leituras.

Erro, null indevido, count ausente/incompatível, linha duplicada, registro estrangeiro ou metadata declarada inválida bloqueiam a página. Não se ignora uma linha ruim para simular completude. `PGRST103` só representa uma página posterior desaparecida se um novo count exato do mesmo filtro comprovar a ausência. Erro na primeira página ou recount falho/insuficiente continua erro. Voltar à primeira página é uma decisão GET explícita, não redirecionamento silencioso.

Loading, erro inicial, vazio confirmado, releitura e cache antigo têm apresentações distintas. Falha das recomendações impede nova gravação; falha da jornada é independente. Trocas de filtro/página são GET; GETs não geram lotes, memórias, Score, Saúde ou IA. A jornada não usa uma lista vazia como prova de nenhuma atividade externa e não diz que toda ação produzirá evento ou será contexto de IA.

## Metodologia do lote `velt-coach-v2`

Geração é um POST explicitamente confirmado, precedido de leitura válida do painel e reconhecimento dos efeitos. O adaptador estrito `buildDiagnostics` da19 lê **marcas, canais, conteúdo e scheduler_jobs**, sem consultar perfil/jornada ou chamar BrainSnapshot, motores legados, IA ou provedores.

Cada fonte exige count exato, escopo correto, formato válido, IDs únicos e recorte completo até500 (`min(total,500)`). A falta de uma fonte não vira zero. Coleção de conteúdo inclui rascunhos; atividade significa criação nos30 dias anteriores ao início da coleta, não última publicação. Fila exclui simulações, agendamentos futuros e resultados/reconciliações inelegíveis. Detalhes das fontes/fórmulas compartilhadas em [QA19](./QA_SAUDE_SCORE_RODADA_19.md).

| Código                | Critério das regras v2                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `brandMissing`        | Nenhuma marca na leitura confirmada                                                           |
| `brandIncomplete`     | Média de voz35/paleta35/logo30 preenchidos abaixo de70/100 nas marcas lidas                   |
| `channelMissing`      | Nenhum canal na leitura confirmada; conexão continua opcional                                 |
| `channelDisconnected` | Pelo menos um canal lido não consta conectado sem bloqueio de autorização conhecido           |
| `inventoryLow`        | Menos de9 itens de conteúdo no recorte, inclusive rascunhos                                   |
| `activityLow`         | Menos de6 itens criados em30 dias no recorte                                                  |
| `queueFailures`       | Pelo menos uma falha definitiva elegível no recorte                                           |
| `queueNoEvidence`     | Zero êxitos/falhas elegíveis para a taxa; não equivale a fracasso medido                      |
| `reviewBaseline`      | Nenhuma outra sugestão produzida por estas regras; não é “tudo em ordem” ou ausência de risco |

As regras atuais geram no máximo5 sugestões por avaliação; o contrato do lote é limitado a8. Cada card mostra critério, registros carregados/contados/limite500, contagem de criação, evidência da fila, janela de coleta e UUID do lote. A amostra parcial500/1205 é explicitamente diferente de uma leitura completa. Os quatro counts pertencem a leituras independentes, não a uma transação.

`cta.coach` guarda versão, código e evidência `velt-records-v2` no JSON existente, sem migration. Textos/CTA em PT estáveis preservam leitores legados; a UI20 traduz códigos reconhecidos em PT/EN. JSON declarado incompatível não cai silenciosamente em legacy. Há checagens das condições necessárias verificáveis no resumo (p.ex., inventário baixo não pode declarar9 itens); o resumo **não reconstitui os campos brutos nem prova origem, autorização ou realidade de um provedor**. É validação de consistência, não certificação externa.

Legados sem namespace mantêm o original, escapado, com aviso de metodologia não verificável e possíveis afirmações antigas sem base. Links salvos só são exibidos se forem destinos internos seguros; targets externos, scripts, barras codificadas/controles e normalizações perigosas não viram links. Isso não é uma alegação retroativa de exploração no helper antigo.

## Gravação principal, evento secundário e concorrência

- Um único insert aditivo envia o lote com IDs, ator/workspace, regras e base. O retorno inteiro precisa corresponder aos IDs/conteúdo/status/datas enviados, sem duplicatas ou partes faltantes. Histórico anterior não é dispensado/apagado antes ou depois do insert.
- Só depois do lote principal confirmado é tentado um evento secundário em `brain_memory_events`, com referência do lote, quantidade e ator/workspace conferidos. Falha/retorno incompatível do evento é aviso de lote já salvo, não convite para gerar novamente. Não há compensação destrutiva nem transação distribuída entre as duas gravações.
- Concluir/dispensar é um **registro manual**, não execução da sugestão, conexão de conta, publicação ou prova de resultado. O `user_id` original identifica o criador; o schema existente não ganhou trilha de todos os atores/transições de estado. CAS é proteção desta API, não uma nova restrição contra DML por todos os outros clientes.
- Trava síncrona por usuário/workspace evita duplo clique e persiste durante desmontagem/retorno à página **na mesma execução do navegador**. Snapshot de SSR não expõe o ledger do cliente. Cache, confirmação e feedback de uma identidade não aparecem em outra.
- Não há retry automático de POST. Retorno incerto conserva UUID de referência, bloqueia nova gravação e exige GET confirmado e conferência humana. A confirmação apenas libera uma decisão futura; não repete o POST nem prova ausência de duplicação. Mudar filtro/página exige nova conferência.
- Geração repetida pode produzir sugestões repetidas. `batchId` é referência de correlação, **não chave idempotente no banco**. Não se garante exactly-once entre abas, dispositivos, processos ou recarga da página; não há deduplicação distribuída nova.
- Recibo principal confirmado com releitura falha continua sucesso primário com aviso; não vira resultado incerto. Releitura da lista/jornada limpa somente o aviso correspondente, preservando o aviso estático de evento secundário não confirmado.

## Evidências, correções de QA e limites

Os310 novos testes estão em seis arquivos: modelo, contratos, handlers, apresentação, ledger e markup. As2.553 verificações anteriores continuam aprovadas. Testes temporais usam fixture explícita12/11/2026; handlers de QA têm relógio controlado.

O navegador usa app Vercel compilado, SDK e serialização reais, com Auth/RPC **interceptados em harness externo sintético**. Os16 POSTs Coach foram interceptados e não gravaram em banco. Zero pageErrors, RPCs/mutações inesperados e saídas HTTP inesperadas. WebSockets foram fechados e fetch do servidor negado; isso não é certificação de firewall. Os42 relatórios CSP interceptados não homologam a política da produção.

Foram exercitados: GET-only; refresh duplo; preparar/cancelar sem POST; confirmação e foco por teclado; critérios/amostra; lote aditivo e duplo clique; concluir/dispensar com versão; todos os estados, conflito e histórico fechado; páginas independentes e página desaparecida; legado com texto longo/HTML escapado/link inseguro omitido; loading/erro/vazio/stale; viewer; escopo estrangeiro; gravação salva-com-503 e recibo vazio; review GET falho/válido + humano; evento secundário/releitura falhos e recuperação por painel; retorno tardio com troca de workspace/usuário; trava sobrevivendo remount; membership desconhecida/falha/retry. Layout não teve overflow nos cenários320/1280 escolhidos. Axe não certifica WCAG.

Duas passagens de navegador pararam num **conflito do harness**: o gate de uma leitura deliberadamente atrasada capturava a leitura inicial do contexto recém-trocado, antes do clique de releitura. Foram preservadas como falhas em `history/`, sem reclassificação. A última passagem aguarda o workspace correto e exercita troca de identidade num contexto independente; ambos os cenários permanecem, sem retirar asserções de isolamento. Não houve mudança do produto para contornar esse teste. Antes disso, a revisão de código acrescentou invalidação de jornada no cache e limpeza do aviso de releitura da própria jornada; todos os gates/build/browser finais usam essa versão.

Chromium exigiu bibliotecas de sistema ausentes no sandbox. A instalação foi local; não houve mudança de dependência/lock do produto. Dois ajustes iniciais eram fixtures/testes novos (tipo JSON da entrada corrompida e tentativa de “forjar” um kind que já era o mesmo); corrigidos antes dos gates finais.

Referência temporal da sessão: **12/11/2026, America/Sao_Paulo**. O sandbox informa23/11UTC. O baseline19 realmente já registrava a mesma referência de sessão; não foi encontrada necessidade de reescrever sua política. Nenhum ZIP/recibo histórico foi adulterado e a diferença de relógio não comprova atualidade de feed/estado remoto. Auditoria pública zero com lock igual não prova patch técnico ou aceite de risco: revisão anterior continua pendente, sem fork, waiver, mudança de threshold ou bypass de CI.

Pendências: homologar Auth/RLS/Postgres e concorrência real em ambiente isolado autorizado; revisar outros fluxos legados do Brain/Navigator; segurança operacional, dependências, LGPD/backups/SMTP e integração de provedores/IA reais. **Não houve liberação comercial irrestrita.** Publicar18–20 continua uma etapa separada, dependente de pedido específico.

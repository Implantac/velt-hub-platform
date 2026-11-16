# Publicações sem confirmação — operação e recuperação

Este fluxo evita que uma resposta perdida seja interpretada como autorização para publicar novamente. Consultar a referência original **não cria outro post**. O código e os testes não substituem homologação com uma conta externa autorizada.

## O que cada estado significa

| Estado de confirmação | Significado                                                                                                                                    | Próximo passo                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `none`                | Sem consulta de confirmação ativa; pode ser um agendamento ainda não iniciado ou uma falha anterior ao envio                                   | Consultar a situação da tentativa e seu erro; não presumir que qualquer falha permite reenviar        |
| `pending`             | O envio pode existir, mas a confirmação final ainda não foi registrada                                                                         | Aguardar a consulta da referência original, com backoff; não reenviar                                 |
| `review`              | Faltam evidências, autorização de leitura ou uma referência segura; ou o limite automático foi atingido                                        | Owner/admin confere a mesma conta no provedor e decide; uma nova consulta só aparece quando aplicável |
| `confirmed`           | O observador confirmou os requisitos de identidade/estado/visibilidade daquele provedor, ou a confirmação final foi persistida pelo publicador | Job `succeeded`; não repetir a publicação                                                             |
| `rejected`            | Foi observada recusa/falha terminal explícita, não apenas erro ao consultar                                                                    | Corrigir a causa e avaliar um novo agendamento como ação separada                                     |
| `closed`              | Owner/admin encerrou a revisão interna com justificativa                                                                                       | Não certifica publicação nem ausência no provedor; não reenvia ou exclui conteúdo externo             |

A tabela da interface diferencia “Aguardando confirmação”, “Revisão necessária”, “Recusado pelo provedor” e “Encerrado manualmente”. Os filtros de confirmação não alteram o job. Uma referência de container, upload ou tracking **não é um post público**. IDs legados sem tipo validado ficam identificados como tal, inclusive antes da recuperação.

## Conferir um resultado incerto

1. Em **Agendamento**, localize o conteúdo e canal corretos. Expanda **Referência e conferências** para consultar referência, contagem, última conferência e próxima consulta disponível.
2. **Verificar confirmação** requer owner/admin do workspace. O servidor revalida papel, workspace e ID exato do job. Editor e viewer não podem disparar consultas privilegiadas.
3. A ação consulta somente o envio preservado. Não chama criação de post, upload ou `media_publish`. O status-fetch do TikTok usa POST por contrato da plataforma, mas é uma leitura.
4. O botão pode estar desabilitado por cooldown ou outra consulta em andamento. Não tente contornar a reserva. “Nenhuma consulta disponível” não significa sucesso.
5. `401`/`403`, referência ausente, conta divergente e respostas não reconhecidas exigem revisão. Um `404` não comprova que o post nunca existiu. Indisponibilidade/timeout mantêm consulta pendente com backoff.
6. Reconecte somente **a mesma conta** se a autorização de leitura tiver expirado. Não troque a identidade do canal de uma entrega incerta.

O ciclo normal e a execução manual da fila fazem recuperação/consultas antes de novos envios. Crons ativos não comprovam que um provedor recebeu/publicou o conteúdo: monitore separadamente SQL, HTTP, jobs e a visibilidade externa.

## Encerrar revisão, sem inventar resultado

Somente um job em revisão, sem execução/consulta reservada, permite **Encerrar revisão**.

- Confira primeiro o provedor e a conta corretos.
- Registre uma justificativa de **20 a 1000 caracteres** e confirme a declaração do diálogo. Não inclua tokens, senhas ou dados sensíveis.
- A decisão grava `content.publication_review_closed`, com ator, job, conteúdo, decisão `close_without_resend` e justificativa. O texto completo fica no evento de auditoria; o resumo da conferência tem limite de 1000 caracteres.
- O job permanece na trilha histórica, sem ser transformado em `succeeded`. Nenhuma chamada de publicação/exclusão é feita.
- Falha HTTP preserva o formulário. Se a resposta se perdeu depois do commit, uma repetição não cria outro encerramento: atualize a fila e confira o estado/auditoria. **Não conclua que a falha HTTP desfez uma operação.**
- Depois do encerramento, o agregado do conteúdo é recalculado. Outro canal ainda pendente/incerto mantém o conteúdo bloqueado. Sem outro resultado publicado ou ativo, ele pode voltar a `failed` e ficar elegível para um agendamento separado.

**Reagendar é outra decisão e pode duplicar um post existente.** Encerrar a revisão não prova ausência no provedor e não cancela um post que já tenha sido criado.

## Limites e garantias do mecanismo

- `delivery_token` identifica uma execução; `delivery_started_at` marca o limite conservador anterior à escrita. O hook de banco é aguardado antes de cada escrita upstream. Perder seu acknowledgement interrompe a próxima escrita.
- Checkpoints tipados preservam conta/plataforma/referência antes da etapa seguinte. URLs de upload autenticadas não são persistidas como referência de publicação.
- Apenas uma execução fenced interrompida **antes** desse limite, sem referência aceita, pode ser recuperada automaticamente para a fila. Recusas explícitas e falhas comprovadamente anteriores ao envio seguem a política de retry e seu limite. Resultados incertos não autorizam novo envio.
- Claim de envio usa lease de 300 segundos por padrão; o início de escrita revalida e renova cinco minutos. Recuperação de execução expirada aguarda mais 30 segundos. Sem lease, aplica janela conservadora de dez minutos desde `run_at`/criação. Locks/tokens antigos não autorizam uma nova escrita após recuperação.
- Consultas são reservadas individualmente, imediatamente antes da leitura, com lease de 60 segundos no serviço. Um token substituído não pode registrar um resultado conflitante.
- Backoff exponencial das consultas, limitado a seis horas. Ao atingir 20 consultas automáticas ou sete dias sem confirmação, o resultado pendente passa para revisão. Novas consultas manuais em revisão respeitam cooldown de 15 minutos e limites do banco.
- O serviço deixa de iniciar novos itens após um orçamento de 45 segundos; **não é deadline absoluto** da consulta já em andamento. Refresh tem timeout de 20 segundos e a leitura HTTP de confirmação, 15 segundos.
- Cada chamada inicia até três publicações; jobs do mesmo canal são serializados dentro daquele lote. Não é um mutex global de refresh para chamadas diferentes.
- Conteúdo/canal/identidade com publicação pendente, em execução ou incerta ficam protegidos contra edição, exclusão, retarget e reagendamento incompatíveis. O cascade autorizado de exclusão do workspace continua permitido.

Isso reduz risco de duplicidade; **não é uma garantia universal de exactly-once em APIs externas**. Ainda pode haver escrita aceita sem referência retornada, perda de confirmação ou mudança posterior do post. Nesses casos o comportamento é bloquear e pedir revisão, não adivinhar.

## Particularidades dos provedores

- **Instagram:** container `FINISHED` é pronto para publicar, não publicado. Container `PUBLISHED` sem ID da mídia exige revisão. A confirmação da mídia exige referência/proprietário/permalink esperados; a reconciliação nunca chama `media_publish`.
- **Facebook:** ID de foto isolado não identifica automaticamente um post. Posts exigem Página autora, `is_published=true`, `is_hidden=false` e `is_expired=false`. Vídeo pronto não basta: estado de publicação também é conferido.
- **YouTube:** processamento concluído não implica vídeo público. Canal, referência e privacidade pública são conferidos; projetos não auditados podem ter uploads privados.
- **LinkedIn:** Posts API versionada. A leitura pode exigir permissão restrita além da permissão de escrita; não possuir leitura leva a revisão, não a republicação. Autor, ID, visibilidade pública e distribuição no feed são conferidos.
- **TikTok:** inbox não conta como publicação. `PUBLISH_COMPLETE` sem um único ID publicamente disponível não basta. IDs int64 são preservados sem arredondamento em Node 22. Upload atual continua limitado a um chunk de até 64 MiB.
- **Google Business:** consulta a mesma localização/referência. `LIVE`/`RECURRING` distinguem-se de `PROCESSING`/`REJECTED`; não se cria outro `localPost` para consultar.

Esses contratos foram exercitados com respostas sintéticas e documentação. Aprovação do app, grants, formatos, quotas, OAuth/publicação/coleta reais e recuperação externa ainda precisam de autorização e homologação específicas. X, Threads e Pinterest não recebem publicações automáticas nesta versão.

## Banco e implantação

A migration `20261116113916_publication_reconciliation.sql` já está aplicada **somente no Supabase VELT**, com a versão atribuída pelo serviço. Não a reaplique manualmente nesse projeto. São 13 colunas e RPCs/guardas de lifecycle; os RPCs antigos foram preservados para transição de deploy, sem permissão para liquidar uma execução fenced nova.

Deploy continua Git/main-only; CI paralelo, não gate. Faça smoke pós-deploy e confirme SHA, CI, estado e domínio. Confira [a evidência da rodada 4](./QA_RECONCILIACAO_RODADA_4.md) e [o checklist para clientes](./PORTFOLIO_E_CLIENTES.md). Não usar `VELT_PUBLISHER_MODE=simulate` em produção e não liberar clientes por ter apenas build/HTTP 200/testes aprovados.

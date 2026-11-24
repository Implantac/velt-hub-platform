# Plano de melhorias e correções — VELT

## Integração GitHub25 — conteúdo completo18–24 para o Lovable

Esta integração reúne a entrega24 completa sobre703f93c na branch de destino `main`, conforme solicitação do usuário. As seções locais18–24 abaixo são encerramentos históricos; não são instruções de publicar cada patch separadamente nem de restaurar/reiniciar o banco.

- Projeto completo, não só Brain Lab: Missões/Saúde/Score/Coach/Navigator/Aprendizado/Skill Map/Skills do Lab, preservando a base Dashboard/Brain15–16.
- Código funcional24 e628src inalterados; apenas documentação desta integração é nova. Validações por commit/CI/sincronização Lovable são evidências externas separadas.
- Manutenção dos sete moderados dev continua pendente; produção observada0 não aceita risco. Sem fix/fork/waiver/override/threshold/CI alterados.
- Ainda pendentes: API Skills legada exportada/outros seis painéis, homologação real isolada autorizada, instalação limpa/backup/LGPD/liberação comercial.
- Nenhum deploy manual, banco/migration/ambiente, publicação social ou reativação de Lovable Cloud está incluído. Push pode acionar automações Git existentes; publicação final no Lovable deve ser conferida lá.

[Escopo e operação](./docs/INTEGRACAO_GITHUB_RODADA_25.md).

## Rodada 24 — Skills do Brain Lab no fluxo compartilhado (local, não publicada)

Continuação da23 em `velt-development-24`. **Rodadas18–24 permanecem locais**; última publicação registrada17/base703f93c, sem consulta remota24. Seções anteriores são encerramentos históricos.

- [x] Substituir o formulário Skills legado pelo mesmo SkillMapSurface/hook/API/cache/draft/recibo/trava da rota nativa, sem segundo escritor ou alteração dos contratos/guard23.
- [x] Preservar nota0–100/zero válido/ausência honesta, base/recibo/CAS, viewer próprio, metadados técnicos não verificados, revisão/consentimento e incerteza sem replay.
- [x] Links explícitos entre os dois locais no mesmo runtime, com draft preservado/consentimento revogado e respostas tardias isoladas por conta+workspace.
- [x] Aba na URL validada, deep-link Skills sem montar Twin/abas inativas, tablist de ativação manual por teclado e Back; padrão twin preservado.
- [x] h1/h2/h3 e IDs adequados por contexto;15folhas PT/EN novas, todos os namespaces anteriores preservados. Outros seis conteúdos não são alegados traduzidos/corrigidos.
- [x] **4.056 testes/136arquivos (206novos),88checks/64Axe,28HTML/25assets**, typecheck/lint/build;390 testes e53checks/31Axe nativos23 reaplicados.39POSTs Skills e7GETs Twin sintéticos, não serviços reais.
- [x]628src/611outros baseline/31migrations/9protegidos preservados; preview/swap/saída compilada encerrados.
- [ ] Mitigação segura dos **sete moderados dev** pendentes; produção observada0 não corrige/aceita, sem fork/waiver/override/CI alterado.
- [ ] API legada de Skills ainda exportada (UI conhecida migrada); coordenar clientes externos/depreciação sem presumir correção/retirada do servidor. Outros seis painéis/motores permanecem anteriores.
- [ ] Homologação real isolada autorizada de Auth/RLS/Postgres/serviços, instalação limpa/backup/LGPD/liberação comercial.
- [ ] Integração/publicação18–24 somente sob pedido específico; apps conectados não autorizam push/deploy/banco.

[Método e limites](./docs/QA_BRAIN_LAB_SKILLS_RODADA_24.md): estado substituível, sem ledger/idempotência/lock distribuídos, membership preflight não atômica e assessed_at não versão universal. Sem liberação comercial inferida.

## Rodada23 — Skill Map com edição deliberada e reavaliação (histórico local)

Continuação da22 em `velt-development-23`. **Rodadas18–23 permanecem locais**; última publicação registrada17/base703f93c, sem consulta remota23. Encerramentos anteriores são históricos.

- [x] Substituir gravação ao soltar régua por escolher/editar/revisar/consentir/salvar; nota inteira0–100/step1 por teclado, sem confundir ausência com0 ou certificar domínio.
- [x] GET completo e limitado às10 áreas/count exato, escopo de conta+workspace, membership reconhecida inclusive viewer próprio; loading/erro/vazio/stale distintos e dados legados escapados/preservados.
- [x] API nativa dedicada com conta esperada, pré-leitura/base completa, INSERT na ausência ou UPDATE CAS por ID/escopo/assessed_at e recibo integral. Sem UPSERT/delete/histórico fictício/evento Brain/recalcular outros módulos.
- [x] Preservar confidence/evidence originais sem tratá-los como calibrados/verificados; origem self e mudança de campos/datas declaradas na revisão. Segunda avaliação atualiza o mesmo registro único; no-op não normaliza/grava.
- [x] Draft/recibo temporários e ledger de flags por conta+workspace, remount, proteção pré-RPC/servidor de identidade e respostas tardias que não alteram nova intenção/consentimento. Incerteza exige GET+humano e descarte sem replay.
- [x] Corrigir bug real de Back/default-submit encontrado no browser, repetir gates/build/HTTP/browser; PT/EN99folhas, foco/labels,320/1280px e datas SãoPaulo.
- [x] **3.850 testes/132 arquivos (390 novos),53 checks/31 Axe,26 HTML/25 assets**, typecheck/lint/build finais PASS.24POSTs sintéticos, nenhum serviço real homologado; preview/swap/saída compilada encerrados.
- [ ] Mitigação segura dos **sete moderados dev** observados no lock intacto; produção0 não é correção/aceite, sem fork/waiver/override/CI alterado.
- [ ] Revisar Brain Lab legado (incluindo seu painel de Skills), demais fluxos/onboarding e homologação real isolada autorizada de Auth/RLS/Postgres/serviços. API legada brain-evolution não foi alterada23.
- [ ] Integrar/publicar18–23 somente mediante solicitação específica; apps conectados não são autorização permanente.

[Contratos, método e limitações](./docs/QA_SKILL_MAP_RODADA_23.md): estado substituível por conta/workspace/área, sem histórico imutável; membership preflight não atômica, assessed_at não é versão monotônica universal, trava efêmera/UUID sem idempotência distribuída. Sem liberação comercial inferida.

## Rodada 22 — Trilhas de Aprendizado pessoais e verificáveis (local, não publicada)

Continuação da entrega21 em `velt-development-22`. **Rodadas18–22 permanecem locais.** Última publicação registrada17/base703f93c, sem consulta remota22. Seções anteriores registram seus encerramentos, não uma revalidação atual de produção.

- [x] Catálogo paginado20/count exato/ordem estável; estados independentes de catálogo e progresso, sem transformar erro em vazio/zero.
- [x] Progresso pessoal por conta, incluindo viewer; cache/intenção/recibo isolados e memória temporária no remount, sem armazenamento persistente.
- [x] Comando explícito marcar/desmarcar, revisão/consentimento, conta esperada no servidor, catálogo/base completa e INSERT ou UPDATE CAS com recibo integral, sem UPSERT/retry/efeitos ocultos.
- [x] Preservar IDs antigos, mostrar percentual original divergente e calcular somente marcos reconhecidos. No-op não normaliza nem escreve.
- [x] Resultado incerto exige GET+humano e descarte da intenção antiga, sem replay/rebase automático; salvar confirmado com GET falho mantém sucesso com aviso separado.
- [x] Fechar janela de troca de conta detectada no QA: conferir sessão antes de RPC e accountId no servidor, sem modificar Auth/shell; resposta antiga não altera intenção/consentimento novos.
- [x] PT/EN, teclado/foco,320/1280px e datas São Paulo; autorrelato não é certificação, tarefa executada, IA ou resultado comercial.
- [x] **3.460 testes/126 arquivos,286 novos**, typecheck/lint/build; **48 checks/34 Axe**, **24 HTML/25 assets** locais,25POSTs sintéticos, sem escrita real. Preview/swap/artefatos gerados encerrados.
- [ ] Resolver auditoria geral **sete moderados dev**, com revisão segura própria; produção observada zero não é correção/aceite. Lock/CI intactos, sem fork/waiver/override.
- [ ] Homologar Auth/RLS/Postgres/concorrência/serviços reais somente em ambiente isolado autorizado; revisar demais fluxos legados Brain Lab/Skill Map/onboarding.
- [ ] Integrar/publicar18–22 somente mediante solicitação específica; apps conectados não são autorização permanente.

Método e mudanças deliberadas de contrato em [QA_APRENDIZADO_RODADA_22.md](./docs/QA_APRENDIZADO_RODADA_22.md). Catálogo sem versão transacional, progresso substituível/autorrelatado, UUID não idempotente e trava limitada ao runtime; nenhuma liberação comercial inferida.

## Rodada 21 — Navigator pessoal utilizável e versionado (local, não publicada)

Continuação da entrega20; fontes completas em `velt-development-21`. Última publicação registrada17/base703f93c, sem consulta remota21. **Rodadas18–21 permanecem locais.** Seções anteriores são estados históricos, não novas confirmações de produção.

- [x] Corrigir primeiro uso bloqueado: ação de começar, cinco perguntas navegáveis e revisão/consentimento antes de salvar; prefill de todas as respostas e descarte explícito.
- [x] Tratar perfil como pessoal por user_id, sem exigir editor de workspace; cache/draft/ledger isolados por conta. Preservar draft temporário no remount de workspace sem mudar o shell compartilhado nem persistir no navegador.
- [x] Diferenciar loading/erro/ausência/stale; GET estrito, owner conferido, metadata nativa inconsistente rejeitada; POST sem retries automáticos.
- [x] Remover upsert e efeito oculto de concluir onboarding. INSERT ou UPDATE com versão exata, retorno obrigatório e recibo integral de ator/respostas/regras/revisão/datas, sem truncar microssegundos.
- [x] Resultado incerto exige GET deliberado e humano; versão atual diferente exige descarte/carga ou rebase e nova confirmação separadas. Confirmação primária não é perdida por falha da releitura.
- [x] Expor roteiro determinístico limitado `velt-navigator-v2`, fórmula herdada do enum técnico e ausência de diagnóstico/IA/previsão. Preservar legados, valores completos, opções originais e links internos seguros; PT/EN, teclado, mobile e fuso São Paulo.
- [x] Validar **3.174 testes/120 arquivos (311 novos)**, typecheck/lint/build Node22; **38 checks/25 Axe**, **22 HTML/25 assets** locais, sem escrita real.
- [ ] Resolver com revisão/validação própria a auditoria geral **sete pacotes moderados dev / um advisory minimatch**. Produção observada zero, locks intactos; sem atualização forçada, fork, waiver, mudança de CI ou aceite de risco.
- [ ] Homologar Auth/RLS/Postgres/concorrência e outros fluxos reais somente em ambiente isolado autorizado; revisar Brain Lab/aprendizado/onboarding e operação comercial.
- [ ] Integrar/publicar18–21 somente quando solicitado especificamente; apps conectados não autorizaram push/deploy/banco nesta rodada.

Método/contratos/limites em [QA_NAVIGATOR_RODADA_21.md](./docs/QA_NAVIGATOR_RODADA_21.md). UUID de revisão não é chave idempotente de banco; perfil substituível não é trilha imutável. Trava/draft não persistem após reload nem coordenam abas/dispositivos.

## Rodada 20 — Coach com histórico e ações confiáveis (local, não publicada)

Continuação da entrega19; fontes completas em `velt-development-20`. Última publicação registrada17/base703f93c, não reconsultada nesta rodada. **Rodadas18–20 permanecem locais.** As seções anteriores abaixo descrevem os respectivos encerramentos históricos, não o estado remoto atual.

- [x] Paginar recomendações/jornada20 com count exato e estados independentes; diferenciar loading/erro/vazio/stale e permitir recuperar uma página desaparecida por GET explícito.
- [x] Preservar estados aberto/concluído/dispensado/conflitante e todo o histórico; não fechar recomendações abertas durante a geração.
- [x] Unificar as duas entradas de geração na mesma operação aditiva e estrita, com lote/ator/escopo/linhas conferidos e aviso secundário de jornada separado.
- [x] Gerar por regras `velt-coach-v2` usando somente o adaptador estrito de quatro fontes da19; mostrar amostra/count/cap/janela e critérios, sem promessa comercial, IA ou personalização implícita pela jornada.
- [x] Exigir membership reconhecida e owner/admin/editor para escrever, também na API; status manual condicionado à versão aberta exata lida e zero linhas rejeitadas.
- [x] Confirmar efeitos antes de gravar; trava síncrona por usuário/workspace que sobrevive remount no mesmo runtime; sem retry de POST, resultado incerto exige GET e reconhecimento humano.
- [x] Isolar cache/feedback/retornos tardios, proteger links salvos e conservar legado original escapado/rotulado; PT/EN, foco de confirmação, mobile e datas São Paulo.
- [x] Validar **2.863 testes/114 arquivos (310 novos)**, typecheck/lint/build local; **37 checks/24 Axe**; **20 HTML/25 assets** locais. Postagens de QA sintéticas/interceptadas, sem serviço real.
- [ ] Homologar Auth/RLS/Postgres reais e outros fluxos legados em ambiente isolado autorizado; testes sintéticos não equivalem a isso.
- [ ] Concluir revisão técnica de dependências e segurança operacional; feed zero e lock igual não encerram risco anterior nem autorizam fork/waiver/bypass.
- [ ] Integrar/publicar18–20 somente quando solicitado especificamente; nenhum conector/push/deploy/migration/configuração remota nesta rodada.

Detalhes, mudanças deliberadas de contrato e limites em [QA_COACH_RODADA_20.md](./docs/QA_COACH_RODADA_20.md). Lotes são aditivos e podem repetir sugestões; batchId não é chave idempotente de banco. Não há promessa exactly-once ou liberação comercial irrestrita.

## Rodada 19 — Saúde e Digital Score confiáveis (local, não publicada)

Continuação local da entrega18 preservada. A última publicação registrada continua a17/base `703f93ce5fe0afc93666a0a6cd8b5ed2c42ffa92`; estado remoto não foi consultado nesta rodada. Fontes em `velt-development-19`. Nenhum push/deploy automático, conector remoto ou mudança de banco/configuração/credencial.

- [x] Separar releitura GET de novo cálculo POST explícito; loading, falha inicial, vazio confirmado e cache antigo não se confundem.
- [x] Exigir membership reconhecida e limitar cálculo a owner/admin/editor, também na API; viewer só consulta.
- [x] Isolar cálculo em adaptador estrito de quatro fontes, sem mudar o carregador/motores legados compartilhados do Brain ou chamar IA/provedores.
- [x] Versionar a metodologia `velt-records-v2`, declarar contagens exatas versus recorte500, janela de coleta e falta de evidência; atividade de rascunhos não é publicação e simulações/incertezas não são crescimento medido.
- [x] Confirmar Score principal e exatamente cinco áreas de Saúde; avisos de espelhamento/cache/releitura são independentes de uma gravação já confirmada.
- [x] Evitar duplo clique local; resultado incerto exige GET e reconhecimento humano sem retry automático de POST; dados/feedback isolados por módulo/usuário/workspace.
- [x] Composição em features, PT/EN, seis pilares/cinco áreas, históricos parciais/legados explícitos e datas São Paulo; layout móvel e controles rotulados.
- [x] Validar **2.553 testes/108 arquivos (275 novos)**, typecheck/lint/build local; **49 checks navegador/35 Axe**; **18 HTML/25 assets** locais, sem escrita externa.
- [ ] Homologar Auth/RLS/Postgres e serviços reais em ambiente isolado autorizado; testes sintéticos não substituem isso nem certificam WCAG.
- [ ] Concluir revisão técnica das dependências e demais fluxos legados; auditoria pública zero não prova correção técnica nem aceite de risco.
- [ ] Integrar/publicar18–19 somente mediante pedido específico; esta entrega permanece local.

Método, versão, limites, evidências e ressalvas em [QA_SAUDE_SCORE_RODADA_19.md](./docs/QA_SAUDE_SCORE_RODADA_19.md). Nenhuma promessa de transação distribuída, exactly-once, resultado comercial ou liberação irrestrita.

## Rodada 18 — missões confiáveis (local, não publicada)

Base publicada: `703f93ce5fe0afc93666a0a6cd8b5ed2c42ffa92`, confirmada na publicação 17. O usuário escolheu continuar o desenvolvimento local, sem novo push/deploy automático. **Fontes desta rodada no checkout limpo `velt-development-18`**, não no histórico dirty herdado de `velt-hub-platform`.

- [x] Distinguir loading, erro inicial, vazio confirmado e cache desatualizado, com retry somente de leitura; null/erro não viram lista vazia.
- [x] Paginar em 20 registros com total exato do mesmo filtro, ordenação estável e recuperação de página desaparecida; contagens das colunas são somente da página atual.
- [x] Exibir os quatro estados, inclusive dispensada, e permitir retorno explícito de uma missão ao estado pendente.
- [x] Normalizar título2–160/descrição2000/prioridade0–10, confirmar linha/escopo/ator antes de limpar e separar falha de atividade secundária de falha da criação.
- [x] Restringir escritas a owner/admin/editor, negar membership desconhecida, condicionar atualização ao estado e timestamp exatos lidos e rejeitar update de zero linhas.
- [x] Bloquear duplo envio de forma síncrona; preservar rascunho em resultado incerto e exigir releitura + confirmação humana para liberar outra ação, sem repetir POST.
- [x] Isolar cache/formulário/feedback por usuário e workspace; resposta tardia não limpa outra edição nem refaz consulta com outra identidade.
- [x] Compor a rota sob features, traduzir PT/EN, rotular controles e apresentar datas São Paulo, prioridades zero e histórico legado sem coerção.
- [x] Validar **2.278 testes/103 arquivos**, typecheck/lint/build Vercel local; **36 checks de navegador/24 Axe**, 14 HTML/25 assets locais. Os 16 POSTs de missões no navegador foram sintéticos e interceptados fora do produto.
- [ ] Homologar missões com Auth/RLS/Postgres reais em ambiente isolado autorizado; testes de contrato e transporte sintético não substituem isso.
- [ ] Concluir revisão técnica das dependências: auditoria pública atual reportou zero com lock inalterado; não se afirmou correção técnica nem aceite de risco.
- [ ] Integrar/publicar esta rodada somente após solicitação específica; nenhum push, deploy, migration, banco ou configuração remota foi alterado aqui.

Estados são registros manuais: esta tela não executa a missão, publica conteúdo, gera IA ou recalcula pontuações/snapshots do Brain. A condição de versão protege **esta API**, não é uma nova restrição geral do banco nem garantia de criação única entre processos. Método e limites em [QA_MISSOES_RODADA_18.md](./docs/QA_MISSOES_RODADA_18.md).

### Publicação 17 — concluída (evoluções 15–16)

As evoluções de painel e Brain nativo foram publicadas em `703f93ce5fe0afc93666a0a6cd8b5ed2c42ffa92`, com 50 alterações e 619 blobs conferidos. O [CI44565754068](https://github.com/Implantac/velt-hub-platform/actions/runs/44565754068) aprovou aplicação e auditoria; a automação Git da Vercel promoveu `dpl_CsUvRNt5zDZxuKAPEWgEVS3pxzBB`, mesmo SHA, em produção. O smoke público passou em 12 HTML/25 assets. Não houve novo deploy manual ou mudança de banco/configuração nessa publicação.

**As seções 15–16 abaixo preservam o estado histórico de cada encerramento, anterior à publicação17; suas indicações de “ainda não publicado” não descrevem mais o estado remoto atual.** A reprovação de CI14 continua sendo histórica e não foi reclassificada. A rodada18 acima permanece somente local.

## Rodada 16 — USE Brain nativo (local, não publicada)

Continuação local da entrega 15, sobre a última publicação conhecida `2c32eff40f6d2c88eaaffd2e8eaf329b161066ab`. As evoluções 15 e 16 ainda não foram enviadas ao GitHub/Vercel; nenhum banco/env/credencial foi alterado nesta rodada.

- [x] Distinguir loading/erro/vazio confirmado/cache desatualizado por painel de memórias e recomendações, com retry e prévias50 separadas dos totais exatos.
- [x] Separar atualização GET de geração explícita por regras, com confirmação, fontes contadas corretamente e falhas propagadas antes da gravação.
- [x] Preservar o histórico em falha de geração; confirmar lote salvo e informar evento secundário indisponível sem incentivar duplicação.
- [x] Confirmar memórias com trim2–4000 e status manual open/não expirado; zero linhas/recibo incompatível não são sucesso. Bloquear duplo envio e pedir releitura antes de decidir reenviar resultado incerto.
- [x] Restringir ações a owner/admin/editor, negar membership desconhecida e isolar cache, formulário e retorno tardio por usuário/workspace.
- [x] Melhorar rótulos, radios, PT/EN, fuso São Paulo, rota de composição e feedback de recuperação parcial/completa.
- [x] Validar 2.067 testes/99 arquivos, typecheck/lint/build, 38 checks navegador/21 Axe e 12 respostas HTML/25 assets locais. Auth/RPC/gravações do navegador são sintéticos fora do produto.
- [ ] Concluir a revisão técnica de dependências e homologar fluxos reais em ambiente autorizado. Audit local reportou zero no lock inalterado; risco técnico histórico não foi considerado corrigido.
- [ ] Integrar/publicar quando autorizado, partindo da main remota correta — não do HEAD herdado. Patches incremental16 e acumulado15–16 são alternativas.

O USE Brain nativo gera recomendações por regras, **não recalcula a pontuação/cinco respostas do dashboard** nem chama IA. Core de análises/Coach/Brain Lab e idempotência distribuída permanecem outras frentes. Histórico aditivo pode conter sugestões repetidas. Método, contratos e limites em [QA_BRAIN_RODADA_16.md](./docs/QA_BRAIN_RODADA_16.md).

## Rodada 15 — painel confiável (local, não publicada)

Base publicada: `2c32eff40f6d2c88eaaffd2e8eaf329b161066ab`, integrada na rodada 14. A revisão abaixo é desenvolvimento local; não houve push/deploy nem alteração de banco/configuração.

- [x] Contar marcas/canais/conteúdo com contagens exatas; separar o total de agendamentos futuros pendentes da prévia de até cinco, com o mesmo corte de data.
- [x] Exibir falha de leitura, ausência confirmada e cache desatualizado como estados diferentes, sem converter erro em zero.
- [x] Tornar atualização do painel somente leitura; consultar análises salvas com data/expiração e manter geração como ação explícita no USE Brain.
- [x] Adiar consultas avançadas no primeiro uso até a abertura dos detalhes; conexão social opcional fora das duas etapas essenciais.
- [x] Isolar cache e feedback por usuário/workspace, ocultar dados com membership não confirmada e adequar próximos passos ao papel.
- [x] Preservar navegação/metadados/SSR, mover composição para features e traduzir estáticos PT/EN com datas no fuso explícito de São Paulo.
- [x] Validar localmente typecheck/lint, 1.878 testes/95 arquivos, build Vercel, 39 checks de navegador/21 Axe e 10 respostas HTML/25 assets.
- [ ] Concluir a revisão técnica de dependências: consultas de auditoria desta rodada retornaram zero, mas o lock não mudou; a página do advisory contém data posterior à referência da conversa. Não se tratou isso como patch nem aceite de risco.
- [ ] Revisar e autorizar futura integração/publicação. Nenhum HEAD Git herdado deve ser publicado sem reconstruir a integração sobre a base remota correta.

Método, resultados e limites em [QA_PAINEL_RODADA_15.md](./docs/QA_PAINEL_RODADA_15.md). Fixtures de QA ficam fora do produto e não homologam Auth/RLS/SMTP/provedores reais. Piloto assistido condicionado, sem liberação comercial.

### Publicação 14 — concluída (histórico operacional)

A evolução de acesso da rodada 13 foi publicada no GitHub/main como `2c32eff40f6d2c88eaaffd2e8eaf329b161066ab` e promovida na Vercel como `dpl_G4mDE3C5jH5AeHwPPz2psJxNoC1V`. A aplicação passou no CI; a auditoria então registrou 11 findings altos. Isso é histórico, não uma nova publicação ou um novo CI desta rodada.

## Rodada 13 — acesso para piloto assistido (histórico; publicada na rodada 14)

- [x] Confirmar sessão antes de exibir a troca de senha; distinguir link inválido de indisponibilidade temporária, inclusive falha na inicialização do SDK.
- [x] Descartar respostas antigas em logout/troca de identidade e revalidar a conta antes de atualizar a senha.
- [x] Bloquear duplo envio, oferecer feedback de limite/reenvio e preservar campos em falha, sem afirmar entrega de e-mail.
- [x] Usar destinos de confirmação/reenvio consistentes, validação compartilhada de nome e visibilidade de senha acessível.
- [x] Manter PT/EN e rotas de composição; validar 1.663 testes/91 arquivos, typecheck/lint/build, 76 checks de navegador/28 Axe e 6 respostas SSR/11 assets locais.
- [ ] Homologar SMTP, redirecionamentos autorizados e ciclo real de confirmação/recuperação em ambiente isolado. Fixtures do harness não comprovam entrega.
- [ ] Concluir a revisão técnica de dependências. A auditoria desta rodada histórica registrou 11 findings altos; consulte a observação distinta da rodada 15 acima. Nenhum fork, exceção ou mudança de lock foi adotado.
- [x] Sincronização/publicação posteriormente autorizada e concluída na rodada 14, com SHA/deploy conferidos.

Método e limites em [QA_ACESSO_RODADA_13.md](./docs/QA_ACESSO_RODADA_13.md). As verificações de auditoria abaixo são históricas; a consulta mais recente e seus limites estão na rodada 15 acima. Não há liberação comercial.

## Rodada de portfólio — 12/11/2026

A rodada descrita abaixo, de 11/11, é histórica. Em 12/11 foram aplicadas correções de primeiro acesso/navegação, melhorias de primeiro uso, conteúdo móvel e acessibilidade. O segredo de cron já foi configurado via Vault no Supabase exclusivo; as instruções antigas de `ALTER DATABASE` não são o caminho operacional desse ambiente.

O estado atual e as pendências para clientes estão em [PORTFOLIO_E_CLIENTES.md](./docs/PORTFOLIO_E_CLIENTES.md). A migration de RLS aplicada remotamente foi incorporada ao repositório. A liberação comercial e o ciclo real de publicação/coleta continuam pendentes.

### Segunda rodada: perfil, configurações e análises

- [x] Unificar o cache do perfil por usuário, carregar o nome correto e confirmar a atualização no banco antes de exibir sucesso.
- [x] Validar nomes vazios/espaços/limite de 80 caracteres; preservar rascunho em falha e recuperação.
- [x] Corrigir a consulta de equipe sem inventar relacionamento PostgREST nem ampliar acesso a outros perfis.
- [x] Distinguir erro de leitura de estado vazio em análises/requisitos/equipe e oferecer nova tentativa.
- [x] Ajustar configurações para celular, traduzir os fluxos desta rodada e fornecer controles de período por teclado/tabelas acessíveis.
- [x] Informar os limites de snapshots cumulativos, capacidade de coleta e relatórios; validar downloads sem prometer e-mail automático.
- [x] Validar localmente typecheck/lint, 444 testes em 43 arquivos, auditoria de produção, build Vercel e 19 verificações de navegador com 9 análises Axe sem violações detectadas.

A confirmação de sincronização, CI remoto e deploy pertence ao relatório operacional da entrega, não é deduzida dos testes locais. Nenhum gate de CI foi adicionado; a integração Git automática anterior foi preservada. Método, recuperação de falhas e limites estão em [QA_PORTFOLIO_RODADA_2.md](./docs/QA_PORTFOLIO_RODADA_2.md).

### Terceira rodada: integridade funcional

- [x] Criar/editar conteúdo real com texto e referências HTTPS de mídia, preservar formulário em falha e invalidar opções de agendamento relacionadas.
- [x] Agendar/cancelar atomicamente, proteger conteúdo/canais com publicação ativa e aplicar escopo de workspace na execução manual da fila.
- [x] Proteger owner, billing, relações entre workspaces e estados de entrega no Postgres/RLS; outcomes idempotentes e sem republicação automática de referência upstream conhecida.
- [x] Fortalecer state/callback OAuth, persistência atômica de canal/token e remoção do ciphertext ao desconectar; sem conexão externa nos testes.
- [x] Corrigir contatos/ordenação Bio e métricas pela última coleta cumulativa por conteúdo × canal, com relatórios paginados e metodologia explícita.
- [x] Corrigir mensagens vazias/rejeições desconhecidas e erros HTTP JSON que poderiam parecer sucesso; corrigir contraste reproduzido dos rótulos de capacidade.
- [x] Sete migrations aplicadas no Supabase exclusivo, 116 checks SQL reais com rollback aprovados e dados reais preservados.
- [x] Typecheck/lint/build Vercel, 712 testes em 56 arquivos e auditoria de produção com zero vulnerabilidades reportadas.
- [x] Build compilado: 22 checks HTTP autenticados e 31 de navegador; 16 análises Axe sem violações detectadas nos estados selecionados; limpeza das fixtures confirmada.
- [ ] Homologar OAuth/publicação/visibilidade/coleta com contas externas de teste e autorização específica; não usar fixtures como substituto.
- [x] Implementar o mecanismo durável de reconciliação de `processing` expirado/resultado ambíguo — concluído na rodada 4 abaixo; homologação externa continua pendente.

Método, escopo e limites em [QA_FUNCIONAL_RODADA_3.md](./docs/QA_FUNCIONAL_RODADA_3.md). CI permanece paralelo ao deploy, sem gate novo; SHA/CI/deploy/smoke remotos são registrados separadamente. “100% funcional” permanece requisito de aceitação, não conclusão presumida.

### Quarta rodada: reconciliação sem duplicidade implícita

- [x] Persistir limite de escrita, execução fenced, conta e referências tipadas antes de etapas subsequentes; não usar upload/container como post público.
- [x] Recuperar somente tentativas seguras para a fila; resultado iniciado/incerto consulta o envio original ou exige revisão explícita, sem create/publish de continuação.
- [x] Reservar consulta just-in-time, aplicar fencing/backoff/cooldown/limites; impedir edição/exclusão/retarget/reagendamento incompatíveis.
- [x] Oferecer filtros, referências legadas e revisão owner/admin traduzidos; nota/checkbox/auditoria, sem override de sucesso e sem reenvio no encerramento.
- [x] Aplicar uma migration no Supabase VELT, validar paridade SQL e 87 novos checks reais com rollback; dados reais preservados.
- [x] Reexecutar 203 checks nas cinco suítes locais PGlite focadas; typecheck/lint/build Vercel, 978 testes/61 arquivos e audit de produção com zero vulnerabilidades reportadas.
- [x] Validar 25 checks HTTP de reconciliação + 22 de regressão com Auth/RLS reais; 22 de navegador e 11 análises Axe sem violações detectadas; fixtures removidas.
- [x] Documentar estados, intervenção manual, risco de duplicidade e limites em [RECONCILIACAO_PUBLICACOES.md](./docs/RECONCILIACAO_PUBLICACOES.md).
- [ ] Homologar escrita/leitura/OAuth/coleta/recuperação em provedores reais com autorização específica; mocks/documentação não substituem esse ciclo.
- [ ] Concluir o checklist operacional/comercial restante, sem liberar clientes por testes/HTTP 200 apenas.

Evidências e distinção entre testes locais, banco real, respostas sintéticas de provedor e publicação remota em [QA_RECONCILIACAO_RODADA_4.md](./docs/QA_RECONCILIACAO_RODADA_4.md). CI paralelo e deploy Git/main-only não foram alterados.

### Quinta rodada: ciclo de credenciais OAuth

- [x] Consumir tentativa única antes do exchange, vinculada a ator/workspace/provedor/marca/redirect/alvo/TTL; negar replay e callback tardio após disconnect/delete.
- [x] Renovar com versão/lease/begin reconhecidos e CAS; proibir UPSERT de worker antigo e retry cego de grant rotativo. Resolver commit sem reconhecimento pelo recibo UUID.
- [x] Separar busy/cooldown/indisponibilidade transitória de credencial inválida/incerta; preservar reconciliação sem reenvio e invalidação analítica por versão.
- [x] Corrigir o primeiro vínculo GBP explicitamente, com discovery/Voice of Merchant atual e RPC versionado; impedir retarget de unidade/histórico e agendamento sem vínculo confirmado.
- [x] Validar tokens/expiração/respostas sem coerção ou vazamento, limitar corpo/tempo, recusar redirects; traduzir estados e ações PT/EN.
- [x] Aplicar e conferir hash da migration 29 no VELT; 133 novos checks SQL reais/rollback e ACLs, fingerprints reais preservados.
- [x] Typecheck/lint/build Vercel Node 22, 1.138 testes/66 arquivos, audit de produção zero reportado; 336 checks locais em oito suítes.
- [x] Runtime real com 25 checks/12 interleavings e três disputas simultâneas entre processos; navegador com 12 checks/12 Axe sem violações detectadas. Fixtures removidas, nenhum job executável ou conta/publicação social real.
- [x] Documentar operação, schema legado fechado e limites em [CICLO_CREDENCIAIS_OAUTH.md](./docs/CICLO_CREDENCIAIS_OAUTH.md); método/evidências em [QA_OAUTH_RODADA_5.md](./docs/QA_OAUTH_RODADA_5.md).
- [ ] Homologar OAuth/publicação/consulta/coleta reais e o restante do checklist comercial com autorização específica. Não liberar clientes por contagem de testes, configuração ou HTTP 200.

SHA/CI/deploy/smoke remoto são registrados separadamente. Main-only/CI paralelo preservados.

---

**Atualizado:** 11/11/2026
**Base:** branch `main`, commit `9c1225f`
**Objetivo:** reduzir risco de publicação não autorizada e de abuso de rede, tornar as verificações repetíveis e fechar lacunas de operação sem ampliar o escopo funcional.

## Resumo de execução

### Aplicado neste changeset

- [x] Cron não aceita mais a chave publicável/anon: exige `x-cron-secret` exclusivo com pelo menos 32 caracteres.
- [x] Ambos os endpoints de cron falham fechado se o segredo não estiver configurado e não retornam detalhes internos de erro ao chamador.
- [x] Migrations de atualização reconfigura o cron de analytics para usar o segredo dedicado; se não houver segredo, desativa esse agendamento.
- [x] Validação de mídia rejeita IPs literais, nomes locais, credenciais embutidas e portas HTTPS não padrão.
- [x] Downloads server-side de YouTube, TikTok e LinkedIn recusam redirects e limitam tempo e bytes enquanto leem o corpo.
- [x] Guard de ambiente bloqueia também nomes conhecidos de segredos server-side em arquivos de ambiente versionados.
- [x] Node mínimo alinhado para 22.13+; workflow de CI executa `npm run verify` e auditoria de dependências de produção.
- [x] Testes unitários adicionados para autenticação cron e downloads de mídia.

### Ainda exige configuração fora do repositório

- [ ] Gerar um `CRON_SECRET` forte e configurá-lo **somente** no ambiente protegido do servidor.
- [ ] Configurar o mesmo valor como `app.settings.cron_secret` no banco, aplicar a migration `20261111090000_cron_secret_only.sql` e confirmar que `velt-analytics-sync` aparece uma única vez no pg_cron.
- [ ] Atualizar o cron externo/operacional de `scheduler-tick` para enviar `x-cron-secret`; a migration anterior só agenda a coleta de analytics.
- [ ] Validar que chamadas sem segredo retornam 401, segredo ausente/curto retorna 503 e a execução agendada autorizada funciona.
- [ ] Configurar egress da infraestrutura para negar loopback, endereços privados, link-local e endpoints de metadata. As verificações na aplicação reduzem o risco, mas não eliminam DNS rebinding.

## Validação local desta rodada

- Node 22.13.0: `npm run verify` passou — typecheck, lint, **339 testes em 32 arquivos** e build Nitro; o guard de ambiente também passou.
- `npm audit --omit=dev --audit-level=moderate` passou com zero vulnerabilidades de produção.
- O sandbox tem 1,9 GiB de RAM: sem memória adicional, o bundling Nitro dos 2.260 módulos excede o heap disponível. Para concluir a verificação, habilitei temporariamente 1,5 GiB de swap; a compilação terminou com sucesso. O arquivo de swap foi removido ao final.
- O workflow de CI foi configurado, mas ainda não foi executado no remoto. Não há alterações experimentais de build mantidas no código.

## Próximas etapas

### P1 — Segurança e publicação confiável

- [ ] Completar testes de integração dos endpoints de cron, incluindo execução com segredo válido e erro interno sem efeitos colaterais.
  - [x] Smoke test HTTP local: os dois endpoints retornam 405 em GET; POST sem segredo, com segredo incorreto ou só com `apikey` retorna 401. Nenhuma tarefa foi executada.
  - [x] Testes unitários cobrem segredo ausente/curto (503), sucesso autenticado e resposta 500 sem detalhes internos.
- [ ] Criar testes com Supabase local para RLS de dois workspaces, callback OAuth, reserva/retentativa de jobs e mudança de role.
- [ ] Definir política de allowlist de mídia (por exemplo, bucket/CDN aprovado por workspace) se os requisitos do produto permitirem.
- [ ] Revisar limites e tipos dos uploads aceitos por cada plataforma; manter controles de timeout, tamanho, MIME e extensão coerentes.
- [ ] Fazer scanner de segredos no histórico completo do Git antes de tratar o repositório como livre de credenciais históricas; revogar/rotacionar qualquer segredo identificado.

### P2 — Operação e manutenção

- [ ] Definir Supabase CLI como fonte única de migrations, ou preencher o schema Drizzle e automatizar uma verificação de paridade. Hoje `drizzle/schema.ts` está vazio e há diretórios de migration distintos.
- [ ] Adicionar smoke tests pós-deploy para login, leitura RLS, página pública de bio e endpoints de cron.
- [ ] Migrar gradualmente os `createServerFn().inputValidator()` restantes para `.validator()` e remover os avisos de depreciação do build.
  - [x] Função pública de bio migrada para `.validator()`; outros call sites seguem pendentes.
- [ ] Adicionar métricas/alertas de jobs parados, falhas de refresh OAuth, quotas de provedores e atraso de coleta de analytics.
- [ ] Monitorar relatório CSP em produção e, após validar hosts legítimos, ativar `CSP_MODE=enforce` por ambiente.

### P3 — Produto e experiência

- [ ] Medir a jornada de ativação: workspace criado → canal conectado → primeiro conteúdo publicado → primeira métrica sincronizada → retorno na semana seguinte.
- [ ] Priorizar melhorias por uso e retenção, não por número de telas; simplificar navegação para o fluxo central de conteúdo e crescimento.
- [ ] Manter Commerce Hub oculto até existir um fluxo funcional; não ampliar redes sociais sem concluir aprovação e suporte operacional.
- [ ] Revisar o Studio local com usuários e definir se fica como ferramenta local experimental ou se merece uma arquitetura de processamento hospedada.

## Critérios de conclusão do ciclo

1. `npm run verify` passa no Node 22.13+ no CI.
2. `npm audit --omit=dev --audit-level=moderate` passa.
3. Nenhum endpoint de cron aceita chave publicável, token de usuário ou origem não autenticada como substituto do segredo.
4. Downloads de mídia têm limite de tempo/tamanho e a infraestrutura bloqueia acesso a ranges privados.
5. Migrations aplicam em banco limpo e atualização de banco existente produz o mesmo schema e agendamentos esperados.
6. Ao menos os fluxos críticos de autenticação, RLS, cron e publicação têm testes de integração.

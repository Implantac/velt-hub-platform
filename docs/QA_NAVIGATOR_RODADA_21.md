# QA — Navigator pessoal · rodada 21

## Entrega e alcance

**Desenvolvimento local validado, não publicado; manutenção de dependências pendente.** Continuação da entrega20, verificada pelo ZIP e pelos668 hashes de fontes. O checkout completo está em `velt-development-21`; rodadas18–20 e seus arquivos fechados foram preservados. Última publicação registrada: rodada17/base `703f93ce5fe0afc93666a0a6cd8b5ed2c42ffa92`. Estado remoto não foi reconferido21.

Nenhum conector, Git remoto, push, deploy, CI remoto, banco real, migration, mudança de RLS/ambiente/configuração/credencial, SMTP, IA ou provedor real foi usado. Apps conectados não foram tratados como autorização de publicação ou banco. Três dotfiles omitidos pelo snapshot foram recuperados **somente em21** do ZIP20 verificado. `.env` foi preservado por hash local e não é exportado.

| Verificação final do código21 | Resultado                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Node                          | 22.13.0;492 dependências instaladas pelo lock existente                                         |
| Typecheck                     | PASS · 27,37 s                                                                                  |
| ESLint                        | PASS · 21,16 s                                                                                  |
| Vitest completo               | **3.174 testes / 120 arquivos / zero falhas** · 42,07 s                                         |
| Novos testes                  | **311 / seis arquivos**;2.863 testes anteriores preservados                                     |
| Build preset Vercel local     | PASS · 53 s; sem publicação                                                                     |
| Chromium no app compilado     | **38 verificações /25 varreduras Axe**, zero violações detectadas nos estados escolhidos        |
| Idioma/layout/tempo           | PT/EN;320/1280 px; navegador Asia/Tokyo, apresentação America/Sao_Paulo                         |
| Smoke HTTP anônimo local      | **22 HTML /25 assets /zero erros**, apenas GET                                                  |
| Integridade                   | **583 hashes de src** iguais nos gates/build/browser/HTTP; nove arquivos protegidos inalterados |
| Auditoria geral               | **NÃO limpa**: exit1, sete pacotes moderados numa cadeia de desenvolvimento, um advisory direto |
| Auditoria de produção         | exit0, zero reportado com `--omit=dev --audit-level=moderate`; lock inalterado                  |

O sandbox2GB usou heap local1536MB e swap temporário1536MB nas verificações/build. Nada disso alterou scripts, locks, configuração versionada ou thresholds. Preview8080 encerrado e swap removido. O artefato compilado é hashado e removido ao selar o pacote, depois de confirmar todas as evidências.

## Problemas concretos corrigidos

1. Primeiro uso iniciava `step=0`, mas só as etapas1–5 tinham botões de avanço. Agora ausência confirmada oferece **Começar questionário**, cinco etapas navegáveis e uma revisão final. Avançar/voltar não grava.
2. A chave global `digital-profile` misturava o domínio pessoal com caches sem identidade. Perfil, rascunho e retornos agora são isolados por `user_id`, sem impor papéis de editor de workspace às preferências da própria conta.
3. Refazer começava com valores padrão, sem carregar o registro anterior; os sliders antigos limitavam a UI a40h/R$10.000, embora a API aceitasse168h/R$1.000.000. Toda resposta lida é preenchida, inclusive escolhas originais e limites completos; valores inválidos antigos continuam visíveis para correção explícita, sem clamping, substituição ou gravação automática.
4. A API fazia upsert incondicional e depois mudava `profiles.onboarding_completed=true`, sem confirmar essa segunda gravação. Agora cria por INSERT ou atualiza pela versão lida, confere a linha completa e **não toca onboarding, profiles, workspace ou jornada**.
5. A interface tratava regras simples como diagnóstico personalizado e navegava pelo href salvo. Agora explicita a fórmula, traduz códigos reconhecidos, conserva texto legado escapado/rotulado e só oferece destinos internos seguros.

## Domínio, cache e rascunho

`user_profile_digital` é um perfil da **conta**. A API recebe o ator apenas de `requireSupabaseAuth` e usa `user_id` na consulta. Não há `workspaceId` ou `user_id` controlável no input, membership de workspace, papel de editor ou service-role novo neste domínio. RLS própria existente não foi alterada nem homologada21. A casca autenticada ainda depende do bootstrap de workspace da aplicação; uma experiência de conta sem workspace não foi redesenhada.

O shell existente remonta o Outlet ao trocar workspace. Em vez de alterar esse shell compartilhado, o rascunho fica em React Query com chave `['navigator-draft', userId]`, query **desabilitada, sem endpoint**, e GC após cinco minutos inativo. É memória temporária desta execução, não localStorage/sessionStorage, cookie, persistência durável ou salvamento no servidor. Recarga/fechamento perde o rascunho; ele pode expirar fora da tela. Respostas salvas também têm chave por usuário, `['navigator-profile', userId]`.

Trocar workspace conserva as respostas pessoais e o rascunho ainda em memória. Outra conta não recebe esse rascunho, feedback ou dados; uma resposta tardia só invalida/limpa as chaves da conta de origem. Descartar apaga o rascunho dessa conta explicitamente; um recibo de gravação confirmado limpa o rascunho salvo mesmo se a tela foi remontada. Não há promessa de retenção após GC, recarga, encerramento ou perda do runtime. O ledger de operações guarda **apenas flags, tipo e referência**, nunca respostas/orçamento/registro pessoal; SSR recebe snapshot idle.

## Leitura e edição honestas

GET faz uma leitura `select('*').eq('user_id', userId).maybeSingle()`. Só `null` explícito é ausência. Erro, undefined, objeto incompleto, ator estrangeiro, enum/data inválidos ou metadata v2 inconsistente não viram vazio. Loading, primeiro erro, ausência confirmada, releitura e registro anterior com aviso stale são distintos. Nada é escrito ao abrir, reler ou navegar entre perguntas. GET pode repetir apenas leitura; POST não é repetido automaticamente.

A edição parte da versão e de **todas** as respostas lidas. Campos conhecidos mantêm seus valores persistidos PT históricos; labels da UI são PT/EN. Valores desconhecidos são apresentados como escolhas originais removíveis, não convertidos em outra opção. Strings/duplicatas e números legados não são normalizados na leitura. Limites atuais são validados antes de enviar:

- Experiência: `beginner`, `intermediate`, `advanced`; atividade enum conhecida ou null explícito.
- Horas: inteiro0–168. Orçamento: reais0–1.000.000, até duas casas decimais. UI aceita ponto ou vírgula decimal sem separador de milhar; não transforma vazio, notação exponencial ou moeda textual em número.
- Até12 objetivos,80 caracteres cada; até20 canais e20 formatos,40 caracteres cada; escolhas não vazias.
- Trim nas pontas/deduplicação somente no input explícito de salvamento, mantendo ordem. Quando isso muda uma coleção, a revisão mostra a prévia normalizada e um aviso; o rascunho original continua nas etapas anteriores.

A revisão exige reconhecimento dos efeitos antes de salvar. Voltar, editar ou receber uma nova leitura revoga esse reconhecimento. Um perfil nativo v2 sem alterações não oferece gravação redundante. Um legado inalterado só é convertido para v2 se a pessoa revisar, reconhecer e confirmar: não há migração automática.

## Escrita e recibo

O POST `saveDigitalProfile` agora exige `{ answers, expectedUpdatedAt, revisionId }`. Respostas são completas; `expectedUpdatedAt` é null explícito para criação ou o timestamp exato lido para atualização; `revisionId` é UUID de correlação. Campos extras, input flat antigo, workspace/ator forjado ou confirmação incompleta falham antes da consulta.

- **Criar:** um INSERT com user_id autenticado e respostas/modelo/datas. Corrida de criação pode falhar pela PK existente; não cai em upsert/update nem sobrescreve o concorrente.
- **Atualizar:** um UPDATE condicionado a `user_id` autenticado **e `updated_at` exato**. O trigger existente atualiza a versão; payload não reescreve a data de criação nem altera o trigger.
- Ambos exigem `select('*').single()` e conferem recibo `{ profile, mode:'created'|'updated' }`: ator, respostas completas, modo, metodologia/ações, referência e datas. Atualização sem nova versão, zero linhas, retorno vazio/parcial, outro ator ou outra revisão não são sucesso.
- A comparação de instantes aceita a serialização de offset do Postgres sem arredondar microssegundos; dois tokens diferentes dentro do mesmo milissegundo JS não são confundidos. A condição SQL usa o texto original exato lido, não Date.toISOString arredondado.
- A API faz apenas essa gravação pessoal. Não completa onboarding, muda permissões, cria evento, chama Brain/IA, conecta conta ou publica conteúdo.

Essa confirmação confere a linha retornada; **não cria recibo imutável separado, trilha histórica completa ou assinatura de origem**. Uma revisão substitui o perfil anterior quando autorizada e a versão ainda coincide. Regras/metadata consistentes não provam autoria, realidade de um negócio, habilidade, maturidade ou resultado externo.

## Resultado por regras e compatibilidade

`recommended_actions` continua um array JSON com `title`/`href` PT para leitores antigos. Cada ação nova acrescenta namespace `navigator` com `model:'velt-navigator-v2'`, `code`, `revisionId` e `savedAt`, sem migration. A UI traduz apenas os códigos conferidos; metadata declarada inválida falha fechada, sem cair silenciosamente em legado.

O roteiro sempre inclui revisar o cadastro da marca e preparar um rascunho. Sem canais escolhidos, sugere avaliar canais opcionais; com escolhas, revisar preferências. Iniciante ganha sugestão de trilha introdutória. **Atividade, objetivos, horas, orçamento e formatos são guardados, mas não alteram essas sugestões.** Nenhuma métrica externa ou IA é consultada.

O enum `maturity_level` mantém a fórmula anterior para os consumidores existentes: advanced+orçamento>1000 → scaling; advanced → established; intermediate → growth; beginner com pelo menos dois objetivos → sprout; demais → seed. A UI só o apresenta em detalhes técnicos, com fórmula e ressalva: esses nomes não medem maturidade real e orçamento/autodeclaração não comprovam crescimento. Os consumidores legados do Brain/growth não foram reavaliados globalmente; seus arquivos permanecem iguais20.

Todos os consumidores internos dos dois serverFns Navigator foram coordenados nesta mudança; não foram encontrados outros chamadores desses exports fora do novo hook/testes. Leitores diretos existentes mantêm as colunas/valores do schema. **Clientes externos antigos que usam o POST flat ou esperam uma linha em vez do recibo precisam de integração coordenada; não há compatibilidade retroativa presumida.**

Legados mantêm textos/valores originais, inclusive afirmações não verificadas. A UI não os promove a análise nova. Sugestões legadas têm prévia de até20, com total legível explícito quando excedem esse limite, sem truncar o banco. Links externos/scripts/barras ou controles perigosos não viram ações de navegação. Isso não afirma exploração comprovada de código antigo.

## Concorrência, incerteza e retorno tardio

- A trava síncrona é por conta nesta execução do navegador e sobrevive remount/troca de workspace. Não coordena abas/dispositivos/processos, não persiste após reload e não garante exactly-once.
- Não há retry automático de POST, chave idempotente nova no banco ou migração global contra clientes antigos. UUID é referência, **não chave idempotente**. CAS é proteção desta API, não de todas as escritas possíveis sob RLS.
- Retorno incerto conserva referência/rascunho ainda em memória, bloqueia nova gravação e exige GET deliberado válido e reconhecimento humano. A conferência só libera uma decisão futura; nunca repete o pedido anterior.
- Se o perfil atual difere da base do rascunho, a base **não muda automaticamente**. A pessoa vê respostas, data e referência atuais e escolhe explicitamente entre descartar/carregar ou manter o rascunho contra a nova versão. Manter exige novo reconhecimento e depois confirmação de salvamento separada. Se a primeira escrita já ocorreu e as respostas coincidem, não há POST redundante.
- Gravação confirmada com releitura falha ou não conferida após remount continua confirmada, com aviso e ação de reler. Não vira incerteza de escrita nem gera novo POST só para atualizar a tela.
- Contas diferentes têm caches/ledger distintos. Resposta antiga não injeta toast/feedback/registro nem apaga edição de outra conta.

## Evidências e limites de QA

Os311 testes novos cobrem contratos/modelo, handlers, apresentação/draft, ledger e markup PT/EN. Os handlers usam contexto pré-autenticado sintético e um builder PostgREST fake: verificam declaração de Auth, filtros SQL emitidos, payload/recibos e ausência de outras tabelas; **não executam o middleware real, Postgres, trigger, RLS ou concorrência real do banco**.

O navegador usa o app/SDK/serialização compilados reais, com Auth/RPC sintéticos em harness externo. Foram interceptados15 POSTs Navigator; nenhuma conta ou banco real foi usado. Zero pageErrors, RPCs/mutações inesperados e saídas HTTP inesperadas; fetch do servidor negado e WebSockets fechados. Isso não é homologação de firewall. Os64 relatórios CSP interceptados não certificam a política da produção.

Foram exercitados: primeiro uso; teclado/foco; cinco etapas/revisão; back/forward; defaults explícitos; horas/orçamento completos e inválidos; seleção múltipla; confirmação/duplo clique; prefill e não-gravação sem mudança; cancelamento; legenda/modelo/critério; originais longos/HTML escapado/link inseguro; normalização explícita; viewer pessoal; troca de workspace com rascunho/guard; loading/erro/ausência/stale; GET estrangeiro ou inválido; saved-but-503 e recibos vazios/estrangeiros/truncados/revisão errada; revisão GET falha/válida+humano; CAS concorrente e duas decisões de rebase; descarte/carregamento atual; recibo salvo com releitura falha; GET/POST tardios e isolamento de rascunhos entre contas. Layout sem overflow nos cenários320/1280 escolhidos. Axe não certifica WCAG.

O smoke anônimo testa HTML, idioma, assets, nonces/CSP e nosniff, não acesso autenticado. Primeiro uso do Navigator com shell autenticado sintético não homologa cadastro/onboarding/login reais. Uma segunda passagem completa do navegador, também38/25 aprovada, apenas ajustou o scroll da captura para o header não aparecer no meio de screenshots de página inteira; a primeira está preservada, sem mudança de produto.

Falhas iniciais foram mantidas em `history/`: typecheck sem heap local suficiente; inferência de retorno string ampliado corrigida com tipo do enum; asserções de teste confundindo classe `disabled:opacity` com atributo disabled e ordem de atributos SSR; e uma prop de prévia normalizada não repassada, corrigida no componente. Chromium precisou de libnspr4/NSS e dependências de sistema locais. Todos os gates/build/browser finais usam o código corrigido; não se reclassificou falha como passe.

## Dependências: pendência real, sem silenciar auditoria

A auditoria geral capturada retornou **sete pacotes moderados / exit1**, numa cadeia dev de `typescript-eslint@8.60.0`/`@typescript-eslint/typescript-estree` até `minimatch@10.2.5`. Há um advisory direto: [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), amplificação de globparts/possível DoS; faixa reportada>=7<11.0.1, versão corrigida reportada11.0.1. Sete pacotes não são sete falhas independentes.

`npm explain`, flag dev do lock e auditoria `--omit=dev --audit-level=moderate` delimitaram o alcance observado: **produção exit0/zero**, lock SHA256 `82539eb958951d9aed7233a40ac81b3a86091b5cb72ae874dcbe0d7cfa8e264a` igual. Uma chamada dev inspecionada usa `{dot:true}`, sem optimizationLevel2 explícito; isso **não** é prova exaustiva de ausência de caminho afetado. Não executamos payload DoS neste sandbox2GB.

Não houve `npm audit fix`, override forçado, atualização de dependência/lock, fork, waiver, mudança de threshold/CI ou aceite de risco. A auditoria geral **não está aprovada como limpa**. Corrigir pela cadeia mantida, revisar compatibilidade e validar separadamente continua pendente, assim como a revisão técnica histórica. Relatos zero anteriores são observações históricas, não certificado atual de segurança ou correção retroativa.

Referência de sessão: **12/11/2026, America/Sao_Paulo**. O relógio do sandbox registra24/11UTC nos recibos de execução; esses campos são separados, sem inferir atualização remota ou reescrever ZIPs/recibos18–20. Fixtures temporais explícitas não são datas de homologação externa.

## Próximas etapas e publicação

Prioridades pendentes: manutenção segura da cadeia de desenvolvimento, outros fluxos legados (Brain Lab/aprendizado/onboarding), homologação Auth/RLS/Postgres e concorrência real em ambiente isolado autorizado, SMTP/IA/provedores, LGPD/backups e operação comercial. **Nenhuma liberação comercial irrestrita ou homologação externa é inferida.** Publicar18–21 permanece uma etapa separada, dependente de pedido específico.

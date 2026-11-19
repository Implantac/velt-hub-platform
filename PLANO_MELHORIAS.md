# Plano de melhorias e correções — VELT

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

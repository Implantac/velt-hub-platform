# VELT — ciclo de credenciais OAuth, rodada 5

**Verificações selecionadas aprovadas; não é liberação comercial.** Escopo exclusivo do VELT. Preservados owner/workspace reais, outros projetos, arquitetura `src/features`, idiomas/metadados, Lucide build-only, deploy Git/main-only e CI paralelo/não gate.

Este documento registra implementação e QA. SHA, push, CI remoto, deploy e smoke de produção são verificados separadamente no relatório operacional da entrega; não são deduzidos do build local. “100% funcional” permanece requisito, não conclusão por contagem de testes.

## Defeitos e correções

- O callback anterior validava assinatura/cookie, mas não consumia uma tentativa no banco. Agora consumo single-use precede o exchange; ator/workspace/provedor/marca/redirect/alvo/TTL são vinculados e revalidados na conclusão.
- Refresh antigo usava gravação genérica de token e status conectado. Agora reserva/begin reconhecidos precedem um único POST; versão/lease/CAS impedem concorrência rotativa e resultados tardios após disconnect/delete/reautorização.
- Recibo UUID resolve commit sem reconhecimento. Retry do mesmo CAS é separado de repetir o grant, o que não é permitido após resultado incerto. Busy/cooldown/banco indisponível têm classificação transitória, não reconexão indevida.
- Validação de token/expiração estrita, sem `String(undefined)`/objeto como credencial e sem validade desconhecida tratada como infinita. Exchange/discovery têm timeout, redirect recusado e corpo limitado; discovery agora cancela stream acima de 1 MiB.
- Analytics invalida somente a versão utilizada. Scheduler/reconciliação preservam a consulta pendente diante de falha transitória de autorização, sem reenviar a publicação original.
- O guard anterior de identidade impedia também o primeiro vínculo GBP legítimo. O novo RPC faz esse vínculo explicitamente/versionado; mantém bloqueio de retarget de unidade estabelecida/histórico. API continua exigindo descoberta e Voice of Merchant atual. Agendamento via RPC exige unidade confirmada.
- Canais explica autorização incerta/expirada, reconexão da mesma conta, alcance real de desconectar e erro de listagem/vínculo. PT/EN, permissões e cache relacionado mantidos. Cadastro manual continua desconectado, sem OAuth/publicação fictícios.

## Verificações e suas camadas

| Camada                                             | Resultado nesta execução                                                      | O que não prova                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| TypeScript, ESLint e build Node 22 / preset Vercel | Aprovados                                                                     | Deploy remoto ou configuração/conta externa válida                         |
| Vitest                                             | **1.138 testes / 66 arquivos aprovados**                                      | Providers reais ou interleavings de banco por si só                        |
| Auditoria de dependências de produção              | **0 vulnerabilidades reportadas**                                             | Ausência de falhas de lógica, dependências desconhecidas ou pentest        |
| PGlite focado                                      | **336/336 em 8 suítes**                                                       | Auth/cron/extensões reais, locks concorrentes ou instalação limpa Supabase |
| Supabase VELT / transação com rollback             | **133/133 novos checks**                                                      | Ciclo real de consentimento/publicação no provedor                         |
| Runtime compilado + Auth/PostgREST/RLS reais       | **25 checks / 12 interleavings**                                              | Homologação externa: respostas de provider são sintéticas, fora do app     |
| Reserva simultânea entre processos                 | **3/3 rodadas**, dois processos OS por rodada                                 | Todas as possibilidades de falha distribuída                               |
| Navegador / persistência real                      | **12 checks**, incluindo SSR público PT/EN separado                           | Todos os módulos/diálogos, leitor de tela ou certificação WCAG             |
| Axe nas jornadas selecionadas                      | **12 análises, 0 violações detectadas**; larguras 320/390/1440 px verificadas | Acessibilidade universal ou ausência absoluta de bugs                      |

### Banco local

- `functional_integrity.sql`: 63; `delivery_integrity.sql`: 33; `publication_reconciliation.sql`: 87; `scheduler_outcomes.sql`: 13; `channel_lifecycle.sql`: 7.
- `oauth_authorization_lifecycle.sql`: 54; `oauth_refresh_lifecycle.sql`: 53; `oauth_gbp_lifecycle.sql`: 26.
- Total **336**, não somar novamente os mesmos casos executados no Supabase. Harness local usa Auth/roles artificiais e omite código/extensões não pertinentes; não certifica instalação limpa do histórico.

Os três arquivos OAuth podem ser executados em ambiente Supabase autorizado de teste: usam fixtures sintéticas, subtransações e rollback. Não executar em outros projetos por engano nem substituir os RPCs por UPSERTs para fazê-los passar.

### Supabase real

As três suítes OAuth foram combinadas em uma única transação de fixtures temporárias, sem chamadas externas, e encerradas por rollback. Resultado do request `e5a2dd2a-e8bf-4dcf-8fba-c7e867a74ff9`: **133 aprovados, zero falhas**. O conector truncou detalhes individuais da resposta, mas preservou o agregado; não reconstruímos linhas remotas ausentes. SQL integral e resultado local correspondente estão nas evidências operacionais.

Cobertura: owner/admin vs editor/viewer/externo/anon; ACLs de tabelas/RPCs; state único e bindings; TTL/revogação/marca; completion legado fechado; versões/leases/begin; abandono/cooldown/incerteza; workers e erros analíticos antigos; primeiro vínculo GBP, identidade/histórico e enqueue futuro. Auditorias de rollback e pós-runtime/navegador confirmaram Auth/perfil/workspace/membership originais, nenhum usuário/workspace QA, tokens/canais/tentativas/contextos/jobs zero e fingerprints reais preservados.

As 12 funções de ciclo auditadas são SECURITY DEFINER de `postgres`, `search_path=public`; anon sem execute. RPCs privilegiados não são executáveis por authenticated; registro/disconnect revalidam papel. Service role não tem escrita direta em tokens. RLS não foi desativada.

### Concorrência e transporte

- Workers de refresh são **processos Node independentes**, importando o módulo compilado não alterado. Banco e PostgREST são reais. Só a fronteira HTTP externa é substituída pelo harness, nunca o store/lease do produto.
- A pausa depois do begin/POST sintético permite confirmar disconnect, exclusão ou reautorização antes da resposta tardia. Nenhuma recria ou sobrescreve as credenciais vencedoras.
- Reconhecimento perdido de begin: zero POSTs. Reconhecimento perdido de commit: recibo persistido confirma a versão, sem outro grant. Commit não enviado: no máximo um segundo CAS, um único POST.
- Resultado de rede incerto, resposta inválida e invalid_grant exigem reconexão; 429 mantém cooldown transitório. O worker seguinte não repete o POST indevidamente.
- Em **três rodadas adicionais**, ambos os processos leem a versão antiga e aguardam uma barreira imediatamente antes do claim. Liberados juntos, um vence e fica pausado no POST sintético até o outro responder `refresh_busy` retryable: um claim por processo, um begin/POST/commit no vencedor e zero POST no perdedor.
- Dois callbacks HTTP simultâneos do app compilado: um exchange/conclusão sintéticos, outro `authorization_used`; replay sem exchange. Cookie obrigatório e negativa do provedor consumida sem exchange. Disconnect durante callback impede inclusive criar outro ID externo.

Nenhuma conexão de rede social real ou publicação externa foi realizada. O runtime principal não cria jobs. O navegador cria um único job a 30 dias, verifica persistência e o cancela imediatamente, com zero tentativas; fixtures são removidas em `finally`. Nenhum job ficou executável.

### Interface, idioma e falhas

Login por senha real em contexto novo, sem injetar sessão. Erro de listagem GBP + retry; unidade não verificada desabilitada; erro HTTP de vínculo sem toast falso nem mutação; vínculo real confirmado, persistente após recarga e não retargetável. Agendamento inelegível antes e elegível depois do vínculo; criação/cancelamento futuros confirmados no banco. Reconexão preserva alvo/marca; navegação de consentimento é interceptada antes de chegar ao provedor. Disconnect cancela a tentativa e apaga credenciais; editor/viewer não gerenciam conexões.

Mensagens novas em PT/EN e preferência preservada na recarga do app privado. Rotas autenticadas usam CSR por desenho, com bearer e RLS como fronteira; não chamar essa recarga de SSR. **SSR público** é validado separadamente lendo HTML localizado, title e description PT/EN sem executar JavaScript.

Falhas deliberadas e ajustes do próprio harness estão identificados nas evidências: correção da parametrização `.each`, prova vermelha do limite de discovery, espera do perdedor da barreira, seletor de header e capturas fullPage iniciadas no topo. Não foram ocultados nem apresentados como defeitos de produto corrigidos sem reprodução.

## Schema e operação

Migration **já aplicada uma vez** no VELT: `20261116151953_oauth_credential_lifecycle.sql`. Histórico com 29 entradas; filename local alinhado à versão efetiva gerada pelo conector e MD5 local/remoto `90f1ae634a1abb40a40a343aead86c61`. Não reaplicar.

O schema rejeita completion legado; versões antigas não podem contornar a tentativa única. Não restaurar bypass para compatibilidade de um deploy anterior. A promoção do código correspondente e o smoke público são etapas operacionais distintas. Ver [manual do ciclo de credenciais](./CICLO_CREDENCIAIS_OAUTH.md).

## Pendências explícitas

- Homologar, com autorização específica, consentimento/revogação/refresh/permissões/publicação pública/consulta/coleta nos provedores reais. Código e documentação não substituem aprovação comercial dos apps.
- Instalação limpa do histórico de migrations, backup/restore, SMTP, IA, storage/egress, LGPD, operação contínua e demais itens do [checklist de clientes](./PORTFOLIO_E_CLIENTES.md) permanecem pendentes.
- Remover credencial local não revoga PAT/grant externo. Não foi feita rotação automática de segredos de produção nesta rodada.
- Disconnect não cancela retroativamente chamada enviada nem revoga permissões no provedor. Estado incerto não autoriza grant/publicação cega. Não prometer exactly-once externo ou ausência de bugs.

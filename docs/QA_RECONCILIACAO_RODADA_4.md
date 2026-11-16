# VELT — reconciliação de publicação, rodada 4

Escopo: VELT, seu repositório e Supabase exclusivo. Nenhum banco Loja/Lotofacil, owner/workspace real ou conta social real foi alterado. “100% funcional” continua sendo requisito de aceitação, não uma conclusão obtida por contagem de testes.

**Resultado das verificações selecionadas:** aprovadas. Este registro cobre código, schema e runtime isolado; commit/CI/deploy/smoke remotos são conferidos separadamente no relatório operacional da entrega. Main-only e CI paralelo foram preservados.

## Mudanças

- Checkpoints duráveis tipados e limite de escrita aguardado no banco. Identidade do canal, token de execução, início do envio, referência upstream e post confirmado são campos distintos.
- Recuperação conservadora de workers interrompidos. Apenas tentativa fenced comprovadamente não iniciada pode ser recuperada para a fila. Envio iniciado sem referência recuperável exige revisão; com referência segura, consulta ao envio original.
- Observadores de Instagram, Facebook, YouTube, LinkedIn, TikTok e Google Business distinguem upload/processamento, autorização de leitura, identidade, visibilidade e recusa explícita. Não criam outro post. IDs int64 do provedor são preservados em Node 22.
- Reserva individual de consulta, fencing, backoff, cooldown, limites automáticos e serialização por canal dentro do lote. Lote de novas publicações limitado a três por chamada; orçamento de 45 segundos limita início de novas consultas, não a duração absoluta da operação em andamento.
- Proteções de edição/exclusão/retarget/reagendamento enquanto o resultado estiver incerto, incluindo agregado com mais de um canal.
- Tela traduzida pt-BR/en-US com filtros, referência/checks expansíveis e ações de owner/admin. ID legado continua visível com aviso de upload/container, inclusive antes da recuperação.
- Encerramento manual com confirmação, nota de 20–1000 caracteres e evento auditado. Não transforma incerteza em publicação comprovada, não certifica ausência no provedor e não reenvia. Novo agendamento é ação separada, com risco explícito de duplicidade.

O [manual de operação](./RECONCILIACAO_PUBLICACOES.md) descreve estados, procedimento e limitações.

## Verificações desta rodada

| Camada                               | Resultado                                | Alcance                                                                                                                                                                 |
| ------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck / lint                     | Aprovados                                | Consistência estática do código; não certificam provedores                                                                                                              |
| Vitest                               | **978 testes / 61 arquivos**             | Inclui observação, referências, checkpoints, fencing, escopo/acknowledgements, permissões e UI renderizada; provedores são mockados                                     |
| Build Node 22.13 / Nitro Vercel      | Aprovado                                 | Artefato de produção compilado localmente; não equivale a deploy remoto                                                                                                 |
| Audit de dependências de produção    | **0 vulnerabilidades reportadas**        | Lockfile/data da execução; não é garantia permanente                                                                                                                    |
| SQL local PGlite                     | **203/203, cinco suítes no mesmo run**   | 63 integridade + 33 entrega + 87 reconciliação + 13 outcomes + 7 lifecycle; auth/schema artificiais, sem cron/net/pgvector; não é instalação Supabase limpa             |
| SQL Supabase real, novo nesta rodada | **87/87**, rollback                      | PostgreSQL/roles/RLS reais; suíte de reconciliação executada em uma transação sequencial, não corrida paralela                                                          |
| HTTP/Auth/REST real, reconciliação   | **25/25**                                | Build compilado, Supabase Auth/RLS/persistência reais, duas corridas de claim/consulta e encerramento concorrente; observações positivas são HTTP sintético fora do app |
| HTTP/Auth, regressão funcional       | **22/22**                                | Conteúdo/agendamento, proteção de tenant/owner/plano, Bio/relatórios/métricas, callback inválido e desconexão com fixtures                                              |
| Chromium, novos estados/recuperação  | **22/22**                                | Falhas HTTP, confirmação, revisão, perda de acknowledgement, recargas, idiomas, RBAC e isolamento de workspace                                                          |
| Axe, estados selecionados            | **11 análises / 0 violações detectadas** | Tabela/diálogo, erro, inglês, mobile e RBAC; não certifica WCAG nem substitui auditoria manual completa                                                                 |
| Responsividade                       | **320 / 360 / 390 px**                   | Sem overflow de página no diálogo e scheduler; tabela larga em região rolável focável por teclado                                                                       |

Os 116 checks SQL reais da rodada 3 permanecem evidência histórica; não foram reexecutados remotamente nesta rodada. Não some esse histórico aos 87 novos como se fossem uma execução remota de 203 checks. Os 203 locais foram reexecutados juntos no schema focado PGlite.

## Cenários de runtime que passaram

- Duas ações HTTP concorrentes de owner/admin para o mesmo job reservaram uma consulta e registraram uma confirmação sintética. Repetição não gerou nova leitura ou evento de publicação.
- Duas transações PostgREST concorrentes de claim concederam uma reserva. Token substituído não conseguiu registrar sucesso; consulta em andamento bloqueou encerramento.
- Processamento pendente preservou backoff e bloqueio do conteúdo. Falta de permissão de leitura virou revisão, não rejeição de publicação. Execução antiga/sem referência não foi reenviada.
- Execução fenced não iniciada foi recuperada para pending; o token anterior perdeu autorização para cruzar o limite de escrita. No teste, `scheduled_at` permaneceu 30 dias no futuro.
- Dois encerramentos concorrentes gravaram uma decisão com ator/justificativa, sem post fabricado ou reenvio. Editor/viewer/outro owner foram recusados; REST autenticado não forjou sucesso nem acessou ciphertext OAuth.
- Diálogo preservou nota/checkbox em `503` anterior ao commit. Outro cenário deixou o commit ocorrer e substituiu somente sua resposta por `503`: repetição não criou outro encerramento/evento; recarga mostrou o estado verdadeiro.
- UI e servidor distinguiram owner/admin/editor/viewer. Troca de workspace refez dados/permissões; nota descartada de um diálogo anterior não reapareceu no outro contexto.
- Regressão executou cinco corridas enqueue/cancel, oito appends Bio concorrentes/dois reorders e confirmou metodologia analítica 100→120 para um post/canal mais 90 em outro = **210/21**, não 310/31.

## Método, falhas do harness e limpeza

- Cada execução criou cinco usuários e dois workspaces identificados como QA. Cleanup no `finally` confirmou remoção. Jobs foram agendados 30 dias à frente; não se inseriu job vencido publicável capturável pelo cron.
- O servidor usou build de produção e `VELT_PUBLISHER_MODE=real`. Chaves de app deliberadamente inválidas e chave de criptografia efêmera foram usadas apenas no runtime privado. Chave privilegiada Supabase nunca entrou no repo, bundle público ou relatório.
- O transporte **exclusivo de teste, fora dos fontes/build do aplicativo**, bloqueou fetch não autorizado. Somente referências exatas com token explicitamente falso receberam respostas sintéticas de leitura Facebook/Google Business. Isso exercita o caminho compilado e a persistência real; **não é publicação real nem homologação OAuth**. O navegador não navegou para provedor social.
- O resultado final de navegador registrou zero exceções de página e zero erros inesperados de console. O servidor local também registrou abortos `ECONNRESET` em requisições interrompidas/recargas; não se declara runtime universalmente livre de erros a partir do resultado de navegador.
- Correções do harness: acesso a `oauth_tokens` foi corretamente recusado por privilégio SQL (`42501`), não uma lista vazia; nota de encerramento contém prefixo explícito de incerteza; testes de editor/viewer precisavam ocorrer antes de o admin encerrar a mesma fixture. Tentativas interrompidas foram preservadas como histórico, sem contar resultados duplicados.
- Ajuste real adicional de UI: referências legadas sem `reconcile_state` ativo passaram a aparecer com o mesmo aviso conservador, antes da recuperação. Incluído em cinco testes de renderização.
- Auditoria após as execuções: um Auth/profile/workspace/membership real; zero QA, conteúdo, canais, jobs, tokens, snapshots e páginas Bio remanescentes. Fingerprints do workspace/membership iguais ao preflight; owner preservado.

## Schema e operação auditados

Migration **já aplicada**: `20261116113916_publication_reconciliation.sql`, versão atribuída pelo conector, 13 colunas novas, total de **28 migrations**. SQL local e histórico remoto com MD5 idêntico `5f17b42fcdd1ee046912560e43757d36`. Não reaplicar manualmente no ambiente VELT.

Referências de evidência do conector, sem valores de segredos:

- Aplicação: `d4fbd800-f8b2-4fdf-8c16-49fc2faac92a`; listagem: `6deb611f-1560-4ca5-aaeb-9a774be159ec`.
- Verificação do schema/fingerprints: `b847439b-7636-4e8f-9d3a-948948500cfd`.
- 87 verificações reais/rollback: `238d9493-c22d-4fc0-aa93-aeda599c99b8`.
- Auditoria depois de runtime/browser: `193b74b2-0402-4e0c-bf94-47b5d3a41083`.
- Consulta somente leitura dos crons: `38f63d9d-7462-433a-a191-fb4834b5f5e8`.

Os crons existentes de scheduler por minuto e analytics a cada seis horas estavam ativos. O histórico SQL consultado registrou 1440 e 4 execuções na janela de 24 horas, sem falhas SQL. Isso comprova disparo da função SQL, **não** status HTTP downstream, publicação ou coleta de um canal real. Nenhuma definição/segredo de cron foi alterada. A Vercel não precisa ter crons próprios para esse caminho Supabase.

## O que continua sem homologação

- OAuth/publicação/coleta reais, scopes/aprovação dos apps, renovação/expiração, quotas, formatos e visibilidade por provedor. Não conectar/publicar sem autorização específica.
- Instalação limpa Supabase completa, backup/restauração, monitoramento/alertas, resposta a incidentes e revisão completa RLS/RBAC/segredos/histórico.
- SMTP, IA/custos, storage/upload, Realtime, egress/DNS rebinding, LGPD/retenção/exclusão e módulos avançados/traduções.
- Não há garantia universal de exactly-once. Uma escrita aceita sem ID/ack pode exigir revisão humana; o sistema não inventa resultado para desbloquear o fluxo.
- Carrossel/upload hospedado, administração/convites de equipe na tela, Commerce Hub e redes sem publisher não foram implementados por esta rodada.

**Não liberar clientes.** O portfólio exige operação verdadeira dos fluxos anunciados; não autoriza mocks em produção, sucesso vazio ou declaração de funcionamento integral sem concluir as dependências do [checklist](./PORTFOLIO_E_CLIENTES.md).

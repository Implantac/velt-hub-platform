# Coleta analítica: observações e confirmação

Este contrato descreve a persistência interna, não a homologação dos provedores. Não conectar contas nem publicar conteúdo real durante QA sem autorização específica. O rótulo de portfólio não libera mocks no produto, dados inventados ou sucesso sem confirmação.

## O que é uma observação

- A origem é um job do mesmo workspace/canal/conteúdo, com estado `succeeded` e referência externa de publicação. Referências `sim_` não são observações reais. Um upload, container ou tracking ID não substitui a publicação confirmada no fluxo de entrega.
- Uma observação nova é identificada por **workspace × canal × publicação externa × dia UTC**. Duas publicações que reutilizam o mesmo conteúdo não são confundidas. O mesmo post em canais diferentes continua separado.
- Os dez contadores canônicos devem ser inteiros seguros, não negativos. A taxa é derivada dos contadores, não da soma de percentuais nem de metadata arbitrária. Seguidores observados como zero são válidos.
- As normalizações por plataforma continuam distintas: por exemplo, a Data API do YouTube expõe visualizações, usadas como aproximação explicitada no código, não impressões/alcance únicos homologados. Não comparar esse total como se todos os provedores medissem a mesma população.

No mesmo dia, cada contador guarda o **maior valor observado**, nunca a soma de releituras. Essa é uma escolha conservadora: máximos de campos distintos podem vir de leituras diferentes; uma correção do provedor para baixo pode aparecer só no dia seguinte. Não é uma reconstrução de interações novas do dia ou de pessoas únicas.

`collection_day` é preenchido apenas pelo protocolo novo. Registros legados permanecem intactos, com dia nulo; a leitura conserva compatibilidade sem reescrever o histórico. Quando existe observação identificada da mesma combinação conteúdo/canal, um registro legado sem post não é somado novamente.

## Gravação e data no mesmo commit

1. Owner/admin inicia uma coleta manual na API autenticada. Membership e papel são conferidos no servidor; viewer/editor não ganham permissão por alterar a interface. Cron é um chamador privilegiado separado, protegido por segredo server-only.
2. O runner considera até 50 canais conectados; por canal, até 25 publicações recentes na janela configurada. O botão usa 30 dias. Isso **não** promete cobrir toda a história nem drenar automaticamente todos os canais acima desses limites.
3. O coletor lê o provedor com Bearer, valida os contadores e conserva a versão OAuth efetivamente usada. Ausência de recurso/observação retorna ausência, não uma observação zero. Falhas obrigatórias são comunicadas; falta de métrica adicional pode gerar resultado parcial explícito.
4. `commit_analytics_observation` é executável somente pelo service role. A transação revalida job/estado/referência, workspace, conteúdo, canal conectado e versão de token não incerta. Versão alterada recusa a observação antiga.
5. Locks são adquiridos em ordem de pais → canal → token → job, compatível com as fronteiras de agendamento/credenciais. O índice único diário e o merge no PostgreSQL removem a janela SELECT/INSERT/UPDATE do processo Node.
6. Snapshot, `captured_at`, `metrics.collected_at` e `channels.last_synced_at` são confirmados na mesma transação. Falha em qualquer escrita reverte ambas. A data indica **a última observação gravada**, não conclusão de todos os posts do canal.
7. Só um recibo positivo com UUID de snapshot e timestamp válido incrementa `snapshotsWritten`. Esse campo conta commits reconhecidos, incluindo atualização no mesmo dia; não é quantidade de linhas novas.

A aplicação não escreve snapshots ou datas diretamente. DML de snapshots foi retirado de authenticated e service role; SELECT continua sujeito a RLS para o usuário. O guard de data rejeita alteração direta, inclusive do service role. O proprietário SQL confiável mantém as permissões administrativas necessárias: a conta master do aplicativo é owner do workspace, **não** esse superusuário.

## Resultados sem falso sucesso

| Resultado                                                                   | Comportamento                                                                                                                                                     |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Todas as observações consideradas foram reconhecidas, sem avisos relevantes | Coleta confirmada; mostra publicações lidas e gravações reconhecidas.                                                                                             |
| Pelo menos uma gravação e falha/ausência/canal sem coletor                  | Coleta parcial, toast de aviso e detalhes; não usa sucesso completo.                                                                                              |
| Falha sem gravação reconhecida                                              | Erro com mensagem segura. Datas antigas não são apresentadas como nova coleta.                                                                                    |
| Nenhuma observação nova, sem falha                                          | Estado vazio explícito e motivos dos itens ignorados.                                                                                                             |
| HTTP 200 sem recibo, recibo inválido ou resposta perdida                    | Persistência não confirmada; **não repetir automaticamente**. A transação pode ter sido efetivada. Atualizar os dados antes de decidir por nova coleta explícita. |
| Disconnect/reautorização/refresh/exclusão durante a leitura                 | A versão/identidade antiga é recusada na gravação. Não recriar autorização, post ou data.                                                                         |
| 401 de uma credencial antiga após reautorização                             | Somente a versão utilizada pode ser invalidada; não expirar a autorização nova.                                                                                   |

`postsMeasured` conta observações válidas lidas mesmo quando o commit não é reconhecido. `postsUnavailable` não é erro convertido em zero. Avisos são agrupados por canal/tipo, com contagem. Mensagens públicas não refletem corpos de provedor, URLs com credenciais ou detalhes privados de banco.

A interface isola o último resultado por workspace e suprime toast de requisição anterior, tanto no sucesso quanto no catch, se o usuário já trocou de workspace. Enquanto executa, trava o botão local; a integridade concorrente, porém, fica no banco e não depende dessa trava.

## Capacidades e consumidores

O registry operacional contém Instagram, Facebook, YouTube e LinkedIn; ele também é a fonte da lista de capacidades. Capacidade implementada **não** comprova scopes, app review, compatibilidade atual da conta ou consentimento real.

TikTok não tem leitor per-post implementado nesta versão; Google Business possui métricas de unidade que não são atribuídas aqui a posts. Não há função vazia registrada para simular esses coletores: o runner retorna `unsupported`, a interface informa a indisponibilidade e uma execução mista não vira sucesso completo. Suporte a essas capacidades exige implementação/homologação separada, não conectar contas durante este QA.

Analytics e relatório semanal usam a última observação por publicação externa/canal no período. O gráfico diário usa a última observação do dia UTC; não somar o gráfico para inferir interações incrementais. PDF/CSV preservam a nota metodológica. Downloads usam a sessão do usuário e RLS, com cache privado/no-store; workspace inexistente e oculto por RLS recebem o mesmo 404, UUID inválido recebe 400 e falta de autenticação recebe 401. Falhas reais de banco/renderização continuam erros, não arquivos vazios de sucesso.

## Schema, atualização e rollback

Migrations aplicadas **uma vez** no Supabase VELT, chegando a 31 entradas:

- `20261116180947_atomic_analytics_observations.sql`: coluna/índice/guard, merge e commit versionados; MD5 `210eb805ba1ebc6a75a6a64224e2a8f3`.
- `20261116182153_retire_legacy_analytics_recorder.sql`: revogação de EXECUTE de `record_analytics_snapshot` para todos os papéis da aplicação, incluindo service role; MD5 `96c4e06e4bf16fbffad7f1255183e23f`.

Os nomes locais refletem as versões efetivas geradas pelo conector; não renumerar nem reaplicar. A segunda migration fecha a execução antes de entrar no recorder antigo; o caminho REST responde 42501. Sua assinatura fica apenas no histórico, sem bypass de escrita.

**Código antigo não é compatível para coletar com esse schema.** Promover a versão correspondente pelo fluxo Git/main autorizado. Em eventual rollback, avaliar código e schema juntos; não reabrir DML/recorder legado, apagar histórico ou desabilitar RLS. Registros e fingerprints reais foram preservados. O checklist comercial e a homologação de provedores continuam pendentes; resultados selecionados não prometem ausência absoluta de bugs.

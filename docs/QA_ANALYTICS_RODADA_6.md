# QA — sexta rodada: observações analíticas atômicas

Escopo: integridade da coleta, data confirmada, isolamento de workspace e resultados verdadeiros na interface/relatórios. Base da implementação: `7d2350538a85a7578ed30eaa552daf0f77d9813d`. Somente o projeto VELT foi acessado; owner/workspace reais e os demais projetos foram preservados.

**Portfólio não autoriza simulação no produto ou operação vazia.** Este registro distingue testes de contrato, PostgreSQL real, Auth/REST, processos concorrentes e navegador. As respostas de provedor são sintéticas apenas no harness externo; não houve consentimento, conexão de conta social, grant externo, publicação ou homologação real. Os jobs usados para representar publicações são fixtures terminais explicitamente sintéticas, nunca envios feitos pelo aplicativo.

## Defeitos reproduzidos e correções

Antes de corrigir, dois processos Node independentes executaram o módulo compilado da base, usando Auth/PostgREST/RLS reais e leitura Facebook sintética fora do app:

1. Ambos liam ausência e criavam duas linhas para a mesma publicação no mesmo dia.
2. Ambos liam a mesma linha; após uma escrita de 200, o merge tardio do outro processo deixava 150, perdendo o máximo confirmado.
3. A atualização do mesmo dia alterava `metrics.collected_at`, mas mantinha `captured_at` antigo.

O artefato desse baseline tem SHA-256 `b7fc369c0a6be9b10af84fb4ea9783f11170ee9f9186331424ef8dedfdf00fd7`. As três reproduções e a limpeza estão registradas; não reexecutar aquele runner contra chunks/schema posteriores como se fosse a versão antiga.

Testes vermelhos também demonstraram gravação sem confirmação tratada como sucesso, erro por post descartado e falta de distinção entre ausência e zero. O baseline SQL local reproduziu data adulterável diretamente; inserção de snapshots por cliente, estados de publicação e OAuth/metadata **já eram protegidos** e não são apresentados como bugs novos.

A correção usa commit único/versionado no Postgres, índice diário UTC por publicação externa/canal, merge por máximos e data na mesma transação. Fecha DML genérico e recorder antigo; revalida versão OAuth e identidade da publicação. Recibo ausente/inválido/perdido não conta como gravação e não autoriza retry automático.

No QA de consumidores, uma sessão real de outro workspace já era bloqueada, mas o relatório respondia 500. Agora o recurso oculto por RLS e o inexistente recebem o mesmo 404 seguro; UUID inválido recebe 400 antes de consultar o banco. Isso corrige semântica HTTP, não uma suposta leitura entre tenants. Onze testes de rota preservam 401, indisponibilidade e falhas reais de geração sem sucesso vazio.

O registry operacional deixou de expor funções vazias de TikTok/Google Business. Capacidades não implementadas são `unsupported` antes de ler token/job/provedor; execução mista mostra resultado parcial. Isso **não** implementa nem homologa esses coletores. O botão continua habilitado apenas para papel/capacidade elegíveis.

## Resultados por camada

| Camada                                    | Resultado executado                                                                | Limite                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| TypeScript / ESLint                       | Aprovados após as alterações finais                                                | Não prova runtime ou provedor real                                   |
| Vitest                                    | **1.242 testes / 71 arquivos aprovados**                                           | Contratos, não substitui concorrência/REST                           |
| Dependências de produção                  | **0 vulnerabilidades reportadas**                                                  | Não é pentest ou garantia universal                                  |
| Build Node 22.13 / preset Vercel          | **Aprovado**, uma função server                                                    | Não é deploy remoto                                                  |
| PGlite focado                             | **424/424 em 9 suítes**                                                            | Auth artificial, schema selecionado; não é instalação limpa Supabase |
| PostgreSQL remoto, transação com rollback | **87/87**, depois das duas migrations                                              | SET ROLE/claims sintéticos não substituem Auth HTTP                  |
| Runtime compilado + Auth/REST/RLS reais   | **20 checks / 11 interleavings controlados**                                       | Só providers/falhas de transporte são sintéticos                     |
| Concorrência de gravação real             | **8 processos** na primeira observação + **4 processos** atualizando a mesma linha | Não cobre todas as escalas ou falhas distribuídas                    |
| Navegador compilado com persistência real | **14 checks**, mais 5 verificações registradas de consumidores                     | Jornadas selecionadas, não todos os módulos                          |
| Axe nos estados selecionados              | **12 análises, zero violações detectadas**                                         | Não certifica WCAG, teclado/leitor de tela ou todos os temas/estados |

O ambiente local tem cerca de 1,9 GiB de RAM. O build normal com heap de 4 GiB precisou de swap temporário de 1.536 MiB; sem ele houve timeout/OOM nas tentativas registradas. Swap foi desativado e removido, sem alterar plugins, dependências ou configuração de produção para contornar o problema.

### SQL local e remoto

Suítes locais: `functional_integrity` 63; `delivery_integrity` 33; `publication_reconciliation` 87; `scheduler_outcomes` 13; `channel_lifecycle` 7; `oauth_authorization_lifecycle` 55; `oauth_refresh_lifecycle` 53; `oauth_gbp_lifecycle` 26; `analytics_observations` 87. Total 424. Não somar a execução local e remota dos mesmos casos como cobertura distinta.

Os 87 casos remotos novos cobrem ACLs, integridade de contadores, limites inteiros, payloads inválidos, identidade externa/conteúdo/workspace, versões mudadas/incertas, job não confirmado, unicidade/merge, preservação legada, dia UTC independente da sessão e rollback de snapshot/data quando qualquer escrita falha. Os 336 checks locais e 133 remotos da rodada 5 são histórico; não são alegados como reexecução remota integral nesta rodada.

Execução final remota: request `e5df2d90-ca1a-4d3e-b04d-99ff9710f77b`, 87 aprovados/zero falhas, rollback. Resumo portátil dos nomes/SQLSTATEs esperados/reais/booleanos de aprovação, ordenado explicitamente com `COLLATE "C"`: MD5 **`556dd0c2a4689b19205c82a92f4253b7`**, igual ao local. Essa paridade limitada não iguala ambientes, timestamps, IDs de fixtures ou mensagens.

O primeiro comparador usou ordenação padrão e falhou: a collation remota `en_US.UTF-8` ordena nomes de forma diferente. O resumo final demonstra o mesmo conjunto com ordenação C; os digests padrão continuam diferentes. O assert inicial não foi registrado como aprovado nem suas linhas remotas foram reconstruídas.

### Concorrência e Auth reais

- Todos os oito processos chegaram à barreira antes de serem liberados; cada um fez um RPC e recebeu um recibo. Resultado: uma linha, impressões **170**, engajamento **80**, máximos vindos de processos diferentes.
- Quatro processos atualizaram essa mesma identidade: continuou uma linha, impressões **300**, engajamento **90**, taxa derivada **0,3**, com data avançada e igual em snapshot/metadata/canal.
- Sessões reais owner/admin e service role tentando forjar a data receberam **23514**. Editor/viewer/outro workspace afetaram zero linhas. DML direto de snapshots e recorder legado receberam **42501**.
- O RPC novo é service-only. Owner/admin/editor/viewer autenticados podem ler somente dados de seus workspaces; nenhum deles ganha execução do commit privilegiado.
- API compilada impede viewer/editor/não membro/owner com papel editor no outro workspace e chamada sem sessão antes de acessar provedor. Admin coleta legitimamente; viewer lê readiness sem poder iniciar coleta.
- Disconnect, reautorização, refresh concluído e exclusão de publicação vencem uma observação antiga pausada antes do commit, sem recriar dados/autorizações/datas.
- Envio que não saiu, HTTP 200 sem recibo, reconhecimento perdido e recibo inválido nunca contam como salvos localmente ou disparam retry. Nos dois casos em que a transação real ocorreu, snapshot/data continuam atômicos.
- Falha por post não apaga o sucesso de outro; YouTube ausente não cria zeros/data; 429 preserva observação anterior e avisa o restante; 401 tardio não invalida reautorização posterior.
- TikTok sem coletor é ignorado antes de ler o provedor, sem falsa observação.

SHA-256 do módulo de sync compilado usado na execução final de runtime **e** navegador: `22fdf624104e2b7088c343badac0d86e3e4c360bdaf27d6c40679732d51aeb07`. Não é SHA do commit ou artefato da Vercel remota.

### Interface e consumidores

Login real por senha em contexto novo, sem injetar sessão. Coleta em andamento impede novo clique; duas publicações do mesmo conteúdo persistem separadamente. Releituras menores não somam nem perdem máximos. Falhas parciais/429 usam aviso, não toast de sucesso completo; reconhecimento perdido mostra erro e não repete. Ausência fica ausente. Uma requisição antiga, tanto resolvida quanto rejeitada após troca de workspace, não exibe resultado/toast no workspace novo.

PT/EN, preferência de idioma preservada após recarga CSR privada, 320/390 px sem overflow nos estados selecionados, desktop 1440 px. SSR público é verificado separadamente por HTML/title/description localizados, sem executar JavaScript. Leitura privada não é apresentada como SSR autenticado.

API de analytics como viewer real devolveu **700 impressões / 70 engajamentos / 700 alcance / 2 publicações medidas**, iguais às linhas confirmadas, não à soma das múltiplas execuções. Outro workspace permaneceu vazio e não membro foi recusado. PDF válido/uma página e CSV foram servidos com sessão de viewer e cache privado/no-store; o CSV e os downloads reais pelos botões coincidiram com os contadores persistidos e a nota metodológica. Nenhum dado sintético foi mantido no produto após a limpeza.

Papéis editor/viewer no navegador leem os registros mas têm o botão desabilitado. O resultado com canal não suportado é aviso parcial e contém motivo explícito, não execução de função vazia.

## Ocorrências do harness e execução interrompida

- O primeiro runtime corrigido parou no recorder legado: esperava SQLSTATE 40001 e não recebeu recibo HTTP no diagnóstico limitado a 20 segundos. Não foi apresentado como suíte completa; a causa exata desse timeout REST não foi estabelecida.
- Uma migration posterior revoga EXECUTE antes de entrar no recorder. O runtime completo final comprova resposta 42501 e zero queries legadas ativas; a migration anterior não foi reeditada.
- Uma regressão local OAuth encontrou timestamps iguais por resolução de milissegundos do PGlite. Diagnóstico de 50 tentativas confirmou empates; produção já recusa empate de forma conservadora. O teste agora injeta ordem temporal estrita quando esse é o cenário e acrescenta um caso de empate recusado. Não houve alteração no protocolo OAuth de produção nem retry de grant para fazer o teste passar.
- Uma análise Axe iniciou durante a transição entre botão ocupado/desabilitado e reabilitado e acusou contraste transitório. O harness passou a aguardar `aria-busy=false`, fim das animações finitas e remover hover acidental antes da análise. Não foi removida regra de contraste, ocultado elemento ou alterado CSS do produto para aprovar o scan. A execução final das 12 análises passou; a tentativa interrompida está preservada nas evidências.

## Schema e limpeza

Migrations aplicadas uma vez no Supabase VELT, com hashes/bytes locais iguais aos remotos:

| Versão / nome                                     | Bytes | MD5                                |
| ------------------------------------------------- | ----: | ---------------------------------- |
| `20261116180947_atomic_analytics_observations`    |  9846 | `210eb805ba1ebc6a75a6a64224e2a8f3` |
| `20261116182153_retire_legacy_analytics_recorder` |   369 | `96c4e06e4bf16fbffad7f1255183e23f` |

Histórico: **31 migrations**. As migrations 29 e 30 aplicadas não foram reescritas; a 31 é uma retirada de ACL forward-only. Types TypeScript foram ajustados manualmente e conferidos no uso/typecheck; não são apresentados como geração automática remota.

Auditoria após runtime/navegador: request `4256b571-a2b9-492d-90c3-aadfa21b0bbd`. Um user/perfil/workspace/membership original; QA users/workspaces zero; canais/tokens/tentativas/contextos/jobs/snapshots zero. Fingerprints workspace `6369eaa15165e3bd8737f509b020aca0` e membership `a8f0f250392ee243fada3bb1207172e3` preservados. RLS continua habilitada; papéis de aplicação sem DML de snapshots/EXECUTE legado. Cada fixture removeu os dois workspaces e cinco usuários descartáveis em `finally`.

Credenciais transitórias ficam somente em diretório privado fora do Git/pacote e são removidas ao concluir a operação. Remoção local/logout não revoga grants ou PATs externos. O QA não fez rotação automática de segredos reais.

## Publicação e limites restantes

Sucesso local ou migration aplicada não comprova main atualizado, CI remoto ou deploy. A publicação exige novo fluxo oficial GitHub e verificação independente do SHA, CI, deploy Git/main READY/PROMOTED e smoke do domínio existente. Main-only e CI paralelo/não gate permanecem como escolhidos; não habilitar simulação nem recriar projeto/equipe/domínio.

O schema exige o novo protocolo de coleta; não reabrir o recorder antigo para compatibilizar uma versão anterior. Operação/recuperação em [OBSERVACOES_ANALITICAS.md](./OBSERVACOES_ANALITICAS.md), OAuth em [CICLO_CREDENCIAIS_OAUTH.md](./CICLO_CREDENCIAIS_OAUTH.md).

Homologação de consentimento/permissões/renovação/publicação pública/consulta/coleta em contas reais, capacidades ainda não implementadas, instalação limpa de migrations, backup/restore, SMTP, IA, storage/egress, LGPD e operação contínua continuam sujeitos ao [checklist de clientes](./PORTFOLIO_E_CLIENTES.md). As contagens acima não constituem declaração de “100% funcional”, garantia de ausência de bugs, exactly-once externo ou liberação comercial.

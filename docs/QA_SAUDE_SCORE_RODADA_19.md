# QA — Saúde e Digital Score · rodada 19

## Resultado e alcance

**Entrega local validada, não publicada.** Continuação da entrega18 preservada, sobre a última base publicada registrada `703f93ce5fe0afc93666a0a6cd8b5ed2c42ffa92` (publicação17, não reconferida remotamente nesta rodada). Fontes19 em `velt-development-19`. Nenhum conector Supabase/Vercel, push, deploy, banco, migration, ambiente remoto, provedor, SMTP ou IA real foi usado nesta evolução.

| Verificação                   | Resultado final                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| Node                          | 22.13.0                                                                                    |
| Typecheck                     | PASS · 29,08 s                                                                             |
| ESLint                        | PASS · 20,09 s                                                                             |
| Vitest completo               | **2.553 testes / 108 arquivos / zero falhas** · 34,95 s                                    |
| Novos testes                  | **275 em cinco arquivos**                                                                  |
| Build Vercel local            | PASS · 61 s · configuração versionada preservada                                           |
| Navegador Chromium            | **49 verificações / 35 análises Axe / zero violações detectadas** nos estados escolhidos   |
| Contextos visuais             | PT/EN, 320 e 1280 px; navegador em Asia/Tokyo e UI explicitamente São Paulo                |
| HTTP local anônimo            | **18 HTML / 25 assets / zero erros**, somente GET                                          |
| Auditoria pública de produção | exit0 / zero achados reportados, lock inalterado; risco técnico anterior **não encerrado** |
| Integridade                   | 546 hashes de `src` congelados após os gates; nove arquivos protegidos iguais              |

O build usa heap local1536MB e swap temporário1536MB por limite do sandbox2GB, sem editar `package.json`, locks, Vite, Vercel ou CI. O preview foi parado e o swap removido ao encerrar a QA.

## Problemas tratados

- Saúde não verifica mais somente a existência de uma resposta de insert: confirma exatamente as cinco categorias, IDs, workspace, notas, explicações, metodologia e datas enviadas.
- Score confirma primeiro a linha principal. Falhas de espelhamento no painel/Brain ou invalidação de respostas são avisos independentes; não transformam Score salvo em falha que estimule duplicação. A invalidação é limitada ao workspace e a respostas com `computed_at` até o cálculo confirmado; zero respostas removidas pode ser sucesso, count ausente não.
- Ambos exigem papel reconhecido antes de qualquer leitura do domínio; POSTs exigem owner/admin/editor. Viewer só consulta. A API aplica a regra; esconder botão não é fronteira de segurança e não substitui RLS.
- GET distingue ausência explicitamente confirmada (`null` do Score, lista vazia de Saúde) de retorno ausente, inválido ou erro. Ordenação por `computed_at` e ID dá desempate estável. Saúde permite história parcial, mas identifica áreas ausentes e cálculos/datas diferentes, sem preencher zeros nem alegar uma média completa.
- UI distingue loading, erro inicial, refresh e cache antigo. Recalcular exige leitura válida e não concorrente. Releitura nunca gera cálculo/IA. IDs de usuário, workspace e módulo isolam cache/feedback; composição desmontada ignora retornos tardios.
- Trava síncrona evita o duplo clique na instância montada. Não há retry automático de POST. Resposta incerta exige GET confirmado e reconhecimento humano, que apenas libera uma decisão futura, sem reenviar. Isto não é exactly-once, transação distribuída ou idempotência entre abas/dispositivos.

## Metodologia explícita `velt-records-v2`

O adaptador estrito consulta **somente marcas, canais, conteúdo e fila**, que são as fontes dos pilares. Não muda `loadContext`, `buildSnapshot`, `brain-core.functions.ts`, motores compartilhados ou demais consumidores legados do Brain. Aqueles fluxos seguem com limitações próprias; esta melhoria não os homologa.

Cada fonte tem limite500, count exato do mesmo workspace e ordenação estável. Marcas/canais/conteúdo são ordenados por criação decrescente+ID; fila, por atualização decrescente+ID. Erro, null indevido, count ausente, linhas duplicadas, escopo errado, campos incompatíveis ou recorte menor que `min(total,500)` impedem a gravação. Voz/paleta aceitam objetos JSON ou ausência explícita; campos vazios não ganham pontuação.

São exibidos carregados/contados e janela de coleta. Quando o total ultrapassa500, o diagnóstico usa a amostra e declara isso; não extrapola o recorte como população inteira. Os quatro counts são de leituras independentes e podem mudar durante a coleta; **não são uma fotografia transacional**. Fonte vazia confirmada é uma evidência válida de ausência de cadastro, diferente de indisponibilidade.

| Pilar              | Regra desta versão                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Presença           | 40 por ter marca + até60 por três canais cadastrados                                                                           |
| Identidade         | Média, nas marcas analisadas, de voz35 + paleta35 + logo30 preenchidos                                                         |
| Base de conteúdo   | 8 por item cadastrado, até100; inclui rascunhos/arquivados                                                                     |
| Atividade recente  | 12 por item criado nos30 dias anteriores ao início da coleta, até100; não conta datas futuras nem equivale a publicações       |
| Conclusão na fila  | Êxitos registrados com referência não simulada / (esses êxitos + falhas definitivas sem referência/reconciliação), arredondado |
| Conexão registrada | Percentual de canais `connected` sem bloqueio conhecido/revogação registrada; sem teste ao vivo do provedor                    |
| Geral              | Presença18% + identidade17% + conteúdo20% + atividade18% + fila14% + conexão13%, arredondado                                   |

Fila exclui pending/processing/cancelled, referências `sim_` (inclui espaços/caixa), datas futuras, sucesso sem referência e reconciliações pending/review/closed. Falha/dead_letter só entra se não tem referência nem reconciliação aberta/fechamento incerto. Ausência de base elegível usa zero **na fórmula**, mas mostra traço e explicação no pilar/cartão; não é uma falha medida.

Saúde agrupa presença+conexão em marketing, conteúdo+atividade em conteúdo, e mantém identidade/conexão/fila nas outras três áreas. Score não é alcance, receita ou crescimento observado, previsão de resultado ou comprovação de publicação externa. Pesos gerais foram preservados; qualificações da base mudaram e são versionadas. **Registros antigos não são reescritos nem diretamente comparáveis**. Históricos sem metadata permanecem legados, com textos originais escapados e aviso; nova metadata declarada porém inválida não vira legacy silenciosamente.

## Evidências e cenários

Os cinco novos arquivos cobrem275 testes: cálculo105, contratos31, handlers80, apresentação18 e markup41. O teste legado de leitura do dashboard recebeu fixture completa compatível com o contrato mais estrito. As 2.278 verificações anteriores continuam aprovadas.

O harness externo usa o aplicativo Vercel compilado, SDK e serialização reais, mas intercepta Auth/RPC com dados sintéticos. **16 POSTs de diagnóstico foram interceptados**, sem escrita remota. Saídas HTTP inesperadas são bloqueadas no harness, WebSockets fechados e fetch do servidor negado; não é uma certificação de firewall. Zero requisições externas inesperadas, RPCs/mutações inesperadas e pageErrors. Os67 relatórios CSP foram interceptados; isso não atesta a política da produção.

Cenários de navegador: leitura GET-only; duplo refresh e duplo cálculo; cinco categorias/seis pilares; datas São Paulo sob fuso Tokyo; loading/erro/vazio/stale; viewer; transporte com escopo errado; histórico parcial/misto/legado e texto escapado; amostra500/1205 e falta de evidência; fórmula pelo teclado; gravação incerta/recibo vazio/review GET falho; Score confirmado com espelhamento/cache/releitura falhos; retorno tardio após troca de workspace/usuário; membership desconhecida/falha/retry. Sem overflow horizontal nos cenários selecionados.

A primeira passagem local também aprovou49 checks/35 Axe. A revisão final corrigiu apenas mensagens do fixture externo de Saúde, textos de contagem e rigor do formato JSON de marcas; o código final foi novamente validado por todos os gates/build/browser. Dois testes iniciais de markup falharam por capitalização de atributo `dateTime` em SSR; matcher passou a respeitar a equivalência HTML, sem retirar assert de data. Erros iniciais de tipagem estavam nos testes novos; resolvidos. Evidências anteriores permanecem em QA/histórico, sem reclassificação de falhas como passes.

## Segurança, tempo e pendências

Locks, dependências, CI, Vite/Vercel, `.env`, `.env.example` e árvore gerada de rotas foram preservados. Auditoria do registro público retornou zero, mas isso é uma observação do feed, não patch técnico, adoção do laboratório de fork, waiver, bypass ou aceite de risco. Revisão de dependências anterior continua pendente.

Referência de sessão: **12/11/2026, America/Sao_Paulo**. O relógio do sandbox informa23/11/2026UTC; divergência registrada no baseline19. Não se altera a entrega18 nem se usa essa diferença para alegar atualidade de estado remoto/advisory. Fixtures são explicitamente datadas; testes do cálculo/handler não dependem do relógio real.

Ainda exigem autorização e ambiente apropriados: homologação Auth/RLS/Postgres reais, concorrência/transações do banco, operação de provedores, SMTP/IA, revisão ampla dos fluxos legados, backup/LGPD e revisão de segurança/comercial. Axe e testes sintéticos não certificam WCAG ou operação real. **Piloto assistido condicionado, sem liberação comercial irrestrita.** Publicação é uma etapa separada e não foi solicitada nesta rodada.

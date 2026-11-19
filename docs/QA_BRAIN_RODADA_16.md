# Rodada 16 — USE Brain nativo: leitura e gravação confirmadas

## Estado e escopo

**Implementado e validado localmente, sem publicação.** Esta evolução parte da entrega local 15, conferida por 609 hashes antes de editar, sobre a última base publicada conhecida `2c32eff40f6d2c88eaaffd2e8eaf329b161066ab` (rodada 14).

O escopo é o módulo **USE Brain de memórias e recomendações por regras** em `/app/brain`. Não é o Brain Lab, o Coach nem uma homologação do core de IA. O comando nativo **não recalcula a pontuação ou as cinco respostas salvas do dashboard**. Essas frentes conservam seus limites próprios; não se afirma correção integral do orquestrador legado de análises.

Nenhum push, commit de publicação, deploy, CI remoto, migration, banco/configuração remota ou credencial foi alterado nesta rodada. Nenhuma IA, conta ou rede social real foi usada nos testes.

## Problemas corrigidos

### Leituras não são listas vazias presumidas

- Recomendações e memórias têm estados independentes de carga inicial, erro inicial, cache desatualizado e leitura confirmada, com retry identificado por painel.
- Erro ou `null` de dados/contagem não são convertidos em `[]`/zero. O cliente também valida os envelopes recebidos, antes de permitir ações dependentes deles.
- Cada GET retorna `items`, `total` exato, `limit: 50` e `checkedAt`. A prévia exige `items.length === min(total, 50)`; a interface não confunde cinquenta linhas com o histórico completo.
- Ordenação pelos mais recentes com desempate por ID. Não foi adicionada paginação do histórico inteiro; esse recorte é explícito.
- Recomendações com status `open` e expiração atingida são mostradas como expiradas e não oferecem ação manual. A expiração visual usa o instante da leitura; o servidor verifica novamente na gravação.

### Consultar é diferente de gerar

- Abrir a página, trocar de idioma e **Atualizar dados salvos** só fazem leituras. Não geram recomendações, não publicam conteúdo e não chamam IA.
- A geração fica em detalhes nativos por teclado, com confirmação explícita. O texto informa que um novo conjunto será salvo, que o histórico permanece e que sugestões podem se repetir entre gerações.
- O motor nativo usa contagens exatas de marcas, canais efetivamente conectados, conteúdo total, rascunhos e missões `pending`/`in_progress`, em vez de contar listas truncadas ou considerar uma consulta falha como ausência.
- Todas as leituras devem estar válidas antes do INSERT. Contagens inconsistentes, como mais rascunhos que conteúdos, interrompem a operação. As várias consultas são independentes; não se promete snapshot transacional entre tabelas.
- Marca e primeiro rascunho são priorizados; conexão aparece como uma sugestão única e opcional, não como obrigação de conectar quatro plataformas.
- Textos novos por regras usam PT/EN selecionado. Textos já salvos conservam seu idioma original. Não são previsões de desempenho nem garantias de resultado.

### Gravar requer confirmação

- A geração insere um único lote e confere a quantidade/IDs retornados. **Não expira nem apaga registros anteriores antes de tentar inserir**. A antiga substituição destrutiva foi removida; o histórico é aditivo.
- Se a gravação principal foi confirmada e o evento secundário de atividade falhou ou não retornou recibo, o resultado informa essa limitação sem tratar o lote salvo como fracasso e convidar a repeti-lo.
- Não há garantia distribuída de exactly-once ou de deduplicação entre abas/processos. Gerações simultâneas ou novas tentativas explícitas podem criar sugestões repetidas. Não se inventou idempotência que o schema não oferece.
- Mutações não são repetidas automaticamente. Há trava síncrona contra duplo envio local. Resposta HTTP não confirmada, recibo vazio ou incompatível bloqueiam o reenvio até uma releitura explícita; a interface explica que a operação **pode ter sido salva**.
- A releitura não identifica infalivelmente uma gravação ambígua: cabe conferir os registros antes de decidir reenviar. Não foi criado um recibo durável de operação nem uma resolução transacional nova.
- Após gravação confirmada com falha de releitura, o aviso pede retry de leitura, não repetição da gravação. O aviso específico é removido quando aquele painel se recupera; o aviso geral de atualização parcial permanece enquanto outro painel ainda falha e é substituído após recuperação de ambos.

### Memórias e status honestos

- Validação compartilhada de memória: tipo real do enum e texto após trim, de 2 a 4.000 caracteres. Os seis tipos suportados têm rótulos e radios nativos.
- A API confirma a linha devolvida, seu conteúdo e tipo. O formulário só limpa o texto confirmado e conserva o rascunho em resultado incerto.
- **Marcar como aplicada** registra um status manual; não executa a recomendação. A interface deixa explícito que isso não cria, agenda ou publica conteúdo.
- A transição só aceita alvo `applied`/`dismissed`, no mesmo workspace/ID, partindo de `open` e ainda não expirada. Zero linhas, conflito ou recibo incorreto não são sucesso.

### Acesso, escopo e apresentação

- Todos os handlers nativos verificam membership conhecida com o cliente autenticado do chamador. Viewer consulta; owner/admin/editor podem gravar conforme a RLS existente. Papel desconhecido é negado antes dos dados ou da geração. Não foi adicionada service role ou alterada uma política de banco.
- A UI só monta os leitores após confirmar o acesso. Falha de membership oculta também registros já cacheados. A UI não substitui Auth/RLS no servidor.
- Cache e componente têm escopo de usuário e workspace. Retorno tardio de escrita não limpa o formulário novo, não mostra confirmação no contexto novo nem inicia releitura com a outra identidade.
- O rascunho não salvo não é persistido automaticamente e é descartado ao trocar esse contexto, com aviso explícito na tela.
- Nome USE Brain separado de Brain Lab; estáticos, números, tipos e status PT/EN. Datas no fuso IANA de São Paulo, mesmo com navegador em Tóquio.
- Rota reduzida a composição com `modulePageHead("brain")`. Domínio em `src/features/brain`; SSR público, restauração de idioma, Node 22, Lucide build-only e configuração Lovable/Nitro preservados.

## Validação final executada

| Verificação                   | Resultado local                                                        |
| ----------------------------- | ---------------------------------------------------------------------- |
| Node                          | 22.13.0                                                                |
| TypeScript / ESLint           | Aprovados                                                              |
| Suíte integral                | **2.067 testes, 99 arquivos**, zero falhas                             |
| Casos novos                   | **189**: 56 modelos/regras, 80 handlers, 23 apresentação, 30 markup    |
| Build de produção             | Preset Vercel aprovado, 44 segundos                                    |
| Navegador compilado           | **38 checks**, PT/EN e 320/1280px nos fluxos principais                |
| Axe                           | **21 estados**, sem violações detectadas nas regras executadas         |
| HTTP anônimo compilado        | **12 combinações rota/idioma e 25 assets**, aprovados                  |
| Auditoria pública de produção | Exit 0 / zero achados reportados, sem mudança de lock; ressalva abaixo |

O build local usou heap de 1.536MB e swap temporário de 1.536MB por limitação do executor de aproximadamente 2GB. Swap removido/desativado e prévia de QA encerrada. Nenhuma configuração versionada de build foi adaptada para isso.

### Método e limites

O navegador executou o artefato compilado e o SDK reais. Auth/RPC foram interceptados **somente no harness externo** `velt-qa/rodada-16/brain-browser.mjs`, incluindo as gravações: **18 POSTs nativos sintéticos**, não gravações remotas. Uma preferência de workspace também foi trocada somente na fixture.

O runner negou `fetch` no servidor; o harness interceptou HTTP externo e fechou WebSockets do navegador. Nenhuma chamada externa inesperada foi observada. Essa instrumentação não é um firewall nem prova bloqueio de todos os transportes arbitrários. O processo não recebeu credenciais runtime.

Foram observados zero `pageErrors`, zero RPC inesperados e zero mutações inesperadas. **33 relatórios CSP foram interceptados sem persistência**; não homologam coleta/enforcement. As capturas contêm nomes, volumes e textos fictícios de QA.

Os checks selecionados cobrem confirmação de geração, duplo envio, normalização de memória, status manual, expiração, erro inicial, cache desatualizado, recuperação parcial/completa, resposta de gravação incerta, recibo vazio, evento secundário indisponível, escrita confirmada com releitura falha, prévias de 50/1.205/2.404 e corridas de usuário/workspace. O navegador foi configurado em `Asia/Tokyo` para conferir o fuso explícito do produto.

Os testes de handlers usam contexto pré-autenticado e builder sintético. Não são prova de Auth/RLS/Postgres reais, instalação limpa de banco, pentest, certificação WCAG, SMTP ou provedores. HTTP 200 das rotas privadas apenas entrega shells CSR anônimos, não acesso autenticado.

### Iterações intermediárias preservadas

A primeira suíte direcionada revelou incompatibilidade do matcher de objetos com funções anotadas no mock; a verificação foi corrigida para conferir explicitamente método e middleware. Não se mudou o produto para adaptar esse teste.

O primeiro harness parou porque o texto preservado após uma gravação incerta aparecia corretamente tanto no textarea quanto na lista relida; o seletor foi restringido à lista. Depois, a revisão de recuperação acrescentou verificações de remoção dos avisos resolvidos e permanência do aviso enquanto outro painel falha. Todos os gates, build e navegador foram repetidos para a revisão final. Logs anteriores não substituem os arquivos canônicos finais.

## Segurança e integração futura

A consulta `npm audit --omit=dev --audit-level=moderate --registry=https://registry.npmjs.org` retornou zero achados reportados no lock inalterado. Picomatch continua 4.0.7. Isso não identifica patch técnico nem encerra a pendência histórica da rodada 14; a ressalva temporal do feed/advisory registrada na rodada 15 permanece. Nenhum fork, waiver, alteração de threshold ou CI remoto foi adotado/executado.

O envelope dos dois GETs nativos mudou de array para objeto paginado por prévia (`items/total/limit/checkedAt`). UI, funções e seus wrappers tipados devem ser integrados juntos, não copiados isoladamente para builds diferentes.

Artefatos em `/home/user/velt-qa/rodada-16/`: baseline, manifestos, recibos finais, gates, build, browser e HTTP. A entrega inclui patch incremental sobre a entrega 15 e patch acumulado das rodadas 15–16 sobre a publicação 14; são **alternativas**, não patches para aplicar ambos no mesmo checkout.

O Git reidratado original ainda aponta para um HEAD histórico. Uma futura publicação deve obter a main remota correta, verificar divergências, integrar o patch compatível, revalidar e receber autorização própria. Sem nova autorização não há push/deploy nem homologação real. O resultado continua destinado a **piloto assistido condicionado**, não liberação comercial.

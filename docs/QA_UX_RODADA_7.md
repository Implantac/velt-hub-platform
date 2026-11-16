# QA — fundamentos de experiência profissional, rodada 7

Esta é a primeira etapa após a revisão como usuário: responsividade pública, semântica das telas de acesso e próximo passo no agendamento. A base de comparação é `bdcbf941c7110cde062aaf801251318bd56c5b59`. Não é uma declaração de funcionamento completo, certificação de acessibilidade ou homologação externa.

## Alterações

- **Página pública:** cabeçalho em duas linhas nas telas estreitas, com os dois destinos de acesso visíveis, e hero com espaçamento/tipografia móveis menores. O aviso verdadeiro de portfólio, as funcionalidades, o SSR e os metadados PT/EN foram preservados. Não se resolveu o corte simplesmente escondendo o botão.
- **Idioma:** seletor compacto usa `PT-BR`/`EN-US`; o nome acessível de cada opção contém o código visível e o nome nativo. Modo completo mantém os nomes nativos. Alvos de 44px e foco visível no seletor, sem alterar persistência ou invalidação do roteador.
- **Acesso:** login, solicitação/atualização de senha e cadastro estão em um único `main` identificado pelo título. A confirmação do cadastro interpola de fato o endereço e quebra endereços longos, sem cortá-los no cartão.
- **Agendamento:** formulário primeiro; orientação derivada das opções autorizadas e do papel do usuário. Consulta, ausência de rascunho, ausência de canal, OAuth, configuração do serviço, unidade Google Business, implementação indisponível e TikTok inbox recebem orientações distintas. Motivos mistos/desconhecidos não viram uma falsa explicação única. Uma opção elegível não obriga conectar outra.
- **Detalhes secundários:** configuração por plataforma e funcionamento da entrega ficam em disclosures nativos, recolhidos e operáveis por teclado. Configuração continua explicitamente diferente de OAuth/permissão/aprovação do provedor. Aviso de simulação, caso o servidor o informe, fica fora do disclosure; a publicação atual não deve usar simulação.
- **Atividade:** rótulo acessível do sino inclui o número visível, inclusive `9+`. A contagem é de eventos recentes, não de notificações com leitura persistente; essa função não foi inventada.

As proteções do servidor e do banco não foram substituídas pela orientação visual. `enqueuePublication`, preflight, recibos, RBAC/RLS, OAuth single-use/versionado, leases, fences, reconciliação e observações analíticas não foram alterados. Nenhuma migration, configuração de storage, dependência ou segredo de deploy foi acrescentado por esta etapa.

## Testes locais

Executados com **Node 22.13.0**, alinhado ao runtime suportado do repositório/CI/Vercel:

| Verificação                                | Resultado                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Typecheck e ESLint                         | Passaram                                                                                                                                                           |
| Vitest completo                            | 1.306 testes / 76 arquivos passaram                                                                                                                                |
| Testes acrescentados                       | 64 em 5 arquivos; apresentação e orientação PT/EN, motivos mistos/futuros, consulta, capacidade vazia/erro/carregamento/simulação, nomes acessíveis e interpolação |
| `npm audit --omit=dev`                     | Zero vulnerabilidades reportadas na consulta                                                                                                                       |
| Build preset Vercel                        | Passou, preservando wrapper Lovable/Nitro e otimização Lucide build-only                                                                                           |
| Regressão pública no build compilado       | 38 verificações / 10 snapshots Axe, sem violações detectadas nesses estados                                                                                        |
| Agendamento com Auth/persistência reais    | 16 verificações / 11 snapshots Axe, sem violações detectadas nesses estados                                                                                        |
| Contrato visual da confirmação de cadastro | 4 verificações / 2 snapshots Axe; resposta de signup interceptada, **somente UI**, sem cadastro ou e-mail reais                                                    |

O build local usou swap temporário de 1.536MB devido à RAM limitada do executor; o arquivo foi desativado/removido ao fim. Isso não altera plano ou configuração da Vercel.

A suíte completa foi inicialmente invocada com o Node 20 padrão do shell e três casos de preservação de IDs numéricos int64 falharam por falta de `JSON.parse` reviver `context.source`. A execução correta em Node 22 passou sem enfraquecer o parser, os publishers ou os testes. Houve ainda uma falha de cobertura de locale por ausência da chave-base de fallback de um novo plural; a chave foi acrescentada nas duas línguas, sem relaxar o teste de cobertura.

## Método e reproduções

- O navegador usou o **artefato compilado Vercel**, não um componente desenhado apenas para teste. Páginas públicas mantiveram SSR; a área privada manteve o fluxo CSR/autenticação existente.
- PT/EN foram examinados em 320/390/1440px; a página pública também em 768px. Os limites reais de links/campos/botões foram medidos, não apenas a largura do documento. O CTA principal móvel foi conferido dentro do primeiro viewport de 844px.
- O baseline público reproduziu o corte do CTA do cabeçalho, a ausência de `main` nas telas de acesso e a interpolação literal `{email}`. Testes vermelhos/capturas foram preservados separadamente, assim como as correções finais.
- A primeira tentativa do novo rótulo compacto expôs `label-content-name-mismatch`: o nome nativo não incluía o código visível. O nome foi corrigido, sem excluir a regra. Um estado com atividade real da fixture expôs o mesmo problema no sino; a contagem foi incorporada ao rótulo.
- A confirmação com endereço longo parecia caber pela largura do documento, mas a revisão visual e `Range.getClientRects()` comprovaram texto cortado. A quebra de palavras foi corrigida e os limites reais passaram em PT/EN. O diagnóstico anterior não é apresentado como prova final.
- Disclosures de configuração e entrega foram abertos/fechados com Enter/Espaço. Escolher inglês atualizou a orientação e persistiu depois de recarga completa, com `html lang` correto. O HTML público sem JavaScript manteve idioma, título, description e Open Graph nas duas línguas.
- Axe foi executado com o conjunto completo padrão de regras nos **estados selecionados**, aguardando fontes/animações finitas. Zero violações nesses snapshots não é uma auditoria de todos os fluxos, uso por leitor de tela ou conformidade WCAG integral.

## Persistência, permissões e limites do harness

Foram criados owner/viewer e workspace **descartáveis**, com login normal pela UI, sem injetar uma sessão ou workspace no storage. O marcador local de tour visto foi usado apenas para não encobrir as verificações.

1. Workspace vazio mostrou a ação de criar rascunho e bloqueou o agendamento.
2. A ação abriu Conteúdo; salvar realmente persistiu texto/status de rascunho. Ao voltar, a orientação mudou para Canais.
3. Cadastrar manualmente um perfil realmente persistiu `disconnected`, sem token OAuth. Ao voltar, apareceu o motivo específico e o checkbox permaneceu bloqueado.
4. Chamadas reais ao servidor rejeitaram enqueue de owner com canal desconectado e enqueue de viewer por papel, independentemente dos campos desabilitados.
5. Login real do viewer mostrou somente orientação de consulta, sem CTA de edição no novo bloco.
6. Ao fim de cada execução, o workspace/usuários temporários foram removidos. Não havia jobs, tokens, tentativas OAuth ou snapshots analíticos na fixture. Fingerprints e dados originais têm conferência operacional separada.

No runner local, HTTP de provedores foi bloqueado fora do produto; as únicas chamadas de dados permitidas ao servidor eram para o Supabase exclusivo VELT. Não foi instalado mock operacional no aplicativo nem alterado o modo real dos publishers. O teste de carregamento apenas reteve um GET até liberação; os testes de erro abortaram GETs existentes e depois verificaram retries com dados reais. Não foi fabricada resposta positiva de agendamento ou publicação. Abortar requisições/conexões no harness pode gerar logs de desconexão no runner local; não se confundem com exceções de página do navegador.

A confirmação visual do cadastro foi exercitada com resposta de Auth interceptada em um contexto separado, com bloqueio de outras escritas. Esse teste comprova interpolação/layout da UI **somente**. Não comprova cadastro, envio/entrega de confirmação, recuperação efetiva de senha ou SMTP.

## Publicação é uma verificação separada

A versão de trabalho, build e suíte locais não comprovam o `main` remoto ou o domínio publicado. SHA, CI, deploy Git `READY / PROMOTED`, smoke pós-deploy, inspeção visual, limpeza e pacote final devem ser registrados no relatório operacional da entrega. O gatilho main-only e o CI paralelo/não gate foram preservados; não foi adicionada dependência entre os dois.

## Ainda pendente

- Upload/biblioteca de mídia com análise própria de limites, formatos, políticas de armazenamento, segurança e custos; esta etapa preserva mídia por URL.
- Jornada de calendário/reagendamento e experiência móvel da tabela da fila.
- Contextualização da sugestão de melhor horário por canal/fuso. O cartão existente ainda usa Instagram, português e referência São Paulo/UTC−3; o formulário salva a data local do navegador em UTC. **Não foi reproduzido envio em horário errado**, e este cartão não foi apresentado como previsão personalizada validada.
- Suporte, dados legais, termos, privacidade, retenção/exclusão e operação de equipe, sem inventar contatos ou identidade do responsável.
- Leitura persistente de notificações, não criada por alterar o nome acessível do contador.
- Homologação autorizada em provedores reais, ciclo completo de publicação/coleta, SMTP, backup/restauração, instalação limpa das migrations, alertas e revisão integral dos demais módulos.

Não houve conexão social, postagem real, Bio pública, coleta externa positiva, geração paga, mudança de plano, intervenção em Loja/Lotofácil ou alteração do owner/workspace reais. O requisito de funcionamento completo continua em vigor; prontidão comercial e essas frentes não são encerradas pela contagem de testes.

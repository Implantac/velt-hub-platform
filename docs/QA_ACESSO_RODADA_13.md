# Rodada 13 — acesso e recuperação mais confiáveis

## Resultado executivo

Evolução local concluída no fluxo de entrada, cadastro, confirmação de e-mail e recuperação de senha. A aplicação usa o SDK real do Supabase; nenhuma resposta sintética foi adicionada ao produto.

**Esta rodada não foi publicada no GitHub/Vercel.** A última versão publicada e confirmada continua sendo `9937cc81426ffc97ce85aea2b664231e82bc42fe`. Não houve mudança de banco, migrations, configurações remotas, credenciais ou integrações sociais.

## Melhorias implementadas

- **Recuperação com sessão confirmada:** `mode=reset` e os parâmetros do link são apenas intenção. O formulário de nova senha só aparece depois da inicialização do Auth e da confirmação do usuário pelo serviço.
- **Falhas distintas:** link/sessão inválidos oferecem outro link; falha temporária oferece nova tentativa. Se o exchange inicial falha temporariamente, a tentativa explícita reinicializa a página/SDK em vez de repetir manualmente tokens ou um erro de inicialização já armazenado.
- **Sem troca silenciosa de conta:** identifica a conta no formulário, revalida antes de alterar a senha e descarta respostas antigas após logout, troca de identidade ou desmontagem. O servidor Auth continua sendo a autoridade de autorização; isso não é um mecanismo novo de MFA.
- **Callback sem mensagem bruta:** remove parâmetros sensíveis somente depois da inicialização. Mantém apenas um marcador neutro de rejeição para que recarregar um link inválido não aproveite uma sessão já existente. Um exchange ainda pendente/temporariamente falho preserva o callback até a nova tentativa; não é apagado antes de o SDK poder consumi-lo.
- **Envio único:** trava síncrona impede cliques duplicados antes de o React atualizar os controles. Retornos de ações desmontadas não produzem mensagens ou navegação nessa página.
- **Reenvio com feedback:** intervalo local de 60 segundos para solicitar/repetir e-mail, mantido na mesma aba após recarga. O armazenamento contém somente um prazo numérico, nunca e-mail, senha ou token. Isso é UX, **não substitui rate limiting/CAPTCHA/limites do backend**.
- **Confirmação coerente:** envio e reenvio usam o mesmo destino interno na origem atual. Mensagem usa o endereço submetido, permanece neutra quanto à existência da conta e não afirma entrega na caixa de entrada.
- **Cadastro e campos:** nome usa a mesma regra de perfil (trim, 1–80 caracteres); campos permanecem em falhas; a senha é descartada após solicitação de cadastro aceita. Senhas possuem controle de visibilidade rotulado, sem enviar o formulário.
- **Acessibilidade e arquitetura:** erros inline com foco, campos rotulados, gerenciador de senhas preservado, controles de 44px, contador sem anúncios a cada segundo, PT/EN e telas de 320px. Rotas são composição e os componentes estão em `src/features/auth`.

## Validação executada

| Verificação           | Resultado                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Node                  | 22.13.0                                                                                                 |
| TypeScript            | Passou                                                                                                  |
| ESLint                | Passou, sem warnings na execução final                                                                  |
| Testes automatizados  | **1.663 em 91 arquivos**, incluindo 112 casos acrescentados nesta rodada                                |
| Build de produção     | Preset Vercel passou; otimização Lucide/Nitro/Lovable preservada                                        |
| Navegador Chromium    | **76 checks selecionados**, PT-BR/EN-US × celular 320px/desktop 1280px, sem falhas finais               |
| Axe                   | **28 estados selecionados**, sem violações detectadas nas regras executadas; não é certificação WCAG    |
| HTTP local compilado  | **6 combinações rota/idioma + 11 assets JS/CSS**, zero falhas; títulos, headings e nonce/CSP conferidos |
| Auditoria de produção | **Reprovada: 11 findings altos** na árvore de dependências existente                                    |

O build no executor de aproximadamente 2GB usou swap temporário de 1.536MB e heap local de 1.536MB. O swap foi desativado/removido; o comando/configuração versionados de build, lockfiles e dependências não foram alterados.

### O que o navegador cobriu

Senha visível/oculta sem submit, envio duplicado, erro com campos preservados e foco, solicitação neutra de recuperação, intervalo após recarga, erro de limite do Auth, nome só com espaços, cadastro rejeitado/aceito, confirmação/reenvio/destino, edição do cadastro, sessão de recuperação confirmada após recarga, senhas diferentes, revalidação antes da alteração, rejeição por senha igual, sucesso reconhecido antes de navegar, link inválido com outra sessão já existente e nova tentativa após indisponibilidade inicial.

### Isolamento e correção do harness

- O navegador executou o **build real compilado**, com o SDK real. As respostas positivas/negativas de Auth foram interceptadas **somente no harness externo** em `/home/user/velt-qa/rodada-13/`.
- Usuário, tokens, senhas e respostas desse harness são fixtures sem validade em um serviço real. Não houve cadastro, e-mail, alteração de senha, banco ou publicação social reais.
- Toda saída de rede do servidor local foi bloqueada. O runner não recebeu credenciais de servidor. A prévia temporária foi encerrada ao final.
- A primeira execução tinha 12 falhas de asserção: as fixtures omitiram o header de versão que faz o SDK interpretar o campo moderno `code`. O produto corretamente exibiu uma falha genérica segura. Corrigiu-se **somente o harness**, preservando R1 e diagnóstico; R2 terminou com 76 checks e 28 Axe aprovados. Não se alterou código do produto para acomodar uma fixture incorreta.
- A política CSP permaneceu no modo report-only existente. O coletor de relatórios registrou falhas locais por ausência deliberada de credenciais administrativas; relatórios não foram persistidos. Não se certifica enforcement, coleta CSP ou operação desse endpoint por este teste.

## Segurança e limites remanescentes

A auditoria foi executada novamente com `npm audit --omit=dev --audit-level=moderate` e retornou exit 1/11 findings altos. Nenhum nível, exceção, dependência ou lockfile foi alterado para fazer a verificação passar. O protótipo de correção do picomatch continua fora do produto.

Ainda são necessários: SMTP/entrega real e allowlist de redirecionamentos do Auth; confirmação/recuperação reais em ambiente isolado; políticas e limites de abuso; avaliação de sessões/MFA/reautenticação conforme a configuração do Auth; tratamento aprovado da dependência vulnerável; proteção de release/CI; homologação externa de publicação/coleta; backup/restauração, LGPD e operação do piloto.

A validação desta rodada é selecionada e local. Não é pentest, prova universal de ausência de falhas, homologação de e-mail ou liberação comercial. A rota protegida continua usando Auth/RLS existentes; nenhum bypass ou modo de simulação foi acrescentado.

## Rastreabilidade

- Snapshot de fontes anterior: 576 arquivos; baseline com hashes em `rodada-13/baseline.json`.
- Testes/logs/build: `typecheck-final.log`, `lint-final.log`, `full-tests-final.log`, `build-receipt.json` e `build-vercel.log`.
- Navegador: `browser/auth-browser-results.json`; R1 e diagnóstico preservados separadamente.
- HTTP: `http-auth-smoke.json`; auditoria: `npm-audit.json`/`audit-summary.json`.
- Os manifests e relatórios das rodadas anteriores são históricos e não foram reescritos para fingir que descrevem as novas fontes.

O Git local reidratado contém alterações históricas anteriores ao snapshot publicado. Ele não foi resetado nem usado para publicar um HEAD antigo. Uma futura sincronização deve partir da main correta e incorporar somente a evolução conferida desta rodada, preservando as entregas anteriores.

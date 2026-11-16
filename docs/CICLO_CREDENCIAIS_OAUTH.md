# Operação do ciclo de credenciais OAuth

Este protocolo protege o estado **interno** do VELT. Implementação e testes com respostas sintéticas não homologam consentimento, publicação, leitura ou renovação em um provedor real. Não conectar contas nem publicar durante QA sem autorização específica.

## Autorização: início, callback e reconexão

1. Owner/admin inicia em **Canais**. O servidor valida workspace, marca, provedor e, em uma reconexão, o canal/identidade de destino. `APP_ORIGIN` é obrigatório e deve ser uma origem HTTPS confiável em produção; redirect arbitrário do navegador não é aceito.
2. O servidor assina o state e registra uma tentativa privada antes de emitir o cookie HttpOnly/SameSite=Lax. O banco guarda o digest SHA-256, não o state, código ou token bruto. Tentativa válida por dez minutos, vinculada ao ator, workspace, provedor, marca, redirect, plataforma e alvo.
3. O callback exige assinatura, validade e o cookie do navegador que iniciou. Consome a tentativa atomicamente **antes** de trocar o código. Só um callback obtém a reserva de exchange, válida por três minutos. Repetição, cancelamento ou expiração não autorizam outra troca.
4. Identidade/credenciais retornadas são validadas; metadados públicos passam por allowlist. A conclusão transacional revalida papel, marca, época e alvo. Canal, credenciais cifradas, nova versão e evento são persistidos juntos.
5. Reconectar um canal existente preserva sua conta/unidade e, por padrão, sua marca. Não escolher outra conta implicitamente quando o provedor retorna várias. Um retorno sem confirmação no banco nunca exibe sucesso.

Desconectar ou excluir um canal invalida as tentativas pendentes/em exchange da **mesma plataforma no workspace**, inclusive uma tentativa genérica cujo ID externo ainda é desconhecido. A época de autorização evita que um callback anterior crie outro canal depois da desconexão. O aviso de confirmação explica esse alcance.

Uma nova autorização explícita, iniciada depois, é permitida. Uma tentativa mais antiga não sobrescreve a conclusão de outra iniciada mais recentemente. Não restaurar o RPC legado `complete_oauth_connection`: ele falha fechado por não transportar a tentativa single-use.

## Renovação entre workers

- Cada credencial tem um UUID de versão. Reserva de refresh no Postgres, por canal e versão, válida por 60 segundos; não há mutex somente em memória.
- A reserva não basta: `begin_oauth_token_refresh` deve ser **reconhecido pelo banco antes de qualquer POST** ao provedor. Begin sem reconhecimento implica zero POSTs, mesmo que o banco tenha recebido o pedido.
- Um worker concorrente recebe espera transitória. Resultado positivo só é usado após commit CAS da versão/lease e leitura de confirmação. Um UUID novo conhecido funciona como recibo para resolver reconhecimento de commit perdido.
- É permitido repetir uma vez o mesmo commit CAS; **não** repetir automaticamente o grant rotativo após timeout, perda de resposta ou resposta inválida.
- Reserva abandonada sem begin pode ser recuperada. Begin abandonado/resultado incerto exige reconexão, não outro grant. Um worker tardio ainda pode confirmar sua versão se ninguém invalidou/substituiu sua reserva; observar/recuperar a concessão incerta o impede.
- Desconectar, excluir ou reautorizar vence o commit de um refresh antigo. Refresh usa UPDATE fenced, nunca UPSERT de credenciais nem `status=connected` genérico.
- Uma falha de autenticação analítica só invalida a versão que efetivamente foi usada. Um erro antigo não degrada a reconexão/renovação mais nova.

### Como agir nos estados

| Estado                                                                   | Ação operacional                                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `refresh_busy`                                                           | Outro worker está renovando. Aguardar e repetir a operação de leitura/fila, sem exigir reconexão imediata.           |
| `refresh_cooldown`                                                       | Espera temporária de 60 segundos, por exemplo após 429. Aguardar; não enviar grants em loop.                         |
| `credential_changed`                                                     | Atualizar a operação: a versão mudou. Não reutilizar o token/grant antigo.                                           |
| `store_unavailable`                                                      | Não foi possível confirmar o banco. Aguardar e investigar conectividade; não inventar estado nem enviar outro grant. |
| `provider_configuration`                                                 | Revisar configuração/credenciais do app no servidor; não imprimir valores em logs.                                   |
| `refresh_uncertain`, `invalid_grant`, `invalid_token`, `missing_refresh` | Exigir reconexão explícita da mesma conta. O canal fica expirado, não falsamente conectado.                          |
| Canal desconectado/excluído                                              | Credenciais locais não podem ser recriadas por worker antigo. Nova autorização somente por ação explícita.           |

A coleta analítica também fixa a versão efetivamente usada e a revalida no commit único de snapshot/data. Disconnect, refresh ou reautorização posterior recusam a observação antiga; 401 tardio continua sem poder invalidar a versão nova. Não gravar `last_synced_at` diretamente nem reutilizar o recorder legado. Veja [o contrato de observações](./OBSERVACOES_ANALITICAS.md).

Scheduler/reconciliação distinguem falha transitória de autorização irrecuperável. Espera transitória de leitura conserva a consulta pendente, sem reenviar a publicação original. O mecanismo de [reconciliação/revisão](./RECONCILIACAO_PUBLICACOES.md) permanece independente: reconectar não confirma uma publicação e encerrar revisão não a reenvia.

## Google Business: primeiro vínculo de unidade

Uma conta `accounts/…` pode autorizar OAuth sem ainda apontar a uma unidade. Isso aparece como **“selecione uma unidade”**, não como canal pronto para posts.

- O servidor lista recursos gerenciáveis e consulta o **Voice of Merchant atual**. Existência da unidade ou uma verificação histórica não substitui essa autorização.
- A escolha é explícita. Unidade não verificada não pode ser confirmada. Listagem que falhou é erro recuperável, nunca lista vazia ou vínculo presumido.
- O RPC privilegiado revalida owner/admin, workspace, plataforma, status, versão do token, mesma conta e ausência de histórico de entregas/analytics incompatível.
- Só o primeiro vínculo pode mudar `accounts/…` para `accounts/…/locations/…`. Uma unidade estabelecida não é retargetável; para outra unidade, iniciar outra conexão. Confirmação da mesma unidade é idempotente.
- Reconexão preserva a unidade escolhida. Agendamento direto via RPC também exige o vínculo confirmado e serializa com alteração/desconexão.

## Limites e permissões

Tokens são strings ASCII imprimíveis não vazias de até 32.768 caracteres, sem coerção de objetos/`undefined`. Expiração é inteira, positiva e de até 366 dias no parser; o banco usa margem de até 367 dias para o instante absoluto. Expiração é obrigatória fora dos grants Meta; ausência não vira validade infinita. Scope limitado a 8.192 caracteres e token type Bearer.

Exchange/refresh: timeout de 20 segundos e corpo JSON de até 128 KiB. Discovery: até 1 MiB por resposta, timeout de 15 segundos por leitura e deadline agregado de 40 segundos nas listagens paginadas; redirects são recusados. Paginação usa endpoints próprios/cursors validados, nunca um `next` arbitrário com Authorization. Respostas sensíveis não são refletidas em erros.

Tabelas privadas com RLS; clientes não leem tokens, tentativas ou épocas. Service role tem SELECT, não INSERT/UPDATE/DELETE genéricos sobre tokens. Somente RPCs SECURITY DEFINER de owner confiável fazem as transições. Não restaurar permissões amplas ou atualizar status/metadata diretamente para “consertar” uma conexão. Rotacionar credenciais de infraestrutura exige procedimento separado; logout local não revoga grants ou PATs externos.

## Schema e recuperação de versão

Migration aplicada no Supabase VELT: `20261116151953_oauth_credential_lifecycle.sql`, 29ª entrada do histórico. Nome local alinhado ao timestamp efetivo; MD5 local/remoto `90f1ae634a1abb40a40a343aead86c61`. **Não reaplicar manualmente nesse projeto**. Histórico/hash e fingerprints foram conferidos; não houve alteração no owner/workspace real.

Schema atualizado rejeita a conclusão OAuth de versões antigas. Promover código que implemente este protocolo; não reabrir o bypass legado durante rollback. Se houver necessidade de rollback, avaliar compatibilidade de schema e aplicativo explicitamente, com migração de correção revisada, sem apagar histórico ou desabilitar RLS.

Nenhum banco consegue cancelar uma chamada externa que já foi enviada, revogar permissões no provedor por remover o token local ou garantir exactly-once externo sozinho. Reconexão pode exigir ação humana. Validação comercial e de contas reais continua pendente.

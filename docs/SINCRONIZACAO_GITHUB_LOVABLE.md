# VELT completo no GitHub e sincronização com o Lovable

## Escopo desta entrega

Repositório: <https://github.com/Implantac/velt-hub-platform>.

Branch de integração: `main`.

A base funcional `78a258064acd86e5ee1245dcb2d87b34ef3ef9db` contém **574 arquivos versionados**. A conferência local encontrou todos esses arquivos, sem diferenças em relação ao manifest da versão validada anteriormente. O código completo já pertence à árvore Git; esta atualização acrescenta somente este registro de entrega e um manifest verificável, sem substituir a aplicação por arquivos de laboratório.

O manifest [MANIFEST_FONTES_GITHUB.json](./MANIFEST_FONTES_GITHUB.json) lista os arquivos, tamanhos e hashes SHA256 desta entrega, excluindo o próprio manifest para evitar autorreferência. A árvore final esperada contém **576 arquivos versionados**: os 574 originais e os dois documentos desta entrega.

## Conteúdo incluído

- `src/`: interface, módulos de domínio, rotas, APIs de servidor, autenticação, agendamento, traduções e testes versionados.
- `supabase/`: configuração, migrations e suítes SQL existentes.
- `drizzle/`: schema e migrations versionados desse componente.
- `scripts/`, `public/` e `vite/`: verificações, recursos e suporte ao build.
- `package.json`, `package-lock.json` e demais arquivos de configuração de execução, build e testes.
- `.github/`, `.lovable/`, `vercel.json`, documentação e metadados do projeto.

Nenhum recurso de aplicação foi removido para produzir este commit. A conferência de completude não equivale a homologação de todas as integrações externas.

## O que não pertence ao GitHub

Projeto completo significa o **código-fonte e a configuração versionável**, não uma cópia de dados ou segredos da infraestrutura.

Não devem ser enviados: tokens de acesso ao GitHub, chaves privilegiadas, credenciais OAuth, variáveis privadas do servidor, dados reais do banco, node_modules, caches, builds e arquivos locais gerados por ferramentas. O diretório `.vercel/` continua ignorado.

O `.env` deste projeto é uma exceção deliberada já documentada no README: contém configuração pública usada pelo cliente Vite. Ele foi preservado, sem acrescentar segredos. A verificação `scripts/check-env.mjs` foi executada antes da entrega e não encontrou credenciais de servidor conhecidas nos arquivos de ambiente versionados. Esse guard não é um scanner universal de segredos.

Os protótipos de segurança do picomatch permanecem fora da aplicação e não fazem parte desta entrega. A atualização não implementa um fork nem remove o advisory da dependência.

## Como o Lovable recebe a versão

1. No projeto Lovable, confirme que a integração GitHub aponta para `Implantac/velt-hub-platform` e acompanha a branch `main`.
2. Confira se o commit novo da `main` apareceu no projeto antes de tentar publicar.
3. Caso continue a mensagem abaixo, abra **Cloud** e verifique o estado do backend:

   > Publishing failed because your Lovable Cloud backend is not currently active. Open Cloud to check its status before publishing again.

4. Trate o estado do backend no próprio painel Cloud antes de repetir a publicação. O envio de commits ao GitHub não comprova nem realiza a ativação desse serviço.

O sucesso de um push confirma a atualização do GitHub. Ele não comprova que o Lovable importou o commit ou publicou o site. Não altere `.lovable/project.json` apenas para simular um backend ativo, nem troque o banco ou as credenciais para contornar essa mensagem sem revisão da integração.

## Verificação e execução

Use **Node >=22.13.0 e <23**, conforme os contratos existentes:

```bash
npm ci
node scripts/check-env.mjs
npm run verify
```

Os segredos exigidos pelo servidor devem ser configurados no ambiente protegido da hospedagem, nunca preenchidos em arquivos versionados. O estado dos serviços, dados, autorizações e segredos remotos não é restaurado apenas clonando o repositório.

Esta entrega documental não executou novamente a suíte completa ou o build da aplicação. Os testes anteriores continuam sendo evidência histórica da base, não um novo run. O workflow existente executa suas verificações em pushes para `main`, inclusive a auditoria de dependências. O último estado conhecido antes desta entrega tinha pendência de segurança no picomatch; nenhuma exceção ou alteração do nível de auditoria foi aplicada.

## Integridade e publicação

O manifest comprova correspondência de arquivos quando seus hashes são reconferidos. Não prova ausência de vulnerabilidades nem configuração correta do Cloud. Resultados de CI, importação pelo Lovable e publicação precisam ser conferidos separadamente.

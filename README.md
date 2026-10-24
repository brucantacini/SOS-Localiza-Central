# SOS Localiza Central

Painel React/TypeScript separado: resumo, mapa, lista, filtros, detalhes e atendimento pela [API compartilhada](docs/API.md), sem dados fixos ou fallback em memória.

## Deploy na Vercel

Frontend e API são publicados juntos neste repositório: `api/index.mjs` exporta o backend compartilhado e `vercel.json` encaminha `/api/v1/*` à função Node. Configure a raiz do repositório como Root Directory, as variáveis Oracle privadas na Vercel e faça redeploy. A Central usa `/api/v1`; o app principal usa a URL HTTPS pública da Central seguida de `/api/v1`. Configuração completa e diagnóstico do 404 em [VERCEL.md](docs/VERCEL.md).

## Executar

Requer Node.js 20.19+ ou 22.12+ e npm.

```sh
npm install
cp .env.example .env
npm run dev
```

PowerShell: use `npm.cmd` se a política bloquear scripts e `Copy-Item .env.example .env`. Abra http://localhost:5174. A Central usa `/api/v1` relativo e o proxy Vite encaminha ao backend na porta 3001. Em produção configure proxy equivalente de mesma origem. Inicie o backend conforme [RUNBOOK](docs/RUNBOOK.md).

Entre com usuário e senha de operador. O backend valida o hash no Oracle e emite cookie HttpOnly; a chave compartilhada antiga não é mais aceita. Use **Encerrar sessão** para revogar a sessão no banco. **Alterar senha** permite individualizar a senha inicial e encerra todas as sessões do operador. A senha inicial compartilhada destina-se somente à demonstração acadêmica e deve ser alterada antes de qualquer outro uso. Nenhuma credencial é embutida no frontend ou Git. Migration, seed idempotente e testes em [AUTH.md](docs/AUTH.md).

No Windows, execute `npm.cmd run api:start` nesta pasta para manter a API em segundo plano. Após alterações no backend, execute `npm.cmd run api:restart`. Para executar de qualquer pasta: `npm.cmd --prefix C:\DESENVOLVIMENTOS\FIAP\sos-localiza-central run api:start`. O comando confirma a conexão Oracle e reutiliza uma API já saudável. Execute novamente após reiniciar o computador. Consulte o [RUNBOOK](docs/RUNBOOK.md) para os logs locais.

```sh
npm run build
npm run preview
```

## Verificação

1. Configure backend e tabela Oracle; verifique `/api/v1/health`.
2. Envie alerta pelo app e aguarde confirmação da API após COMMIT.
3. Na Central, pressione **Atualizar** e confira protocolo e detalhes.
4. Filtre por status, tipo, texto e datas inclusivas UTC. Resumo contabiliza todos os resultados filtrados. Lista mostra 25 por página; mapa mostra somente GPS real da página carregada. Endereço sem GPS aparece somente na lista. Tiles OpenStreetMap exigem internet.
5. Mude o status e salve. A confirmação exige sucesso da API. Reabra para conferir persistência. Conflito 409 recarrega a versão atual para revisão.
6. Desligue o backend ou encerre a sessão. A consulta deve exigir autenticação sem dados inventados. Senha incorreta e usuário inexistente recebem a mesma falha genérica. Atualização é manual.

Timeout no PATCH pode ocorrer depois de COMMIT: reabra o alerta antes de repetir. `expectedVersion` impede sobrescrever alteração concorrente. O acesso Oracle exige conexão de aplicação SQL*Net; a conexão TCPS fornecida para o Oracle FreeSQL está configurada somente no ambiente local do backend e foi validada. Este projeto é local; dados pessoais exigem controle de identidade e acesso adequado antes de publicação.

## Estrutura

- [src/api.ts](src/api.ts): tipos e cliente HTTP do contrato v1.
- [src/App.tsx](src/App.tsx): consultas, mapa e atendimento.
- [src/styles.css](src/styles.css): identidade e layout responsivo.
- [public/fonts](public/fonts): Montserrat e licença OFL copiadas do app.
- [backend](backend): API e Oracle mantidos pelo coordenador.

## Validação nesta implementação

Build TypeScript/Vite aprovado utilizando as mesmas versões já instaladas no app principal, por junction local de `node_modules` ignorada pelo Git. O lockfile preserva essas versões. O download de novas dependências foi bloqueado no sandbox e o pedido de aprovação foi negado, portanto a instalação limpa deve ser executada no seu ambiente com `npm ci`. Nenhum pacote de painel extra foi necessário: mapa Leaflet nativo e ícones SVG locais.

Após configurar o Oracle FreeSQL, passaram `npm run db:setup`, `npm run test:oracle` e `npm run test:e2e` no backend. O último teste enviou um alerta pelo app, verificou a gravação Oracle, encontrou o mesmo protocolo na Central, alterou o atendimento e conferiu o status no banco. A autenticação individual foi validada no Oracle com os três operadores e seed repetido, sem alterar suas senhas. Resultados em [AUTH.md](docs/AUTH.md) e [RUNBOOK](docs/RUNBOOK.md). A conexão Oracle permanece somente no ambiente local do backend; operadores/senhas são armazenados no banco como usuário/hash, com manifesto privado de seed contendo somente hashes.

# Executar e testar SOS Localiza + Central

Para publicar o frontend e o backend juntos na Vercel, siga [VERCEL.md](./VERCEL.md). O proxy Vite descrito abaixo serve apenas ao desenvolvimento local; em produção as rotas são atendidas pela função `api/index.mjs`.

## Entrega e limite atual

Dois agentes implementaram separadamente app e painel; o coordenador definiu primeiro o [contrato v1](./API.md), implementou API/Oracle e revisou a integração. Responsabilidades em [ORCHESTRATION.md](./ORCHESTRATION.md).

**Gravação Oracle e fluxo completo aprovados em 24/10/2026**, após o usuário fornecer acesso TCPS ao Oracle FreeSQL. O backend está configurado em `.env` local ignorado pelo Git. A tabela e os índices foram criados e os testes reais passaram, incluindo envio pelo app, consulta na Central e persistência da atualização de status. Não existe fallback de dados em memória no backend nem seed de alertas no painel.

## Pré-requisitos

- Node.js 22.12+ (validado com Node 24.22) e npm.
- Os repositórios `SosLocaliza` e `sos-localiza-central` lado a lado, como neste workspace.
- Oracle acessível pelo backend via SQL*Net, com usuário/schema próprio e permissão para criar tabela/índices. Usar conexão fornecida pelo provedor, com TLS/wallet quando exigido.
- FreeSQL acessível apenas pelo navegador **não fornece, por si só, uma conexão para este backend**. Se esse for seu único acesso, obtenha uma conexão Oracle Free/Autonomous acessível. Se possuir somente ORDS, este backend precisará de um adaptador específico; não substituir a connect string por uma URL de página.
- Internet para tiles OpenStreetMap e previsão Open-Meteo. Falhas desses serviços não substituem resultados por alertas fictícios.

## 1. Banco e backend

Abra terminal na pasta `sos-localiza-central/backend`:

```powershell
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Preencha o `.env` **somente do backend**, ignorado pelo Git:

| Variável | Configuração |
| --- | --- |
| `ORACLE_USER` | Schema da aplicação |
| `ORACLE_PASSWORD` | Senha desse usuário |
| `ORACLE_CONNECT_STRING` | Conexão do provedor: `host:1521/service`, `tcps://host:2484/service`, ou alias resolvido via configuração Oracle |
| `ORACLE_CONFIG_DIR` | Opcional: diretório de configuração TLS/TNS |
| `ORACLE_WALLET_LOCATION` | Opcional: diretório seguro do wallet |
| `ORACLE_WALLET_PASSWORD` | Opcional, conforme provedor |
| `SESSION_COOKIE_SECURE` | `false` somente para HTTP local; em produção/HTTPS habilitar Secure |
| `CORS_ORIGINS` | Origens exatas dos frontends; valores localhost e 127.0.0.1 para portas 5173/5174 no exemplo |
| `HOST`, `PORT` | Padrões `127.0.0.1` e `3001` |

Não coloque usuários, senhas, hashes privados ou wallet no Git ou em variáveis `VITE_*`. O driver oficial `oracledb` usa modo Thin; não exige instalar Oracle Instant Client para a configuração padrão.

Neste ambiente o arquivo de credenciais já foi configurado; não o sobrescreva pelo exemplo. A senha Oracle que contém `#` está entre aspas para ser interpretada integralmente pelo carregador de ambiente. A chave compartilhada antiga foi substituída por operadores e sessões Oracle; não é mais aceita. A migration e o seed idempotente dos operadores estão descritos em [AUTH.md](./AUTH.md).

Prepare o schema pelo script abaixo, que aplica [schema.sql](../backend/schema.sql) ao mesmo banco e preserva objetos existentes. Neste ambiente essa preparação já foi executada com sucesso. Depois inicie a API:

```powershell
npm.cmd run db:setup
npm.cmd start
```

Em outro terminal:

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/health
```

Resultado esperado: `data.status=ok`, `data.database=oracle`. Um 503 significa que o banco não está configurado/acessível; não prossiga como se o envio estivesse funcionando. Erros internos Oracle não são devolvidos ao navegador; o backend registra apenas o código da falha.

### Manter a API ativa no Windows

O terminal de uma execução do agente pode encerrar ao terminar a sessão. Para iniciar a API em segundo plano, na raiz de `sos-localiza-central` execute:

```powershell
npm.cmd run api:start
```

O comando abre o processo Node sem janela, carrega o ambiente apenas no backend e verifica a conexão Oracle pelo health check. Se a API já estiver saudável, reutiliza o processo existente. PID e logs ficam em `backend/.runtime/`, ignorado pelo Git. Esse processo não inicia automaticamente após reiniciar o Windows: execute o comando novamente nesse caso. Os frontends continuam com seus comandos Vite habituais.

Correção verificada em 24/10/2026: a Central apresentava `ERR_CONNECTION_REFUSED` porque a API na porta 3001 havia encerrado. Após iniciar em segundo plano e usar **Tentar novamente**, o painel exibiu os dois alertas persistidos no Oracle e seus status.

## 2. App principal

Na pasta `SosLocaliza`:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

No app principal, `VITE_API_BASE_URL=http://localhost:3001/api/v1` é pública e não contém credenciais. Reinicie o Vite se alterar o ambiente. Abra http://localhost:5173. Cadastre um perfil fictício e registre uma ocorrência. O app envia contato/CPF/endereço junto ao alerta e só confirma após resposta válida da API. O histórico mantém cópia local e distingue registros antigos sem envio; o status exibido ali é a cópia do momento do envio.

Em erros de rede/503/timeout, a tentativa conserva o mesmo `requestId` e os mesmos dados durante a página aberta; use **Tentar novamente**. Recarregar ou sair encerra essa tentativa em memória. Um timeout pode ocorrer depois do COMMIT; reutilizar a tentativa evita duplicação. Esse protótipo não implementa fila offline persistente.

## 3. Central

Na pasta `sos-localiza-central`:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

Abra http://localhost:5174 e entre com usuário e senha de operador. A Central usa `/api/v1` relativo com proxy Vite ao backend, mantendo o cookie HttpOnly na mesma origem. Remova configurações antigas de `VITE_API_BASE_URL` absoluto se alternar entre localhost e 127.0.0.1. A sessão é restaurada ao recarregar e revogada no Oracle por **Encerrar sessão**. A senha inicial é compartilhada somente para demonstração e deve ser alterada antes de outro uso. Consulte [AUTH.md](./AUTH.md) para migration, seed e testes dos três operadores.

O painel consulta resumo, lista paginada, mapa e detalhes. Resumo considera todos os alertas filtrados; mapa mostra somente os alertas com GPS na página carregada. Endereços sem GPS continuam na lista, sem coordenadas inventadas. Filtros de data são inclusivos em UTC. Atualização é manual. PATCH de status exige a versão atual; conflito recarrega os dados e pede revisão.

**Nota do ambiente de implementação:** a instalação limpa da Central foi negada na confirmação de ferramenta. O build foi validado usando as dependências já existentes do app por uma junction local ignorada em `node_modules`. Em um clone novo, execute `npm ci` normalmente; o projeto não depende dessa junction. Não há dependências extras de ícones ou wrapper do mapa.

## Testes

### Verificações executadas

| Verificação | Resultado |
| --- | --- |
| Build TypeScript/Vite do app | Passou |
| Transporte do app (`node scripts/check-api.mjs`) | Passou: sucesso 200/201, campos, erros HTTP/rede, timeout, resposta inválida; fixtures explícitas |
| Build TypeScript/Vite da Central | Passou com dependências locais descritas acima |
| `npm test` no backend | 16 testes passaram: alertas e autenticação, hash/salt, mensagens genéricas, cookie, revogação, troca de senha, CSRF, remoção da chave antiga e limites; doubles isolados, sem Oracle |
| App no navegador → API real sem Oracle | 503 visível; nenhum sucesso; histórico permaneceu vazio; formulário e nova tentativa preservados |
| Central no navegador → API real com chave inválida (antes da migração de autenticação) | 401 visível; resumo sem valores inventados e mapa/lista sem alertas |
| Layout inicial da Central a 390 px | Sem overflow horizontal |
| Automação CDP do app (`check-alert-api.mjs`) | Não concluiu: timeout `Page.enable` antes de abrir a aplicação |
| Automação isolada do painel por interceptação no navegador | Não concluiu: timeout de carregamento; não considerada aprovação do fluxo |
| `npm run db:setup` | Passou: conexão TCPS Thin, criação de SOS_ALERTS e dois índices |
| `npm run test:oracle` | Passou com Oracle FreeSQL real: POST, COMMIT em outra conexão, idempotência, filtros, PATCH e conflito de versão |
| `npm run test:e2e` | Passou com Chrome/Edge e Oracle reais: app → API → Oracle → painel → atualização → Oracle, sem interceptações |
| Operadores / seed / login Oracle | Três operadores criados com hashes individuais; três logins e revogação em outra conexão passaram; repetição preservou hashes e senha alterada de conta temporária |

Os testes de erro 503/401 acima foram feitos antes da configuração do banco e permanecem evidência de tratamento de falhas. As automações isoladas anteriores não aprovadas não impedem o resultado posterior do teste ponta a ponta real. O sandbox bloqueia a rede Oracle; os comandos de acesso externo foram executados com autorização, sem desabilitar TLS.

Registros fictícios preservados desta validação:

- API/Oracle: `5937a3f7-490d-4eb3-bf26-56d272d67edd`.
- App/painel/Oracle: `2a98c35e-28d5-4a5e-9a1e-d402c6e10510`, status confirmado `em_atendimento`, versão 2.

### Repetir checks locais

```powershell
# Em SosLocaliza
npm.cmd run build
node scripts/check-api.mjs
# Com Vite e Chrome/Edge disponíveis:
node scripts/check-alert-api.mjs

# Em sos-localiza-central
npm.cmd run build

# Em sos-localiza-central/backend
npm.cmd test
```

### Persistência real e fluxo completo (após configurar Oracle)

Na pasta `sos-localiza-central/backend`, o `.env` é carregado pelos scripts:

```powershell
npm.cmd run test:oracle
# Com os três servidores iniciados e Chrome/Edge instalado:
npm.cmd run test:e2e
```

`test:oracle` cria um alerta fictício real, verifica COMMIT visível em outra conexão, repetição idempotente sem duplicar, conflito de payload, consulta filtrada, PATCH e conflito de versão. `test:e2e` preenche o app no navegador, envia à API real, verifica Oracle por conexão própria, localiza o protocolo na Central, altera o status e confere a persistência. Não interceptam a API nem usam repositório em memória. Os registros ficam identificados como testes e são preservados; remover somente por ação explícita de administrador.

Para URLs diferentes, o teste de navegador aceita `SOS_URL`, `CENTRAL_URL` e `API_BASE_URL` (incluindo `/api/v1`). Configure o app principal para essa API via `VITE_API_BASE_URL`; na Central, prefira manter `/api/v1` relativo e ajuste o destino do proxy Vite/reverso, preservando a mesma origem dos cookies.

### Conferência manual

1. Envie um alerta fictício pelo app e copie o UUID confirmado. Com endereço sem GPS, espere somente a lista; com localização permitida, espere também o marcador.
2. Na Central, atualize e abra o mesmo UUID; confira contato, tipo, localização e observação.
3. Altere o status para **Em atendimento**, reabra o alerta e confira a versão.
4. No mesmo schema Oracle, consulte usando bind parameter: `SELECT ID, STATUS, VERSION FROM SOS_ALERTS WHERE ID = :id`.
5. Reinicie API e Central e confira o mesmo alerta. Isso deve manter o registro porque o armazenamento é Oracle.
6. Tente salvar versões antigas em duas sessões de operador: a segunda deve receber 409.
7. Pare a API ou interrompa acesso ao Oracle e tente enviar outro alerta. O app deve preservar a tentativa sem declarar sucesso.

## Arquivos desta entrega

- Agente 1: `SosLocaliza/src/App.tsx`, `src/api.ts`, `src/styles.css`, `.env.example`, `README.md`, `scripts/check-api.mjs`, `scripts/check-alert-api.mjs`.
- Agente 2: `sos-localiza-central/src/{main.tsx,App.tsx,api.ts,AlertMap.tsx,icons.tsx,styles.css}`, `public/fonts/{montserrat-latin.woff2,OFL.txt}`, `index.html`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `.env.example`, `.gitignore`, `README.md`.
- Coordenador: `sos-localiza-central/backend/{package.json,package-lock.json,.gitignore,.env.example,schema.sql,validation.mjs,oracle.mjs,http.mjs,server.mjs}`, `backend/scripts/setup-oracle.mjs`, `backend/test/{api.test.mjs,oracle-integration.mjs,browser-oracle.mjs}`, `docs/{API.md,ORCHESTRATION.md,RUNBOOK.md}`; ajustes finais pontuais de revisão da Central registrados abaixo. Credenciais somente em `backend/.env` local, ignorado pelo Git.

O app já tinha alterações em README, App, Icon e estilos e arquivos de teste/logout antes desta tarefa. Elas foram preservadas; não houve commit, push, publicação ou envio para serviços de emergência.

Revisão final do coordenador: estabilizou a lista de coordenadas com `useMemo` para que digitar filtros não recentralize o mapa a cada tecla; alinhou ações principais ao verde-lima e ampliou controles para 44 px.

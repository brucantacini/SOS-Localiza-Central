# Deploy do painel e da API na Vercel

## O que foi adaptado

O repositório `SOS-Localiza-Central` publica o frontend Vite e uma função Node no mesmo projeto Vercel. [api/index.mjs](../api/index.mjs) exporta o handler compartilhado, sem chamar `listen` ou abrir uma porta. [vercel.json](../vercel.json) direciona `/api/v1/*` para essa função e preserva a rota REST e os filtros. O proxy Vite continua atendendo somente ao desenvolvimento local.

O driver Oracle também é dependência da raiz, instalada no build do projeto. A função reutiliza um pool por instância aquecida e mantém as sessões e os alertas no Oracle. Ela não lê `.env` do disco, não executa migrations/seed ao receber requisições e não contém credenciais. A proteção adicional de upload local está em [.vercelignore](../.vercelignore).

O servidor tradicional continua disponível com `npm start` em `backend` ou `npm run api:start` na raiz. Não é necessário criar um terceiro projeto Vercel para o backend.

## Configuração do projeto da Central

Em Settings do projeto conectado a este repositório:

| Campo | Valor |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | Raiz do repositório; não selecionar `backend` nem `src` |
| Node.js | 22.x (declarado no package.json) |
| Install Command | `npm ci` ou padrão npm |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Arquivos de `api` na raiz são construídos como Vercel Functions; não mova a função para `dist` nem configure o projeto como hospedagem exclusivamente estática. O build deve mostrar `api/index.mjs` entre as funções. Remova eventuais overrides antigos de build/rotas no painel que conflitem com [vercel.json](../vercel.json).

## Variáveis da Central na Vercel

Cadastre em Settings → Environment Variables no ambiente **Production** e também **Preview**, se for testar previews:

| Nome | Valor a configurar |
| --- | --- |
| `ORACLE_USER` | Mesmo usuário já configurado no ambiente local privado do backend |
| `ORACLE_PASSWORD` | Senha desse usuário, sem adicionar as aspas de sintaxe do `.env` |
| `ORACLE_CONNECT_STRING` | Mesma conexão TCPS Oracle FreeSQL validada localmente |
| `SESSION_COOKIE_SECURE` | `true` |
| `CORS_ORIGINS` | Origens HTTPS exatas do painel e do app, separadas por vírgula, sem barra final nem caminhos |
| `VITE_API_BASE_URL` | `/api/v1` (ou remover a variável para usar esse padrão da Central) |

Nunca prefixe credenciais Oracle com `VITE_`. Não use `localhost` nem `127.0.0.1` nas variáveis de produção. `HOST`, `PORT`, scripts PowerShell e a chave de operador antiga não são usados pela função Vercel. Não é necessário wallet adicional para a conexão FreeSQL já testada. Para outro banco que exija wallet, configure os arquivos privados e seu provisionamento separadamente, sem enviá-los ao Git.

Para o painel já identificado, inclua `https://centralsoslocaliza.vercel.app` em `CORS_ORIGINS`, além da URL pública real do app. Acrescente cada origem de preview explicitamente se quiser testar nela; não aceite qualquer domínio Vercel. O IP do limitador de login usa `X-Forwarded-For` somente quando a aplicação está no ambiente Vercel; localmente o header não é confiado. O limite continua sendo por instância da função.

O Oracle já tem tabelas e operadores cadastrados. Não repita o seed dentro do build. Se precisar preparar outro schema, siga [AUTH.md](./AUTH.md) pelo ambiente administrativo.

## Configuração do projeto do app principal

O app `SosLocaliza` continua sendo outro projeto Vite. Em suas variáveis de produção configure:

```text
VITE_API_BASE_URL=https://centralsoslocaliza.vercel.app/api/v1
```

Somente esse endereço público é necessário no app. Credenciais Oracle e sessões de operador pertencem à Central. Se o domínio final da Central mudar, ajuste a URL. Faça novo deploy do app após mudar a variável, pois Vite a incorpora durante o build.

## Redeploy e verificação

1. Publique o commit com a adaptação no repositório conectado à Central.
2. Configure as variáveis acima e faça **Redeploy** da Central. Variáveis novas não alteram uma versão já construída/publicada.
3. Abra `https://centralsoslocaliza.vercel.app/api/v1/health`: espere HTTP 200 e `{ "data": { "status": "ok", "database": "oracle" } }`.
4. Abra `/api/v1/auth/session` sem estar autenticado: espere **401 em JSON**, indicando sessão ausente. Esse resultado é correto; não deve retornar a página HTML 404 da Vercel.
5. Entre pelo painel com um operador existente, confira os alertas e recarregue. A sessão deve ser restaurada. Ao sair, a sessão deve ser revogada e o cookie expirado.
6. Configure a URL pública da API no app, faça redeploy e envie um alerta fictício. Atualize a Central e confira o mesmo UUID.

Diagnóstico: HTML 404 = função/rota ou deploy ainda incorreto; 503 JSON = função existe, mas falta configuração ou conectividade Oracle; 403 JSON ao entrar = conferir origem HTTPS em `CORS_ORIGINS`; 401 JSON na sessão sem login = comportamento esperado. Um erro de função antes de retornar JSON deve ser conferido nos logs da função, sem publicar credenciais.

## Validação disponível

- Build Vite/TypeScript e consistência do lockfile com o driver Oracle da raiz validados.
- 25 testes unitários/HTTP passaram, incluindo reescrita da configuração, metadados de captura da Vercel, sessão sem login, filtros em URL e helper query, POST/PATCH com JSON pré-processado, limites de corpo e cookie Secure na Vercel.
- `npm run test:vercel:oracle` passou em `backend`: adaptador local com Oracle real, login, COMMIT visível em outra conexão, repetição sem duplicar, filtros, PATCH e conflito de versão. Não substitui verificar o deploy publicado.
- A verificação cloud depende do redeploy e das variáveis no projeto da sua conta Vercel; os testes locais não são apresentados como publicação concluída.

### Erro 400 após autenticar

O runtime pode acrescentar a captura `:path*` do rewrite como `path` no helper de query ou na URL encaminhada. Isso é metadado de roteamento e não um filtro de alertas. O adaptador remove essa captura somente quando corresponde à rota REST capturada, antes de chamar a validação compartilhada. Filtros desconhecidos enviados pelo cliente continuam retornando 400. Testes cobrem esse comportamento para evitar aprovação apenas com URLs locais sem os metadados reais do runtime.

Para verificar a versão publicada com Oracle real, execute `npm run test:vercel:live` em `backend`. O teste consulta health, faz login com um operador temporário, consulta alertas sem imprimir dados pessoais e encerra a sessão. A conta temporária é removida ao final. A URL padrão é a Central identificada; `API_BASE_URL` permite usar outro deploy, incluindo o sufixo `/api/v1`.

Referências oficiais: [Vite e funções](https://vercel.com/docs/frameworks/frontend/vite), [runtime Node](https://vercel.com/docs/functions/runtimes/node-js), [configuração de rewrites](https://vercel.com/docs/routing/rewrites), [versões Node](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

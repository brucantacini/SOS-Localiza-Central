# Contrato compartilhado SOS Localiza — v1

Este é o contrato único para os dois sistemas. Base local: `http://localhost:3001/api/v1`. JSON UTF-8; datas UTC ISO 8601. Nenhum frontend acessa o Oracle diretamente. O sucesso do POST só ocorre após COMMIT no Oracle.

## Modelo

`Alert`: `{ id, requestId, type, date, updatedAt, status, version, location, source, latitude, longitude, profile, notes }`.

- `id`, `requestId`: UUID. O cliente gera `requestId` uma vez por envio lógico e o reutiliza ao tentar novamente. O servidor gera `id`.
- `type`: exatamente `Alagamento`, `Enchente`, `Desmoronamento ou barranco em risco`, `Casa com risco de desabamento` ou `Outra situação`.
- `date`, `updatedAt`: gerados pelo servidor.
- `status`: `novo`, `em_atendimento`, `resolvido`. Inicial: `novo`.
- `version`: inteiro positivo, inicial 1; incrementado em cada alteração.
- `location`: texto obrigatório, 1–500 caracteres. Endereço informado ou coordenadas reais do dispositivo; nunca coordenadas de demonstração.
- `source`: `Localização do dispositivo`, `Informada manualmente` ou `Endereço cadastrado`.
- `latitude` e `longitude`: ambos números reais (-90..90 e -180..180), ou ambos `null`. Endereço sem GPS não é geocodificado implicitamente.
- `profile`: `{ name, cpf, phone, address }`, todos textos obrigatórios. Limites: 120, 20, 30 e 500 caracteres. O cadastro atual é local; ao enviar um alerta sua cópia é transmitida ao backend.
- `notes`: texto até 2000 caracteres; pode ser vazio.

## Operações

| Método / caminho | Entrada | Resposta |
| --- | --- | --- |
| `POST /alerts` | `{ requestId, type, location, source, latitude, longitude, profile, notes }` | `201 { data: Alert }` após COMMIT; repetição idêntica: `200 { data: Alert }`. Mesmo requestId com conteúdo diferente: 409. |
| `GET /alerts` | filtros abaixo | `200 { data: Alert[], pagination: { page, pageSize, total }, summary: { total, novo, em_atendimento, resolvido } }` |
| `GET /alerts/:id` | UUID | `200 { data: Alert }` |
| `PATCH /alerts/:id/status` | `{ status, expectedVersion }` | `200 { data: Alert }`; conflito de versão: 409. Qualquer status do enum pode ser escolhido. |
| `GET /health` | nenhuma | `200 { data: { status: "ok", database: "oracle" } }` somente se SELECT no Oracle funciona; caso contrário 503. |

Filtros opcionais do GET: `status`, `type`, `q` (busca textual literal sem diferenciar maiúsculas em nome, localização e observação; até 120 caracteres), `from` e `to` (datas `YYYY-MM-DD`, inclusivas em UTC), `page` (padrão 1) e `pageSize` (padrão 50, máximo 100). Ordenação: date decrescente, id decrescente. `summary` contabiliza TODOS os registros que atendem aos mesmos filtros, não apenas a página. Mapa representa apenas a página carregada e apenas registros com coordenadas; informar ambos os limites na UI.

GET de alertas e PATCH exigem sessão de operador em cookie HttpOnly `sos_operator_session`, validada no Oracle. A antiga chave Bearer foi removida. POST de alertas e health continuam públicos, sem autenticação de cidadão. A Central usa proxy de mesma origem `/api/v1`; o app principal continua enviando seus alertas à API como antes. Detalhes em [AUTH.md](./AUTH.md).

### Autenticação de operador

| Método / caminho | Entrada | Resposta |
| --- | --- | --- |
| `POST /auth/login` | `{ username, password }` | `200 { data: { operator: { username, mustChangePassword }, expiresAt } }` e cookie HttpOnly; falha: 401 genérico |
| `GET /auth/session` | cookie | `200 { data: { operator: { username, mustChangePassword } } }`; sem sessão válida: 401 |
| `POST /auth/logout` | cookie | `200 { data: { loggedOut: true } }`; revoga no Oracle e expira cookie |
| `POST /auth/password` | cookie e `{ currentPassword, newPassword }` | `200 { data: { passwordChanged: true } }`; revoga todas as sessões; nova senha diferente, de 12 a 256 caracteres |

Mutações de autenticação e PATCH de status exigem `X-SOS-Client: central` e, quando enviada pelo navegador, origem permitida. Resposta não inclui senha, hash ou token. Cookie com `SameSite=Strict`, duração de oito horas e `Secure` em produção/HTTPS. Login: usuário normalizado para minúsculas, até 80 caracteres, senha até 256, sem remover espaços da senha; erros de usuário/senha retornam a mesma mensagem. Limite por IP: 20 tentativas em 15 minutos; máximo de quatro verificações simultâneas por instância.

## Erros

Sempre `{ error: { code, message, fields? } }`. `fields` é um mapa opcional de campo → mensagem. Nunca incluir senha, SQL, conexão ou stack.

| HTTP | code | Uso |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | JSON, campos, filtros, UUID ou valores inválidos |
| 401 | UNAUTHORIZED | credenciais inválidas ou sessão ausente, expirada ou revogada |
| 403 | FORBIDDEN | origem/header de mutação não permitido |
| 429 | TOO_MANY_ATTEMPTS | limite de autenticação atingido |
| 404 | NOT_FOUND | alerta ou rota inexistente |
| 409 | CONFLICT | versão desatualizada ou requestId reutilizado com outro conteúdo |
| 413 | PAYLOAD_TOO_LARGE | corpo acima de 16 KiB |
| 503 | DATABASE_UNAVAILABLE | Oracle indisponível ou backend não configurado |
| 500 | INTERNAL_ERROR | falha inesperada |

O cliente deve manter formulário e requestId após erro/timeout. Não declarar sucesso, gerar protocolo local substituto ou salvar falha como envio realizado. Timeout pode ocorrer depois de COMMIT: reutilizar requestId recupera o resultado sem duplicar. Erros de rede não possuem necessariamente JSON.

## Oracle e segredos

Backend Node.js + `oracledb` em modo Thin; conexão via `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING` (`host:1521/service` ou `tcps://host:2484/service`). O acesso TCPS fornecido pelo usuário ao Oracle FreeSQL foi validado em 24/10/2026, sem wallet adicional. Para outros provedores que exijam TLS/wallet, configurar também `ORACLE_CONFIG_DIR`, `ORACLE_WALLET_LOCATION`, `ORACLE_WALLET_PASSWORD`. Somente backend lê essas variáveis. Usar `.env` ignorado pelo Git ou gerenciador de segredos. Nunca usar prefixo VITE para segredos. Não commitar wallet ou certificados privados.

Executar `npm run db:setup` na pasta backend para aplicar o schema de alertas e a migration de operadores, preservando tabela e índices existentes. `npm run db:migrate` aplica somente operadores/sessões; `npm run operators:seed` cadastra apenas operadores ausentes a partir do manifesto privado de hashes. Tabelas são persistentes e não são recriadas ao iniciar. Queries com binds e COMMIT explícito. Sessões Oracle protegem consultas/atendimento; `CORS_ORIGINS` lista origens exatas autorizadas. CORS não substitui autenticação.

Oracle FreeSQL na web é um ambiente de execução de SQL; o login do site não implica acesso SQL*Net remoto. É necessário obter do provedor uma conexão de aplicação compatível (ou provisionar Oracle Free/Autonomous acessível). Uma API ORDS exigiria um adaptador backend específico; não informar URL de página FreeSQL como connect string. Sem conexão válida o backend responde 503 e o fluxo real fica pendente, sem fallback em memória.

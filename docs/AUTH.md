# Operadores: migration, seed e login

## Estrutura verificada e reutilizada

A inspeção de metadados do schema Oracle encontrou apenas `SOS_ALERTS`. A API usava uma chave compartilhada, sem tabela de usuários ou sessões. O login individual substitui esse mecanismo; a chave antiga não concede mais acesso. Alertas, driver Thin, pool, respostas de erro e servidor HTTP foram reutilizados.

A migration [002-operators.sql](../backend/migrations/002-operators.sql) cria `SOS_OPERATORS` (usuário único, hash, ativo e indicador de troca de senha) e `SOS_OPERATOR_SESSIONS` (somente hash do token, vínculo e expiração). O aplicador consulta metadados e preserva objetos existentes. Não há tabelas paralelas de autenticação.

## Executar a partir de qualquer pasta no PowerShell

```powershell
npm.cmd --prefix C:\DESENVOLVIMENTOS\FIAP\sos-localiza-central\backend run db:migrate
npm.cmd --prefix C:\DESENVOLVIMENTOS\FIAP\sos-localiza-central\backend run operators:seed
npm.cmd --prefix C:\DESENVOLVIMENTOS\FIAP\sos-localiza-central run api:restart
```

Neste ambiente a migration e o cadastro dos três operadores solicitados já foram executados. Os nomes e hashes estão somente no banco e no manifesto local `backend/.operators.seed.json`, ignorado pelo Git. O manifesto não contém senha em texto puro. Ele não é distribuído em clones do repositório.

Em outro ambiente, antes do seed, prepare o manifesto local:

```powershell
npm.cmd --prefix C:\DESENVOLVIMENTOS\FIAP\sos-localiza-central\backend run operators:prepare
```

O comando solicita os nomes e a senha sem exibi-la, calcula hashes com salts individuais e cria o arquivo privado. Não sobrescreve um manifesto existente. Nenhum nome, senha, hash ou token é impresso pelo script. O seed usa `MERGE ... WHEN NOT MATCHED`: insere apenas usuários ausentes e **não atualiza hashes, flags ou dados de operadores existentes**, mesmo se suas senhas já tiverem sido alteradas. A execução repetida retorna apenas contagens de criados/preservados.

## Senhas e sessões

Hashes usam scrypt assíncrono do Node, salt aleatório de 16 bytes e parâmetros `N=32768, r=8, p=3`, alternativa indicada pela [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). A verificação compara chaves em tempo constante. O login inexistente também calcula hash para reduzir diferenças de tempo. Falhas retornam a mesma mensagem genérica. Há limite de tentativas por IP e de hashes simultâneos; esse limitador é local à instância, enquanto operadores e sessões persistem no Oracle.

**A senha inicial é compartilhada e serve exclusivamente à demonstração acadêmica. Deve ser alterada individualmente antes de qualquer uso fora da demonstração.** Ela foi definida conforme a solicitação e não é gravada no frontend, código, Git, manifesto ou logs. A interface mostra o aviso enquanto `mustChangePassword` estiver ativo; a demonstração permite consultar alertas antes de trocar.

Em **Alterar senha**, informe a atual e uma nova de 12 a 256 caracteres. A alteração marca a senha como individual e revoga todas as sessões do operador, exigindo novo login. O seed não desfaz essa mudança.

O navegador recebe cookie `HttpOnly`, `SameSite=Strict`, com expiração de oito horas. O token aleatório não aparece no JSON nem em `localStorage`/`sessionStorage`; somente seu hash SHA-256 é persistido. Recarregar a página restaura a sessão pelo backend. **Encerrar sessão** remove a sessão no Oracle e expira o cookie; reutilizar o token revogado retorna 401. Se a revogação falhar, a tela informa falha e permite tentar sair novamente.

Para desenvolvimento, a Central usa `/api/v1` relativo e o proxy Vite aponta à API na porta 3001. Assim funciona tanto com localhost como com 127.0.0.1, sem cookies entre sites diferentes. Em produção, configure proxy de mesma origem e HTTPS; `NODE_ENV=production` ou `SESSION_COOKIE_SECURE=true` exige cookie Secure. Mutações autenticadas exigem `X-SOS-Client: central` e origem permitida, evitando submissão por sites externos. Nunca exponha segredos em variáveis VITE.

## Testar os três operadores

1. Abra a Central em http://localhost:5174 ou http://127.0.0.1:5174. Se o frontend estiver parado, execute `npm.cmd --prefix C:\DESENVOLVIMENTOS\FIAP\sos-localiza-central run dev`.
2. Use cada um dos três usuários solicitados e a senha inicial combinada. Confira o painel e o aviso de troca. Saia entre os testes.
3. Experimente usuário inexistente e senha incorreta: ambos devem mostrar **Usuário ou senha inválidos.**
4. Após sair, confirme que recarregar exige login e que os endpoints de alertas retornam 401 sem sessão.
5. Para verificar automaticamente os três logins reais sem imprimir credenciais:

```powershell
npm.cmd --prefix C:\DESENVOLVIMENTOS\FIAP\sos-localiza-central\backend run test:auth:oracle
```

Informe os três nomes separados por vírgula e a senha compartilhada pela entrada oculta. Depois que as senhas forem individualizadas, execute por usuário com sua senha atual. O teste verifica os logins, acesso a alertas, revogação em conexão Oracle independente e idempotência. Também usa uma conta temporária com senha aleatória para verificar que uma senha alterada não é sobrescrita pelo seed; a conta temporária é removida ao final, sem alterar as contas solicitadas.

```powershell
# Testes unitários/HTTP (sem banco):
npm.cmd --prefix C:\DESENVOLVIMENTOS\FIAP\sos-localiza-central\backend test
# Com os três servidores ativos, fluxo real com operador temporário:
npm.cmd --prefix C:\DESENVOLVIMENTOS\FIAP\sos-localiza-central\backend run test:e2e
```

## Verificação desta entrega

- Migration aplicada no Oracle real; as duas tabelas de autenticação foram criadas sem alterar alertas.
- Seed criou os três operadores; repetição preservou os três hashes.
- Teste real aprovou os três logins, sessões persistidas e revogadas em outra conexão e preservação de senha alterada após seed repetido.
- 16 testes unitários/HTTP passaram, incluindo scrypt/salt, falhas genéricas, rejeição da chave antiga, cookies, CSRF, limite de tentativas e revogação após troca de senha.
- Teste pelo navegador com Oracle real passou: login individual, envio/consulta/atendimento do alerta, restauração da sessão após recarregar e logout. A conta temporária foi removida ao final; os três operadores solicitados mantêm a senha inicial definida.

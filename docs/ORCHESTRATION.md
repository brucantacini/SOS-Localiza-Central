# Coordenação e limites de edição

## Estrutura encontrada

- `../../SosLocaliza`: app React 18 + TypeScript + Vite existente, com mapa Leaflet/Open-Meteo, perfil, histórico local, temas, orientações e logout. Sem backend.
- `..`: repositório da Central, inicialmente apenas README. Frontend separado a construir na raiz e API em `backend/`.
- Contrato único: [API.md](./API.md), finalizado antes da distribuição. Mudanças de contrato são exclusivas do coordenador e devem ser comunicadas aos dois agentes.

## Responsabilidades

1. Agente 1 (SOS Localiza): pode editar somente `SosLocaliza/src/App.tsx`, `SosLocaliza/src/api.ts`, `SosLocaliza/src/styles.css`, `SosLocaliza/.env.example`, `SosLocaliza/README.md` e testes de integração novos em `SosLocaliza/scripts/`. Preservar alterações pré-existentes de logout, perfil, ícones e estilos. Não editar Central/backend/contrato.
2. Agente 2 (SOS Localiza Central): pode criar/editar apenas frontend `sos-localiza-central/src/`, `public/`, `index.html`, `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `.env.example`, `.gitignore` e `README.md`. Não editar app principal, `backend/`, `docs/` ou contrato. Reutilização por cópia de fontes licenciadas permitida, sem alterar a origem.
3. Coordenador: exclusivamente `sos-localiza-central/backend/` e `docs/`; revisão e ajustes finais em ambos os sistemas somente após entrega dos agentes. Valida implementação do contrato, persistência Oracle e ponta a ponta.

Nenhum agente altera os mesmos arquivos durante a implementação. Cada agente deve ler o contrato e informar testes executados e limitações. Dados fictícios são permitidos apenas em testes explicitamente identificados; não como integração em produção.

## Verificação

Build dos dois frontends; testes backend de validação, erros, autenticação, idempotência e concorrência; teste real opt-in contra Oracle utilizando dados de teste identificados. Ausência de credenciais/conexão deve constar como bloqueio de validação, nunca como teste aprovado. Resultado final e execução em [RUNBOOK.md](./RUNBOOK.md).

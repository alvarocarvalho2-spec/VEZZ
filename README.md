# VEZZ

Aplicação de gestão de atendimentos e filas para clínicas, agora com **React, TypeScript e Vite**, navegação com React Router, animações com Motion e experiência 3D com Three.js / React Three Fiber.

Repositório ativo: **https://github.com/alvarocarvalho2-spec/VEZZ**. O `MVP__VEZZ` permanece como backup; seu remoto local tem push desativado.

## Começar

Requer Node.js 24+ e npm.

```bash
npm ci
npm run dev:local
```

Abra **http://127.0.0.1:5173**. Esse comando usa somente dados locais, mesmo que existam configurações do Supabase no navegador. As alterações ficam no localStorage.

Para usar o backend configurado em `js/env.js`:

```bash
npm run dev
```

Contas de demonstração **somente no modo local**, senha `demo123`:

| Perfil           | E-mail                   |
| ---------------- | ------------------------ |
| Paciente         | ana.silva@email.com      |
| Gestor principal | ricardo@clinicasol.com   |
| Gestora          | marina@institutovida.com |

Veja [RODAR.md](RODAR.md) para desenvolvimento e [SETUP.md](SETUP.md) para o backend.

## Stack e experiência

- **React + TypeScript + Vite:** componentes, navegação, compilação e módulos separados por página.
- **React Router:** mantém os links existentes `#/clinicas`, `#/paciente` e `#/gestor`.
- **Motion:** transições de navegação, menus, troca das prévias e resposta ao ponteiro.
- **Three.js + React Three Fiber:** cena orbital da home, carregada separadamente. Pausa fora da tela, com a aba oculta ou por controle do usuário. Sem 3D no primeiro carregamento de celulares, economia de dados ou movimento reduzido; o conteúdo continua disponível sem WebGL.
- **Lucide:** ícones da nova navegação e componentes.
- **Supabase:** integração, banco, autenticação, políticas e funções existentes preservados.

Cores `#061b4f` e `#0b3b8f`, fontes locais Source Sans 3 e Mokoto e as dez expressões oficiais do mascote foram mantidas. A prévia do atendimento na home é ilustrativa; a fila real vem da camada de dados.

## Funcionalidades

**Paciente:** cadastro, login, recuperação de senha, pesquisa de clínicas, detalhes, agendamento, cancelamento, reagendamento, histórico e fila atualizada automaticamente.

**Gestor:** painel diário, iniciar/finalizar/chamar próximo, agenda, pacientes, dados, horários e foto da clínica; acesso de novos gestores pelo responsável principal.

**Administração:** solicitações de clínicas, aprovação, recusa e convite do primeiro gestor.

As regras de disponibilidade, ordenação, permissões e exclusividade continuam na camada de dados e no backend. A migração visual não altera essas regras.

## Estrutura

```text
src/
  App.tsx                 inicialização, rotas e aplicação
  components/             navegação, mascotes, cena 3D e jornada
  pages/                  Home, Clinics e How nativas em React
  styles.css              nova identidade e acabamento operacional
js/
  pages/                  fluxos operacionais existentes
  lib/db.js               adaptadores Local / Supabase
  lib/ui.js               formulários, modais e componentes operacionais
assets/                   mascotes, fontes e fotos oficiais
scripts/verify-browser.mjs QA pela CLI Playwright da skill do projeto
```

`LegacyPage` integra as telas operacionais à navegação React com guardas, foco, limpeza de polling e renderização serializada. Essas telas receberam a nova identidade e continuam usando seus renderizadores JavaScript; a conversão interna delas para componentes React é uma evolução posterior. O código estático anterior e seus testes históricos permanecem no histórico Git e nos módulos existentes.

## Verificar

```bash
npm test
npm run test:logic
npm run typecheck
npm run test:browser
npm run test:production
npm run build
```

Os testes de banco e segurança usam PGlite local. O novo teste de navegador inicia Vite em `127.0.0.1:5174` no modo local, usa o wrapper Bash da skill Playwright e bloqueia conexões externas. Requer Chrome e Git Bash no Windows. Os artefatos ficam em `output/playwright/` (ignorado pelo Git). Os cenários anteriores em `tests/` documentam a versão estática e não são o aceite da nova interface.

## Build e publicação

```bash
npm run build
npm run preview
```

O build de produção vai para `dist/`; o preview usa **http://127.0.0.1:4173**. Para validar um build isolado de produção, use `npm run build:local` antes do preview. Reexecute `npm run build` para produzir a versão conectada ao Supabase.

Na Vercel, importe **VEZZ**, use `npm run build` e saída `dist` (já em `vercel.json`). Não publique a pasta de fontes diretamente. A política de segurança de scripts continua restrita no build; somente o servidor de desenvolvimento permite o preâmbulo de Fast Refresh.

Nenhuma alteração no banco ou publicação de Edge Function é necessária para esta migração visual. As migrações de segurança já documentadas continuam sendo pré-requisitos do backend existente.

A decisão de stack, limites e verificações estão em [docs/MIGRACAO-IMERSIVA.md](docs/MIGRACAO-IMERSIVA.md).

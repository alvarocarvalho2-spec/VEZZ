# VEZZ — Setup do zero (projeto Supabase novo)

Guia completo para criar um projeto Supabase do zero e conectar o app.
O frontend usa React + TypeScript + Vite. A integração mantém os dados públicos em `js/env.js` (URL + anon key) e `supabase/config.toml` (project_id). Use `npm run dev:local` para demonstração isolada ou `npm run dev` para o backend configurado. O modo local tem uma flag sem credenciais em `.env.local-demo`.

> Ordem recomendada: **cria o projeto novo primeiro, testa tudo, e só apaga o antigo depois.**

## 1. Criar o projeto no Supabase

1. Crie o projeto novo: https://supabase.com/dashboard → New project.
2. Anote (você vai precisar dos três):
   - **Project URL** → Settings → API (ex: `https://xxxx.supabase.co`)
   - **anon public key** → Settings → API (a chave longa `eyJ...`)
   - **Reference ID** → Settings → General (também aparece na URL do dashboard)
3. **Authentication → Providers → Email**:
   - Email **habilitado**
   - **"Confirm email" DESLIGADO** ⚠️ (senão paciente/gestor novo não consegue logar na hora)

## 2. Banco de dados (SQL Editor)

Rode no SQL Editor, nessa ordem, **sem nenhum erro**:

1. O conteúdo **inteiro** de `sql/schema.sql` — cria as 8 tabelas, RLS, policies, a função `vezz_is_admin()`, o trigger da fila, o realtime, a coluna `principal` no gestor (só o primeiro gestor cadastra outros gestores, edita os dados, os horários de funcionamento e troca a foto da clínica — os demais só visualizam) e o bucket `fotos-clinicas` no Storage. (Se um dia precisar reaplicar só as policies, rode `sql/policies.sql` — é idempotente.)
   - Banco **já existente**? Não recria do zero: rode as migrações idempotentes da pasta `sql/` na ordem do relatório de entrega (diagnóstico somente leitura → `migracao-agendamento-fila.sql` → tratamento de duplicidades, se houver → `reindexar-filas.sql`, se preciso → `migracao-seguranca-rls.sql`).
2. Rode também as migrações de `supabase/migrations/`, **por último e em ordem crescente**, tanto em banco novo quanto existente:
   - `20261018163947_auditoria_integridade_acesso.sql`: fecha o acesso entre clínicas, valida as transições de consultas, torna consulta/fila atômicas e adiciona as RPCs usadas pela versão atual.
   - `20261019223130_fila_por_horario.sql`: ordena as posições pelo horário da consulta e corrige as filas existentes. Veja [docs/FILA-POR-HORARIO.md](docs/FILA-POR-HORARIO.md).
   - Não publique apenas o frontend: veja a ordem de publicação e os limites em [docs/AUDITORIA-2026-10-18.md](docs/AUDITORIA-2026-10-18.md). Reaplicar scripts antigos de `sql/` exige reaplicar as migrações versionadas nessa ordem ao final.
3. Crie o usuário administrador: **Authentication → Users → Add user**
   - E-mail: o e-mail que você escolher para a conta administrativa
   - Senha: **defina uma senha forte e única, guardada em gerenciador de senhas**
     (a senha do admin NUNCA fica no código do app — o frontend não precisa dela)
   - Marque **✅ Auto Confirm User**
4. No SQL Editor, dê o papel de admin no token do usuário (troque o e-mail
   pelo da conta criada no passo 2):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
where email = '<E-MAIL_DA_CONTA_ADMINISTRATIVA>';
```

O papel de administrador vem desse `app_metadata.role = 'admin'`: é ele que o
RLS (`vezz_is_admin()`) e o app (claim do token) usam para reconhecer o admin.
Esse campo só pode ser alterado pela API administrativa — o próprio usuário não
consegue se promover.

## 3. Edge Function (convite do primeiro gestor)

A `service_role` **nunca** fica em arquivo do projeto — o Supabase injeta `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` na function automaticamente. Só deploy:

No computador, **dentro da pasta `vezz`**:

```powershell
npx supabase login                                  # se ainda não estiver logado (pede um Access Token do dashboard)
npx supabase link --project-ref <REFERENCE_ID>      # vincula a pasta ao projeto novo (preenche supabase/config.toml)
npx supabase functions deploy accept-clinic-invite --no-verify-jwt
```

- Aviso de "Docker is not running" é normal — deploy não precisa de Docker.
- Se atualizar o código da function (ex.: a coluna `principal` no gestor), rode o `deploy` de novo — a versão antiga continua no ar até lá.
- Confere no dashboard: **Edge Functions → `accept-clinic-invite`** aparece como ACTIVE.

## 4. Ambiente local

1. Atualize `js/env.js` com a **Project URL** e a **anon key NOVAS** (único lugar que o app lê — sem `.env`).
2. O `supabase/config.toml` já foi preenchido pelo `supabase link` (confere o `project_id`).
3. Limpe os dados do navegador em `http://127.0.0.1:5173`:
   DevTools (F12) → Application → Clear storage → **Clear site data**
   (a sessão antiga guarda um token do projeto velho).
4. Suba o servidor de novo e force reload:
   - `npm ci` e `npm run dev` dentro da pasta do projeto
   - No navegador: **Ctrl+Shift+R**

## 5. Vercel (se for publicar)

Importe o repositório `alvarocarvalho2-spec/VEZZ`, com build `npm run build` e saída `dist`. A chave pública continua no `js/env.js`; a segurança dos dados vem das policies RLS. Depois de trocar o `env.js`, gere e publique um novo build. Nunca publique a pasta de fontes diretamente. O remoto `MVP__VEZZ` permanece como backup.

## 6. Testar o fluxo completo

1. `#/solicitar-clinica` → envia uma solicitação (visitante, sem login).
2. `#/admin-vezz` → login com o e-mail e a senha da conta administrativa → aprova a solicitação → **copia o link do convite**.
3. Aba anônima (**Ctrl+Shift+N**) → cola o link → cadastra o primeiro gestor (a clínica é criada aqui).
4. Login como gestor → painel do gestor → **"Novo gestor"** → cadastra outro gestor.
5. Cadastra um paciente e agenda uma consulta.

## Troubleshooting

- **401/42501 no formulário público mesmo com a policy verde no editor** → não é policy, é o header `Prefer: return=representation`. O PostgREST só devolve o registro inserido se ele for legível pela policy de SELECT do role atual — e a solicitação anônima grava em tabela que só o admin lê. O app já manda `return=minimal` em escritas anônimas (veja `rest()` em `js/lib/db.js`). Se esse erro voltar, confere se alguma chamada nova está pedindo `return=representation` sem sessão.
- **Admin não consegue aprovar** → confere se o `app_metadata` tem `{"role": "admin"}` (passo 2.3) e faz login de novo (token novo carrega o papel).
- **Página do convite não abre** → confere se a function está ACTIVE e se o `env.js` está com a URL do projeto novo.
- **Depois de 1h dá 401** → não era para acontecer (o app renova o token sozinho com o refresh_token); recarrega a página e faz login de novo.

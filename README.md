# VEZZ

Plataforma de **gestão de atendimentos e filas** para clínicas e consultórios.
O app funciona conectado ao **Supabase** (Auth + banco + Edge Function). Sem build — site estático.

**👉 Setup do zero (projeto Supabase novo): [SETUP.md](SETUP.md)**
Execução local: **[RODAR.md](RODAR.md)**.

Auditoria de funcionamento e segurança: **[relatório de 18/10/2026](docs/AUDITORIA-2026-10-18.md)**.
Ao atualizar esta versão, aplique a migração de segurança e publique a Edge Function junto do frontend, na ordem documentada no relatório.

Testes adicionais (Node.js 24+ e Chrome instalado): `npm ci`, `npm test`, `npm run test:logic` e `npm run test:browser`. O último inicia seu próprio servidor e bloqueia chamadas para serviços externos. `npm run test:legacy` usa um servidor em `localhost:8080` e sempre executa com dados locais.

## Deploy na Vercel

O projeto já possui `vercel.json`, não depende de build e pode ser publicado como site estático a partir da pasta raiz. **Não precisa de variável de ambiente na Vercel**: a anon key fica no `js/env.js` (é pública por design — a segurança dos dados vem das policies RLS). A `service_role` nunca vai para o frontend nem para a Vercel; só o ambiente da Edge Function tem ela.

## Edge Function do convite

O fluxo de aprovação usa a função `supabase/functions/accept-clinic-invite`. Para publicar no projeto Supabase (guia completo no [SETUP.md](SETUP.md)):

```bash
supabase login
supabase link --project-ref <REFERENCE_ID>
supabase functions deploy accept-clinic-invite --no-verify-jwt
```

A função usa a `SUPABASE_SERVICE_ROLE_KEY` apenas no ambiente seguro do Supabase; essa chave não deve ser colocada no frontend ou na Vercel.

## Execução rápida

```bash
cd vezz
python3 serve.py          # http://localhost:8080
```

Contas de demonstração (senha `demo123`):

| Perfil | E-mail |
|---|---|
| Paciente | `ana.silva@email.com` |
| Gestor | `ricardo@clinicasol.com` |
| Gestora | `marina@institutovida.com` |

## Estrutura

```
vezz/
  index.html            página única (SPA por hash)
  serve.py              servidor local sem cache (uso em desenvolvimento)
  start.sh              atalho para o serve.py
  css/vezz.css          design system (marinho #061b4f + royal #0b3b8f)
  js/
    app.js              bootstrap, rotas, sessão
    config.js           parâmetros (espera média, intervalo de polling, chaves)
    lib/
      db.js             adaptadores: local (localStorage) e Supabase
      seed.js           dados de demonstração de Fortaleza
      router.js         roteador por hash
      ui.js             componentes (header, cards, senha, upload de foto)
      utils.js          datas, máscaras, validações de horário
      validators.js     CPF, CNPJ, e-mail, telefone, CEP
    pages/              telas por perfil
  sql/schema.sql        tabelas, índices, RLS, realtime e trigger da fila
  assets/               foto da marca, imagens das clínicas, fontes locais
  docs/REQUISITOS.md    mapa requisito → arquivo
```

## Identidade

- Azuis: `#061b4f` (marinho) e `#0b3b8f` (royal)
- Papel frio `#f2f4f9`, champagne `#c9b07a` como acento
- Tipografia: Fraunces (títulos), Source Sans 3 (interface), Mokoto (marca)

## Funcionalidades

**Paciente:** cadastro, login, recuperação de senha, pesquisa de clínicas, agendamento, cancelamento, reagendamento, histórico, fila ao vivo com estimativa de espera.

**Gestor:** painel do dia, controle de fila (iniciar, finalizar, chamar próximo), agenda, pacientes da clínica, edição dos dados e da foto da clínica.

**Regras de horário:** datas passadas não têm grade; horários ocupados ou já ocorridos aparecem riscados e sem clique; um paciente não agenda duas consultas no mesmo dia; só há atendimento no dia da consulta.

## Banco de dados

```
PACIENTE 1—N CONSULTA N—1 CLINICA
CLINICA 1—1 ENDERECO
CLINICA 1—N GESTOR
CONSULTA 1—1 FILA_ATENDIMENTO
```

Status da consulta: **Agendada → Em Atendimento → Finalizada** (ou **Cancelada**).
Consultas de hoje entram na fila; a posição e a estimativa (`tempo_medio` × pessoas à frente) são recalculadas para todos.

Senhas: no modo local usam SHA-256 com salt; com Supabase, o hash do Auth.

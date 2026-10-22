# Rodar o VEZZ

O frontend usa React + TypeScript + Vite. Use Node.js 24+ e npm; o servidor Python e o Live Server não compilam a aplicação atual.

## Desenvolvimento isolado

```bash
npm ci
npm run dev:local
```

Abra **http://127.0.0.1:5173**. Não há conexão com Supabase nesse modo, nem gravações de produção. O arquivo `.env.local-demo` define apenas `VEZZ_DATA_MODE=local`; não contém credenciais.

Contas locais, senha `demo123`:

- Paciente: `ana.silva@email.com`
- Gestor da Clínica Sol: `ricardo@clinicasol.com`
- Gestora do Instituto Vida: `marina@institutovida.com`

Para restaurar os dados, limpe o armazenamento deste endereço no navegador. Não use contas de demonstração no ambiente conectado.

## Desenvolvimento com o backend existente

```bash
npm run dev
```

Esse modo usa o Supabase configurado em `js/env.js`. A URL e a chave pública permanecem no frontend. Nunca adicione service role ou outra chave privada ao código. Consulte [SETUP.md](SETUP.md) para configurar um backend novo.

## Build e preview

```bash
npm run build:local
npm run preview
```

Abra **http://127.0.0.1:4173** para validar a versão compilada com dados locais. Use `npm run build` para gerar o build conectado ao backend antes da publicação. Não publique um build de demonstração por engano.

## Verificações

```bash
npm test
npm run test:logic
npm run test:browser
npm run build
```

O teste de navegador usa o wrapper versionado em `.agents/skills/playwright/scripts/playwright_cli.sh`, inicia um servidor local na porta 5174 e bloqueia conexões externas. No Windows, requer Git Bash e Chrome. Evidências em `output/playwright/`.

## Publicação

Na Vercel, selecione o repositório **alvarocarvalho2-spec/VEZZ**, comando `npm run build` e diretório `dist`. O `vercel.json` já declara essa configuração e mantém os cabeçalhos de segurança. O hash nas rotas mantém links diretos sem rewrites especiais.

O repositório `MVP__VEZZ` é o backup. Não use esse remoto para push.

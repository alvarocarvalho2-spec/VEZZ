# Instruções do projeto VEZZ

## Skills obrigatórias quando aplicáveis

As skills estão versionáveis junto com o projeto em `.agents/skills/`.
Antes de executar uma tarefa que se enquadre no escopo abaixo, leia o respectivo
`SKILL.md` e siga suas instruções e referências relevantes.

- **frontend-design** — `.agents/skills/frontend-design/SKILL.md`.
  Use em toda criação ou alteração de interface: composição, componentes,
  tipografia, cores, espaçamento, responsividade, estados visuais e movimento.
- **playwright** — `.agents/skills/playwright/SKILL.md`.
  Use para automação e validação no navegador: navegação, formulários,
  capturas de tela, inspeção visual e investigação de fluxos da interface.
- **ux-audit** — `.agents/skills/ux-audit/SKILL.md`.
  Use em auditorias e revisões de UX/UI, navegação, usabilidade, hierarquia,
  formulários, mensagens, estados e acessibilidade. Diferencie achados
  observados de hipóteses e priorize por impacto na tarefa.
- **motion-design** — `.agents/skills/motion-design/SKILL.md`.
  Use em alterações de animações, transições, efeitos de rolagem, hover e
  microinterações. Preserve estados funcionais e respeite movimento reduzido.
- **responsive-ui** — `.agents/skills/responsive-ui/SKILL.md`.
  Use em alterações de layouts responsivos, grids, breakpoints, menus
  adaptativos e correções de overflow em celular, tablet e desktop.
- Quando uma alteração visual exigir validação no navegador, combine
  `frontend-design` e `playwright`. Aplique também `ux-audit`, `motion-design`
  e `responsive-ui` quando seus escopos se aplicarem.
  Não aplique uma skill a tarefas que não tenham relação com seu conteúdo.

## Contexto e integração

- Preserve a identidade e os fluxos existentes do VEZZ: plataforma de clínicas
  e filas, azul marinho `#061b4f`, royal `#0b3b8f`, Source Sans 3, marca Mokoto
  e mascotes oficiais. Instruções explícitas do usuário prevalecem sobre
  recomendações genéricas das skills.
- A migração para React + TypeScript + Vite foi autorizada pelo usuário.
  Preserve o roteamento por hash com React Router, as regras e adaptadores de
  `js/lib/db.js` e os fluxos operacionais integrados por `LegacyPage`.
- Use `npm run dev:local` e `npm run test:browser` nas validações. O modo local
  isola o Supabase; `npm run dev` usa o backend configurado.
- O repositório ativo é `alvarocarvalho2-spec/VEZZ`. `MVP__VEZZ` é backup;
  nunca envie commits para ele.
- A skill Playwright foi instalada neste repositório, não no diretório global.
  Resolva seu wrapper em `.agents/skills/playwright/scripts/playwright_cli.sh`
  a partir da raiz do projeto; não suponha `$CODEX_HOME/skills/playwright`.
- Confira a disponibilidade de `npx` antes de usar a CLI. No Windows, execute
  o wrapper por um shell Bash disponível; não presuma que scripts `.sh`
  podem ser executados diretamente pelo PowerShell.
- Salve artefatos de novas verificações Playwright em `output/playwright/`.
  Os cenários anteriores em `tests/` continuam disponíveis; suas capturas
  temporárias permanecem em `tests/artifacts/`.
- Valide fluxos com dados locais ou de homologação. Não use os testes para
  gravar dados no Supabase de produção sem autorização específica.

## Origem das skills

- `frontend-design`: https://github.com/anthropics/skills/tree/main/skills/frontend-design
- `playwright`: https://github.com/openai/skills/tree/main/skills/.curated/playwright
- `ux-audit`, `motion-design` e `responsive-ui`: pacote `codex-web-skills.zip`
  fornecido pelo usuário, diretório `codex-web-skills/.agents/skills/`.

Preserve as licenças, avisos e referências distribuídos com cada skill.

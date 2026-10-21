# Migração imersiva do VEZZ

## Direção e escopo

O repositório ativo é [alvarocarvalho2-spec/VEZZ](https://github.com/alvarocarvalho2-spec/VEZZ).
O antigo MVP permanece como backup. No checkout de trabalho, seu remoto foi
renomeado para `backup` e recebeu o endereço de push `DISABLED-BACKUP`.

O produto continua atendendo pacientes, gestores e administradores. A direção
visual gira em torno de devolver tempo ao paciente: uma cena orbital com o
mascote oficial, uma demonstração explorável do atendimento e interfaces
operacionais mais claras. Marinho `#061b4f`, royal `#0b3b8f`, Source Sans 3,
Mokoto e as dez expressões oficiais foram preservados.

## Escolha da stack

| Opção | Avaliação para este projeto |
| --- | --- |
| React + TypeScript + Vite | Escolhida. Permite migrar a SPA e aproveitar os módulos existentes, com componentes, ecossistema 3D e build sem adicionar outro servidor ao backend já existente. |
| Next.js | Adequado se o produto passar a precisar de renderização de conteúdo no servidor ou rotas de backend próprias. Esses recursos não são requisitos desta migração. |
| Astro | Bom candidato para um site institucional predominantemente editorial; a aplicação atual concentra muitas telas com sessão, formulários e estado de filas. |

O React documenta a [adoção gradual em projetos existentes](https://react.dev/learn/add-react-to-an-existing-project).
O [Vite](https://vite.dev/guide/) fornece desenvolvimento e compilação.
O [Next.js](https://nextjs.org/learn) oferece recursos de servidor que podem
ser reavaliados caso esses requisitos apareçam. O modelo de
[ilhas do Astro](https://v5.docs.astro.build/en/concepts/islands/) também foi
considerado. A escolha é específica do VEZZ e da migração, não uma classificação
universal entre frameworks.

Bibliotecas adicionadas:

- `react`, `react-dom`, `react-router-dom` para aplicação e navegação;
- `motion` para transições, prévias, menu e reação ao ponteiro;
- `three` e `@react-three/fiber` para a cena orbital;
- `lucide-react` para os ícones da nova interface;
- TypeScript, Vite, plugin React e tipos como ferramentas de desenvolvimento.

As versões resolvidas estão fixadas em `package.json` e `package-lock.json`.
As skills versionadas de design, movimento, responsividade, UX e Playwright
foram suficientes para esta etapa; nenhuma instalação adicional de skills foi
necessária.

## Arquitetura entregue

`src/main.tsx` monta a aplicação React. `src/App.tsx` controla inicialização,
rotas e sessão. O HashRouter preserva os endereços já utilizados.

Home, busca de clínicas e explicação do produto são páginas nativas em React.
Cabeçalho, rodapé e navegação dos painéis também são componentes React. A busca
continua usando `db().listClinics` e a mesma filtragem por nome, especialidade e
localização do backend.

`LegacyPage` integra os renderizadores de autenticação, agendamento, paciente,
gestor e administração. Ela protege as rotas, coordena foco e encerra polling,
modais e observadores ao sair. A renderização dos módulos é serializada para
evitar que uma navegação antiga inicie listeners depois de outra tela.

As telas operacionais receberam a nova identidade via CSS. Seus renderizadores
continuam em JavaScript. Converter internamente cada formulário e painel em
componentes React é trabalho posterior; não se afirma que toda a base já foi
reescrita em TSX. A camada de dados, as validações e as regras de filas foram
mantidas.

## Movimento e 3D

| Alvo | Gatilho e comportamento | Alternativa |
| --- | --- | --- |
| Navegação | Entrada curta de 280 ms, sem bloquear interação | Sem deslocamento com movimento reduzido |
| Menu móvel | Abre/fecha com estado anunciado; Escape devolve foco | Transição praticamente instantânea com movimento reduzido |
| Prévia do hero | Clique alterna agendamento, posição ilustrativa e chamada | Mesmos controles e conteúdo sem 3D |
| Mascote e cartão | Reação à etapa e inclinação suave ao mouse | Sem inclinação em toque, pausa ou movimento reduzido |
| Órbita 3D | Carga separada após o conteúdo; acompanha ponteiro | Órbitas CSS e mascote vetorial sem WebGL |

A cena tem limite de resolução de 1,5 DPR, materiais simples e nenhuma textura
ou modelo externo. Pausa quando não está visível, quando a aba fica oculta ou
pelo controle do usuário. Não carrega inicialmente em celular, com economia de
dados ou movimento reduzido. O padrão de renderização sob demanda segue a
[orientação do React Three Fiber](https://r3f.docs.pmnd.rs/advanced/scaling-performance).
A preferência de movimento é respeitada usando os recursos do
[Motion](https://motion.dev/docs/react-use-reduced-motion) e CSS.

A prévia é identificada como ilustrativa. Nenhum número da demonstração é
apresentado como posição real do paciente. O estado de fila continua vindo do
adaptador e das RPCs existentes.

## Ambiente e publicação

- `npm run dev:local`: demonstração isolada, sem Supabase.
- `npm run dev`: usa a integração existente.
- `npm run build:local`: build isolado para QA.
- `npm run build`: build conectado para publicação.
- `npm run preview`: serve `dist` na porta 4173 com os cabeçalhos de segurança.

A Vercel está configurada para Vite, `npm run build` e saída `dist`. Os assets
referenciados pelos dados das clínicas são copiados para o build sem alterar
seus caminhos. A política de scripts permanece restrita em produção; a
permissão para o preâmbulo inline de Fast Refresh existe somente no dev server.
O dev server bloqueia `.git`, arquivos de ambiente, chaves e a pasta de vídeo;
os caminhos foram verificados e retornam 403.

Não foram feitas alterações de schema, RLS ou Edge Functions nesta etapa.
Não foram feitos testes com gravação no Supabase de produção.

## Verificação

Os testes de regras e segurança usam PGlite e adaptadores locais. Os cenários
de navegador atuais são executados pela CLI Playwright da skill versionada;
iniciam Vite no modo isolado e bloqueiam tráfego externo. Capturas e logs são
salvos em `output/playwright/`.

Os cenários históricos da versão estática permanecem em `tests/` como
referência. Seu layout e seus seletores não são o critério de aceite da nova
interface.

Resultados desta entrega:

- 93 testes de segurança, banco, Edge Function e fila passaram em ambiente local.
- Testes de lógica de datas, validação e timeline passaram.
- TypeScript e builds local e de produção passaram.
- 20 verificações de fluxos: busca, cadastro, autenticação, recuperação,
  agendamento, reagendamento, cancelamento, atendimento e permissões.
- 6 verificações de administração: solicitação, aprovação, convite persistente,
  recusa, cadastro do primeiro gestor e criação de equipe sem troca de sessão.
- 125 verificações de layout, acessibilidade e interação: 20 rotas nos tamanhos
  320, 375, 768, 1280 e 1440 px, axe sem violações graves/críticas nas telas
  verificadas, menu por teclado, cena 3D, pausa, movimento reduzido, salto para
  conteúdo e entrada de texto maliciosa na busca.
- 8 verificações do build de produção: CSP restrita, módulos compilados,
  imagens copiadas, navegação, recuperação com tokens removidos da URL,
  submissão simulada, layout móvel e estado de erro com nova tentativa.

Os testes do build conectado interceptaram as chamadas ao backend com respostas
locais; nenhuma requisição chegou ao Supabase de produção. Isso verifica a
integração do frontend compilado, sem alegar uma validação ao vivo do serviço.

Achados observados e corrigidos durante a migração: compatibilidade entre a
API síncrona do adaptador local e o carregamento das páginas React; necessidade
de sincronizar a URL sanitizada de recuperação com HashRouter; contraste de
textos secundários; faixa do link de salto parcialmente visível antes do foco.
As verificações finais foram realizadas após essas correções. Desempenho em
aparelhos físicos permanece uma hipótese a validar, não um resultado medido.

O chunk de 3D é maior que os demais e é carregado separadamente. A qualidade
visual e os limites de renderização foram verificados em navegador; não foi
realizado benchmark em aparelhos físicos nem se declara uma pontuação de
Core Web Vitals.

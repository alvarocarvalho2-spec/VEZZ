# Como rodar o VEZZ no seu computador

O VEZZ é um site estático (HTML + CSS + JavaScript). Ele não precisa de build nem de instalar dependências: basta servir a pasta por HTTP.

> Importante: **não abra o `index.html` com duplo clique**. O VEZZ usa módulos ES (`type="module"`), que só funcionam por HTTP. Se abrir como `file://`, a tela fica em “Abrindo a clínica…”.

---

## Opção 1 — Python (já vem no Mac e no Linux)

1. Abra o terminal.
2. Entre na pasta do projeto:
   ```bash
   cd caminho/para/vezz
   ```
3. Suba o servidor:
   ```bash
   python3 serve.py
   ```
4. Abra no navegador: **http://localhost:8080**

Para parar: `Ctrl + C` no terminal.

O `serve.py` envia `Cache-Control: no-store`, então o navegador sempre pega a versão atual dos arquivos — sem aquele problema de “abriu como era antes”.

Se preferir o servidor embutido do Python (sem os cabeçalhos de no-cache), também funciona:

```bash
python3 -m http.server 8080
```

## Opção 2 — VS Code (Live Server)

1. Instale a extensão **Live Server**.
2. Abra a pasta `vezz` no VS Code.
3. Clique com o botão direito no `index.html` → **Open with Live Server**.
4. Ele abre sozinho em `http://127.0.0.1:5500`.

## Opção 3 — Node.js

```bash
npx serve -l 8080
```

Ou qualquer outro servidor estático (`http-server`, `live-server`, Nginx, Apache).

---

## Entrar no sistema (contas de demonstração)

| Perfil | E-mail | Senha |
|---|---|---|
| Paciente (já na fila de hoje) | `ana.silva@email.com` | `demo123` |
| Gestor da Clínica Sol | `ricardo@clinicasol.com` | `demo123` |
| Gestora do Instituto Vida | `marina@institutovida.com` | `demo123` |

Roteiro rápido para testar a fila ao vivo:

1. Entre como **Ana** em `#/login`. Ela aparece na **posição 1** da Clínica Sol, com Carlos em atendimento.
2. Em outra aba (ou outro navegador), entre como **Ricardo**.
3. No painel `#/gestor/fila`, clique **Finalizar atendimento**. A posição da Ana muda sozinha na primeira aba.

## Restaurar os dados de demonstração

Os dados ficam no `localStorage` do navegador. Para voltar ao estado inicial:

- Abra limpe os dados locais do navegador, ou
- Limpe os dados do site no navegador (DevTools → Application → Clear storage).

---


## Publicar na internet

Como é estático, qualquer hospedagem serve:

- **Vercel**: importe a pasta, não precisa de comando de build.
- **Netlify**: arraste a pasta `vezz` para o painel.
- **GitHub Pages**: suba o conteúdo e ative o Pages.

O roteamento é por hash (`#/clinicas`), então não é necessário configurar rewrites.

---

## Problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| Tela presa em “Abrindo a clínica…” | Abriu o arquivo direto (`file://`) | Sirva por HTTP (opções acima) |
| Layout sem estilo | CSS não carregou | Confirme que abriu `http://localhost:8080`, não o arquivo |
| Continua com aparência antiga | Cache do navegador | `Ctrl + Shift + R` (recarregar sem cache) ou aba anônima |
| Login não funciona | Dados locais corrompidos | limpe os dados locais do navegador |
| Porta 8080 ocupada | Outro programa usando | `python3 -m http.server 8090` e use esse endereço |

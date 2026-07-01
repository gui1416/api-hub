# Plano: responsividade do AlertDialog + toasts (sonner)

## Contexto / estado atual

- `components/ui/alert-dialog.tsx` e `components/ui/sonner.tsx` já foram gerados
  pelo usuário via CLI oficial do shadcn (`base-nova` style, `@base-ui/react`).
- `components/ui/sonner.tsx` importa `useTheme` de `next-themes`, mas o projeto
  **não** usa `next-themes` — o dark mode é manual (`app/layout.tsx`, script
  inline + `localStorage['apihub-theme']`, toggla a classe `.dark` no `<html>`).
  Sem `ThemeProvider` do `next-themes` no topo da árvore, o hook cai no
  `defaultContext` da lib (`theme: undefined` → o componente usa o fallback
  `"system"`), ou seja, o Toaster sempre seguiria o tema do SO via
  `prefers-color-scheme`, ignorando o toggle manual do app. Precisa de um
  pequeno ajuste local (ler a classe `.dark` do `document.documentElement`)
  em vez de depender do `next-themes`.
- Estado do `node_modules` está incerto: uma sequência de instalações
  concorrentes (Windows-side `npm install sonner` em background + shadcn CLI
  rodando dentro do WSL) deixou `node_modules/next` corrompido (`ENOTEMPTY`
  em `dist/server`, `dist/esm`) e uma tentativa de `rm -rf node_modules` foi
  interrompida pelo usuário no meio. **Precisa verificar o estado real antes
  de mexer em mais nada** (rodar `npm install`/`npm ls next-themes sonner`
  primeiro).

## Passo 0 — Confirmar/consertar o ambiente

1. Checar se `node_modules/next`, `node_modules/sonner`,
   `node_modules/next-themes` estão presentes e íntegros.
2. Confirmar que `package.json` ganhou `sonner` (e opcionalmente
   `next-themes`, a depender da decisão do Passo 1) e que `npm run build`
   passa limpo depois.

## Passo 1 — Adotar `next-themes` como única fonte de verdade do tema

Decisão revista: em vez de adaptar o `sonner.tsx` ao mecanismo manual, o
`next-themes` passa a ser o único sistema de tema do app (o manual é
removido, evitando os dois coexistindo):

- `app/layout.tsx`: troca o script inline (`localStorage.getItem('apihub-theme')`
  + toggle manual de `.dark`) por `<ThemeProvider attribute="class"
  defaultTheme="dark" enableSystem={false} storageKey="apihub-theme"
  disableTransitionOnChange>` envolvendo `{children}` — usa a mesma chave de
  `localStorage` (`apihub-theme`) que o script antigo já usava, então a
  preferência já salva pelos usuários continua válida. `enableSystem={false}`
  preserva o comportamento antigo (nunca segue `prefers-color-scheme`
  automaticamente, sempre cai em `dark` como padrão).
- `components/api-hub/theme-toggle.tsx`: troca a manipulação direta de
  `classList`/`localStorage` por `useTheme()` (`resolvedTheme`/`setTheme`).
- `components/ui/sonner.tsx`: volta a usar `useTheme()` de `next-themes`
  (padrão gerado pelo CLI), já que agora há um `ThemeProvider` de verdade no
  topo da árvore.

## Passo 2 — Montar o `<Toaster />` globalmente

- Adicionar `<Toaster />` em `app/layout.tsx`, dentro do `<body>`, uma única
  vez (evita duplicar toasts se algum dia houver múltiplos layouts
  aninhados).

## Passo 3 — Deixar `components/ui/alert-dialog.tsx` mais responsivo

A versão gerada pelo CLI já resolve boa parte disso (`data-size`,
`max-w-xs`/`sm:max-w-sm`, `text-balance`/`md:text-pretty`, footer
`flex-col-reverse` → `sm:flex-row`). Ajustes adicionais a fazer em cima
dela:

- Garantir a largura segura em telas pequenas com `max-w-[calc(100%-2rem)]`
  no `AlertDialogContent` (sem usar scroll interno/`overflow-y-auto` — só
  largura, sem alterar o comportamento de altura).
- Botões de ação em largura total quando empilhados no mobile
  (`w-full sm:w-auto` em `AlertDialogAction`/`AlertDialogCancel`), melhor
  alvo de toque.
- Garantir quebra de texto para URLs longas na `AlertDialogDescription`
  (`break-all` ou `break-words` no trecho que interpola `spec.sourceUrl`,
  em `components/api-hub/spec-switcher.tsx`, não no componente base).

## Passo 4 — Adicionar toasts nas interações do usuário

Pontos identificados (todos client components já existentes):

1. **`components/api-hub/spec-switcher.tsx` → `handleConfirmDelete`**
   - Sucesso: `toast.success(\`Spec "${spec.title}" deletada com sucesso.\`)`
   - Falha (`!res.ok`): `toast.error(\`Não foi possível deletar "${spec.title}".\`)`

2. **`components/api-hub/api-hub.tsx` → `loadSpec`**
   - Sucesso (antes do `router.push`):
     `toast.success(\`Spec "${title}" adicionada com sucesso.\`)`
   - Falha ao carregar a URL (`!res.ok` do `/api/spec`) e falha ao registrar
     (`!res.ok` do `/api/specs`): `toast.error(data.error ?? '...')`
     — mantém o banner inline (`loadError`) que já existe, o toast só
     reforça a notificação (mais visível, não depende de scroll).
   - Erro de rede inesperado (`catch`): `toast.error(...)`.

Fora de escopo (não mexer, a menos que o usuário peça): toasts de
login/logout e do fluxo de "Try it" (`components/api-hub/try-it.tsx`) — o
pedido foi especificamente sobre specs.

## Passo 5 — Validar

- `npx tsc --noEmit` (rodar de dentro do WSL nativo pra evitar a ponte UNC).
- `npm run lint`.
- Rodar `npm run dev` e testar manualmente: abrir o switcher, carregar uma
  spec nova (toast de sucesso + navegação), tentar uma URL inválida (toast
  de erro), deletar uma spec (confirmar no AlertDialog, toast de sucesso),
  redimensionar a janela/DevTools mobile pra conferir a responsividade do
  AlertDialog.

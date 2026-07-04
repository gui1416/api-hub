# Plano: teste e ajuste de responsividade de todas as telas (navegador)

Objetivo: percorrer **todas as telas** no navegador em vários tamanhos de viewport,
identificar quebras de layout (overflow horizontal, texto/botão cortado, sobreposição,
tabela estourando, dialog/sheet maior que a tela, sidebar sem fallback mobile) e
**corrigir** com Tailwind, mantendo o padrão do repo (Tailwind v4 CSS-first, sem
`tailwind.config`, tokens em `app/globals.css`).

## Ferramentas e método

- **Playwright MCP** para dirigir o Chromium: `browser_navigate`, `browser_resize`,
  `browser_snapshot` (árvore de acessibilidade — melhor sinal que screenshot para
  detectar estrutura), `browser_take_screenshot` (evidência visual) e
  `browser_console_messages` (erros de hidratação/layout).
- **Detecção de overflow horizontal** (o defeito responsivo mais comum) via
  `browser_evaluate` rodando no documento:
  ```js
  () => {
    const de = document.documentElement;
    const overflowX = de.scrollWidth > de.clientWidth;
    const offenders = [...document.querySelectorAll('*')]
      .filter(el => el.getBoundingClientRect().right > de.clientWidth + 1)
      .slice(0, 20)
      .map(el => ({ tag: el.tagName, cls: el.className, w: Math.round(el.getBoundingClientRect().width) }));
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflowX, offenders };
  }
  ```
  Rodar em cada tela × cada viewport; `overflowX === false` é o critério de aprovação
  base. Os `offenders` apontam direto o elemento a corrigir.

## Viewports a testar

| Rótulo            | Larg × Alt | Foco                                              |
|-------------------|-----------|---------------------------------------------------|
| Mobile pequeno    | 360 × 740 | pior caso; botões/tabelas/dialogs                 |
| Mobile (iPhone)   | 390 × 844 | caso comum                                         |
| Tablet retrato    | 768 × 1024| breakpoint `md`; sidebar docs vira drawer          |
| Laptop            | 1024 × 720| breakpoint `lg`                                    |
| Desktop           | 1440 × 900| baseline atual                                     |

Breakpoints Tailwind v4 padrão em uso: `sm 640 / md 768 / lg 1024 / xl 1280`.
Ao ajustar, preferir mobile-first (estilo base = mobile, `md:`/`lg:` para telas maiores).

## Pré-requisitos (setup do ambiente)

1. Subir o app: `npm run dev` (Next dev, porta 3000) — rodar em background.
2. Precisa de sessão autenticada. Fazer login via UI no `/login` com o admin
   (usuário do `seed:admin`); se não houver admin, rodar `npm run seed:admin` antes.
   O cookie `apihub_session` (1 dia) persiste na sessão do Playwright.
3. Ter pelo menos **uma spec registrada** para exercitar `/docs/[slug]`, `TryIt` e o
   chat de IA (carregar uma URL de OpenAPI pública via command palette, ou usar a
   "Documentação do API Hub" bundled em `/docs`).

## Telas e o que verificar (checklist por tela)

### Fluxos sem sessão
1. **`/login`** (`app/login/page.tsx`) — card centralizado não pode encostar/estourar
   nas bordas no mobile; inputs e botão full-width; sem overflow.
2. **`/change-password`** (`app/change-password/page.tsx`) — header mínimo sem
   navegação; formulário legível no mobile.

### App autenticado
3. **`/` (home)** (`app/page.tsx` + `components/app-shell/app-header.tsx`) —
   header (marca, título, ⌘K, tema, logout) não pode quebrar/empilhar feio no mobile;
   CTAs (`open-docs-button.tsx`) acessíveis; hero/textos sem overflow.
4. **`/docs` e `/docs/[slug]`** (`components/api-hub/*`) — a tela mais densa:
   - Sidebar (`Sidebar`) deve virar **drawer** no mobile (o `Header` do docs tem
     toggle mobile) e não empurrar conteúdo; verificar overlay e scroll.
   - `EndpointView`: `ParamTable`/`SchemaView`/`CodePanel`/`CodeBlock` — blocos de
     código e tabelas precisam de `overflow-x-auto` no container, nunca estourar a
     página. URLs/exemplos longos não podem alargar o body.
   - `TryIt`: inputs de método/URL/headers/body utilizáveis no mobile; resposta com
     scroll próprio.
   - `Overview`: tabela de endpoints/descrição sem overflow.
5. **Command palette** (`components/command-palette/command-palette.tsx`) — abrir com
   ⌘K em cada viewport: largura máxima adequada, lista com scroll, itens longos
   (URLs de spec) truncados, não maior que a viewport no mobile.
6. **AI chat dialog** (`components/api-hub/ai-chat-dialog.tsx`) — abrir via ⌘K/Ctrl+I
   num spec: bolhas de mensagem (alinhamento user/assistant), input fixo, dialog
   ocupando quase full-screen no mobile sem estourar; textos longos com wrap.

### Admin (header via `app/admin/layout.tsx`)
7. **`/admin/users`** e **`/admin/groups`** (`components/admin/directory-console.tsx`)
   — layout estilo AD com **árvore à esquerda + lista à direita**: no mobile precisa
   colapsar para uma coluna (árvore vira drawer/topo ou seletor) — este é o candidato
   nº 1 a quebrar. Lista/tabela de objetos com scroll; kebab menu acessível.
   - **Dialog "Propriedades"** (com abas Geral/Conta/Membro de / Membros/Permissões/
     Specs): abas não podem estourar horizontalmente; matriz de permissões e
     multi-select de specs precisam rolar dentro do dialog; dialog não maior que a tela.
8. **`/admin/dashboard`** (`components/admin/usage-dashboard.tsx`) — cards de métrica
   empilham no mobile; **gráficos/charts** com container responsivo (`width: 100%`),
   sem overflow; tabelas por provider/modelo/usuário com scroll. (Ao mexer em chart,
   seguir a skill `dataviz`.)

### Config IA (header via `app/config-ia/layout.tsx`)
9. **`/config-ia`** (`components/config-ia/*`) — lista de providers clicável;
   textarea "Regras e limitações da IA" (`ai-rules-form.tsx`) full-width;
   **Sheet lateral** de relatório do provider (`provider-usage-sheet.tsx`) deve virar
   quase full-width no mobile, com charts/tabelas internos rolando, sem estourar.

## Padrões de correção esperados (Tailwind, mobile-first)

- **Overflow de código/URL**: `min-w-0` no filho flex + `break-words`/`break-all` ou
  `overflow-x-auto` no wrapper; nunca `whitespace-nowrap` sem container rolável.
- **Tabelas densas**: envolver em `<div class="overflow-x-auto">`; considerar layout
  em cards no mobile onde fizer sentido.
- **Grids**: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` em vez de colunas fixas.
- **Layout duas colunas (directory console)**: `flex-col md:flex-row`; a coluna
  árvore vira `Sheet`/drawer no mobile (reusar `components/ui/sheet.tsx`).
- **Dialog/Sheet**: `max-w-[95vw]`/`w-full` + `max-h-[90vh]` + `overflow-y-auto` no
  corpo; conteúdo interno com seu próprio scroll.
- **Header global** (`app-header.tsx`): esconder/encolher rótulos com `hidden sm:inline`,
  manter ⌘K/tema/logout sempre acessíveis (ícones no mobile).
- **min-w-0 em containers flex** para permitir que filhos encolham (causa comum de
  overflow em flex).

Não perseguir os ~8 warnings conhecidos de `react-hooks/set-state-in-effect` (padrão
do repo).

## Fluxo de execução (loop por tela)

Para cada tela do checklist:
1. `browser_navigate` até a rota.
2. Para cada viewport: `browser_resize` → rodar o snippet de overflow (`browser_evaluate`)
   → `browser_snapshot` → `browser_take_screenshot` (guardar no scratchpad como evidência).
3. Registrar defeitos (viewport, elemento infrator, sintoma).
4. Abrir overlays relevantes (palette, chat, dialog de propriedades, sheet) e repetir 2–3.
5. Corrigir no componente (Tailwind, mobile-first), salvar.
6. Re-testar a mesma tela nos viewports afetados até `overflowX === false` e layout ok
   visualmente.

Trabalhar por tela (navegar → medir → corrigir → re-medir) em vez de medir tudo antes,
para o dev server já refletir o ajuste no próximo passo.

## Registro de achados

Manter uma tabela de achados no fim deste arquivo (ou em nota separada), com:
`Tela | Viewport | Elemento | Sintoma | Correção | Status`. Marcar cada item como
✅ corrigido / ⏳ pendente / ➖ ok (sem ajuste).

## Verificação final

- Passar por todas as telas × viewports uma última vez com `overflowX === false`.
- `npm run lint` e `npx tsc --noEmit` (o build ignora erros de TS; checar à parte).
- `npm test` (garantir que nenhum ajuste quebrou snapshot/lógica).
- Conferir modo claro **e** escuro (`.dark` no `<html>`) em ao menos mobile e desktop,
  pois algumas correções mexem em bordas/sombras visíveis só num dos temas.
- Screenshots antes/depois das telas que mudaram como evidência.

## Ordem sugerida

1. Setup (dev server + login + spec registrada).
2. Telas simples primeiro: `/login`, `/change-password`, `/` (home).
3. Admin: `directory-console` (users/groups) + dialog de propriedades — maior risco.
4. `/admin/dashboard` (charts) e `/config-ia` (+ sheet do provider).
5. `/docs`/`/docs/[slug]` + overlays (palette, chat, TryIt) — mais densa.
6. Verificação final (viewports, lint/tsc/test, temas).

---

## Registro de achados (execução 2026-07-04)

Testado nos viewports 360/390/768/1024/1440 (claro + escuro). Critério: `scrollWidth == clientWidth`.

| Tela | Viewport | Elemento | Sintoma | Correção | Status |
|------|----------|----------|---------|----------|--------|
| `/` home | todos | — | — | — | ➖ ok |
| `/login` | todos | — | — | — | ➖ ok |
| `/change-password` | todos | — | — | — | ➖ ok |
| `/admin/users` e `/admin/groups` | 360/390 | grupo de controles do header (busca `w-56` + dropdown + botão, `flex` rígido) | overflow horizontal de página (~466px) | `flex w-full flex-wrap ... sm:w-auto`; busca `flex-1 min-w-0` + `w-full sm:w-56` (`directory-console.tsx`) | ✅ corrigido |
| Dialogs de propriedades (user/grupo) | 360/390 | — | já cabiam (margens + scroll interno + 4 abas ok) | — | ➖ ok |
| `/admin/dashboard` | todos | — | cards/barras já empilham | — | ➖ ok |
| `/config-ia` | 360/390 | header: botões "Adicionar provider"+"Salvar" (`flex` sem wrap, `shrink-0`) | overflow horizontal (~438px) | `flex-wrap` no header e no grupo de botões (`config-ia-manager.tsx`) | ✅ corrigido |
| `/config-ia` sheet do provider | 360/390 | `SheetContent` | base `data-[side=right]:w-3/4` vencia o `w-full` (specificity) → sheet 3/4 no mobile e capado em `max-w-sm` no desktop | `!w-full sm:!max-w-xl` (`provider-usage-sheet.tsx`) → full-width no mobile, `xl` no desktop | ✅ corrigido |
| `/docs/[slug]` (overview + endpoint) | todos | code blocks (`<pre>`) | rolam dentro do próprio container (correto), sem overflow de página | — | ➖ ok |
| Command palette / chat IA / TryIt / sidebar drawer | todos | — | contidos, sem overflow | — | ➖ ok |

**Ajuste extra pedido pelo usuário:** botão "Enviar mensagem" do chat movido de baixo do textarea para a **direita** dele (`InputGroupAddon align="block-end"` → `"inline-end"` em `ai-chat-dialog.tsx`).

**Interações validadas no chat:** abrir (Ctrl+I), digitar + Enter e envio pelo botão → resposta transmitida do provider (Groq), "Nova conversa" reseta, bolhas user/assistant renderizam com wrap e sem overflow no mobile.

**Verificação:** `eslint` 0 erros (4 warnings `set-state-in-effect` pré-existentes do repo); `tsc --noEmit` 0 erros de código-fonte (só arquivos gerados em `.next/`); `vitest` 137/137 testes passando. Conferido claro + escuro.

Evidências (screenshots antes/depois) em `resp/`.

# Plano: persistência de specs no Postgres + navegação via Command

## Estado atual

- **Persistência já existe e já está em uso.** `lib/db/schema.ts` define a tabela `specs`
  (migração `drizzle/0000_giant_phalanx.sql`), `lib/db/client.ts` expõe o client Drizzle
  singleton, e `lib/specs-store.ts` (`getSpec`/`listSpecs`/`saveSpec`) é a única camada de
  acesso. `app/api/specs/route.ts` expõe `GET` (lista) e `POST` (upsert) sobre essa camada.
  O resquício de armazenamento em arquivo (`data/specs.json`) era código morto e foi removido
  — nenhuma rota o lia.
- **O que falta não é a persistência em si, é a superfície em volta dela:**
  1. Não existe forma de remover uma spec registrada (sem `DELETE`).
  2. `GET /api/specs` é chamado por nenhum componente hoje — os dados existem no banco mas
     não aparecem em lugar nenhum da UI.
  3. A única forma de "navegar" entre specs é o popover "Carregar spec" no `Header`
     (`components/api-hub/header.tsx`), que só aceita uma URL nova — não lista as specs já
     registradas, então trocar entre duas specs já conhecidas exige colar a URL de novo.

O pedido tem duas partes: (1) consolidar a persistência para cobrir o ciclo de vida completo
(listar, abrir, remover), e (2) trocar a navegação entre specs para um command palette
(`components/ui/command.tsx`, baseado em `cmdk`).

## Parte 1 — Persistência (banco como fonte de verdade)

A tabela já casa com o que é necessário; não há mudança de schema obrigatória. Mudanças na
camada de acesso/API:

1. **`lib/specs-store.ts`**
   - Adicionar `deleteSpec(slug: string): Promise<boolean>` (`DELETE FROM specs WHERE slug = ...`,
     retorna se algo foi removido). Necessário para o command palette poder remover uma entrada.
   - Revisar `saveSpec`: a resolução de colisão de slug (`while (await getSpec(slug))`) faz uma
     query por tentativa — aceitável no volume esperado (registro manual, baixo throughput),
     mas vale um comentário deixando explícito que não há lock/transação cobrindo a checagem +
     insert (corrida teórica entre dois registros simultâneos com o mesmo título). Não bloqueia
     este trabalho; registrar como limitação conhecida.
2. **`app/api/specs/route.ts`**
   - Adicionar `DELETE` recebendo `{ slug }` no corpo (ou usar `app/api/specs/[slug]/route.ts`
     com o slug na URL — preferível, mais RESTful e mais simples de chamar do client).
   - Manter `GET`/`POST` como estão.
3. **Nova rota `app/api/specs/[slug]/route.ts`**
   - `DELETE`: chama `deleteSpec(slug)`, devolve `204` ou `404` se não existir.
   - Protegida pelo middleware automaticamente (`/api/specs/:path*` já está no matcher).
4. **Sem mudança de migração** — schema atual já suporta tudo isso. Se no futuro quisermos
   ordenar o command palette por uso recente em vez de criação, aí sim entraria uma coluna
   `last_opened_at` + migração nova; fora de escopo agora (ver "Fora de escopo").

## Parte 2 — Navegação via Command

### Componente novo: `components/api-hub/spec-switcher.tsx`

Um command palette controlado, montado uma vez em `ApiHub`, usando os primitivos que já
existem em `components/ui/command.tsx` (`CommandDialog`, `CommandInput`, `CommandList`,
`CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`).

Comportamento:

- **Abertura**: atalho global `Cmd+K` / `Ctrl+K` (listener em `ApiHub`, já é o componente que
  guarda o estado de topo) e um botão no `Header` (substitui o botão "Carregar spec" atual —
  ver abaixo).
- **Conteúdo do dialog**:
  - `CommandInput` com placeholder `"Buscar spec ou colar uma URL..."`.
  - Grupo **"Specs registradas"**: carregado de `GET /api/specs` quando o dialog abre (fetch
    on-open, sem cache local complexo — é uma lista pequena). Cada `CommandItem` mostra
    título + `sourceUrl` truncada, marca com check a spec atualmente aberta
    (comparando `sourceUrl` atual, igual ao que `Header` já recebe via prop), e ao
    selecionar faz `router.push(/docs/{slug})` e fecha o dialog.
  - Estado vazio (`CommandEmpty`): "Nenhuma spec carregada ainda."
  - Estado de carregamento: reaproveitar o `loading` já existente em `ApiHub`/`Header`
    (spinner no item ou no próprio input).
  - Grupo **"Carregar nova URL"**: aparece somente quando o texto digitado em `CommandInput`
    parece uma URL (`http(s)://...`) e não corresponde a nenhuma `sourceUrl` já registrada.
    Um único `CommandItem` "Carregar `<url digitada>`" dispara o mesmo `loadSpec(url)` que o
    popover atual usa hoje (`ApiHub#loadSpec`) — nenhuma lógica de fetch/parse muda, só o
    gatilho de UI.
  - Ação secundária de remover: cada `CommandItem` de spec registrada ganha um botão/ícone de
    lixeira (`Trash2`) que chama `DELETE /api/specs/{slug}` e atualiza a lista local; se a
    spec removida for a que está aberta no momento, redirecionar para `/docs` (spec padrão).
- **Fechamento**: Escape ou seleção de um item (o `Dialog` do `@base-ui/react` já trata Escape/
  clique fora; basta `onOpenChange` setar o estado local).

### Mudanças em componentes existentes

- **`components/api-hub/header.tsx`**: o botão "Carregar spec" passa a abrir o
  `SpecSwitcher` (via callback `onOpenSwitcher` vindo de `ApiHub`) em vez do popover
  inline atual. Isso permite remover ~60 linhas de popover handrolled (estado `open`,
  `popoverRef`, click-outside listener, form) — tudo isso já existe pronto em
  `CommandDialog`/`cmdk`. O atalho de teclado (`⌘K`) deve aparecer como dica visual no botão
  (`CommandShortcut`-like badge), igual ao padrão comum desse tipo de componente.
- **`components/api-hub/api-hub.tsx`**: passa a guardar `switcherOpen` (estado local) e
  renderizar `<SpecSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} sourceUrl={sourceUrl} onLoad={loadSpec} />`
  ao lado do restante do layout. `loadSpec` já existe e não muda de assinatura.
- **`components/ui/command.tsx`**: não precisa mudar — já fornece tudo (Dialog, Input, List,
  Empty, Group, Item, Shortcut, Separator).

### Fluxo de dados

```
SpecSwitcher (open)
  -> GET /api/specs            (lib/specs-store.ts#listSpecs)
  -> usuário digita / seleciona
       - selecionou spec existente -> router.push(/docs/{slug})
       - digitou URL nova          -> ApiHub#loadSpec(url) (fluxo atual: GET /api/spec -> POST /api/specs -> router.push)
       - clicou lixeira            -> DELETE /api/specs/{slug} -> refetch da lista
```

## Arquivos afetados (resumo)

| Arquivo | Mudança |
|---|---|
| `lib/specs-store.ts` | + `deleteSpec(slug)` |
| `app/api/specs/[slug]/route.ts` | novo — `DELETE` |
| `components/api-hub/spec-switcher.tsx` | novo — command palette |
| `components/api-hub/api-hub.tsx` | estado `switcherOpen`, atalho `⌘K`, renderiza `SpecSwitcher` |
| `components/api-hub/header.tsx` | botão abre `SpecSwitcher` em vez do popover atual; remove estado/lógica do popover |

Nenhuma migração de banco nova é necessária para este escopo.

## Fora de escopo (não incluir agora)

- Reordenar por "mais recente aberta" (exigiria coluna `last_opened_at` + migração).
- Paginação/busca server-side em `GET /api/specs` (lista tende a ser pequena; filtro fica
  client-side, que é o que `cmdk` já faz nativamente via `CommandInput`).
- Multi-usuário / specs por usuário (a aplicação tem login único, sem modelo de usuário).

## Checklist de implementação

- [x] `deleteSpec` em `lib/specs-store.ts`
- [x] `app/api/specs/[slug]/route.ts` (`DELETE`)
- [x] `components/api-hub/spec-switcher.tsx`
- [x] Atalho global `⌘K`/`Ctrl+K` em `api-hub.tsx`
- [x] `header.tsx` aponta o botão para o switcher e remove o popover antigo
- [x] Testar manualmente no navegador: abrir com atalho, abrir pelo botão, buscar por título,
      trocar de spec, carregar URL nova pelo switcher, remover spec (inclusive a que está
      aberta), comportamento com lista vazia (primeira execução, nenhuma spec registrada ainda)

## Bug encontrado e corrigido durante a implementação

`components/ui/command.tsx#CommandDialog` não envolvia `{children}` em `<Command>` (a raiz do
cmdk que provê o contexto de busca/filtro). Qualquer `CommandDialog` com `CommandInput` dentro
quebrava em runtime (`Cannot read properties of undefined (reading 'subscribe')`) por faltar
esse contexto. Corrigido envolvendo `{children}` com `<Command>` dentro do `DialogContent`.

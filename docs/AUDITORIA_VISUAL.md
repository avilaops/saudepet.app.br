# Auditoria visual do frontend — simetria, harmonia e coerência

Gerada em 2026-08-28 a partir do código (`frontend/src`) e de screenshots reais
das rotas públicas (`node scripts/screenshots-telas.mjs`).

## 1. Como revisar todas as telas

```bash
# uma vez
npx playwright install chromium

# frontend rodando em http://localhost:5173 (npm run dev:frontend)
node scripts/screenshots-telas.mjs                              # públicas + auth
TUTOR_EMAIL=... TUTOR_SENHA=... ADMIN_EMAIL=... ADMIN_SENHA=... \
VET_EMAIL=... VET_SENHA=... PARCEIRO_EMAIL=... PARCEIRO_SENHA=... \
ID_ATENDIMENTO=... ID_PET=... \
node scripts/screenshots-telas.mjs --areas=public,tutor,veterinario,admin,parceiro,mercado
```

Saída: `output/screenshots/<area>/<mobile|tablet|desktop>/<rota>.png` e uma
folha de contato `output/screenshots/index.html` com as três larguras lado a
lado por rota — é aí que simetria e ritmo ficam óbvios.

## 2. Mapa de rotas (espelho de `App.tsx`)

| Área | Rotas | Shell / kit |
|---|---|---|
| Pública | `/`, `/faq`, `/contato`, `/blog`, `/blog/:slug`, `/privacidade`, `/tag/:id`, `/mercado`, `/mercado/:slug`, `/mercado/:slug/:produto` | `PublicLayout` + `public.css` (`.public-*`, `.lv-*`) |
| Auth | `/login`, `/cadastrar`, `/esqueci-senha`, `/redefinir-senha`, `/verificar-email`, `/onboarding/tutor`, `/f/:id` | nenhum kit (Tailwind solto, `gray-*`) |
| Tutor (25) | `/tutor/home`, `/pets`, `/solicitar`, `/acompanhar/:id`, `/historico`, `/atendimento/:id/prontuario`, `/lembretes`, `/agenda`, `/marcar-consulta`, `/avaliar/:id`, `/privacidade`, `/perfil`, `/mensagens`, `/notificacoes`, `/dispositivos`, `/chat/:id`, `/parceiros`, `/pet/:id/carteira`, `/planos`, `/mercado`, `/mercado/produto/:id`, `/mercado/carrinho`, `/mercado/pedidos`, `/mercado/pedidos/:id`, `/mercado/pedidos/:id/pagamento`, `/pagamento/:id` | `AppKit` + `TutorBottomNav` (max-w-md) |
| Veterinário (27) | `/veterinario/home` … `/veterinario/agenda` | `VetUI` + `vet.css` (max-w 32rem) |
| Admin (26) | `/admin/dashboard` … `/admin/dispositivos` | `AdminShell` + `AdminUI` (max-w-7xl) |
| Parceiro (3) | `/parceiro/painel`, `/financeiro`, `/perfil` | `ParceiroShell` (tema escuro) |
| Loja (4) | `/mercado/loja`, `/painel`, `/catalogo`, `/feed` | `container-app` (max-w-md) |

## 3. Diagnóstico — números do código

| Métrica | Valor | Leitura |
|---|---|---|
| Raios de borda | `xl` 481 · `2xl` 226 · `3xl` 118 · `lg` 64 · `md` 6 | 5 raios em uso; o kit define **2xl (cards) / xl (inputs)**. `3xl`+`lg` são desvio (84 dos 118 `3xl` estão no admin). |
| Sombras | `sm` 60 · `xl` 59 · `2xl` 35 · `md` 23 · `lg` 20 | O kit é "borda de um fio + `shadow-sm`". `xl/2xl` = 94 ocorrências, **71 no admin** (`AdminUI.Painel` usa `shadow-xl`). |
| Tamanhos de texto | 43 valores distintos; `text-[0.78rem]`, `[0.72rem]`, `[0.8rem]`, `[0.75rem]`, `[0.68rem]`, `[0.7rem]`, `[0.76rem]`, `[0.74rem]`… | Não há escala tipográfica. Sugerido: 10 / 11 / 12 / 13 / 14 / 16 / 20 / 24 / 32px. |
| Pesos | `bold` 550 · `semibold` 367 · `black` 110 · `extrabold` 95 · `medium` 76 | `black`/`extrabold` concentrados em admin (57) e parceiro (22); tutor e vet usam `semibold/bold`. |
| Cor de ação | tutor `primary` 204 · admin `teal-*` 52 / `primary` 0 · parceiro `teal-*` 73 · vet vars CSS | Mesma cor, três nomes. Admin e parceiro nunca usam o token `primary`. |
| `emerald-*` | admin 188 · tutor 44 · parceiro 24 · vet 0 | Verde "sucesso" ≈ teal da marca; concorre visualmente com a cor de ação. |
| Cinzas | `slate` 2324 · `gray` 57 | `gray` só nas telas de auth + `GoogleAuthButton` + `ReportarViolacaoModal`. |
| Fundo | `#f6f9f9` 57× inline · body `#f7fbfa` · vet `#f7f8fa` · admin `slate-50` | 4 off-whites diferentes. |
| Páginas sem kit | 39 de 100 | Todo o admin (17), auth (7), público (10), parceiro (3), `TutorPlanos`, `TutorPaymentCheckout`. |

## 4. Achados concretos (com evidência)

### A. Auth (login/cadastro/senha) — fora do sistema
1. **Faixa vertical no desktop** — `container-app` pinta `#f6f9f9` numa coluna
   `max-w-md` sobre o body `#f7fbfa`; em 1440px aparece uma faixa central mais
   clara ([Login.tsx:133](../frontend/src/pages/Login.tsx#L133), screenshot
   `public/desktop/login.png`). Corrigir: igualar body e `container-app`
   (um único token `--surface-app`).
2. **Raios desalinhados no mesmo formulário** — "Entrar"/"Criar conta" usam
   `.btn-primary` (`rounded-2xl`), o botão Google logo abaixo usa `rounded-xl`
   ([GoogleAuthButton.tsx:18](../frontend/src/components/GoogleAuthButton.tsx#L18)).
   Mesmo raio para botões empilhados.
3. **Paleta `gray-*`** só aqui; trocar por `slate-*` (7 arquivos).
4. **Logo em posições diferentes**: fora do card no login, dentro do card no
   cadastro; "Voltar para o login" solto acima do card só no cadastro.
5. **Onboarding** usa emoji 🏠 como ilustração; resto do produto usa ícones
   de traço (`Icon`/`DogAnimation`). Botão em `rounded-full` vs `2xl` do login.

### B. Admin — um segundo sistema visual
- `AdminUI.Painel` = `rounded-3xl shadow-xl p-6`; o app = `rounded-2xl border shadow-sm p-5`.
- Botão primário admin é `bg-slate-900`; no app é `bg-primary`.
- Títulos em `font-black uppercase tracking-wider`; app usa `Eyebrow` (`10px semibold tracking-[0.16em]`).
- 17 páginas não importam nem `AdminUI`: cada uma reimplementa card/botão.
  Ação: alinhar `AdminUI` aos tokens do `AppKit` (mudar 4 constantes muda 26 telas).

### C. Parceiro — tema escuro isolado
- Único shell escuro (`#0d141b`), `teal-400/500`, `font-black`. Ou vira
  padrão "console" compartilhado com o `ConsoleHeader` (cabeçalho escuro +
  corpo claro), ou o admin também vai para o escuro. Hoje é o único.

### D. Tutor / Vet — os mais coerentes, mas com duas implementações
- Bottom nav duplicada: `TutorBottomNav` (Tailwind, `max-w-md`, ícones sem
  fundo) e `.vet-bottom-nav` (CSS, `32rem`, `min-height 5rem`, `.61rem`).
  Larguras de app diferentes: tutor 28rem, vet 32rem → mesma pessoa com dois
  papéis vê o app "encolher".
- Tutor mercado (`Carrinho`, `Pagamento`, `Lembretes`, `PartnerDirectory`)
  usa fundo escuro `#121b24`/`#0e262b` — ilhas escuras dentro do app claro.
- `TutorPlanosAssinatura` e `TutorPaymentCheckout` são `max-w-5xl/2xl`
  centralizados, sem `TutorBottomNav` — saem do frame do app.

### E. Público — bom ritmo, dois sistemas de CSS
- `public.css` mistura `.public-*` e `.lv-*` ("modelo Lovable"), com raios
  `28/22/18/14/12/10px` e botões `999px`; tudo em CSS solto, sem tokens
  Tailwind. Home desktop está harmônica (grid 4/2/2 colunas, espaçamento
  90px); mobile mantém alinhamento.
- Pill "Entrar" laranja no header e CTA laranja: correto (laranja = conversão
  pública); dentro do app laranja não aparece — coerente.
- `/mercado` público mostra estado de erro quando a API está fora; o cartão
  de erro tem raio/padding próprios (não é o `Aviso` do app).

## 5. Checklist de coerência (para cada tela)

- [ ] Raio: card `2xl`, input/botão `xl` (ou `full` só para pills/avatares). Nada de `3xl`/`lg`/`md`.
- [ ] Elevação: borda `slate-200/80` + `shadow-sm`. `xl/2xl` só em overlays (modal, drawer).
- [ ] Padding de card: `p-5` (tutor/vet) — admin idem, não `p-6`.
- [ ] Espaçamento vertical entre blocos: `gap-3`/`gap-4`; entre seções `mt-6`.
- [ ] Tipografia: só a escala (10/11/12/13/14/16/20/24). Sem `text-[0.7x rem]`.
- [ ] Pesos: `semibold` para títulos, `medium` corpo, `bold` números. `black` só no display público.
- [ ] Cor de ação: **`primary`** (nunca `teal-600`, `emerald-*` ou hex). Sucesso = `emerald`, espera = `amber`, erro = `red`.
- [ ] Cinza: `slate-*` apenas. Fundo de página: um token único (`#f6f9f9`).
- [ ] Largura do app móvel: `max-w-md` em tutor, vet e loja (hoje vet = 32rem).
- [ ] Cabeçalho: `ConsoleHeader`/`PageHeader` do `AppKit`; título `1.35rem semibold tracking-tight`.
- [ ] Bottom nav: um componente só, 5 itens, `text-[11px]`, ativo `primary`.
- [ ] Botões empilhados no mesmo raio e mesma altura (`py-3.5`).
- [ ] Estado vazio/erro: `EmptyState`/`Aviso` do kit, não texto solto.
- [ ] Mobile 390 / tablet 820 / desktop 1440 sem scroll horizontal e com o mesmo alinhamento de margens (16px móvel, 24px tablet).

## 6. Aplicado em 2026-08-29 (itens 1–3)

- **Tokens de superfície**: `--surface-page/card/muted` em `index.css` +
  `surface.*` no `tailwind.config.js`. `body`, `.container-app`, `.vet-app`,
  `AdminShell` e 57 ocorrências de `bg-[#f6f9f9]` passaram a `bg-surface-page`.
  A faixa do login desktop sumiu (confirmado no diff).
- **AdminUI = AppKit**: `Painel` → `rounded-2xl border-slate-200/80 shadow-sm p-5`;
  botão primário `bg-primary`; título de painel = `Eyebrow`; inputs com foco
  `primary`. Nas 17 telas sem kit, cartões `rounded-3xl … shadow-xl` viraram
  `rounded-2xl … shadow-sm` **apenas quando não são modais** (linhas com
  `shadow-2xl`/`max-w-`/`max-h-` ficaram intactas — 21 modais preservados).
- **Auth**: `GoogleAuthButton` com o mesmo raio/altura do `.btn-primary`
  (`rounded-2xl py-3.5`), `gray-*` → `slate-*` em 7 arquivos, erro do login em
  `red-50` com ícone do kit (era `bg-red-500` com emoji), cartão do cadastro
  sem `shadow-xl`. Diff: login 1–4 %, cadastro 5–21 %, demais telas 0 %.

## 7. Ordem sugerida do que falta

1. Rodar as áreas logadas (tutor, vet, admin, parceiro, loja) e confirmar o admin no diff.
2. Um shell móvel só para tutor e vet (mesma largura, mesma bottom nav) — decisão: **claro**;
   o tema escuro fica restrito ao parceiro; Carrinho, Pagamento, Lembretes e
   Diretório de parceiros do tutor voltam ao sistema claro.
3. Escala tipográfica (12/14/16/18/20/24/30) substituindo os 43 tamanhos — só depois de shells e superfícies estáveis.

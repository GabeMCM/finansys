# Handoff — Correção do Frontend (Desktop + Mobile)

Guia para qualquer IA/dev continuar. Siga **na ordem**, um item por vez, e rode a verificação após cada um.

## Stack (não mudar)
- Deno + Vite + **Preact via `preact/compat`** (imports de `"react"` são aliasados). JSX aceita `class=` e `style="string"` — isso é intencional, NÃO converter.
- Valores financeiros são **centavos inteiros** (`number`). Nunca usar float para dinheiro.
- Desktop: `src/main.tsx` → `src/pages/*`. Mobile: `src/mobile/MobileShell.tsx` → `src/mobile/views/*` + `src/components/mobile/*`.
- Ícones: só nomes existentes em `src/components/Icon.tsx` (`paths`). Ícone inexistente = SVG vazio.
- A tela "Relatórios" foi **fundida no Início** (Dashboard / MobileHomeView). NÃO recriar `Relatorios.tsx`.

## Comandos de verificação (rodar SEMPRE)
```bash
deno check src/main.tsx 2>&1 | grep -c "ERROR]"     # meta: 0
deno task build                                     # deve terminar "built in"
DENO_TESTING=true deno test -A --unstable-kv        # 36 passed
# auditoria de ícones inexistentes (deve imprimir nada):
grep -oE '^\s+[a-zA-Z]+:' src/components/Icon.tsx | tr -d ' :' | sort -u > /tmp/i.txt; grep -rhoE 'Icon name="[a-zA-Z]+"' src | sed -E 's/.*"(.*)"/\1/' | sort -u | while read n; do grep -qx "$n" /tmp/i.txt || echo "MISSING $n"; done
```
Dev server: `deno task dev` (porta 5173). Teste visual mobile: DevTools → modo dispositivo 390px.

## ✅ Já corrigido (05/11)
- Crash: `MobileNovoLancamento` (faltava import `projecoes`) — tela de lançamento mobile abria em branco.
- Crash: `MobileMetas` (faltava import `NATURE_META`).
- Crash: `MobileCaixinhas` (`carteira.detalhesPorReserva` → `carteira.reservas`).
- Crash: `Dashboard` últimos lançamentos (`contaNome` → `contaMap`).
- `MobileInvestimentos`: campos errados (`bazinCeilingPrice→precoTetoBazin`, `priceToBook→pvp`, `trailingPE→pl`, `sector→besttCategory`, `quantidade→quantidadeTotal`).
- `MobileHomeView`: `totalGeral→totalSaldoAtual`, removidos campos inexistentes em lançamento.
- 8 ícones inexistentes adicionados ao `Icon.tsx` (arrowRight, arrowUpRight, chevronDown, edit, matrix, search, trendUp, warn).

## ⏳ Pendente — Fase 1: tipagem restante (fácil, mecânico)
| Arquivo:linha | Correção |
|---|---|
| `src/mobile/views/MobileInvestimentos.tsx:127` e `:598` | `x.pvp`/`x.pl` podem ser undefined → usar `(x.pvp ?? 0)` e `(x.pl ?? 0)` |
| `src/mobile/views/MobileAjustes.tsx:145` | remover a linha `cor: ...` (campo não existe em `Categoria`) |
| `src/mobile/views/MobileAjustes.tsx:844` | remover o ramo `b.tipo === "dinheiro" ? "Dinheiro" :` (tipo não existe) |
| `src/components/ModalReplicacao.tsx:14` e `MobileMetas.tsx:1439` | prop espera `string`, recebe `string \| null` → passar `valor ?? ""` |

## ⏳ Fase 2: paridade de funcionalidades Desktop × Mobile
Para CADA página desktop, listar botões/ações e confirmar que existem no mobile equivalente. Mapa:
| Desktop (`src/pages`) | Mobile |
|---|---|
| `Dashboard.tsx` | `components/mobile/MobileHomeView.tsx` |
| `Projecoes*.tsx` | `mobile/views/MobileMetas.tsx` |
| `Lancamentos.tsx` | `mobile/views/MobileRealizacoes*.tsx` + `MobileNovoLancamento.tsx` |
| `Reservas*.tsx` | `mobile/views/MobileCaixinhas.tsx` |
| `Investimentos*.tsx` | `mobile/views/MobileInvestimentos.tsx` |
| `Ajustes*.tsx` | `mobile/views/MobileAjustes.tsx` |

Método barato: `grep -n "onClick=" src/pages/X.tsx` vs o mobile; para cada ação ausente no mobile, adicionar botão que chama a MESMA função do repo (`src/data/repo.ts`). Checar no Lançamento: natureza (receber/pagar/aporte/saída/transferência), banco, forma de pagamento, reserva, editar, excluir, duplicar, quitar pendência.

## ⏳ Fase 3: visual (checklist por tela, 390px e 1280px)
- Nada estoura horizontalmente (`overflow-x`); textos longos com `text-overflow:ellipsis`.
- Bottom nav mobile (6 itens) não cobre conteúdo: container precisa `padding-bottom` ≥ altura da nav + `env(safe-area-inset-bottom)`.
- Modais: rolam internamente em telas baixas (`max-height:90vh; overflow:auto`).
- Tema claro e escuro legíveis (usar variáveis `var(--text)`, `var(--surface)` etc., nunca cores fixas).
- Console do navegador sem erros vermelhos ao navegar por todas as abas.

## Regras de commit
Um commit por fase: `git add -A && git commit -m "fix(front): fase N ..." && git push origin main`.

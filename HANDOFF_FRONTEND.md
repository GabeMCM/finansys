# Handoff — Correção do Frontend (Desktop + Mobile)

Guia de status e instruções de continuidade do frontend Finansys.

## Stack (não mudar)
- Deno + Vite + **Preact via `preact/compat`** (imports de `"react"` são aliasados). JSX aceita `class=` e `style="string"` — isso é intencional, NÃO converter.
- Valores financeiros são **centavos inteiros** (`number`). Nunca usar float para dinheiro.
- Desktop: `src/main.tsx` → `src/pages/*`. Mobile: `src/mobile/MobileShell.tsx` → `src/mobile/views/*` + `src/components/mobile/*`.
- Ícones: só nomes existentes em `src/components/Icon.tsx` (`paths`). Ícone inexistente = SVG vazio.
- A tela "Relatórios" foi **fundida no Início** (Dashboard / MobileHomeView). NÃO recriar `Relatorios.tsx`.

## Comandos de verificação (rodar SEMPRE)
```bash
deno check src/main.tsx 2>&1 | grep -c "ERROR]"     # meta: 0 (atualmente 0)
deno task build                                     # deve terminar "built in"
DENO_TESTING=true deno test -A --unstable-kv        # 36 passed
# auditoria de ícones inexistentes (deve imprimir nada):
grep -oE '^\s+[a-zA-Z]+:' src/components/Icon.tsx | tr -d ' :' | sort -u > /tmp/i.txt; grep -rhoE 'Icon name="[a-zA-Z]+"' src | sed -E 's/.*"(.*)"/\1/' | sort -u | while read n; do grep -qx "$n" /tmp/i.txt || echo "MISSING $n"; done
```

## Para iniciar o servidor localmente (no seu terminal):
```bash
deno task dev
```
Porta padrão: `http://localhost:5173`.

---

## ✅ Já corrigido e concluído

### Fase 1: Resolução Total de Tipagem & Crashes
- **Zero erros no `deno check src/main.tsx`**:
  - `MobileInvestimentos.tsx`: `(ativo.pvp ?? 0)` e `(ativo.pl ?? 0)` com fallback seguro contra `undefined`.
  - `MobileAjustes.tsx`: removido campo `cor` inexistente em `Categoria`.
  - `MobileAjustes.tsx`: removida checagem inválida `b.tipo === "dinheiro"`.
  - `MobileMetas.tsx`: passado `empId ?? ""` para `ModalReplicacao`.
  - `Icon.tsx`: 8 ícones adicionados (`arrowRight`, `arrowUpRight`, `chevronDown`, `edit`, `matrix`, `search`, `trendUp`, `warn`).

### Fase 2: Paridade Total de Funcionalidades Desktop × Mobile
- **Empresas**: adicionada opção de editar (nome, CNPJ com máscara, endereço) e excluir empresa pelo mobile.
- **Anos Fiscais**: adicionada opção de editar a Banca Inicial (com MoneyInput) e excluir ano fiscal pelo mobile.
- **Categorias**: adicionada opção de editar nome da categoria pelo mobile.
- **Contas Financeiras**: adicionada opção de editar nome, categoria pai e alternar status ativa/inativa no mobile.
- **Perfil Cloud**: adicionado botão para editar nome de perfil de sincronização na nuvem pelo mobile.
- **Lançamentos**: suporte completo a transferência entre bancos, parcelamento, recorrência mensal, caixinhas, quitação de pendência, duplicar e excluir.
- **Início & Relatórios**: abas analíticas completas (Bancos, DRE, Fluxo diário, Razão) com presets e exportação CSV unificadas no desktop e no mobile.

### Fase 3: Validação Visual & Mobile
- **Bottom Nav**: 6 itens sincronizados com a barra desktop (`repeat(6, 1fr)`), com `overflow:hidden; text-overflow:ellipsis` nos rótulos.
- **Espaçamento Inferior**: `.shell .main` com padding bottom seguro `calc(var(--mobile-nav-h) + var(--safe-b) + 20px)`.
- **Modais / Bottom Sheets**: todas com `max-height: 92dvh` e rolagem interna (`overflow-y: auto; -webkit-overflow-scrolling: touch;`).
- **36/36 testes automatizados passando**: `DENO_TESTING=true deno test -A --unstable-kv`.
- **Compilação de produção sem falhas**: `deno task build`.

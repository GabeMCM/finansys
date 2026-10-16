# Plano de Reformulação — Modais de Lançamento (Real) e Projeção

> **Status:** aguardando aprovação. Nenhuma linha de código foi alterada ainda.
> **Escopo:** `Novo/Editar Lançamento Real` ([Lancamentos.tsx](../src/pages/Lancamentos.tsx)) e `Nova Projeção` ([Projecoes.tsx](../src/pages/Projecoes.tsx)).
> **Ponto de restauração:** commit `942e661` (estado atual da `main`).

---

## 1. Diagnóstico do estado atual

### 1.1 Modal de Lançamento Real (`Lancamentos.tsx`, linhas ~557–1227, ~670 linhas de JSX)

| # | Problema | Impacto na UX |
|---|----------|---------------|
| 1 | **O campo de valor fica no fim do card 2**, depois do alerta de teto, da sugestão de vínculo e da calculadora de fórmula. | O dado mais importante (quanto?) é o último que o usuário encontra. |
| 2 | **4 cards empilhados com o mesmo peso visual** (Classificação, Valor/Automações, Repetição, Detalhes). | Não fica claro o que é obrigatório e o que é opcional. |
| 3 | A **calculadora de vínculo/fórmula (~300 linhas)** abre *dentro* do card de valor e o empurra para baixo. | O formulário "pula" e o usuário perde o contexto. |
| 4 | **Alerta de teto e sugestão de vínculo** aparecem antes de o usuário digitar qualquer coisa. | Ruído visual; a informação chega fora de hora. |
| 5 | **4 abas de natureza + 3 abas de repetição + 2 seletores** em um modal de 520px. | Visual "amontoado", sobretudo no desktop, onde sobra espaço lateral. |
| 6 | Criar categoria/conta abre **outro modal por cima** (modal empilhado). | Troca de contexto e perda de foco. |
| 7 | **Nenhum resumo** antes de salvar (ex.: "12 parcelas de R$ 100 de mar/26 a fev/27"). | O usuário salva sem conferir o que vai ser gerado. |
| 8 | Estilos **todos inline** e repetidos (`background:var(--surface-soft);padding:...`). | Difícil de manter; visual inconsistente. |

### 1.2 Modal de Nova Projeção (`Projecoes.tsx`, linhas ~1297–2029, ~730 linhas de JSX)

| # | Problema | Impacto na UX |
|---|----------|---------------|
| 1 | **5 abas de "modo de valor"** (Fixo 12x, Parcelado, Mês Pontual, Grade Mês a Mês, Vinculado) numa linha só. | As abas quebram de linha e confundem; "Vinculado" mistura *origem do valor* com *distribuição no tempo*. |
| 2 | **Categoria e conta usam um padrão diferente** do modal de lançamento (alternância inline "Nova/Existente" em vez do select com ação). | Os dois modais não parecem do mesmo sistema. |
| 3 | O **editor de vínculo/fórmula é uma cópia** com divergências do editor do modal de lançamento. | Comportamento inconsistente e bugs em dobro. |
| 4 | Prévia dos 12 meses **só existe no modo Vinculado**. | Nos modos Fixo, Parcelado e Grade o usuário não vê o resultado final. |
| 5 | O título muda com a natureza ("Nova Projeção Financeira (A Pagar)"), mas a natureza é escolhida *dentro* do modal. | Redundância visual. |

### 1.3 Problemas comuns

- Modal limitado a **520px** também no desktop: tudo fica empilhado numa coluna estreita.
- **Não existe campo monetário com máscara**: `type="number"` aceita "e", não formata em R$ e se comporta mal no mobile.
- Não há atalhos (salvar com `Ctrl+Enter`, "Salvar e criar outro").

---

## 2. Princípios da nova experiência

1. **Primeiro o essencial:** *O quê? → Quanto? → Quando?* Todo o resto é opcional e fica recolhido.
2. **Separar decisões independentes.** Hoje "Vinculado" convive com "Parcelado" como se fossem alternativas. Na prática são dois eixos:
   - **Origem do valor:** `Manual` ou `Calculado` (vínculo % / valor fixo / fórmula).
   - **Distribuição no tempo:** `Único`, `Parcelado`, `Recorrente` e, só na projeção, `Mês a mês`.
3. **Mostrar o resultado antes de salvar:** um painel de **Resumo** em tempo real, presente nos dois modais.
4. **Mesma linguagem visual e os mesmos componentes** nos dois modais.
5. **Desktop aproveita a largura; mobile continua em tela cheia** (subtela), com rodapé fixo.

---

## 3. Nova estrutura (wireframes)

### 3.1 Desktop (≥ 900px): modal largo (~920px) em duas colunas

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Novo lançamento real                                               [x]  │
├───────────────────────────────────────────────┬──────────────────────────┤
│ [ A Receber | A Pagar | Aporte | Saída ]      │  RESUMO                  │
│                                               │  ───────────────────     │
│ ① O QUÊ?                                      │  A Pagar · Aluguel       │
│   Conta  [ 🔍 Imóveis › Aluguel          ▾ ]  │  Imóveis                 │
│          (busca por categoria e conta,        │                          │
│           com "+ Criar" no próprio picker)    │  R$ 2.400,00             │
│                                               │  12x de R$ 200,00        │
│ ② QUANTO E QUANDO?                            │  mar/2026 → fev/2027     │
│   ┌─────────────────────────┐  Data           │                          │
│   │ R$  2.400,00            │  [16/10/2026]   │  ⚠ Teto de out: 92%      │
│   └─────────────────────────┘  [Hoje][Ontem]  │  (projetado R$ 2.600)    │
│   Valor: (•) Manual  ( ) Calculado fx/🔗      │                          │
│   💡 Sugestão do vínculo: R$ 2.400 [Aplicar]  │  Parcela 1: R$ 200,00    │
│                                               │  Parcela 2: R$ 200,00    │
│ ③ REPETIÇÃO                                   │  … (lista compacta)      │
│   [ Único | Parcelado | Recorrente ]          │                          │
│   Nº parcelas [12]  (•) Dividir total         │                          │
│                                               │                          │
│ ▸ Detalhes (descrição, observação)            │                          │
├───────────────────────────────────────────────┴──────────────────────────┤
│ Ctrl+Enter para salvar     [Cancelar] [Salvar e criar outro] [Salvar]   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Mobile (< 640px): subtela em tela cheia, uma coluna

```
┌─────────────────────────────┐
│ ←  Novo lançamento          │
├─────────────────────────────┤
│ [Receber][Pagar][Ap.][Saída]│ ← segmentado com rolagem horizontal
│ Conta [Imóveis › Aluguel ▾] │
│ ┌─────────────────────────┐ │
│ │     R$ 2.400,00         │ │ ← valor em destaque, teclado numérico
│ └─────────────────────────┘ │
│ Data [16/10] [Hoje][Ontem]  │
│ Repetição [Único|Parc.|Rec.]│
│ ▸ Cálculo automático        │
│ ▸ Detalhes                  │
├─────────────────────────────┤
│ 12x R$ 200 · mar→fev    [▴] │ ← resumo compacto (expande)
│ [ Salvar lançamento       ] │
└─────────────────────────────┘
```

### 3.3 Projeção: mesma estrutura, com estas diferenças

- **② Quanto e quando?** passa a ser **② Valor e distribuição**:
  - **Origem do valor:** `Manual` | `Calculado (vínculo/fórmula)`.
  - **Distribuição:** `Todos os meses (12x)` | `Parcelado` | `Mês pontual` | `Mês a mês (grade)`.
  - Com `Calculado`, a distribuição é sempre mensal (12 meses calculados); as demais opções ficam desabilitadas, com uma explicação.
- **Resumo à direita:** sempre mostra a **prévia dos 12 meses** (mini-grade com os valores), em qualquer modo, mais o total anual e, no parcelado, os anos seguintes atingidos.
- **"Salvar regra na conta"** fica dentro do bloco Calculado, sempre visível quando ele está ativo.

---

## 4. Componentes novos (reutilizados nos dois modais)

Todos em `src/components/lancamento/`:

| Componente | Responsabilidade | Substitui |
|------------|------------------|-----------|
| `MoneyInput.tsx` | Campo monetário com máscara BRL (o usuário digita só números: `240000` → `R$ 2.400,00`), `inputMode="decimal"`, variante `hero` (grande) e `compact`. Trabalha em **centavos**. | Todos os `<input type="number" step="0.01">` de valor dos dois modais |
| `NaturezaSegmented.tsx` | Controle segmentado das 4 naturezas, com cor por natureza e rolagem horizontal no mobile. No modo edição aparece como badge somente leitura. | Abas de natureza duplicadas |
| `ContaPicker.tsx` | Um único picker com busca, agrupado por categoria (`Categoria › Conta`). Rodapé com "+ Nova conta" e "+ Nova categoria" abrindo um **mini-formulário inline dentro do próprio dropdown**, sem modal empilhado. | Dois `CustomSelect` (categoria + conta), os 2 modais rápidos de criação e a alternância "Nova/Existente" da projeção |
| `RepeticaoSelector.tsx` | Segmentado de repetição e campos condicionais (nº de parcelas, dividir/por parcela, mês inicial). Recebe `modo: "real" \| "projecao"`. | Card 3 do lançamento e as abas Parcelado/Fixo da projeção |
| `ValorCalculadoEditor.tsx` | Editor único de vínculo (% ou fixo, conta ou categoria) **e** fórmula (variáveis, operadores rápidos, validação ao vivo). Recebe uma função `avaliar(mes)` para servir tanto a lançamentos reais quanto a projeções. | As ~300 linhas duplicadas e divergentes em cada modal |
| `ResumoPainel.tsx` | Painel de resumo: conta, valor, distribuição (lista de parcelas ou mini-grade de 12 meses), alerta de teto e total. Lateral fixa no desktop; barra recolhível no mobile. | Prévias espalhadas ("💡 Serão geradas…", "📊 Prévia…") e o alerta de teto do topo |
| `FormSection.tsx` | Seção numerada com título, e `Disclosure` (seção recolhível) para "Detalhes" e "Cálculo automático". | Divs com estilo inline repetido |

### 4.1 Alteração no `Modal.tsx` (compatível com o uso atual)

- Nova prop `size?: "md" | "lg"` (padrão `md` = 520px, como hoje; `lg` = 920px).
- Nova prop `aside?: ComponentChildren`: renderiza a coluna lateral no desktop.
- Nova prop opcional `onSubmitShortcut`: atalho `Ctrl/Cmd+Enter`.
- Os demais modais do sistema **não mudam**, porque as props novas são opcionais.

### 4.2 CSS (`components.css`)

Classes novas, que substituem os estilos inline:
`.modal--lg`, `.modal__layout` (grid 1fr/300px), `.modal__aside`, `.form-section`, `.form-section__title`, `.segmented`, `.segmented__item`, `.money-input`, `.money-input--hero`, `.disclosure`, `.summary`, `.summary__row`, `.summary-bar` (mobile), `.picker`, `.picker__group`, `.picker__create`.

---

## 5. Mudanças de comportamento (UX)

| Antes | Depois |
|-------|--------|
| Valor no fim do card 2 | Valor em destaque logo após a conta, com **foco automático** |
| Alerta de teto no topo, antes da digitação | Alerta de teto no **Resumo**, atualizado conforme o valor digitado |
| Sugestão de vínculo como banner grande | Linha discreta abaixo do valor: "💡 Sugestão: R$ X [Aplicar]" |
| Calculadora abre e empurra o formulário | Escolha `Manual / Calculado`; o editor abre no lugar do campo de valor, e o resultado preenche o valor |
| Modal empilhado para criar categoria/conta | Criação inline no próprio picker |
| `type="number"` | Máscara BRL; só números |
| Sem resumo | Resumo em tempo real e lista das parcelas/meses |
| Só "Salvar" | "Salvar" e **"Salvar e criar outro"** (mantém natureza, conta e data) |
| Data apenas com input | Input e atalhos **Hoje / Ontem / Início do mês** |
| Descrição/obs sempre visíveis | Seção **Detalhes** recolhida (abre sozinha na edição se já tiver conteúdo) |
| Obs só aparece para Aporte/Saída | Obs disponível para todas as naturezas, dentro de Detalhes |
| Edição mostra tudo | Edição esconde Repetição; natureza vira badge; título "Editar lançamento" |

---

## 6. O que **não** muda (garantias)

- **Regras de negócio e persistência:** `salvarLancamento`, `salvarNovaProjecao`, geração de parcelas e recorrências, criação de anos seguintes, `recalcularDependentes`, vínculos automáticos gerados após o lançamento.
- **Modelo de dados:** `types.ts`, `repo.ts` e `db.ts` não mudam. Nenhuma migração.
- **Fórmulas:** `formula.ts` e `calc.ts` intactos; os 18 testes continuam valendo.
- **Pontos de abertura dos modais:** botão "Novo lançamento", FAB mobile, `#/lancamentos/novo`, botões "+" das categorias, atalho de parcelamento por conta (`abrirNovaProjecao(cat, nat, conta, "parcelado")`).
- **Demais modais** (observação, editar conta, replicação, auth, confirmação).

---

## 7. Arquivos afetados

| Arquivo | Tipo | Alteração |
|---------|------|-----------|
| `src/components/Modal.tsx` | Editar | Props `size`, `aside`, `onSubmitShortcut` |
| `src/components/lancamento/MoneyInput.tsx` | Novo | Campo monetário com máscara |
| `src/components/lancamento/NaturezaSegmented.tsx` | Novo | Seletor de natureza |
| `src/components/lancamento/ContaPicker.tsx` | Novo | Picker categoria›conta com criação inline |
| `src/components/lancamento/RepeticaoSelector.tsx` | Novo | Repetição/parcelamento |
| `src/components/lancamento/ValorCalculadoEditor.tsx` | Novo | Editor unificado de vínculo/fórmula |
| `src/components/lancamento/ResumoPainel.tsx` | Novo | Resumo lateral / barra mobile |
| `src/components/lancamento/FormSection.tsx` | Novo | Seção e disclosure |
| `src/lib/format.ts` | Editar | Helpers `parseCentavosBRL` / `formatInputBRL` |
| `src/lib/format.test.ts` | Editar | Testes da máscara monetária |
| `src/pages/Lancamentos.tsx` | Editar | Novo JSX do modal; remove os 2 modais rápidos e a calculadora inline duplicada; estados reorganizados; lógica de salvar mantida |
| `src/pages/Projecoes.tsx` | Editar | Novo JSX do modal; `modoValor` dividido em `origemValor` + `distribuicao` (mapeados para a lógica de salvar existente); editor duplicado removido |
| `src/styles/components.css` | Editar | Classes novas da seção 4.2 |

**Estimativa:** cerca de 1.400 linhas de JSX duplicado ou inline nos dois modais passam para cerca de 700 linhas, entre componentes compartilhados e modais mais enxutos.

---

## 8. Execução em fases (um commit por fase)

| Fase | Entrega | Verificação |
|------|---------|-------------|
| **1. Fundação** | `Modal` (size/aside/atalho), CSS base, `MoneyInput` + helpers e testes, `FormSection`, `NaturezaSegmented` | `deno test`, `deno task build`, demais modais sem mudança visual |
| **2. Componentes de domínio** | `ContaPicker`, `RepeticaoSelector`, `ValorCalculadoEditor`, `ResumoPainel` | Build; revisão dos componentes isolados |
| **3. Modal de Lançamento Real** | Novo modal em `Lancamentos.tsx` (criar e editar) | Roteiro manual da seção 9 (itens L1–L10) |
| **4. Modal de Projeção** | Novo modal em `Projecoes.tsx` | Roteiro manual da seção 9 (itens P1–P8) |
| **5. Acabamento** | Responsividade, foco/teclado, acessibilidade (labels, `aria-*`), limpeza de código morto | Teste desktop, mobile (≤ 380px) e temas claro/escuro |

Cada fase vai para a `main` com build e testes verdes. Se algo der errado, o `git revert` da fase devolve o estado anterior.

---

## 9. Roteiro de validação manual

**Lançamento Real**
- L1. Novo lançamento único (cada natureza) → salvo com valor, data e conta corretos.
- L2. Parcelado 12x "dividir total" com centavos (ex.: R$ 100,00 / 3) → resto na 1ª parcela.
- L3. Parcelado que ultrapassa dezembro → cria o ano seguinte.
- L4. Recorrente 6 meses → 6 lançamentos com o mesmo valor.
- L5. Conta com vínculo → sugestão aparece e "Aplicar" preenche o valor.
- L6. Valor calculado por fórmula → resultado preenche o valor e salva.
- L7. Alerta de teto muda conforme o valor digitado.
- L8. Criar categoria e conta inline → aparece selecionada e o lançamento salva nela.
- L9. Editar lançamento existente → campos preenchidos, sem bloco de repetição.
- L10. "Salvar e criar outro" → mantém natureza, conta e data e limpa o valor.

**Projeção**
- P1. Todos os meses 12x → 12 projeções iguais.
- P2. Parcelado (a partir do botão da conta) → conta pré-selecionada e badges `n/N` na grade.
- P3. Mês pontual → só o mês escolhido recebe valor.
- P4. Mês a mês → valores individuais salvos.
- P5. Calculado por vínculo % → prévia de 12 meses = valores salvos.
- P6. Calculado por fórmula → prévia = valores salvos; "salvar regra" grava `conta.vinculo`.
- P7. Nova categoria e nova conta inline.
- P8. Resumo mostra a prévia correta em todos os modos.

---

## 10. Decisões em aberto (preciso da sua confirmação)

1. **Modal largo de duas colunas no desktop (≈920px), com resumo lateral.** Ou prefere manter coluna única, mais larga (≈640px), com o resumo no rodapé?
2. **Máscara monetária "só números"** (digitar `2400` → R$ 24,00, estilo app de banco), **ou** digitação livre com vírgula (`2400` → R$ 2.400,00, formatando ao sair do campo)?
3. **"Salvar e criar outro"**: incluir?
4. **Criação de categoria/conta inline no picker** (sem modal empilhado): pode substituir os modais rápidos atuais?
5. **Observação para todas as naturezas** (hoje só Aporte/Saída): liberar?

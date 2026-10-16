# Plano de Reformulação da Tela de Lançamentos & Gestão de Pendências

> **Status:** Proposta detalhada para alinhamento e aprovação antes da execução.  
> **Documento:** `docs/PLANO_REFORMULACAO_TELA_LANCAMENTOS.md`  
> **Data:** Outubro de 2026

---

## 1. Diagnóstico da Tela Atual e Dores do Usuário

### 1.1 O que causa confusão no visual atual
1. **Excesso de barras de filtro desconexas no topo:**
   - Uma barra de rolagem horizontal com chips de meses (`.hscroll`).
   - Logo abaixo, outra barra de tabs de natureza (`Todas`, `Pagar`, `Receber`, `Aporte`, `Saída`).
   - Logo abaixo, 4 cards de estatísticas (`grid--stats`).
   - Logo abaixo, uma barra de busca misturada com contadores de texto.
   - **Resultado:** O usuário precisa rolar a tela antes de conseguir ver qualquer lançamento real. O topo fica poluído e visualmente carregado.
2. **Lista de lançamentos volumosa e sem hierarquia temporal:**
   - Os lançamentos aparecem em um fluxo contínuo sem agrupamento por data (dia/semana).
   - Títulos, descrições, categorias e múltiplos badges (`fx`, `recorrência`, `parcelas`) competem pelo mesmo espaço.
3. **Desconexão total entre o Planejado (Projeção) e o Realizado (Lançamentos):**
   - Na hora de operar o dia a dia, o usuário não sabe:
     - *"O que eu projetei para pagar este mês que ainda não paguei?"*
     - *"Tem alguma conta de mês passado vencida/esquecida?"*
   - O usuário era obrigado a abrir a tela de Projeções em outra aba para conferir mentalmente se lançou tudo.
4. **A confusão do campo "Sugestão da regra":**
   - Ao lançar uma conta com vínculo ou fórmula, a tela sugeria um valor que não batia com a projeção.
   - **Motivo técnico:** a "Sugestão da regra" calculava em cima dos lançamentos reais (`ls`) já cadastrados no mês. Se a conta de origem ainda não tivesse sido lançada no real neste mês, a fórmula resultava em `R$ 0,00` ou valor parcial, gerando contradição direta com o valor projetado que acabava de ser pré-preenchido.

---

## 2. Objetivos da Reformulação

1. **Clarificação da "Sugestão da regra":**
   - Nunca sugerir `R$ 0,00` ou valores contraditórios sem explicação.
   - Indicar com clareza a origem do cálculo: valor projetado (planejamento) vs. apuração sobre lançamentos reais já existentes.
2. **Central de Pendências (Card de Contas Projetadas Não Lançadas):**
   - Exibir no início da tela um painel inteligente destacando contas que foram projetadas mas ainda não foram lançadas no real no mês selecionado.
   - Identificar com destaque visual vermelho/alerta contas **vencidas/atrasadas** (meses anteriores não lançados ou vencimentos passados).
   - Botão **"Lançar"** direto na pendência, abrindo o modal com conta, valor e data já prontos para confirmação imediata.
3. **Ação "Ignorar esse mês" com Decisão Estratégica:**
   - Opção para ignorar uma conta projetada naquele mês.
   - Modal de confirmação inteligente com 2 caminhos:
     - **Somar ao próximo mês:** acumula o valor não realizado na projeção do mês seguinte e zera o mês atual.
     - **Apenas ignorar:** desconsidera a projeção daquele mês sem afetar os meses futuros.
4. **Reformulação Visual e Experiência do Usuário (UX):**
   - Redesenho do topo da página com barra de navegação temporal integrada (mês, alertas de pendências e botão de ação primária).
   - Card resumo unificado e clean (Realizado vs. Pendente vs. Projetado).
   - Lista/tabela de lançamentos organizada por agrupamento cronológico de datas (Hoje, Ontem, Esta semana, Anteriores).

---

## 3. Especificação Detalhada das Melhorias

### 3.1 Correção e Clarificação da "Sugestão da Regra" no Modal

#### O Problema:
Quando uma conta possui regra de vínculo (ex: Pensão = 30% do Salário) ou fórmula `fx`:
- A projeção calculou `30% de R$ 5.000,00 (projetado) = R$ 1.500,00`.
- Ao abrir o lançamento real, o campo de valor agora recebe `R$ 1.500,00`.
- Mas o banner "Sugestão da regra" calculava `calcularFormulaLancamentos` / `calcularBaseLancamentos` usando os lançamentos reais (`ls`). Se o salário real ainda não havia sido lançado neste mês, o banner sugeria `30% de R$ 0,00 = R$ 0,00` com botão `[Aplicar]`. O usuário ficava confuso com dois números diferentes.

#### A Solução:
- Se a base real for zero (nenhum lançamento da conta de origem no mês ainda), o banner de sugestão **não deve ser exibido** (evita poluição e confusão).
- Se já houver lançamento real da conta de origem no mês E o valor for diferente da projeção:
  - Exibir com rótulo transparente:
    `💡 Recalcular pelo Real: R$ 1.650,00 (30% dos R$ 5.500,00 lançados em Salário neste mês) [Aplicar]`
  - O usuário entende imediatamente: *"Ah, na projeção era R$ 1.500,00 porque eu planejava R$ 5.000,00, mas como já lancei o Salário real de R$ 5.500,00, a regra me sugere R$ 1.650,00"*.

---

### 3.2 Central de Contas Projetadas & Pendências

#### Como identificar:
Para cada conta com projeção (`p.valor > 0`):
1. Verificamos se há lançamentos reais daquela conta no mês `p.mes`.
2. Se `totalRealizadoNoMes == 0`:
   - A conta está **Pendente de Lançamento**.
   - Se `p.mes < mesAtual` no ano corrente (ou ano passado): está **Vencida / Atrasada** (`badge` vermelho `Vencida`).
   - Se `p.mes === mesAtual`: está **Pendente no Mês Atual** (`badge` âmbar `A Realizar`).
3. Se `0 < totalRealizadoNoMes < p.valor`:
   - Está **Parcialmente Realizada** (ex.: projetou R$ 1.000,00, lançou R$ 600,00; restam R$ 400,00 pendentes).

#### O Card no Início da Tela:
Posicionado estrategicamente logo abaixo dos filtros de período:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ PENDÊNCIAS DE OUTUBRO                                3 pendentes · R$ 2.450,00 │
├─────────────────────────────────────────────────────────────────────────────┤
│ [!] Aluguel Escritório · R$ 2.000,00       [Vencida há 5 dias]  [Lançar] [▾] │
│ [ ] Conta de Luz · R$ 250,00               [A vencer]           [Lançar] [▾] │
│ [ ] Internet Fibra · R$ 200,00             [A vencer]           [Lançar] [▾] │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Cada linha de pendência oferece:
  - **Botão `[Lançar]`:** abre o modal de Novo Lançamento já preenchido com a conta, o mês, o valor projetado e a data sugerida. O usuário só revisa e salva.
  - **Menu/Botão `[Ignorar] / [Opções]`:** abre o modal de "Ignorar este mês".

---

### 3.3 Fluxo de "Ignorar esse mês"

Ao clicar em "Ignorar" numa conta pendente, abre-se um modal dialog claro e objetivo:

```
┌────────────────────────────────────────────────────────────────┐
│ Ignorar Projeção: Conta de Luz (R$ 250,00)                     │
├────────────────────────────────────────────────────────────────┤
│ Esta conta foi projetada para Outubro/2026, mas não foi        │
│ realizada no real. Como deseja proceder?                       │
│                                                                │
│ ( ) Somar ao próximo mês (Novembro/2026)                       │
│     O valor de R$ 250,00 será somado à projeção de Novembro,   │
│     e Outubro será zerado. Ideal para contas acumuladas.       │
│                                                                │
│ ( ) Apenas ignorar este mês                                    │
│     A projeção de Outubro será zerada sem alterar os próximos  │
│     meses. Ideal para despesas que foram canceladas ou isentas.│
├────────────────────────────────────────────────────────────────┤
│                              [ Cancelar ]   [ Confirmar Ação ] │
└────────────────────────────────────────────────────────────────┘
```

#### Efeito no Banco de Dados:
- **Se "Somar ao próximo mês":**
  1. Localiza a projeção de `mes + 1` para aquela conta.
  2. Atualiza `projecoes.set(anoId, contaId, mes + 1, projecaoProxMes.valor + valorAtual)`.
  3. Atualiza `projecoes.set(anoId, contaId, mes, 0)`.
  4. Mostra toast de sucesso: *"R$ 250,00 transferidos para a projeção de Novembro!"*.
- **Se "Apenas ignorar":**
  1. Atualiza `projecoes.set(anoId, contaId, mes, 0)`.
  2. Mostra toast de sucesso: *"Projeção de Outubro desconsiderada."*.

---

### 3.4 Reformulação Estrutural da Tela `Lancamentos.tsx`

#### Layout Proposto:
1. **Cabeçalho Unificado:**
   - Título e Seletor do Ano Fiscal com indicador de conexão/sincronização.
   - Botão de ação primária em destaque: `+ Novo Lançamento` com atalho de teclado `[N]`.
2. **Barra de Controle Temporal Compacta:**
   - Seletor de meses em formato de linha do tempo moderna, com marcadores pontuais (dots) indicando meses com contas pendentes ou atrasadas.
   - Opção "Ano Todo" integrada.
3. **Painel de Controle Financeiro do Período (Cockpit):**
   - 3 blocos informativos em cards modernos:
     - **Realizado no Mês:** Total de Entradas vs. Saídas e Resultado Líquido.
     - **Status de Conciliação:** % das contas projetadas que já foram lançadas.
     - **Alertas / Pendências:** quantidade de itens aguardando lançamento e atrasados.
4. **Card de Pendências (quando houver itens pendentes no mês):**
   - Destacado visualmente com tons suaves de atenção (`--warning`/`--surface-soft`), recolhível caso o usuário queira focar apenas no histórico.
5. **Histórico de Lançamentos Reais:**
   - Barra de ferramentas com busca rápida por favorecido/descrição/conta, filtro rápido de natureza (chips discretos) e ordenação.
   - Itens agrupados por blocos de data (`Hoje`, `Ontem`, `12 de Outubro`, etc.) facilitando a leitura diária de extrato.
   - Cada linha possui ícone da natureza, conta/categoria, descrição/obs, valor com formatação e ações rápidas (editar, excluir).

---

## 4. Mockup Visual da Nova Tela de Lançamentos

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Lançamentos Reais                                              [ + Novo Lançamento ]   │
│ Acompanhamento e conciliação dos valores realizados em 2026                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [Ano Todo] [Jan] [Fev] [Mar] [Abr] [Mai] [Jun] [Jul] [Ago] [Set] [Out •] [Nov] [Dez]    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────────┐ │
│ │ Entradas Realizadas      │ │ Saídas Realizadas        │ │ Saldo Líquido do Mês   │ │
│ │ R$ 12.500,00             │ │ R$ 8.200,00              │ │ + R$ 4.300,00          │ │
│ │ Meta: R$ 12.000,00 (104%)│ │ Teto: R$ 9.000,00 (91%)  │ │ 8 de 10 contas lançadas│ │
│ └──────────────────────────┘ └──────────────────────────┘ └──────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠️ Contas Projetadas Pendentes de Realização (2 pendentes · R$ 450,00)             [▴] │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 🔴 Aluguel Escritório    Despesa · Vencimento 10/10       R$ 2.000,00  [Lançar] [▾]│ │
│ │ 🟡 Internet Fibra        Despesa · Vencimento 20/10       R$   200,00  [Lançar] [▾]│ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Histórico de Lançamentos                                                               │
│ [ 🔍 Buscar lançamento ou conta... ]       [Todas] [Pagar] [Receber] [Aporte] [Saída]  │
│                                                                                        │
│  HOJE — 16/10/2026                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 🟢 Venda Balcão              Receber · Receitas             + R$ 1.200,00  [✎] [🗑]│  │
│  │    Vínculo: 10% s/ faturamento                                                   │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                        │
│  ONTEM — 15/10/2026                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 🔴 Energia Elétrica (Enel)   Pagar · Custos Fixos             - R$ 380,00  [✎] [🗑]│  │
│  │    NF 44321 · Obs: pago via PIX                                                  │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Roteiro de Implementação em Fases

| Fase | Descrição | Arquivos Envolvidos |
|---|---|---|
| **Fase 1** | Ajuste da "Sugestão da regra" no modal para não conflitar com a projeção | `src/pages/Lancamentos.tsx` |
| **Fase 2** | Cálculo e estado de pendências (não lançadas e atrasadas) por mês | `src/data/calc.ts`, `src/pages/Lancamentos.tsx` |
| **Fase 3** | Modal/Diálogo de "Ignorar este mês" (somar ao próximo mês vs. apenas ignorar) | `src/components/lancamento/ModalIgnorarProjecao.tsx` |
| **Fase 4** | Componente visual `CardPendencias` com ações de Lançar e Ignorar | `src/components/lancamento/CardPendencias.tsx` |
| **Fase 5** | Reformulação completa do layout de `Lancamentos.tsx` (cockpit, navegação de meses e extrato agrupado por data) | `src/pages/Lancamentos.tsx`, `src/styles/components.css` |
| **Fase 6** | Testes automatizados de cálculo e fluxo de rolagem de projeção | `src/data/calc.test.ts`, `src/lib/format.test.ts` |

---

## 6. Pontos para sua Validação

1. **Agrupamento de lançamentos:** Você prefere o extrato agrupado por data (estilo aplicativo de banco moderno com divisões `Hoje`, `Ontem`, `Data específica`) ou prefere manter tabela contínua com colunas?
2. **Critério de conta "Vencida / Atrasada":** Qualquer conta de meses anteriores que não foi lançada é considerada "Atrasada". No mês atual, se não houver dia específico configurado, você prefere considerar atrasada apenas quando o mês termina, ou após o dia 15/dia médio?
3. **Aprovação do plano:** Podemos seguir com a execução das fases conforme estruturado acima?

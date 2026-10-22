# Plano de Implementação: Investimentos & Reservas (Finansys)

Este documento especifica a arquitetura financeira, o modelo de dados, o motor de cálculo e a interface da nova página de **Investimentos & Reservas**, integrada com o fluxo de caixa operacional, projeções e relatórios.

---

## 1. Fundamentação Financeira

### 1.1. O Problema da Abordagem Anterior
No modelo original de 4 naturezas (`receber`, `pagar`, `aporte`, `saida`), guardar dinheiro em reservas e resgatar no futuro distorcia completamente os relatórios:
* **Guardar dinheiro (Aplicação)** era registrado como despesa (`pagar` ou `saida`), gerando uma falsa impressão de que o dinheiro "foi gasto" e reduzindo artificialmente a margem e o lucro líquido operacional.
* **Resgatar dinheiro** para pagar uma despesa (ex: 13º salário ou compra de maquinário) era registrado como receita (`receber` ou `aporte`), criando um falso faturamento.
* **Rendimentos de juros/CDI** não tinham onde ser acumulados de forma segregada.

### 1.2. A Solução: Gestão de Caixa Operacional vs. Carteira Patrimonial
O sistema passa a trabalhar com duas esferas integradas:
1. **Caixa Operacional (Banca Líquida):** Contas correntes e disponibilidades imediatas para o giro do dia a dia.
2. **Carteira de Investimentos & Reservas:** Ativos financeiros e "caixinhas" patrimoniais (ex: Reserva de Emergência, Provisão de 13º/Férias, Expansão, Renda Fixa).

**As 3 Operações da Carteira:**
* **Aplicação (Guardar):** Sai do Caixa Operacional (− Banca) e Entra na Reserva (+ Saldo da Reserva).
* **Resgate (Retirar):** Sai da Reserva (− Saldo da Reserva) e Volta para o Caixa Operacional (+ Banca).
* **Rendimento (Juros/Dividendos):** Incrementa diretamente o Saldo da Reserva (+ Saldo da Reserva) sem mexer no caixa diário até o resgate.

---

## 2. Modelo de Dados (`src/data/types.ts` e `src/data/db.ts`)

### 2.1. Novas Interfaces
```typescript
export interface Reserva extends Base {
  empresaId: string;
  nome: string;                 // Ex: "Reserva de Emergência", "Tesouro Selic", "Expansão 2027"
  descricao?: string;            // Ex: "6 meses de despesas fixas da empresa"
  cor?: string;                  // Tom visual (ex: "emerald", "blue", "violet", "amber")
  metaCentavos?: number;         // Meta financeira opcional em centavos (ex: 5000000 = R$ 50.000)
  saldoInicialCentavos?: number; // Saldo preexistente antes do início do controle no sistema
  ativa: boolean;
}

export type TipoMovimentoReserva = "aporte" | "resgate" | "rendimento";

export interface ReservaMovimento extends Base {
  empresaId: string;
  anoId: string;
  reservaId: string;
  tipo: TipoMovimentoReserva;
  data: string;                  // YYYY-MM-DD
  mes: number;                   // 0-11
  valor: number;                 // Em centavos (positivo)
  obs?: string;
  lancamentoId?: string;         // Vínculo com lançamento no caixa operacional (se houve saída/entrada de conta)
  contaId?: string;              // Conta operacional envolvida (se houver)
}

export interface ReservaProjecao extends Base {
  empresaId: string;
  anoId: string;
  reservaId: string;
  mes: number;                   // 0-11
  valorAporte: number;           // Centavos planejados para aplicar
  valorResgate: number;          // Centavos planejados para resgatar
  valorRendimento: number;       // Rendimento estimado em centavos
  obs?: string;
}
```

### 2.2. Campos Opcionais em `Lancamento` e `Projecao`
* `Lancamento`: `reservaId?: string`, `tipoReserva?: "aporte" | "resgate"`
* `Projecao`: `reservaId?: string`, `tipoReserva?: "aporte" | "resgate"`

### 2.3. Migração do Banco Dexie (`src/data/db.ts`)
Criação da versão 2 do banco com novas tabelas e índices:
* `reservas: "id, empresaId, nome, updatedAt"`
* `reservaMovimentos: "id, empresaId, reservaId, anoId, [empresaId+anoId], mes, data, tipo, updatedAt"`
* `reservaProjecoes: "id, empresaId, reservaId, anoId, [empresaId+anoId], mes, [anoId+reservaId+mes], updatedAt"`

---

## 3. Motor de Cálculo Puro (`src/data/calc.ts`)

Novas funções e tipagens determinísticas para consolidação da carteira:
```typescript
export interface ResumoReserva {
  reserva: Reserva;
  saldoInicial: number;
  totalAportesReal: number;
  totalResgatesReal: number;
  totalRendimentosReal: number;
  saldoAtualReal: number;
  
  totalAportesProj: number;
  totalResgatesProj: number;
  totalRendimentosProj: number;
  saldoFinalProj: number;
  
  evolucaoMensalReal: number[]; // Saldo acumulado mês a mês (0..11)
  evolucaoMensalProj: number[]; // Saldo acumulado mês a mês (0..11)
  progressoMetaPct?: number;   // Calculado caso metaCentavos > 0
}

export interface ResumoCarteira {
  totalPatrimonioReal: number;
  totalPatrimonioProj: number;
  totalAportadoAnoReal: number;
  totalAportadoAnoProj: number;
  totalResgatadoAnoReal: number;
  totalResgatadoAnoProj: number;
  totalRendimentoAnoReal: number;
  totalRendimentoAnoProj: number;
  reservas: ResumoReserva[];
}

export function calcularCarteiraReservas(
  reservas: Reserva[],
  movimentos: ReservaMovimento[],
  projecoes: ReservaProjecao[],
  mesReferencia = 11,
): ResumoCarteira;
```

---

## 4. Nova Tela: `src/pages/Investimentos.tsx`

### 4.1. Estrutura Visual
1. **Cabeçalho:** Título "Investimentos & Reservas", resumo do ano ativo, botão `[ + Nova Reserva ]`.
2. **Cockpit Patrimonial (2x2 no Mobile):**
   * **Patrimônio Total Alocado:** Saldo consolidado de todas as reservas.
   * **Total Guardado / Aplicado:** Volume aportado no ano (Real vs. Meta).
   * **Total Resgatado no Ano:** Liquidez recomposta para o caixa.
   * **Rendimento Acumulado:** Juros e ganhos gerados pelas reservas.
3. **Cards de Reservas & Caixinhas:**
   * Lista visual em cards elegantes.
   * Rótulo, descrição, saldo atualizado.
   * Barra de progresso da meta (se informada): `R$ 35.000 / R$ 50.000 (70%)`.
   * Ações diretas no card:
     * `[ + Guardar / Aplicar ]`
     * `[ ⇄ Retirar / Resgatar ]`
     * `[ % Rendimento ]`
     * `[ ✏️ Editar Reserva ]`
4. **Visualização Alternável (Projeção × Real e Extrato):**
   * **Aba 1: Evolução Mensal (Projeção × Real):** Tabela/grade com o fluxo de cada reserva mês a mês.
   * **Aba 2: Extrato de Movimentações:** Linha do tempo cronológica com data, tipo (Aplicação, Resgate, Rendimento), conta de origem/destino e observação.

### 4.2. Modais da Tela
* `ModalReserva`: Criação e edição de reservas (nome, descrição, cor, meta financeira opcional, saldo inicial).
* `ModalMovimentoReserva`: Aplicação, Resgate ou Rendimento:
  * Permite escolher se debita/credita de uma conta do Caixa Operacional ou se é ajuste direto na reserva.
* `ModalProjecaoReserva`: Planejamento dos aportes, resgates e rendimentos previstos mês a mês.

---

## 5. Integração com Lançamentos e Projeções Operacionais

No modal de lançamento (`ModalLancamento`):
* Quando a natureza for `saida` ou `pagar`: opção com switch *"Destinar para Reserva"*, com dropdown para escolher a reserva de destino.
* Quando a natureza for `aporte` ou `receber`: opção com switch *"Origem: Resgate de Reserva"*, com dropdown para escolher a reserva de origem.
* Ao salvar, além de movimentar o caixa operacional, o lançamento cria/sincroniza automaticamente a movimentação na carteira de investimentos.

---

## 6. Integração com Relatórios (`Relatorios.tsx`) e Dashboard (`Dashboard.tsx`)

### 6.1. Relatórios
Adição de um bloco dedicado:
* **Posição Patrimonial Consolidada:**
  * Saldo Líquido Operacional em Conta: R$ ...
  * Saldo Acumulado em Investimentos & Reservas: R$ ...
  * **Patrimônio Total da Empresa / Pessoa: R$ ...**
* **Fluxo de Movimentação de Reservas no Período:**
  * (+) Total Aplicado no período
  * (−) Total Resgatado no período
  * (+) Rendimentos gerados pelas reservas

### 6.2. Dashboard
* Card ou resumo no topo informando o **Patrimônio Consolidado** (Saldo em Conta + Reservas), com link rápido para a nova página.

---

## 7. Navegação & Responsividade Mobile

* **Desktop:** Link "Investimentos" adicionado ao menu lateral (`NAV` em `AppShell.tsx`) com ícone `wallet`.
* **Mobile:**
  * Inclusão no menu inferior (`bottomnav`), ajustado para grade de 6 colunas proporcionais com ícones e touch targets confortáveis.
  * Cockpit em grid 2x2.
  * Modais com botões largos empilhados (`modal-footer-actions`).

/**
 * Modelo de dados do Finansys.
 * - Valores monetários em CENTAVOS (inteiros).
 * - Meses 0–11.
 * - Todo registro tem id (UUID), updatedAt e deletedAt (soft delete),
 *   o que permite o merge registro a registro no backup (etapa 9).
 */

export type Natureza = "pagar" | "receber" | "saida" | "aporte";

export const NATUREZAS: Natureza[] = ["receber", "aporte", "pagar", "saida"];

/** Entradas somam ao saldo; saídas subtraem. */
export const SINAL: Record<Natureza, 1 | -1> = { receber: 1, aporte: 1, pagar: -1, saida: -1 };

/** Naturezas "livres" aceitam observação. */
export const LIVRE: Record<Natureza, boolean> = { receber: false, pagar: false, aporte: true, saida: true };

export interface Base {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface Empresa extends Base {
  nome: string;
  cnpj?: string;
  endereco?: string;
  logo?: string; // data URL
}

export interface Ano extends Base {
  empresaId: string;
  ano: number;
  bancaInicial: number;
}

export interface Categoria extends Base {
  empresaId: string;
  natureza: Natureza;
  nome: string;
}

export type ModoVinculo = "simples" | "formula";

export interface RegraVinculo {
  modo?: ModoVinculo;
  tipo?: "conta" | "categoria";
  origemId?: string;
  percentual?: number; // ex: 30 para 30%
  valorFixo?: number; // em centavos
  formula?: string; // ex: "([Salário Bruto] - [INSS]) * 30%"
}

export interface Conta extends Base {
  empresaId: string;
  categoriaId: string;
  natureza: Natureza;
  nome: string;
  ativa: boolean;
  vinculo?: RegraVinculo;
}

export interface Projecao extends Base {
  anoId: string;
  contaId: string;
  mes: number;
  valor: number;
  data?: string; // Data específica / vencimento (ISO yyyy-mm-dd) - opcional
  obs?: string;
  vinculoOrigemId?: string;
  parcela?: number;
  totalParcelas?: number;
  reservaId?: string;
  tipoReserva?: "aporte" | "resgate";
}

export interface Lancamento extends Base {
  anoId: string;
  contaId: string;
  mes: number;
  data: string; // ISO yyyy-mm-dd
  valor: number;
  descricao?: string;
  obs?: string;
  recorrenciaId?: string;
  parcela?: number;
  totalParcelas?: number;
  vinculoLancamentoOrigemId?: string;
  vinculoDescricao?: string;
  reservaId?: string;
  tipoReserva?: "aporte" | "resgate";
  bancoId?: string; // Vínculo com ContaBancaria (opcional)
  formaPagamento?: string; // Ex: "PIX", "Boleto", "Cartão de Crédito" (opcional)
}

/* ==========================================================
   Contas Bancárias (Bancos) & Formas de Pagamento
   ========================================================== */

export const FORMAS_PAGAMENTO_PADRAO = [
  "PIX",
  "Boleto",
  "Cartão de Débito",
  "Cartão de Crédito",
  "Transferência",
  "Dinheiro",
  "Débito Automático",
] as const;

export interface ContaBancaria extends Base {
  empresaId: string;
  nome: string;                  // Ex: "Nubank PJ", "Itaú Corrente", "Inter"
  saldoInicialCentavos: number;  // Saldo de abertura em centavos
  cor?: string;                  // Cor visual opcional (ex: "emerald", "blue", "violet", "amber", "rose", "cyan")
  agencia?: string;              // Agência bancária (opcional)
  numeroConta?: string;          // Número da conta com dígito (opcional)
  bancoCodigo?: string;          // Código de compensação (ex: "260", "341")
  formasPagamento?: string[];    // Formas de pagamento aceitas/disponíveis nesta conta (ex: ["PIX", "Boleto", "Cartão de Crédito"])
  ativa: boolean;
}

/* ==========================================================
   Investimentos & Reservas Patrimoniais
   ========================================================== */

export interface Reserva extends Base {
  empresaId: string;
  nome: string;                  // Ex: "Reserva de Emergência", "CDB Liquidez Diária", "Expansão 2027"
  descricao?: string;             // Ex: "6 meses de despesas fixas"
  cor?: string;                   // "emerald", "blue", "violet", "amber", "rose"
  metaCentavos?: number;          // Meta financeira opcional em centavos
  saldoInicialCentavos?: number;  // Saldo inicial preexistente (banca inicial da reserva)
  ativa: boolean;
}

export type TipoMovimentoReserva = "aporte" | "resgate" | "rendimento";

export interface ReservaMovimento extends Base {
  empresaId: string;
  anoId: string;
  reservaId: string;
  tipo: TipoMovimentoReserva;
  data: string;                   // YYYY-MM-DD
  mes: number;                    // 0-11
  valor: number;                  // Centavos (sempre positivo)
  obs?: string;
  lancamentoId?: string;          // Vínculo com lançamento no caixa operacional (se houver)
  contaId?: string;               // Conta operacional de onde saiu ou para onde foi o dinheiro
  bancoId?: string;               // Conta bancária de onde saiu ou para onde foi o dinheiro (opcional)
}

export interface ReservaProjecao extends Base {
  empresaId: string;
  anoId: string;
  reservaId: string;
  mes: number;                    // 0-11
  valorAporte: number;            // Centavos planejados para guardar no mês
  valorResgate: number;           // Centavos planejados para resgatar no mês
  valorRendimento: number;        // Rendimento estimado no mês
  obs?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

/* ==========================================================
   Inteligência de Mercado & Análise de Ações (Longo Prazo / Barsi / Bazin)
   ========================================================== */

export type BesttCategory = "Bancos" | "Energia" | "Saneamento" | "Telecom" | "Seguros";

export interface LongTermAnalysis {
  symbol: string;
  name: string;
  currency: string;
  market: "B3" | "GLOBAL";
  price: number;
  precoTetoBazin: number;
  margemSegurancaBazin: number; // Porcentagem de desconto (+15.5%) ou ágio (-10%)
  dividendYield: number; // Porcentagem (ex: 8.5)
  dividendRateAnual: number; // Valor financeiro por cota (ex: 2.50)
  fiveYearAvgDividendYield?: number;
  payoutRatio?: number; // Porcentagem (ex: 65)
  dividaEbitda?: number; // Múltiplo (ex: 1.8)
  debtToEquity?: number;
  roe?: number; // Porcentagem (ex: 18.5)
  pvp?: number;
  pl?: number;
  isBestt: boolean;
  besttCategory?: BesttCategory;
  isAristocrat?: boolean;
  score: number; // 0 a 100
  status: "oportunidade" | "neutro" | "alerta";
  pontosFortes: string[];
  pontosAtencao: string[];
  atualizadoEm: number;
}

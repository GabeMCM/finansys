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
  bancoDestinoId?: string; // Para transferências entre instituições (banco de destino)
  formaPagamento?: string; // Ex: "PIX", "Boleto", "Cartão de Crédito" (opcional)
}

/* ==========================================================
   Contas Bancárias (Bancos) & Formas de Pagamento
   ========================================================== */

export type TipoContaBancaria = "corrente" | "investimento" | "poupanca";

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
  nome: string;                  // Ex: "Nubank PJ", "Itaú Corrente", "XP Investimentos", "Inter"
  tipo?: TipoContaBancaria;       // "corrente" (padrão), "investimento" (recebe aportes/resgates), "poupanca"
  reservaVinculadaId?: string;   // Vínculo com Reserva / Caixinha opcional
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
  contaBancariaId?: string;      // Vínculo opcional com a Conta Bancária / Instituição onde está guardada
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
  bancoId?: string;               // Conta bancária de origem / saída
  bancoDestinoId?: string;        // Conta bancária de destino / entrada (para troca de instituição)
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
  precoGraham?: number; // Preço Justo de Benjamin Graham: raiz(22.5 * LPA * VPA)
  margemLiquida?: number; // Em porcentagem (ex: 24.5)
  liquidezCorrente?: number; // Múltiplo de solvência de curto prazo (ex: 1.8)
  isBestt: boolean;
  besttCategory?: BesttCategory;
  isAristocrat?: boolean;
  score: number; // 0 a 100
  status: "oportunidade" | "neutro" | "alerta";
  pontosFortes: string[];
  pontosAtencao: string[];
  atualizadoEm: number;
}

/* ==========================================================
   Gestão de Carteira de Ações & Registro de Compras (Longo Prazo)
   ========================================================== */

export type TipoOperacaoInvestimento = "compra" | "venda";

export interface OperacaoInvestimento extends Base {
  empresaId: string;
  anoId?: string;
  data: string; // ISO yyyy-mm-dd
  ticker: string; // Ex: "BBAS3", "KO", "TAEE11"
  nome?: string;
  tipo: TipoOperacaoInvestimento;
  quantidade: number; // Quantidade de cotas compradas ou vendidas
  precoUnitarioCentavos: number; // Preço pago por cota em centavos (moeda do ativo)
  taxasCentavos?: number; // Taxas/corretagem em centavos
  moeda: "BRL" | "USD";
  corretora?: string;
  obs?: string;
}

export interface PosicaoInvestimento {
  ticker: string;
  nome: string;
  moeda: "BRL" | "USD";
  market: "B3" | "GLOBAL";
  quantidadeTotal: number;
  precoMedioCentavos: number;
  totalInvestidoCentavos: number;
  cotacaoAtualCentavos: number;
  valorMercadoAtualCentavos: number;
  lucroPrejuizoCentavos: number; // Lucro não realizado da posição em custódia
  rentabilidadePct: number;
  lucroRealizadoCentavos: number; // Lucro realizado em vendas anteriores
  // Métricas Fundamentalistas ao Vivo
  precoTetoBazinCentavos: number;
  margemBazinPM: number; // Margem vs Preço Médio
  margemBazinAtual: number; // Margem vs Cotação Atual
  precoGrahamCentavos?: number;
  margemGrahamAtual?: number; // Margem vs Graham (%)
  dyAtualPct: number;
  dpaAnualCentavos: number;
  proventosAnuaisEstimadosCentavos: number;
  yieldOnCostPct: number; // (Proventos Anuais / Total Investido) * 100
  score: number;
  status: "oportunidade" | "neutro" | "alerta";
  isBestt: boolean;
  besttCategory?: BesttCategory;
  isAristocrat?: boolean;
  totalCompras: number;
  totalVendas: number;
  // Valores convertidos para BRL com base no câmbio
  valorMercadoBrlCentavos: number;
  totalInvestidoBrlCentavos: number;
  proventosAnuaisBrlCentavos: number;
}

export interface ProjecaoBolaDeNeve {
  em1AnoCentavos: number;
  em3AnosCentavos: number;
  em5AnosCentavos: number;
  em10AnosCentavos: number;
  rendaMensalEm5AnosCentavos: number;
}

export interface CarteiraInvestimentosConsolidada {
  posicoes: PosicaoInvestimento[];
  totalInvestidoCentavos: number; // Consolidado em BRL
  valorMercadoAtualCentavos: number; // Consolidado em BRL
  lucroNaoRealizadoTotalCentavos: number;
  lucroRealizadoTotalCentavos: number;
  lucroPrejuizoTotalCentavos: number; // Lucro Total = Realizado + Não Realizado
  rentabilidadeTotalPct: number;
  crescimentoPatrimonialPct: number;
  proventosAnuaisTotalCentavos: number; // Consolidado em BRL
  rendaMensalEstimadaCentavos: number;
  rendaDiariaEstimadaCentavos: number;
  yieldOnCostMedioPct: number;
  cambioUsdBrl: number;
  // Totais separados por moeda de custódia
  totalInvestidoBrlCentavos: number;
  totalInvestidoUsdCentavos: number;
  valorMercadoBrlCentavos: number;
  valorMercadoUsdCentavos: number;
  projecaoBolaDeNeve: ProjecaoBolaDeNeve;
}

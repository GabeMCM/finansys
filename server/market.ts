/**
 * Módulo de Integração com o Mercado Financeiro Global e Análise Fundamentalista de Longo Prazo.
 * Filosofia: Luiz Barsi (BESTT), Décio Bazin (Preço Teto 6%), e Filtro Anti-Armadilha (Anti-Dividend Trap).
 *
 * Atualização Diária Dinâmica: Varre um universo amplo de mais de 150 ativos líquidos do Brasil e do mundo,
 * recalculando cotações, dividendos reais, Preço Teto Bazin e pontuação para gerar o verdadeiro HOT 100 do dia.
 */

export interface MarketTickerRaw {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  previousClose: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  sector?: string;
  industry?: string;
  dividendRate?: number;
  dividendYield?: number;
  trailingAnnualDividendRate?: number;
  trailingAnnualDividendYield?: number;
  fiveYearAvgDividendYield?: number;
  payoutRatio?: number;
  totalDebt?: number;
  ebitda?: number;
  debtToEquity?: number;
  returnOnEquity?: number;
  priceToBook?: number;
  trailingEps?: number;
  trailingPE?: number;
}

export interface LongTermAnalysis {
  symbol: string;
  name: string;
  currency: string;
  market: "B3" | "GLOBAL";
  price: number;
  precoTetoBazin: number;
  margemSegurancaBazin: number; // Porcentagem de desconto (+15.5%) ou ágio (-10%)
  dividendYield: number; // Em porcentagem (ex: 8.5)
  dividendRateAnual: number; // Valor financeiro por cota (ex: 2.50)
  fiveYearAvgDividendYield?: number;
  payoutRatio?: number; // Em porcentagem (ex: 65)
  dividaEbitda?: number; // Múltiplo (ex: 1.8)
  debtToEquity?: number; // Em porcentagem
  roe?: number; // Em porcentagem (ex: 18.5)
  pvp?: number; // Preço / Valor Patrimonial
  pl?: number; // Preço / Lucro
  isBestt: boolean;
  besttCategory?: "Bancos" | "Energia" | "Saneamento" | "Telecom" | "Seguros";
  score: number; // 0 a 100
  status: "oportunidade" | "neutro" | "alerta";
  pontosFortes: string[];
  pontosAtencao: string[];
  atualizadoEm: number;
}

// ---------------------------------------------------------------------------
// Setores BESTT Mapeados (Metodologia Luiz Barsi)
// ---------------------------------------------------------------------------
export function identificarSetorBESTT(sector?: string, industry?: string, symbol?: string): {
  isBestt: boolean;
  category?: "Bancos" | "Energia" | "Saneamento" | "Telecom" | "Seguros";
} {
  const s = (sector || "").toLowerCase();
  const ind = (industry || "").toLowerCase();
  const symb = (symbol || "").toUpperCase();

  // 1. Seguros (verificado antes para não colidir com 'Insurance - Diversified')
  if (
    ind.includes("insurance") ||
    ["BBSE3", "CXSE3", "PSSA3", "IRBR3"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Seguros" };
  }

  // 2. Bancos
  if (
    ind.includes("bank") ||
    (s.includes("financial") && (ind.includes("regional") || ind.includes("banking") || (ind.includes("diversified") && !ind.includes("insurance")))) ||
    ["BBAS3", "ITUB4", "BBDC4", "BBDC3", "SANB11", "ITSA4", "BPAC11", "BRSR6", "JPM", "BAC", "WFC"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Bancos" };
  }

  // 3. Energia Elétrica (Geração, Transmissão, Distribuição)
  if (
    ind.includes("electric") ||
    ind.includes("renewable") ||
    (s.includes("utilities") && !ind.includes("water")) ||
    ["TAEE11", "TRPL4", "CPLE6", "EGIE3", "ALUP11", "CMIG4", "CMIG3", "NEOE3", "EQTL3", "ENGI11", "CPFE3", "AURE3", "ELET3", "ELET6"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Energia" };
  }

  // 4. Saneamento e Água
  if (
    ind.includes("water") ||
    ["SAPR11", "SAPR4", "CSMG3", "SBSP3", "AMBP3"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Saneamento" };
  }

  // 5. Telecomunicações
  if (
    s.includes("communication") ||
    ind.includes("telecom") ||
    ["VIVT3", "TIMS3", "FIQE3", "VZ", "T"].some((t) => symb.includes(t))
  ) {
    return { isBestt: true, category: "Telecom" };
  }

  return { isBestt: false };
}

/**
 * Normaliza o ticker para formato aceito pelo provedor de mercado global.
 * Ex: 'BBAS3' -> 'BBAS3.SA', 'AAPL' -> 'AAPL'
 */
export function normalizeSymbol(rawInput: string): string {
  let sym = (rawInput || "").trim().toUpperCase();
  if (!sym) return "";

  // Aliases conhecidos de migrações societárias da B3
  if (sym === "CPLE6" || sym === "CPLE6.SA") return "CPLE3.SA";

  if (sym.includes(".")) return sym;

  // Padrão brasileiro da B3: 4 letras + dígitos (ex: PETR4, TAEE11, MXRF11)
  const isB3Ticker = /^[A-Z]{4}(3|4|5|6|11|12|32|33|34|35)$/.test(sym);
  if (isB3Ticker) {
    return `${sym}.SA`;
  }

  return sym;
}

/**
 * Motor de Cálculo de Longo Prazo (Barsi / Bazin / Anti-Armadilha)
 */
export function calcularAnaliseLongoPrazo(raw: MarketTickerRaw): LongTermAnalysis {
  const price = raw.price > 0 ? raw.price : raw.previousClose;
  const isB3 = raw.symbol.endsWith(".SA");
  const cleanSymbol = raw.symbol.replace(".SA", "");

  // Setor BESTT
  const bestt = identificarSetorBESTT(raw.sector, raw.industry, raw.symbol);

  // Dividendo anual por ação (prioriza proventos reais dos últimos 12 meses)
  let dividendRate = raw.trailingAnnualDividendRate || raw.dividendRate || 0;
  let dy = 0;
  if (raw.trailingAnnualDividendYield && raw.trailingAnnualDividendYield > 0) {
    dy = raw.trailingAnnualDividendYield * 100;
  } else if (raw.dividendYield && raw.dividendYield > 0) {
    dy = raw.dividendYield;
  }

  if (dy === 0 && dividendRate > 0 && price > 0) {
    dy = (dividendRate / price) * 100;
  }
  if (dividendRate === 0 && dy > 0 && price > 0) {
    dividendRate = (dy / 100) * price;
  }

  // 1. Preço Teto de Bazin (DY 6% a.a.)
  let dpaRef = dividendRate;
  if (raw.fiveYearAvgDividendYield && raw.fiveYearAvgDividendYield > 0 && price > 0) {
    const avg5yRate = (raw.fiveYearAvgDividendYield / 100) * price;
    dpaRef = (dividendRate + avg5yRate) / 2;
  }

  const precoTetoBazin = dpaRef > 0 ? Number((dpaRef / 0.06).toFixed(2)) : 0;
  const margemSegurancaBazin = precoTetoBazin > 0 && price > 0
    ? Number((((precoTetoBazin - price) / price) * 100).toFixed(1))
    : -100;

  // 2. Métricas de Saúde Financeira
  const payout = raw.payoutRatio !== undefined && raw.payoutRatio !== null && !isNaN(raw.payoutRatio)
    ? Number((raw.payoutRatio * 100).toFixed(1))
    : undefined;

  let dividaEbitda: number | undefined = undefined;
  if (raw.totalDebt && raw.ebitda && raw.ebitda > 0) {
    dividaEbitda = Number((raw.totalDebt / raw.ebitda).toFixed(2));
  }

  const roe = raw.returnOnEquity !== undefined && raw.returnOnEquity !== null && !isNaN(raw.returnOnEquity)
    ? Number((raw.returnOnEquity * 100).toFixed(1))
    : undefined;

  const pvp = raw.priceToBook ? Number(raw.priceToBook.toFixed(2)) : undefined;
  const pl = raw.trailingPE
    ? Number(raw.trailingPE.toFixed(1))
    : raw.trailingEps && raw.trailingEps > 0 && price > 0
    ? Number((price / raw.trailingEps).toFixed(1))
    : undefined;

  // 3. Algoritmo de Score (0 a 100)
  let score = 50; // Base neutra
  const pontosFortes: string[] = [];
  const pontosAtencao: string[] = [];

  // A. Setor BESTT (Bônus de até +12 pts)
  if (bestt.isBestt) {
    score += 12;
    pontosFortes.push(`Setor Perene BESTT (${bestt.category}): demanda essencial e receita previsível.`);
  }

  // B. Dividend Yield
  if (dy >= 6) {
    score += Math.min(18, Math.round((dy - 6) * 2 + 10));
    pontosFortes.push(`Dividend Yield atraente de ${dy.toFixed(1)}% a.a. (acima do corte mínimo de 6%).`);
  } else if (dy >= 4) {
    score += 5;
    pontosAtencao.push(`Yield atual de ${dy.toFixed(1)}% a.a. está um pouco abaixo do patamar ideal de Bazin (6%).`);
  } else if (dy > 0) {
    score -= 10;
    pontosAtencao.push(`Yield baixo de ${dy.toFixed(1)}% a.a.`);
  } else {
    score -= 25;
    pontosAtencao.push("Não paga dividendos ou sem proventos registrados recentemente.");
  }

  // C. Margem de Segurança Bazin
  if (margemSegurancaBazin > 15) {
    score += 18;
    pontosFortes.push(`Negociando com grande desconto vs Preço Teto Bazin (+${margemSegurancaBazin.toFixed(0)}% de margem).`);
  } else if (margemSegurancaBazin > 0) {
    score += 10;
    pontosFortes.push(`Abaixo do Preço Teto Bazin (+${margemSegurancaBazin.toFixed(0)}% de margem de segurança).`);
  } else if (margemSegurancaBazin > -20) {
    score -= 5;
    pontosAtencao.push(`Preço atual está acima do teto de Bazin (${Math.abs(margemSegurancaBazin).toFixed(0)}% mais cara).`);
  } else {
    score -= 15;
    pontosAtencao.push(`Muito acima do Preço Teto Bazin. Aguardar recuo de cotação para aportar.`);
  }

  // D. Payout (Sustentabilidade dos Dividendos)
  if (payout !== undefined) {
    if (payout >= 35 && payout <= 85) {
      score += 10;
      pontosFortes.push(`Payout saudável de ${payout.toFixed(0)}% (distribui dividendos sem queimar caixa).`);
    } else if (payout > 100) {
      score -= 25;
      pontosAtencao.push(`Alerta de Armadilha: Payout de ${payout.toFixed(0)}% excede o lucro gerado pela empresa!`);
    } else if (payout > 85) {
      score -= 5;
      pontosAtencao.push(`Payout elevado (${payout.toFixed(0)}%), retenção pequena para novos investimentos.`);
    }
  }

  // E. Alavancagem e Dívida
  if (dividaEbitda !== undefined) {
    const limiteSeguro = bestt.category === "Energia" || bestt.category === "Saneamento" ? 3.5 : 2.5;
    if (dividaEbitda <= limiteSeguro) {
      score += 10;
      pontosFortes.push(`Dívida controlada (${dividaEbitda}x EBITDA, dentro da faixa de segurança).`);
    } else if (dividaEbitda > 4.5) {
      score -= 25;
      pontosAtencao.push(`Alavancagem perigosa: Dívida/EBITDA em ${dividaEbitda}x compromete a geração de caixa.`);
    } else {
      score -= 10;
      pontosAtencao.push(`Dívida moderadamente elevada (${dividaEbitda}x EBITDA). Exige acompanhamento.`);
    }
  }

  // F. Rentabilidade (ROE)
  if (roe !== undefined) {
    if (roe >= 15) {
      score += 10;
      pontosFortes.push(`Alta rentabilidade sobre patrimônio (ROE de ${roe.toFixed(1)}%).`);
    } else if (roe < 0) {
      score -= 30;
      pontosAtencao.push(`Empresa registrando prejuízo (ROE negativo de ${roe.toFixed(1)}%).`);
    } else if (roe < 8) {
      score -= 10;
      pontosAtencao.push(`Baixa eficiência patrimonial (ROE de ${roe.toFixed(1)}%).`);
    }
  }

  // G. Limites do Score (0 a 100)
  score = Math.max(5, Math.min(99, score));

  // Status consolidado
  let status: "oportunidade" | "neutro" | "alerta" = "neutro";
  if (score >= 75 && margemSegurancaBazin >= 0) {
    status = "oportunidade";
  } else if (score < 50 || margemSegurancaBazin < -25 || (roe !== undefined && roe < 0)) {
    status = "alerta";
  }

  return {
    symbol: cleanSymbol,
    name: raw.name || cleanSymbol,
    currency: raw.currency || (isB3 ? "BRL" : "USD"),
    market: isB3 ? "B3" : "GLOBAL",
    price: Number(price.toFixed(2)),
    precoTetoBazin,
    margemSegurancaBazin,
    dividendYield: Number(dy.toFixed(2)),
    dividendRateAnual: Number(dividendRate.toFixed(2)),
    fiveYearAvgDividendYield: raw.fiveYearAvgDividendYield ? Number(raw.fiveYearAvgDividendYield.toFixed(2)) : undefined,
    payoutRatio: payout,
    dividaEbitda,
    debtToEquity: raw.debtToEquity ? Number(raw.debtToEquity.toFixed(1)) : undefined,
    roe,
    pvp,
    pl,
    isBestt: bestt.isBestt,
    besttCategory: bestt.category,
    score,
    status,
    pontosFortes,
    pontosAtencao,
    atualizadoEm: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Sessão e Cookie Yahoo Finance
// ---------------------------------------------------------------------------
let _cachedCookie: string | null = null;
let _cachedCrumb: string | null = null;
let _crumbExpiry = 0;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function getYahooCrumb(): Promise<{ cookie: string; crumb: string } | null> {
  const now = Date.now();
  if (_cachedCookie && _cachedCrumb && now < _crumbExpiry) {
    return { cookie: _cachedCookie, crumb: _cachedCrumb };
  }

  try {
    const fcRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": USER_AGENT },
    });
    const cookie = fcRes.headers.get("set-cookie");
    if (!cookie) return null;

    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": USER_AGENT,
        "Cookie": cookie,
      },
    });

    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes("<html>")) return null;

    _cachedCookie = cookie;
    _cachedCrumb = crumb;
    _crumbExpiry = now + 1000 * 60 * 60 * 24; // 24h
    return { cookie, crumb };
  } catch (err) {
    console.warn("[Market Engine] Aviso ao obter crumb Yahoo Finance:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Universo de Ativos Monitorados Diariamente (B3 & Bolsas Mundiais)
// Mais de 160 empresas líquidas varridas diariamente pelo algoritmo.
// ---------------------------------------------------------------------------
export const MARKET_UNIVERSE_SYMBOLS: string[] = [
  // 1. B3 - Bancos & Financeiro
  "BBAS3.SA", "ITUB4.SA", "BBDC4.SA", "BBDC3.SA", "SANB11.SA", "ITSA4.SA", "BPAC11.SA", "BRSR6.SA", "B3SA3.SA",

  // 2. B3 - Seguros
  "BBSE3.SA", "CXSE3.SA", "PSSA3.SA", "IRBR3.SA",

  // 3. B3 - Energia Elétrica & Transmissão (BESTT)
  "TAEE11.SA", "CPLE3.SA", "EGIE3.SA", "ALUP11.SA", "CMIG4.SA", "CMIG3.SA",
  "EQTL3.SA", "ENGI11.SA", "CPFE3.SA", "AURE3.SA",

  // 4. B3 - Saneamento e Água (BESTT)
  "SAPR11.SA", "SAPR4.SA", "CSMG3.SA", "SBSP3.SA", "AMBP3.SA",

  // 5. B3 - Telecomunicações (BESTT)
  "VIVT3.SA", "TIMS3.SA", "FIQE3.SA",

  // 6. B3 - Commodities, Mineração e Siderurgia
  "VALE3.SA", "PETR4.SA", "PETR3.SA", "GGBR4.SA", "GOAU4.SA", "CSNA3.SA", "USIM5.SA",
  "SUZB3.SA", "KLBN11.SA", "PRIO3.SA", "RECV3.SA", "UGPA3.SA", "VBBR3.SA", "RAIZ4.SA",

  // 7. B3 - Consumo, Varejo, Indústria e Saúde
  "ABEV3.SA", "WEGE3.SA", "VULC3.SA", "MDIA3.SA", "GRND3.SA", "CAML3.SA", "LEVE3.SA",
  "SHUL4.SA", "KEPL3.SA", "TUPY3.SA", "POMO4.SA", "RAPT4.SA", "LREN3.SA", "ALOS3.SA",
  "ASAI3.SA", "SMTO3.SA", "SLCE3.SA", "RADL3.SA", "HYPE3.SA", "FLRY3.SA",
  "CYRE3.SA", "EZTC3.SA", "DIRR3.SA", "MRVE3.SA", "RENT3.SA", "RAIL3.SA",

  // 8. B3 - Fundos Imobiliários (FIIs)
  "HGLG11.SA", "MXRF11.SA", "KNCR11.SA", "XPML11.SA", "XPLG11.SA", "VISC11.SA", "BTLG11.SA", "KNRI11.SA", "HGRU11.SA", "CPTS11.SA",

  // 9. B3 - Empresas em Alerta / Estresse
  "OIBR3.SA", "AMER3.SA", "BHIA3.SA", "CVCB3.SA",

  // 10. Globais - S&P 500 Dividend Aristocrats & Kings (25 a 50+ anos de dividendos crescentes)
  "KO", "PEP", "JNJ", "PG", "MMM", "ABBV", "CVX", "XOM", "MCD", "O", "IBM", "T", "VZ", "MO", "PM",
  "CAT", "EMR", "GPC", "LOW", "WMT", "CL", "SYY", "ED", "BDX", "ITW", "PPG", "TGT", "ADM", "ADP",
  "AFL", "APD", "BKH", "CINF", "DOV", "FRT", "HRL", "KMB", "NUE", "PNR", "SHW", "SWK", "ABT",
  "CB", "CLX", "GD", "GWW", "LIN", "MDT", "MKC", "NEE", "ROP", "SPGI",

  // 11. Globais - Mega Caps & Finanças Globais
  "JPM", "BAC", "WFC", "MS", "GS", "BLK", "TXN", "QCOM", "CSCO", "INTC", "ORCL", "MSFT", "AAPL", "V", "MA",
  "SCHD", "VYM", "VIG"
];

/**
 * Consulta cotações e indicadores em lote de múltiplos ativos via API externa com sessão autenticada.
 */
export async function fetchBatchQuotes(symbols: string[]): Promise<MarketTickerRaw[]> {
  const session = await getYahooCrumb();
  const results: MarketTickerRaw[] = [];

  // Yahoo Finance aceita até 45-50 símbolos por requisição HTTP
  const CHUNK_SIZE = 45;
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    chunks.push(symbols.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of chunks) {
    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${chunk.join(",")}${
        session?.crumb ? `&crumb=${encodeURIComponent(session.crumb)}` : ""
      }`;

      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          ...(session?.cookie ? { "Cookie": session.cookie } : {}),
        },
      });

      if (res.ok) {
        const json = await res.json();
        const list = json.quoteResponse?.result || [];

        for (const r of list) {
          const price = r.regularMarketPrice || r.previousClose || 0;
          if (price <= 0) continue;

          results.push({
            symbol: r.symbol,
            name: r.longName || r.shortName || r.symbol,
            currency: r.currency || (r.symbol.endsWith(".SA") ? "BRL" : "USD"),
            price,
            previousClose: r.regularMarketPreviousClose || r.previousClose || price,
            fiftyTwoWeekHigh: r.fiftyTwoWeekHigh || price,
            fiftyTwoWeekLow: r.fiftyTwoWeekLow || price,
            dividendRate: r.dividendRate,
            dividendYield: r.dividendYield,
            trailingAnnualDividendRate: r.trailingAnnualDividendRate,
            trailingAnnualDividendYield: r.trailingAnnualDividendYield,
            trailingPE: r.trailingPE,
            priceToBook: r.priceToBook,
            trailingEps: r.epsTrailingTwelveMonths,
            totalDebt: r.totalDebt,
            ebitda: r.ebitda,
          });
        }
      }
    } catch (chunkErr) {
      console.warn("[Market Engine] Aviso ao consultar lote de cotações:", chunkErr);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Cache Global da Hotlist Diária (Hot 100)
// ---------------------------------------------------------------------------
let _cachedHot100: LongTermAnalysis[] | null = null;
let _hot100LastUpdated = 0;
const HOT100_TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

/**
 * Retorna o verdadeiro HOT 100 atualizado diariamente:
 * Varre todo o universo de mercado (>160 ativos), calcula os múltiplos de hoje e ranqueia do #1 ao #100.
 */
export async function getHot100(forceRefresh = false): Promise<{
  items: LongTermAnalysis[];
  updatedAt: number;
  totalScanned: number;
}> {
  const now = Date.now();

  if (!forceRefresh && _cachedHot100 && _cachedHot100.length > 0 && now - _hot100LastUpdated < HOT100_TTL_MS) {
    return {
      items: _cachedHot100,
      updatedAt: _hot100LastUpdated,
      totalScanned: MARKET_UNIVERSE_SYMBOLS.length,
    };
  }

  console.log(`[Market Engine] Iniciando varredura diária de ${MARKET_UNIVERSE_SYMBOLS.length} ativos para o Hot 100...`);
  const rawList = await fetchBatchQuotes(MARKET_UNIVERSE_SYMBOLS);

  if (rawList.length === 0 && _cachedHot100 && _cachedHot100.length > 0) {
    // Se a API estiver instável, preserva o último cache diário
    return {
      items: _cachedHot100,
      updatedAt: _hot100LastUpdated,
      totalScanned: MARKET_UNIVERSE_SYMBOLS.length,
    };
  }

  // Processa e calcula o Score de Longo Prazo e Bazin para todos os ativos retornados
  const analyzed: LongTermAnalysis[] = [];
  for (const raw of rawList) {
    try {
      const calc = calcularAnaliseLongoPrazo(raw);
      analyzed.push(calc);
    } catch (_err) {
      // Continua se um cálculo específico falhar
    }
  }

  // Ordenação rigorosa: Maior Score primeiro (100 -> 0), desempate por Maior Margem de Segurança Bazin
  analyzed.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.margemSegurancaBazin - a.margemSegurancaBazin;
  });

  // Seleciona o Top 100
  const top100 = analyzed.slice(0, 100);

  _cachedHot100 = top100;
  _hot100LastUpdated = now;

  console.log(`[Market Engine] Varredura diária concluída: ${analyzed.length} ativos analisados, Top 100 gerado com sucesso.`);

  return {
    items: top100,
    updatedAt: now,
    totalScanned: analyzed.length,
  };
}

/**
 * Fallback resiliente usando o endpoint de Chart do Yahoo Finance (não requer crumb nem cookie).
 * Obtém preço em tempo real e soma todos os dividendos em dinheiro distribuídos nos últimos 12 meses.
 */
async function fetchChartTicker(symbol: string): Promise<MarketTickerRaw | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&events=div`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;

    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice || meta?.chartPreviousClose || 0;
    if (!meta || price <= 0) return null;

    const divs = data.chart?.result?.[0]?.events?.dividends || {};
    let sumDivs = 0;
    for (const k of Object.keys(divs)) {
      if (typeof divs[k]?.amount === "number") {
        sumDivs += divs[k].amount;
      }
    }

    return {
      symbol,
      name: meta.longName || meta.shortName || symbol,
      currency: meta.currency || (symbol.endsWith(".SA") ? "BRL" : "USD"),
      price,
      previousClose: meta.chartPreviousClose || price,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || price,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow || price,
      dividendRate: sumDivs,
      dividendYield: price > 0 ? (sumDivs / price) * 100 : 0,
    };
  } catch (err) {
    console.warn(`[Market Engine] Fallback de chart falhou para ${symbol}:`, err);
    return null;
  }
}

/**
 * Consulta um ativo individual específico (da busca ou fora do Hot 100).
 */
export async function fetchMarketTicker(rawSymbol: string): Promise<LongTermAnalysis> {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) {
    throw new Error("Símbolo do ativo inválido.");
  }

  // 1. Primeiro verifica se o ativo já foi analisado no Hot 100 recente
  if (_cachedHot100) {
    const clean = symbol.replace(".SA", "");
    const found = _cachedHot100.find((it) => it.symbol === clean || it.symbol === symbol);
    if (found) return found;
  }

  // 2. Busca na API em lote com múltiplos completos
  try {
    const quotes = await fetchBatchQuotes([symbol]);
    if (quotes.length > 0 && quotes[0].price > 0) {
      return calcularAnaliseLongoPrazo(quotes[0]);
    }
  } catch (_batchErr) {
    // Continua para o fallback de chart
  }

  // 3. Fallback resiliente via endpoint /v8/finance/chart (sempre disponível, sem crumb)
  const chartQuote = await fetchChartTicker(symbol);
  if (chartQuote) {
    return calcularAnaliseLongoPrazo(chartQuote);
  }

  throw new Error(`Não foi possível localizar cotações e indicadores para o ativo ${rawSymbol}.`);
}

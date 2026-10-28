import type {
  CarteiraInvestimentosConsolidada,
  LongTermAnalysis,
  OperacaoInvestimento,
  PosicaoInvestimento,
} from "./types.ts";

/**
 * Consolida as operações de compra e venda de ativos, apurando:
 * - Quantidade em custódia
 * - Preço Médio (PM)
 * - Custo Total Investido
 * - Valor de Mercado Atual (com cotações ao vivo)
 * - Retorno / Lucro Real e Percentual
 * - Proventos Anuais Projetados e Yield on Cost (YoC)
 */
export function calcularCarteiraInvestimentos(
  operacoes: OperacaoInvestimento[],
  marketMap: Map<string, LongTermAnalysis>
): CarteiraInvestimentosConsolidada {
  // Ordena operações cronologicamente (da mais antiga à mais recente) para cálculo correto do Preço Médio
  const ordenadas = [...operacoes].sort((a, b) => a.data.localeCompare(b.data));

  // Agrupa operações por ticker
  const agrupadoPorTicker = new Map<string, OperacaoInvestimento[]>();
  for (const op of ordenadas) {
    const sym = (op.ticker || "").trim().toUpperCase();
    if (!sym) continue;
    if (!agrupadoPorTicker.has(sym)) {
      agrupadoPorTicker.set(sym, []);
    }
    agrupadoPorTicker.get(sym)!.push(op);
  }

  const posicoes: PosicaoInvestimento[] = [];
  let totalInvestidoGeral = 0;
  let valorMercadoGeral = 0;
  let proventosAnuaisGeral = 0;

  for (const [ticker, ops] of agrupadoPorTicker.entries()) {
    let qtd = 0;
    let custoTotal = 0;
    let totalCompras = 0;
    let totalVendas = 0;
    let moeda: "BRL" | "USD" = "BRL";
    let nome = ticker;

    for (const op of ops) {
      if (op.nome) nome = op.nome;
      if (op.moeda) moeda = op.moeda;

      const taxas = op.taxasCentavos || 0;
      if (op.tipo === "compra") {
        totalCompras++;
        const custoOperacao = op.quantidade * op.precoUnitarioCentavos + taxas;
        custoTotal += custoOperacao;
        qtd += op.quantidade;
      } else if (op.tipo === "venda") {
        totalVendas++;
        if (qtd > 0) {
          const pmAntes = custoTotal / qtd;
          qtd = Math.max(0, qtd - op.quantidade);
          custoTotal = Math.round(qtd * pmAntes);
        }
      }
    }

    // Se o investidor ainda tem cotas em carteira
    if (qtd > 0) {
      const pm = Math.round(custoTotal / qtd);
      const clean = ticker.replace(".SA", "");
      const analysis = marketMap.get(clean) || marketMap.get(ticker);

      const cotacao = analysis ? Math.round(analysis.price * 100) : pm;
      const valorMercado = Math.round(qtd * cotacao);
      const lucroPrejuizo = valorMercado - custoTotal;
      const rentabilidadePct = custoTotal > 0 ? Number((((valorMercado - custoTotal) / custoTotal) * 100).toFixed(2)) : 0;

      const dpaAnualCentavos = analysis ? Math.round(analysis.dividendRateAnual * 100) : 0;
      const proventosAnuais = Math.round(qtd * dpaAnualCentavos);
      const yoc = custoTotal > 0 ? Number(((proventosAnuais / custoTotal) * 100).toFixed(2)) : 0;

      const precoTetoBazinCentavos = analysis ? Math.round(analysis.precoTetoBazin * 100) : 0;
      const margemBazinPM = precoTetoBazinCentavos > 0 && pm > 0
        ? Number((((precoTetoBazinCentavos - pm) / pm) * 100).toFixed(1))
        : -100;
      const margemBazinAtual = analysis ? analysis.margemSegurancaBazin : -100;

      const precoGrahamCentavos = analysis?.precoGraham ? Math.round(analysis.precoGraham * 100) : undefined;

      const isB3 = ticker.endsWith(".SA") || moeda === "BRL";

      posicoes.push({
        ticker,
        nome: analysis?.name || nome || ticker,
        moeda: analysis?.currency === "USD" ? "USD" : moeda,
        market: isB3 ? "B3" : "GLOBAL",
        quantidadeTotal: qtd,
        precoMedioCentavos: pm,
        totalInvestidoCentavos: custoTotal,
        cotacaoAtualCentavos: cotacao,
        valorMercadoAtualCentavos: valorMercado,
        lucroPrejuizoCentavos: lucroPrejuizo,
        rentabilidadePct,
        precoTetoBazinCentavos,
        margemBazinPM,
        margemBazinAtual,
        precoGrahamCentavos,
        dyAtualPct: analysis?.dividendYield || 0,
        dpaAnualCentavos,
        proventosAnuaisEstimadosCentavos: proventosAnuais,
        yieldOnCostPct: yoc,
        score: analysis?.score || 50,
        status: analysis?.status || "neutro",
        isBestt: analysis?.isBestt || false,
        besttCategory: analysis?.besttCategory,
        isAristocrat: analysis?.isAristocrat || false,
        totalCompras,
        totalVendas,
      });

      totalInvestidoGeral += custoTotal;
      valorMercadoGeral += valorMercado;
      proventosAnuaisGeral += proventosAnuais;
    }
  }

  // Ordena posições por maior valor patrimonial alocado
  posicoes.sort((a, b) => b.valorMercadoAtualCentavos - a.valorMercadoAtualCentavos);

  const lucroPrejuizoTotal = valorMercadoGeral - totalInvestidoGeral;
  const rentabilidadeTotalPct = totalInvestidoGeral > 0
    ? Number((((valorMercadoGeral - totalInvestidoGeral) / totalInvestidoGeral) * 100).toFixed(2))
    : 0;
  const yocMedioPct = totalInvestidoGeral > 0
    ? Number(((proventosAnuaisGeral / totalInvestidoGeral) * 100).toFixed(2))
    : 0;

  return {
    posicoes,
    totalInvestidoCentavos: totalInvestidoGeral,
    valorMercadoAtualCentavos: valorMercadoGeral,
    lucroPrejuizoTotalCentavos: lucroPrejuizoTotal,
    rentabilidadeTotalPct,
    proventosAnuaisTotalCentavos: proventosAnuaisGeral,
    rendaMensalEstimadaCentavos: Math.round(proventosAnuaisGeral / 12),
    yieldOnCostMedioPct: yocMedioPct,
  };
}

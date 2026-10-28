import type {
  CarteiraInvestimentosConsolidada,
  LongTermAnalysis,
  OperacaoInvestimento,
  PosicaoInvestimento,
  ProjecaoBolaDeNeve,
} from "./types.ts";

/**
 * Consolidação rigorosa da carteira de investimentos com metodologia Buy & Hold / Dividend Growth.
 *
 * Apura com precisão matemática:
 * - Quantidade em custódia ativa
 * - Preço Médio ponderado por aporte (PM)
 * - Custo Total Investido
 * - Cotações em tempo real e Valor de Mercado Atual
 * - Lucro Não Realizado (posições ativas) e Lucro Realizado (vendas efetuadas)
 * - Retorno Total e Crescimento Patrimonial (%)
 * - Proventos Anuais Estimados, Renda Mensal e Diária
 * - Yield on Cost (YoC %) individual e médio da carteira
 * - Preço Justo de Graham e Preço Teto Bazin com margens de segurança
 * - Conversão Cambial Multimoeda (USD -> BRL)
 * - Projeção do Efeito Bola de Neve com reinvestimento de proventos
 */
export function calcularCarteiraInvestimentos(
  operacoes: OperacaoInvestimento[],
  marketMap: Map<string, LongTermAnalysis>,
  cambioUsdBrl = 5.35
): CarteiraInvestimentosConsolidada {
  // Ordena operações cronologicamente para consistência estrita do Preço Médio
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
  let lucroRealizadoTotalBrl = 0;
  let totalInvestidoBrlGeral = 0;
  let valorMercadoBrlGeral = 0;
  let proventosAnuaisBrlGeral = 0;

  let totalInvestidoBrlApenas = 0;
  let totalInvestidoUsdApenas = 0;
  let valorMercadoBrlApenas = 0;
  let valorMercadoUsdApenas = 0;

  for (const [ticker, ops] of agrupadoPorTicker.entries()) {
    let qtd = 0;
    let custoTotal = 0;
    let totalCompras = 0;
    let totalVendas = 0;
    let lucroRealizadoTicker = 0;
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
          const qtdVendida = Math.min(qtd, op.quantidade);
          const custoVendido = Math.round(qtdVendida * pmAntes);
          const receitaLiquidaVenda = qtdVendida * op.precoUnitarioCentavos - taxas;
          const lucroOp = receitaLiquidaVenda - custoVendido;
          lucroRealizadoTicker += lucroOp;

          qtd = Math.max(0, qtd - qtdVendida);
          custoTotal = Math.max(0, custoTotal - custoVendido);
        }
      }
    }

    // Lucro realizado do ticker convertido para BRL se for em USD
    const fatorCambio = moeda === "USD" ? cambioUsdBrl : 1;
    lucroRealizadoTotalBrl += Math.round(lucroRealizadoTicker * fatorCambio);

    // Se o investidor possui cotas em custódia ativa
    if (qtd > 0) {
      const pm = Math.round(custoTotal / qtd);
      const clean = ticker.replace(".SA", "");
      const analysis = marketMap.get(clean) || marketMap.get(ticker);

      const cotacao = analysis ? Math.round(analysis.price * 100) : pm;
      const valorMercado = Math.round(qtd * cotacao);
      const lucroNaoRealizado = valorMercado - custoTotal;
      const rentabilidadePct = custoTotal > 0
        ? Number((((valorMercado - custoTotal) / custoTotal) * 100).toFixed(2))
        : 0;

      const dpaAnualCentavos = analysis ? Math.round(analysis.dividendRateAnual * 100) : 0;
      const proventosAnuais = Math.round(qtd * dpaAnualCentavos);
      const yoc = custoTotal > 0
        ? Number(((proventosAnuais / custoTotal) * 100).toFixed(2))
        : 0;

      // Métricas Bazin
      const precoTetoBazinCentavos = analysis ? Math.round(analysis.precoTetoBazin * 100) : 0;
      const margemBazinPM = precoTetoBazinCentavos > 0 && pm > 0
        ? Number((((precoTetoBazinCentavos - pm) / pm) * 100).toFixed(1))
        : -100;
      const margemBazinAtual = analysis ? analysis.margemSegurancaBazin : -100;

      // Métricas Graham
      const precoGrahamCentavos = analysis?.precoGraham ? Math.round(analysis.precoGraham * 100) : undefined;
      const margemGrahamAtual = precoGrahamCentavos && cotacao > 0
        ? Number((((precoGrahamCentavos - cotacao) / cotacao) * 100).toFixed(1))
        : undefined;

      const isB3 = ticker.endsWith(".SA") || moeda === "BRL";
      const moedaFinal = analysis?.currency === "USD" ? "USD" : moeda;

      // Conversões para moeda base nacional (BRL)
      const fx = moedaFinal === "USD" ? cambioUsdBrl : 1;
      const valorMercadoBrl = Math.round(valorMercado * fx);
      const totalInvestidoBrl = Math.round(custoTotal * fx);
      const proventosAnuaisBrl = Math.round(proventosAnuais * fx);

      posicoes.push({
        ticker,
        nome: analysis?.name || nome || ticker,
        moeda: moedaFinal,
        market: isB3 ? "B3" : "GLOBAL",
        quantidadeTotal: qtd,
        precoMedioCentavos: pm,
        totalInvestidoCentavos: custoTotal,
        cotacaoAtualCentavos: cotacao,
        valorMercadoAtualCentavos: valorMercado,
        lucroPrejuizoCentavos: lucroNaoRealizado,
        rentabilidadePct,
        lucroRealizadoCentavos: lucroRealizadoTicker,
        precoTetoBazinCentavos,
        margemBazinPM,
        margemBazinAtual,
        precoGrahamCentavos,
        margemGrahamAtual,
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
        valorMercadoBrlCentavos: valorMercadoBrl,
        totalInvestidoBrlCentavos: totalInvestidoBrl,
        proventosAnuaisBrlCentavos: proventosAnuaisBrl,
      });

      totalInvestidoBrlGeral += totalInvestidoBrl;
      valorMercadoBrlGeral += valorMercadoBrl;
      proventosAnuaisBrlGeral += proventosAnuaisBrl;

      if (moedaFinal === "USD") {
        totalInvestidoUsdApenas += custoTotal;
        valorMercadoUsdApenas += valorMercado;
      } else {
        totalInvestidoBrlApenas += custoTotal;
        valorMercadoBrlApenas += valorMercado;
      }
    }
  }

  // Ordena posições por maior valor patrimonial consolidado
  posicoes.sort((a, b) => b.valorMercadoBrlCentavos - a.valorMercadoBrlCentavos);

  const lucroNaoRealizadoTotalBrl = valorMercadoBrlGeral - totalInvestidoBrlGeral;
  const lucroPrejuizoTotalConsolidado = lucroNaoRealizadoTotalBrl + lucroRealizadoTotalBrl;

  // Crescimento Patrimonial em relação ao capital líquido alocado
  const crescimentoPatrimonialPct = totalInvestidoBrlGeral > 0
    ? Number((((valorMercadoBrlGeral - totalInvestidoBrlGeral) / totalInvestidoBrlGeral) * 100).toFixed(2))
    : 0;

  // Rentabilidade total (inclui lucros já realizados em vendas)
  const rentabilidadeTotalPct = totalInvestidoBrlGeral > 0
    ? Number(((lucroPrejuizoTotalConsolidado / totalInvestidoBrlGeral) * 100).toFixed(2))
    : 0;

  const yocMedioPct = totalInvestidoBrlGeral > 0
    ? Number(((proventosAnuaisBrlGeral / totalInvestidoBrlGeral) * 100).toFixed(2))
    : 0;

  const rendaMensalEstimada = Math.round(proventosAnuaisBrlGeral / 12);
  const rendaDiariaEstimada = Math.round(proventosAnuaisBrlGeral / 365);

  // Projeção de Crescimento da Bola de Neve (com reinvestimento dos proventos a taxa média de retorno)
  // Taxa composta anual estimada: máx entre YoC da carteira e 6.5% a.a. (taxa histórica padrão Siegel / Bazin)
  const taxaAnualComp = Math.max(yocMedioPct / 100, 0.065);
  const basePatrimonio = valorMercadoBrlGeral;

  const projecaoBolaDeNeve: ProjecaoBolaDeNeve = {
    em1AnoCentavos: Math.round(basePatrimonio * (1 + taxaAnualComp)),
    em3AnosCentavos: Math.round(basePatrimonio * Math.pow(1 + taxaAnualComp, 3)),
    em5AnosCentavos: Math.round(basePatrimonio * Math.pow(1 + taxaAnualComp, 5)),
    em10AnosCentavos: Math.round(basePatrimonio * Math.pow(1 + taxaAnualComp, 10)),
    rendaMensalEm5AnosCentavos: Math.round((basePatrimonio * Math.pow(1 + taxaAnualComp, 5) * (yocMedioPct > 0 ? yocMedioPct / 100 : 0.06)) / 12),
  };

  return {
    posicoes,
    totalInvestidoCentavos: totalInvestidoBrlGeral,
    valorMercadoAtualCentavos: valorMercadoBrlGeral,
    lucroNaoRealizadoTotalCentavos: lucroNaoRealizadoTotalBrl,
    lucroRealizadoTotalCentavos: lucroRealizadoTotalBrl,
    lucroPrejuizoTotalCentavos: lucroPrejuizoTotalConsolidado,
    rentabilidadeTotalPct,
    crescimentoPatrimonialPct,
    proventosAnuaisTotalCentavos: proventosAnuaisBrlGeral,
    rendaMensalEstimadaCentavos: rendaMensalEstimada,
    rendaDiariaEstimadaCentavos: rendaDiariaEstimada,
    yieldOnCostMedioPct: yocMedioPct,
    cambioUsdBrl,
    totalInvestidoBrlCentavos: totalInvestidoBrlApenas,
    totalInvestidoUsdCentavos: totalInvestidoUsdApenas,
    valorMercadoBrlCentavos: valorMercadoBrlApenas,
    valorMercadoUsdCentavos: valorMercadoUsdApenas,
    projecaoBolaDeNeve,
  };
}

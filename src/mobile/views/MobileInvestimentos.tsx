import { useState, useEffect } from "react";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { ModalOperacaoInvestimento } from "../../components/investimento/ModalOperacaoInvestimento.tsx";
import { ModalRaioXAtivo } from "../../components/investimento/ModalRaioXAtivo.tsx";
import { calcularCarteiraInvestimentos } from "../../data/calcInvestimentos.ts";
import { anos, empresas, operacoesInvestimento } from "../../data/repo.ts";
import type { LongTermAnalysis, OperacaoInvestimento, PosicaoInvestimento } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { fetchHotlist, searchTicker } from "../../lib/marketApi.ts";
import { money, moneyPrivacidade, signedPrivacidade } from "../../lib/format.ts";
import { anoAtivo, empresaAtiva } from "../../state.ts";
import { useSignal } from "../../lib/signal.ts";

export function MobileInvestimentos() {
  const empId = useSignal(empresaAtiva);
  const anoNum = useSignal(anoAtivo);

  const [abaAtiva, setAbaAtiva] = useState<"carteira" | "radar" | "operacoes">("carteira");
  const [modalOperacaoAberta, setModalOperacaoAberta] = useState(false);
  const [operacaoEdicao, setOperacaoEdicao] = useState<OperacaoInvestimento | null>(null);
  const [tickerOperacao, setTickerOperacao] = useState<string>("");
  const [ativoRaioX, setAtivoRaioX] = useState<LongTermAnalysis | null>(null);

  const [marketQuotesMap, setMarketQuotesMap] = useState<Map<string, LongTermAnalysis>>(new Map());
  const [taxaCambioUsd, setTaxaCambioUsd] = useState<number>(5.35);
  const [carregandoMercado, setCarregandoMercado] = useState<boolean>(false);
  const [radarItems, setRadarItems] = useState<LongTermAnalysis[]>([]);
  const [filtroRadar, setFiltroRadar] = useState<"todos" | "oportunidades" | "bestt" | "aristocratas" | "dividendos" | "baratas">("todos");
  const [buscaRadar, setBuscaRadar] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Sincroniza cotações do radar de mercado
  const carregarCotacoes = async (forceRefresh = false) => {
    setCarregandoMercado(true);
    try {
      const res = await fetchHotlist(forceRefresh);
      setRadarItems(res.items);
      setMarketQuotesMap((prev) => {
        const map = new Map(prev);
        for (const it of res.items) {
          map.set(it.symbol, it);
          map.set(it.symbol.replace(".SA", ""), it);
        }
        return map;
      });

      // Taxa cambial USD/BRL
      try {
        const usdData = await searchTicker("USDBRL=X");
        if (usdData && usdData.price > 0) {
          setTaxaCambioUsd(usdData.price);
        }
      } catch (_cambioErr) {
        // Fallback
      }
      if (forceRefresh) {
        toast.success("Cotações e dividendos atualizados!");
      }
    } catch (err) {
      console.warn("[MobileInvestimentos] Erro ao carregar cotações:", err);
      if (forceRefresh) toast.error("Falha ao sincronizar cotações.");
    } finally {
      setCarregandoMercado(false);
    }
  };

  useEffect(() => {
    carregarCotacoes(false);
  }, []);

  const dados = useLive(async () => {
    if (!empId) return null;
    const [emp, ano, ops] = await Promise.all([
      empresas.get(empId),
      anos.find(empId, anoNum),
      operacoesInvestimento.byEmpresa(empId),
    ]);
    return { emp, ano, ops };
  }, [empId, anoNum, refreshKey], null);

  // Busca cotações dos tickers que o usuário tem na carteira
  useEffect(() => {
    if (!dados?.ops || dados.ops.length === 0) return;
    const tickers = Array.from(new Set(dados.ops.map((o) => (o.ticker || "").trim().toUpperCase()))).filter(Boolean);
    const faltantes = tickers.filter((sym) => {
      const clean = sym.replace(".SA", "");
      return !marketQuotesMap.has(clean) && !marketQuotesMap.has(sym);
    });

    if (faltantes.length > 0) {
      Promise.allSettled(faltantes.map((sym) => searchTicker(sym))).then((results) => {
        setMarketQuotesMap((prev) => {
          const next = new Map(prev);
          for (const res of results) {
            if (res.status === "fulfilled" && res.value) {
              const it = res.value;
              next.set(it.symbol, it);
              next.set(it.symbol.replace(".SA", ""), it);
            }
          }
          return next;
        });
      });
    }
  }, [dados?.ops, marketQuotesMap.size]);

  const emp = dados?.emp;
  const ano = dados?.ano;
  const ops = dados?.ops || [];

  const carteira = calcularCarteiraInvestimentos(ops, marketQuotesMap, taxaCambioUsd);

  // Filtra itens do Radar B3
  const radarFiltrados = radarItems.filter((item) => {
    if (buscaRadar.trim()) {
      const q = buscaRadar.toLowerCase().trim();
      const sym = item.symbol.toLowerCase();
      const n = (item.name || "").toLowerCase();
      const sec = (item.sector || "").toLowerCase();
      if (!sym.includes(q) && !n.includes(q) && !sec.includes(q)) return false;
    }
    if (filtroRadar === "oportunidades") return item.status === "oportunidade";
    if (filtroRadar === "bestt") return item.isBestt;
    if (filtroRadar === "aristocratas") return item.isAristocrat;
    if (filtroRadar === "dividendos") return item.dividendYield >= 6;
    if (filtroRadar === "baratas") return item.priceToBook > 0 && item.priceToBook < 1;
    return true;
  });

  const abrirCompraRapida = (ticker: string) => {
    setTickerOperacao(ticker);
    setOperacaoEdicao(null);
    setModalOperacaoAberta(true);
  };

  const abrirRaioX = async (ticker: string) => {
    const clean = ticker.replace(".SA", "");
    const cached = marketQuotesMap.get(clean) || marketQuotesMap.get(ticker);
    if (cached) {
      setAtivoRaioX(cached);
      return;
    }
    try {
      toast.info(`Buscando análise de ${ticker}...`);
      const res = await searchTicker(ticker);
      if (res) {
        setAtivoRaioX(res);
        setMarketQuotesMap((prev) => new Map(prev).set(res.symbol, res));
      }
    } catch {
      toast.error(`Não foi possível carregar dados de ${ticker}`);
    }
  };

  if (!emp) {
    return (
      <div class="card empty" style="border-radius:18px;margin-bottom:70px;">
        <Icon name="building" />
        <h2 style="font-size:1rem;font-weight:800;">Selecione uma empresa</h2>
        <p style="font-size:0.8rem;color:var(--text-muted);">
          Escolha uma empresa no menu superior para gerenciar seus investimentos.
        </p>
      </div>
    );
  }

  return (
    <div style="display:flex;flex-direction:column;gap:12px;padding-bottom:70px;">
      {/* 1. Switcher Superior de Contexto: Caixinhas vs Bolsa de Valores */}
      <div class="mobile-segmented" style="margin-bottom:2px;">
        <a
          href="#/reservas"
          class="mobile-segmented__btn"
          style="text-decoration:none;"
        >
          <Icon name="wallet" style="width:16px;height:16px;" />
          Caixinhas & Metas
        </a>
        <button
          type="button"
          class="mobile-segmented__btn is-active"
        >
          <Icon name="chart" style="width:16px;height:16px;" />
          Bolsa & Ações
        </button>
      </div>

      {/* 2. Cartão Executivo de Patrimônio em Ações */}
      <section class="bank-hero-card" aria-label="Patrimônio em Investimentos">
        <div class="bank-hero-card__header">
          <div class="bank-hero-card__title">
            <Icon name="sparkles" />
            <span>Carteira de Ativos</span>
          </div>
          <button
            type="button"
            class="mobile-pill"
            onClick={() => carregarCotacoes(true)}
            disabled={carregandoMercado}
            style="border:none;cursor:pointer;background:var(--surface-soft);"
            title="Sincronizar cotações"
          >
            <Icon name="refresh" style={`width:12px;height:12px;${carregandoMercado ? "animation:spin 1s infinite linear;" : ""}`} />
            <span>{carregandoMercado ? "Atualizando..." : "Cotações B3"}</span>
          </button>
        </div>

        <div class="bank-hero-card__value">
          {moneyPrivacidade(carteira.valorMercadoAtualCentavos)}
        </div>

        {/* Métricas Compactas */}
        <div class="bank-hero-card__meta-row">
          <div class="bank-hero-card__meta-item">
            <span class="bank-hero-card__meta-label">Total Investido</span>
            <span class="bank-hero-card__meta-val" style="color:var(--text);">
              {moneyPrivacidade(carteira.totalInvestidoCentavos)}
            </span>
          </div>

          <div class="bank-hero-card__meta-item" style="text-align:right;">
            <span class="bank-hero-card__meta-label">Retorno Total</span>
            <span
              class="bank-hero-card__meta-val"
              style={{
                color: carteira.lucroNaoRealizadoTotalCentavos >= 0 ? "var(--in)" : "var(--out)",
              }}
            >
              {signedPrivacidade(carteira.lucroNaoRealizadoTotalCentavos)} ({carteira.rentabilidadeTotalPct.toFixed(1)}%)
            </span>
          </div>
        </div>

        {/* Proventos Estimados */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "6px",
            borderTop: "1px dashed var(--border-soft)",
            fontSize: "0.72rem",
          }}
        >
          <span style="color:var(--text-muted);">Proventos / Mês:</span>
          <strong style="color:var(--in);font-variant-numeric:tabular-nums;">
            ~{moneyPrivacidade(carteira.rendaMensalEstimadaCentavos)}
          </strong>
        </div>

        {/* Botão de Nova Operação */}
        <div style="margin-top:10px;">
          <button
            type="button"
            class="btn btn--primary"
            style="width:100%;min-height:38px;border-radius:12px;font-size:0.82rem;gap:6px;"
            onClick={() => {
              setTickerOperacao("");
              setOperacaoEdicao(null);
              setModalOperacaoAberta(true);
            }}
          >
            <Icon name="plus" /> Registrar Compra / Venda
          </button>
        </div>
      </section>

      {/* 3. Segmented de Abas: Minha Carteira vs Radar B3 vs Histórico */}
      <div class="mobile-segmented" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:4px;">
        <button
          type="button"
          class={`mobile-segmented__btn ${abaAtiva === "carteira" ? "is-active" : ""}`}
          onClick={() => setAbaAtiva("carteira")}
        >
          <Icon name="wallet" style="width:13px;height:13px;" />
          Carteira ({carteira.posicoes.length})
        </button>

        <button
          type="button"
          class={`mobile-segmented__btn ${abaAtiva === "radar" ? "is-active" : ""}`}
          onClick={() => setAbaAtiva("radar")}
        >
          <Icon name="sparkles" style="width:13px;height:13px;" />
          Radar B3
        </button>

        <button
          type="button"
          class={`mobile-segmented__btn ${abaAtiva === "operacoes" ? "is-active" : ""}`}
          onClick={() => setAbaAtiva("operacoes")}
        >
          <Icon name="list" style="width:13px;height:13px;" />
          Operações ({ops.length})
        </button>
      </div>

      {/* 4. CONTEÚDO: ABA MINHA CARTEIRA */}
      {abaAtiva === "carteira" && (
        <>
          {carteira.posicoes.length === 0 ? (
            <div class="card empty" style="border-radius:16px;padding:24px 16px;">
              <Icon name="chart" />
              <h3 style="font-size:0.95rem;font-weight:700;margin:0;">Nenhum ativo na carteira</h3>
              <p style="font-size:0.75rem;color:var(--text-muted);margin:4px 0 14px;">
                Registre sua primeira compra de ações ou FIIs para acompanhar rentabilidade e proventos.
              </p>
              <button
                type="button"
                class="btn btn--primary btn--sm"
                onClick={() => {
                  setTickerOperacao("");
                  setOperacaoEdicao(null);
                  setModalOperacaoAberta(true);
                }}
              >
                <Icon name="plus" /> Registrar Ativo
              </button>
            </div>
          ) : (
            <div style="display:flex;flex-direction:column;gap:8px;">
              {/* Card Efeito Bola de Neve (Barsi Dividend Growth) */}
              <div
                class="card"
                style="border-radius:14px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);"
              >
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                  <div style="display:flex;align-items:center;gap:6px;">
                    <Icon name="sparkles" style="width:14px;height:14px;color:var(--primary);" />
                    <strong style="font-size:0.80rem;color:var(--text);text-transform:uppercase;letter-spacing:0.04em;">
                      Efeito Bola de Neve
                    </strong>
                  </div>
                  <span class="badge" style="background:var(--primary-soft);color:var(--primary);font-size:0.68rem;font-weight:700;">
                    YoC Médio {carteira.yieldOnCostMedioPct.toFixed(1)}%
                  </span>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.72rem;">
                  <div style="background:var(--surface-soft);padding:8px;border-radius:10px;">
                    <div style="color:var(--text-muted);font-size:0.64rem;">Em 1 Ano (Proventos)</div>
                    <div style="font-weight:800;color:var(--in);margin-top:2px;">
                      +{money(carteira.projecaoBolaDeNeve.em1AnoCentavos)}
                    </div>
                  </div>
                  <div style="background:var(--surface-soft);padding:8px;border-radius:10px;">
                    <div style="color:var(--text-muted);font-size:0.64rem;">Em 3 Anos</div>
                    <div style="font-weight:800;color:var(--in);margin-top:2px;">
                      +{money(carteira.projecaoBolaDeNeve.em3AnosCentavos)}
                    </div>
                  </div>
                  <div style="background:var(--surface-soft);padding:8px;border-radius:10px;">
                    <div style="color:var(--text-muted);font-size:0.64rem;">Em 5 Anos (~{money(carteira.projecaoBolaDeNeve.rendaMensalEm5AnosCentavos)}/mês)</div>
                    <div style="font-weight:800;color:var(--primary);margin-top:2px;">
                      +{money(carteira.projecaoBolaDeNeve.em5AnosCentavos)}
                    </div>
                  </div>
                  <div style="background:var(--surface-soft);padding:8px;border-radius:10px;">
                    <div style="color:var(--text-muted);font-size:0.64rem;">Em 10 Anos (Meta Barsi)</div>
                    <div style="font-weight:800;color:var(--primary);margin-top:2px;">
                      +{money(carteira.projecaoBolaDeNeve.em10AnosCentavos)}
                    </div>
                  </div>
                </div>
              </div>

              {carteira.posicoes.map((pos) => {
                const rentPositiva = pos.lucroPrejuizoCentavos >= 0;
                return (
                  <div
                    key={pos.ticker}
                    class="card"
                    style={{
                      borderRadius: "14px",
                      padding: "12px 14px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      cursor: "pointer",
                    }}
                    onClick={() => abrirRaioX(pos.ticker)}
                  >
                    {/* Linha 1: Ticker, Badges e Cotação */}
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                      <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-weight:800;font-size:0.95rem;color:var(--text);letter-spacing:0.02em;">
                          {pos.ticker}
                        </span>
                        {pos.isBestt && (
                          <span
                            class="badge"
                            style="font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--primary-soft);color:var(--primary);"
                          >
                            BESTT
                          </span>
                        )}
                        {pos.moeda === "USD" && (
                          <span
                            class="badge"
                            style="font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:6px;background:var(--warn-soft);color:var(--warn);"
                          >
                            USD
                          </span>
                        )}
                      </div>

                      <div style="text-align:right;">
                        <span style="font-size:0.95rem;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;">
                          {money(pos.cotacaoAtualCentavos)}
                        </span>
                      </div>
                    </div>

                    {/* Linha 2: Quantidade, PM e Total em Carteira */}
                    <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.74rem;color:var(--text-muted);">
                      <span>
                        {pos.quantidade} cotas • PM: {money(pos.precoMedioCentavos)}
                      </span>
                      <strong style="color:var(--text);font-size:0.80rem;font-variant-numeric:tabular-nums;">
                        {moneyPrivacidade(pos.valorMercadoAtualCentavos)}
                      </strong>
                    </div>

                    {/* Linha 3: Retorno e Preço Teto Bazin */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingTop: "6px",
                        borderTop: "1px dashed var(--border-soft)",
                        fontSize: "0.72rem",
                      }}
                    >
                      <div style="display:flex;align-items:center;gap:4px;">
                        <span style="color:var(--text-muted);">Retorno:</span>
                        <span
                          style={{
                            fontWeight: "700",
                            color: rentPositiva ? "var(--in)" : "var(--out)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {signedPrivacidade(pos.lucroPrejuizoCentavos)} ({pos.rentabilidadePct.toFixed(1)}%)
                        </span>
                      </div>

                      {pos.precoTetoBazinCentavos > 0 && (
                        <div style="display:flex;align-items:center;gap:4px;">
                          <span style="color:var(--text-muted);">Teto Bazin:</span>
                          <span style="font-weight:700;color:var(--text);">
                            {money(pos.precoTetoBazinCentavos)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Botões de Ação Rápida */}
                    <div
                      style="display:flex;gap:6px;margin-top:2px;"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        class="btn btn--ghost btn--sm"
                        style="flex:1;min-height:30px;font-size:0.72rem;padding:4px;"
                        onClick={() => abrirRaioX(pos.ticker)}
                      >
                        <Icon name="sparkles" style="width:12px;height:12px;" />
                        Raio-X
                      </button>
                      <button
                        type="button"
                        class="btn btn--secondary btn--sm"
                        style="flex:1;min-height:30px;font-size:0.72rem;padding:4px;"
                        onClick={() => abrirCompraRapida(pos.ticker)}
                      >
                        <Icon name="plus" style="width:12px;height:12px;" />
                        Operar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 5. CONTEÚDO: ABA RADAR B3 HOT 100 */}
      {abaAtiva === "radar" && (
        <>
          {/* Barra de Busca de Ticker */}
          <div style="position:relative;">
            <input
              type="search"
              class="input"
              placeholder="Buscar ação (ex: PETR4, BBAS3, VALE3)..."
              value={buscaRadar}
              onInput={(e) => setBuscaRadar((e.currentTarget as HTMLInputElement).value)}
              style="border-radius:14px;padding-left:36px;min-height:40px;background:var(--surface);font-size:0.80rem;"
            />
            <Icon
              name="sparkles"
              style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:14px;height:14px;color:var(--text-muted);pointer-events:none;"
            />
          </div>

          {/* Filtros em Chips */}
          <div class="hscroll" style="gap:4px;padding-bottom:2px;">
            <button
              type="button"
              class={`chip ${filtroRadar === "todos" ? "is-active" : ""}`}
              onClick={() => setFiltroRadar("todos")}
            >
              Todos ({radarItems.length})
            </button>
            <button
              type="button"
              class={`chip ${filtroRadar === "oportunidades" ? "is-active" : ""}`}
              onClick={() => setFiltroRadar("oportunidades")}
            >
              Oportunidades
            </button>
            <button
              type="button"
              class={`chip ${filtroRadar === "bestt" ? "is-active" : ""}`}
              onClick={() => setFiltroRadar("bestt")}
            >
              Ações BESTT
            </button>
            <button
              type="button"
              class={`chip ${filtroRadar === "aristocratas" ? "is-active" : ""}`}
              onClick={() => setFiltroRadar("aristocratas")}
            >
              Aristocratas
            </button>
            <button
              type="button"
              class={`chip ${filtroRadar === "dividendos" ? "is-active" : ""}`}
              onClick={() => setFiltroRadar("dividendos")}
            >
              DY &gt; 6%
            </button>
            <button
              type="button"
              class={`chip ${filtroRadar === "baratas" ? "is-active" : ""}`}
              onClick={() => setFiltroRadar("baratas")}
            >
              P/VP &lt; 1
            </button>
          </div>

          {/* Lista de Ativos do Radar */}
          {carregandoMercado && radarItems.length === 0 ? (
            <div class="card" style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.82rem;">
              Carregando cotações e inteligência B3...
            </div>
          ) : radarFiltrados.length === 0 ? (
            <div class="card empty" style="border-radius:14px;padding:20px;">
              <Icon name="search" />
              <p style="font-size:0.80rem;color:var(--text-muted);margin:0;">Nenhum ativo encontrado para os filtros selecionados.</p>
            </div>
          ) : (
            <div style="display:flex;flex-direction:column;gap:8px;">
              {radarFiltrados.slice(0, 30).map((ativo) => {
                const abaixoDoTeto = ativo.bazinCeilingPrice > 0 && ativo.price <= ativo.bazinCeilingPrice;
                return (
                  <div
                    key={ativo.symbol}
                    class="card"
                    style={{
                      borderRadius: "14px",
                      padding: "12px 14px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      cursor: "pointer",
                    }}
                    onClick={() => setAtivoRaioX(ativo)}
                  >
                    {/* Linha 1: Ticker, Setor e Cotação */}
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                      <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-weight:800;font-size:0.95rem;color:var(--text);">
                          {ativo.symbol}
                        </span>
                        {abaixoDoTeto && (
                          <span
                            class="badge"
                            style="font-size:0.62rem;font-weight:700;padding:2px 5px;border-radius:6px;background:var(--in-soft);color:var(--in);"
                          >
                            Abaixo do Teto
                          </span>
                        )}
                        <span style="font-size:0.68rem;color:var(--text-muted);">
                          {ativo.sector || "B3"}
                        </span>
                      </div>

                      <div style="text-align:right;">
                        <span style="font-size:0.95rem;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;">
                          R$ {ativo.price.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Linha 2: Indicadores Fundamentalistas */}
                    <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.72rem;color:var(--text-muted);">
                      <span>
                        DY: <strong style="color:var(--in);">{ativo.dividendYield.toFixed(1)}%</strong> • P/VP: <strong>{ativo.priceToBook > 0 ? ativo.priceToBook.toFixed(2) : "-"}</strong> • P/L: <strong>{ativo.trailingPE > 0 ? ativo.trailingPE.toFixed(1) : "-"}</strong>
                      </span>
                      {ativo.bazinCeilingPrice > 0 && (
                        <span>
                          Teto: <strong style="color:var(--text);">R$ {ativo.bazinCeilingPrice.toFixed(2)}</strong>
                        </span>
                      )}
                    </div>

                    {/* Ações */}
                    <div
                      style="display:flex;gap:6px;margin-top:2px;"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        class="btn btn--ghost btn--sm"
                        style="flex:1;min-height:30px;font-size:0.72rem;padding:4px;"
                        onClick={() => setAtivoRaioX(ativo)}
                      >
                        <Icon name="sparkles" style="width:12px;height:12px;" />
                        Raio-X do Ativo
                      </button>
                      <button
                        type="button"
                        class="btn btn--primary btn--sm"
                        style="flex:1;min-height:30px;font-size:0.72rem;padding:4px;"
                        onClick={() => abrirCompraRapida(ativo.symbol)}
                      >
                        <Icon name="plus" style="width:12px;height:12px;" />
                        Comprar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 5.5 CONTEÚDO: ABA HISTÓRICO DE OPERAÇÕES */}
      {abaAtiva === "operacoes" && (
        <div style="display:flex;flex-direction:column;gap:8px;">
          {ops.length === 0 ? (
            <div class="card empty" style="border-radius:16px;padding:24px;">
              <Icon name="list" />
              <h3 style="font-size:0.95rem;font-weight:700;margin:0;">Nenhuma operação registrada</h3>
              <p style="font-size:0.75rem;color:var(--text-muted);margin:4px 0 12px;">
                Registre suas compras e vendas de ações ou FIIs para auditar o histórico.
              </p>
              <button
                type="button"
                class="btn btn--primary btn--sm"
                onClick={() => {
                  setTickerOperacao("");
                  setOperacaoEdicao(null);
                  setModalOperacaoAberta(true);
                }}
              >
                <Icon name="plus" /> Nova Operação
              </button>
            </div>
          ) : (
            [...ops]
              .sort((a, b) => b.data.localeCompare(a.data))
              .map((op) => {
                const isCompra = op.tipo === "compra";
                const totalOp = (op.quantidade * op.precoUnitarioCentavos) + (op.taxasCentavos || 0);

                return (
                  <div
                    key={op.id}
                    class="card"
                    style={{
                      borderRadius: "14px",
                      padding: "10px 12px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      setOperacaoEdicao(op);
                      setTickerOperacao(op.ticker);
                      setModalOperacaoAberta(true);
                    }}
                  >
                    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                      <div
                        class="mobile-tx-card__icon"
                        style={{
                          background: isCompra ? "var(--in-soft)" : "var(--out-soft)",
                          color: isCompra ? "var(--in)" : "var(--out)",
                          width: "32px",
                          height: "32px",
                          flexShrink: 0,
                        }}
                      >
                        <Icon name={isCompra ? "arrowDown" : "arrowUp"} style="width:16px;height:16px;" />
                      </div>

                      <div style="flex:1;min-width:0;">
                        <div style="font-size:0.85rem;font-weight:800;color:var(--text);letter-spacing:0.02em;">
                          {op.ticker} • {isCompra ? "Compra" : "Venda"}
                        </div>
                        <div style="font-size:0.68rem;color:var(--text-muted);">
                          {op.data.split("-").reverse().join("/")} • {op.quantidade} cotas a {money(op.precoUnitarioCentavos)}
                          {op.corretora ? ` • ${op.corretora}` : ""}
                        </div>
                      </div>
                    </div>

                    <div style="text-align:right;flex-shrink:0;">
                      <div
                        style={{
                          fontSize: "0.88rem",
                          fontWeight: "800",
                          color: isCompra ? "var(--text)" : "var(--in)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {money(totalOp)}
                      </div>
                      <span style="font-size:0.64rem;color:var(--text-muted);">
                        {op.moeda || "BRL"}
                      </span>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* 6. MODAIS DE INVESTIMENTOS */}
      {modalOperacaoAberta && (
        <ModalOperacaoInvestimento
          isOpen={true}
          operacao={operacaoEdicao}
          tickerInicial={tickerOperacao}
          empresaId={emp.id}
          anoId={ano?.id}
          onClose={() => {
            setModalOperacaoAberta(false);
            setOperacaoEdicao(null);
          }}
          onSave={async (dadosOp) => {
            if (operacaoEdicao?.id) {
              await operacoesInvestimento.update(operacaoEdicao.id, dadosOp);
              toast.success("Operação atualizada!");
            } else {
              await operacoesInvestimento.create(dadosOp);
              toast.success("Operação registrada!");
            }
            setRefreshKey((k) => k + 1);
          }}
          onDelete={async (id) => {
            await operacoesInvestimento.remove(id);
            toast.success("Operação excluída!");
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {ativoRaioX && (
        <ModalRaioXAtivo
          ativo={ativoRaioX}
          onClose={() => setAtivoRaioX(null)}
        />
      )}
    </div>
  );
}

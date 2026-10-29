import { useState, useEffect } from "preact/hooks";
import { Icon } from "../Icon.tsx";
import { ModalRaioXAtivo } from "./ModalRaioXAtivo.tsx";
import { fetchHotlist, searchTicker } from "../../lib/marketApi.ts";
import type { LongTermAnalysis } from "../../data/types.ts";

export function HotMarketView() {
  const [items, setItems] = useState<LongTermAnalysis[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const [totalScanned, setTotalScanned] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filtroMercado, setFiltroMercado] = useState<"todos" | "B3" | "GLOBAL">("todos");
  const [filtroBestt, setFiltroBestt] = useState<boolean>(false);
  const [filtroAristocratas, setFiltroAristocratas] = useState<boolean>(false);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "oportunidade" | "alerta">("todos");
  const [ordenacao, setOrdenacao] = useState<"score" | "margem" | "yield" | "pl">("score");

  // Busca individual de ativo
  const [buscaTicker, setBuscaTicker] = useState<string>("");
  const [buscando, setBuscando] = useState<boolean>(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);

  // Ativo selecionado para o Raio-X
  const [ativoSelecionado, setAtivoSelecionado] = useState<LongTermAnalysis | null>(null);

  const carregarDados = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetchHotlist(forceRefresh);
      setItems(res.items);
      setUpdatedAt(res.updatedAt);
      if (res.scanned) setTotalScanned(res.scanned);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    carregarDados(false);
  }, []);

  const handleBuscarTicker = async (e: Event) => {
    e.preventDefault();
    const query = buscaTicker.trim();
    if (!query) return;

    setBuscando(true);
    setErroBusca(null);
    try {
      const data = await searchTicker(query);
      setAtivoSelecionado(data);

      // Insere o ativo pesquisado na lista caso ainda não esteja presente
      setItems((prev) => {
        const jaExiste = prev.some((it) => it.symbol === data.symbol);
        if (!jaExiste) {
          return [data, ...prev];
        }
        return prev;
      });

      // Se houver filtros restritivos ativos que esconderiam o ativo, reseta-os
      if (filtroStatus !== "todos") setFiltroStatus("todos");
      if (filtroBestt && !data.isBestt) setFiltroBestt(false);
      if (filtroAristocratas && !data.isAristocrat) setFiltroAristocratas(false);

      setBuscaTicker("");
    } catch (err: any) {
      setErroBusca(err?.message || "Não foi possível carregar os dados deste ativo.");
    } finally {
      setBuscando(false);
    }
  };

  // Filtragem
  const filtrados = items.filter((it) => {
    if (filtroMercado !== "todos" && it.market !== filtroMercado) return false;
    if (filtroBestt && !it.isBestt) return false;
    if (filtroAristocratas && !it.isAristocrat) return false;
    if (filtroStatus !== "todos" && it.status !== filtroStatus) return false;
    return true;
  });

  // Ordenação
  const ordenados = [...filtrados].sort((a, b) => {
    if (ordenacao === "score") {
      return b.score - a.score;
    }
    if (ordenacao === "margem") {
      return b.margemSegurancaBazin - a.margemSegurancaBazin;
    }
    if (ordenacao === "yield") {
      return b.dividendYield - a.dividendYield;
    }
    if (ordenacao === "pl") {
      const plA = a.pl && a.pl > 0 ? a.pl : 999;
      const plB = b.pl && b.pl > 0 ? b.pl : 999;
      return plA - plB;
    }
    return 0;
  });

  const fmtPreco = (v: number, cur: string) => {
    const symbol = cur === "BRL" ? "R$ " : "$ ";
    return symbol + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatHoraAtualizacao = (ts: number) => {
    if (!ts) return "Hoje";
    const d = new Date(ts);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div class="stack" style="gap: var(--sp-4);">
      {/* Barra de Pesquisa Global de Qualquer Ativo */}
      <section class="card" style="padding: var(--sp-4); background: var(--surface-card);">
        <div style="display: flex; flex-direction: column; gap: var(--sp-2);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                <Icon name="search" style="color: var(--primary);" />
                Pesquisar Qualquer Ativo Mundial (B3, EUA e Exterior)
              </h3>
              <p class="muted" style="font-size: 0.8rem; margin: 4px 0 0;">
                O ativo não está no Hot 100? Digite o código para consultar cotação ao vivo, Preço Teto Bazin e Score instantaneamente.
              </p>
            </div>

            <button
              class="btn btn--secondary btn--sm"
              onClick={() => carregarDados(true)}
              disabled={refreshing || loading}
              title="Dispara nova varredura completa de cotações em tempo real"
            >
              <Icon name="refresh" />
              {refreshing ? "Varrendo Mercado..." : "Sincronizar Cotações de Hoje"}
            </button>
          </div>

          <form onSubmit={handleBuscarTicker} style="display: flex; gap: 8px; margin-top: 8px;">
            <input
              type="text"
              class="input"
              placeholder="Digite o código (ex: BBAS3, TAEE11, AAPL, KO, SAPR11)..."
              value={buscaTicker}
              onInput={(e) => setBuscaTicker((e.target as HTMLInputElement).value)}
              style="flex: 1; font-weight: 600; text-transform: uppercase;"
              disabled={buscando}
            />
            <button type="submit" class="btn btn--primary" disabled={buscando || !buscaTicker.trim()}>
              {buscando ? (
                <>
                  <Icon name="refresh" /> Analisando...
                </>
              ) : (
                <>
                  <Icon name="search" /> Analisar
                </>
              )}
            </button>
          </form>

          {erroBusca && (
            <div style="color: var(--out); font-size: 0.82rem; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
              <Icon name="alertTriangle" style="width: 14px; height: 14px;" /> {erroBusca}
            </div>
          )}
        </div>
      </section>

      {/* Cockpit de Filosofia & Filtros */}
      <section class="card" style="padding: var(--sp-3) var(--sp-4);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          {/* Segmentos de Mercado */}
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button
              class={`btn btn--sm ${filtroMercado === "todos" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroMercado("todos")}
            >
              Top 100 Geral ({items.length})
            </button>
            <button
              class={`btn btn--sm ${filtroMercado === "B3" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroMercado("B3")}
            >
              B3 (Brasil) ({items.filter((i) => i.market === "B3").length})
            </button>
            <button
              class={`btn btn--sm ${filtroMercado === "GLOBAL" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroMercado("GLOBAL")}
            >
              Globais ({items.filter((i) => i.market === "GLOBAL").length})
            </button>
            <button
              class={`btn btn--sm ${filtroBestt ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroBestt(!filtroBestt)}
              style={filtroBestt ? { background: "#2563eb", borderColor: "#2563eb" } : {}}
            >
              Setores Perenes ({items.filter((i) => i.isBestt).length})
            </button>
            <button
              class={`btn btn--sm ${filtroAristocratas ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroAristocratas(!filtroAristocratas)}
              style={filtroAristocratas ? { background: "#ca8a04", borderColor: "#ca8a04" } : {}}
            >
              Aristocratas S&P ({items.filter((i) => i.isAristocrat).length})
            </button>
            <button
              class={`btn btn--sm ${filtroStatus === "oportunidade" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroStatus(filtroStatus === "oportunidade" ? "todos" : "oportunidade")}
            >
              Abaixo do Teto ({items.filter((i) => i.status === "oportunidade").length})
            </button>
            <button
              class={`btn btn--sm ${filtroStatus === "alerta" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroStatus(filtroStatus === "alerta" ? "todos" : "alerta")}
              style={filtroStatus === "alerta" ? { background: "var(--out)", borderColor: "var(--out)" } : {}}
            >
              Alerta Fundamentalista ({items.filter((i) => i.status === "alerta").length})
            </button>
          </div>

          {/* Ordenação */}
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="muted" style="font-size: 0.8rem; white-space: nowrap;">Ordenar por:</span>
            <select
              class="select"
              value={ordenacao}
              onChange={(e) => setOrdenacao((e.target as HTMLSelectElement).value as any)}
              style="padding: 4px 8px; font-size: 0.8rem; height: auto;"
            >
              <option value="score">Score Geral (Melhor ao Pior)</option>
              <option value="margem">Maior Margem de Segurança Bazin</option>
              <option value="yield">Maior Dividend Yield</option>
              <option value="pl">Menor P/L (Preço sobre Lucro)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Tabela Ranqueada: Top 100 Diário */}
      <section class="card card--table">
        <div class="card__head" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <h2 class="card__title" style="display: flex; align-items: center; gap: 6px;">
              <Icon name="chart" /> Top 100: Melhores Oportunidades de Mercado ({ordenados.length} listados)
            </h2>
            <div class="muted" style="font-size: 0.75rem; margin-top: 2px;">
              Varredura diária de {totalScanned > 0 ? totalScanned : "160+"} empresas da B3 e Bolsas Globais • Atualizado em {formatHoraAtualizacao(updatedAt)}
            </div>
          </div>

          <span class="muted" style="font-size: 0.75rem;">
            Critérios: Barsi (BESTT) + Bazin Brasil (6%) / Bazin Global (2,5% - Graham & Siegel) + Filtro Anti-Armadilha
          </span>
        </div>

        <div class="matriz-scroll-hint only-mobile" style="margin-bottom:var(--sp-2);">
          <Icon name="arrowLeftRight" style="width:12px;height:12px;" />
          <span>Deslize para ver Preço Teto, Margem, Yield, P/L e Score</span>
        </div>

        {loading ? (
          <div style="padding: 32px; text-align: center;" class="muted">
            <Icon name="refresh" /> Carregando indicadores e cotações de mercado...
          </div>
        ) : ordenados.length === 0 ? (
          <div style="padding: 32px; text-align: center;" class="muted">
            Nenhum ativo encontrado com os filtros selecionados.
          </div>
        ) : (
          <>
            <div class="table-wrap table-wrap--mobile-bleed hide-mobile">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 48px; text-align: center;">#</th>
                  <th class="col-reserva" style="text-align: left;">Ativo</th>
                  <th style="text-align: right;">Cotação</th>
                  <th style="text-align: right;">Preço Teto</th>
                  <th style="text-align: right;">Margem Bazin</th>
                  <th style="text-align: right;">DY Anual</th>
                  <th style="text-align: right;">P/L</th>
                  <th style="text-align: right;">P/VP</th>
                  <th style="text-align: center;">Score</th>
                  <th style="text-align: center;">Veredito</th>
                  <th style="width: 80px; text-align: center;">Raio-X</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map((item, index) => {
                  const scoreCor =
                    item.score >= 75
                      ? "var(--in)"
                      : item.score >= 50
                      ? "var(--alerta, #f59e0b)"
                      : "var(--out)";

                  return (
                    <tr
                      key={item.symbol}
                      style="cursor: pointer;"
                      onClick={() => setAtivoSelecionado(item)}
                    >
                      <td style="text-align: center; font-weight: 700; color: var(--text-muted); font-size: 0.8rem;">
                        #{index + 1}
                      </td>

                      <td class="col-reserva">
                        <div style="display: flex; align-items: center; gap: 6px;">
                          <span style="font-weight: 800; font-size: 0.85rem; color: var(--text);">
                            {item.symbol}
                          </span>
                          <span class="badge" style="font-size: 0.62rem; padding: 1px 4px;">
                            {item.market}
                          </span>
                          {item.isBestt && (
                            <span
                              class="badge"
                              style="font-size: 0.65rem; padding: 1px 4px; background: rgba(37, 99, 235, 0.12); color: #2563eb; border: 1px solid rgba(37, 99, 235, 0.3);"
                              title={`Setor perene BESTT (${item.besttCategory})`}
                            >
                              Perene: {item.besttCategory}
                            </span>
                          )}
                          {item.isAristocrat && (
                            <span
                              class="badge"
                              style="font-size: 0.65rem; padding: 1px 4px; background: rgba(234, 179, 8, 0.12); color: #ca8a04; border: 1px solid rgba(234, 179, 8, 0.3);"
                              title="S&P 500 Dividend Aristocrat: mais de 25 anos consecutivos elevando proventos (Critério Graham)"
                            >
                              Aristocrata S&P
                            </span>
                          )}
                        </div>
                        <div
                          class="muted hide-mobile"
                          style="font-size: 0.72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 190px;"
                        >
                          {item.name}
                        </div>
                      </td>

                      <td class="num" style="text-align: right; font-weight: 700;">
                        {fmtPreco(item.price, item.currency)}
                      </td>

                      <td class="num muted" style="text-align: right;">
                        {item.precoTetoBazin > 0 ? fmtPreco(item.precoTetoBazin, item.currency) : "—"}
                      </td>

                      <td
                        class="num"
                        style={{
                          textAlign: "right",
                          fontWeight: "700",
                          color: item.margemSegurancaBazin >= 0 ? "var(--in)" : "var(--out)",
                        }}
                      >
                        {item.margemSegurancaBazin > -100
                          ? `${item.margemSegurancaBazin >= 0 ? "+" : ""}${item.margemSegurancaBazin.toFixed(0)}%`
                          : "Sem margem"}
                      </td>

                      <td class="num" style="text-align: right; font-weight: 700; color: var(--in);">
                        {item.dividendYield.toFixed(1)}%
                      </td>

                      <td class="num muted" style="text-align: right;">
                        {item.pl && item.pl > 0 ? `${item.pl}x` : "—"}
                      </td>

                      <td class="num muted" style="text-align: right;">
                        {item.pvp ? `${item.pvp}x` : "—"}
                      </td>

                      <td style="text-align: center;">
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontWeight: "800",
                            fontSize: "0.78rem",
                            background: `rgba(${
                              item.score >= 75 ? "16, 185, 129" : item.score >= 50 ? "245, 158, 11" : "239, 68, 68"
                            }, 0.15)`,
                            color: scoreCor,
                          }}
                        >
                          {item.score}
                        </span>
                      </td>

                      <td style="text-align: center;">
                        <span
                          class={`badge ${
                            item.status === "oportunidade"
                              ? "badge--receber"
                              : item.status === "neutro"
                              ? "badge--neutro"
                              : "badge--pagar"
                          }`}
                          style="font-size: 0.68rem; padding: 2px 6px;"
                        >
                          {item.status === "oportunidade"
                            ? "Comprar"
                            : item.status === "neutro"
                            ? "Observar"
                            : "Alerta"}
                        </span>
                      </td>

                      <td style="text-align: center;">
                        <button
                          class="btn btn--secondary btn--sm"
                          style="padding: 2px 8px; font-size: 0.72rem;"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAtivoSelecionado(item);
                          }}
                        >
                          Raio-X
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cards Mobile First do Radar */}
          <div class="only-mobile invest-mobile-list" style="padding: 12px var(--sp-2);">
            {ordenados.map((item, index) => {
              const scoreCor =
                item.score >= 75
                  ? "var(--in)"
                  : item.score >= 50
                  ? "var(--alerta, #f59e0b)"
                  : "var(--out)";

              return (
                <div
                  key={`mob-hot-${item.symbol}`}
                  class="invest-card-mobile"
                  onClick={() => setAtivoSelecionado(item)}
                  style="cursor: pointer;"
                >
                  <div class="invest-card-mobile__header">
                    <div>
                      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted);">
                          #{index + 1}
                        </span>
                        <span class="invest-card-mobile__ticker">{item.symbol}</span>
                        <span class="badge badge--neutral" style="font-size: 0.65rem;">{item.market}</span>
                        {item.isBestt && (
                          <span class="badge" style="font-size: 0.62rem; background: rgba(37, 99, 235, 0.12); color: #2563eb;">
                            {item.besttCategory}
                          </span>
                        )}
                        {item.isAristocrat && (
                          <span class="badge" style="font-size: 0.62rem; background: rgba(234, 179, 8, 0.12); color: #ca8a04;">
                            Aristocrata
                          </span>
                        )}
                      </div>
                      <div class="muted" style="font-size: 0.75rem; margin-top: 2px;">
                        {item.name}
                      </div>
                    </div>

                    <div style="text-align: right;">
                      <span
                        class="badge"
                        style={{
                          fontSize: "0.68rem",
                          background: `color-mix(in srgb, ${scoreCor} 16%, transparent)`,
                          color: scoreCor,
                          fontWeight: "800",
                        }}
                      >
                        Score {item.score}
                      </span>
                      <div class="num" style="font-size: 0.95rem; font-weight: 800; color: var(--text); margin-top: 2px;">
                        {fmtPreco(item.price, item.currency)}
                      </div>
                    </div>
                  </div>

                  <div class="invest-card-mobile__grid">
                    <div>
                      <div class="invest-card-mobile__item-label">Preço Teto Bazin</div>
                      <div class="invest-card-mobile__item-val num">
                        {item.precoTetoBazin > 0 ? fmtPreco(item.precoTetoBazin, item.currency) : "—"}
                      </div>
                    </div>
                    <div>
                      <div class="invest-card-mobile__item-label">Margem de Segurança</div>
                      <div class="invest-card-mobile__item-val num" style={{ color: item.margemSegurancaBazin >= 0 ? "var(--in)" : "var(--out)" }}>
                        {item.margemSegurancaBazin >= 0 ? "+" : ""}{item.margemSegurancaBazin.toFixed(0)}%
                      </div>
                    </div>
                    <div>
                      <div class="invest-card-mobile__item-label">Dividend Yield</div>
                      <div class="invest-card-mobile__item-val num" style="color: #9333ea;">
                        {item.dividendYield.toFixed(1)}% a.a.
                      </div>
                    </div>
                    <div>
                      <div class="invest-card-mobile__item-label">Múltiplos (P/L e P/VP)</div>
                      <div class="invest-card-mobile__item-val num">
                        {item.pl ? `${item.pl.toFixed(1)}x` : "—"} · {item.pvp ? `${item.pvp.toFixed(2)}x` : "—"}
                      </div>
                    </div>
                  </div>

                  <div class="invest-card-mobile__footer">
                    <span
                      class={`badge ${
                        item.status === "oportunidade"
                          ? "badge--in"
                          : item.status === "neutro"
                          ? "badge--neutral"
                          : "badge--out"
                      }`}
                      style="font-size: 0.72rem; padding: 2px 8px;"
                    >
                      {item.status === "oportunidade"
                        ? "Comprar (Abaixo do Teto)"
                        : item.status === "neutro"
                        ? "Observar"
                        : "Alerta Fundamentalista"}
                    </span>

                    <button
                      type="button"
                      class="btn btn--secondary btn--xs"
                      style="padding: 3px 12px; font-size: 0.75rem;"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAtivoSelecionado(item);
                      }}
                    >
                      <Icon name="chart" /> Raio-X
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      </section>

      {/* Modal de Raio-X Detalhado */}
      {ativoSelecionado && (
        <ModalRaioXAtivo
          ativo={ativoSelecionado}
          onClose={() => setAtivoSelecionado(null)}
        />
      )}
    </div>
  );
}

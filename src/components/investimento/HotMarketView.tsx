import { useState, useEffect } from "preact/hooks";
import { Icon } from "../Icon.tsx";
import { ModalRaioXAtivo } from "./ModalRaioXAtivo.tsx";
import { fetchHotlist, searchTicker } from "../../lib/marketApi.ts";
import type { LongTermAnalysis } from "../../data/types.ts";

export function HotMarketView() {
  const [items, setItems] = useState<LongTermAnalysis[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filtroMercado, setFiltroMercado] = useState<"todos" | "B3" | "GLOBAL">("todos");
  const [filtroBestt, setFiltroBestt] = useState<boolean>(false);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "oportunidade" | "alerta">("todos");
  const [ordenacao, setOrdenacao] = useState<"score" | "margem" | "yield" | "divida">("score");

  // Busca individual de ativo
  const [buscaTicker, setBuscaTicker] = useState<string>("");
  const [buscando, setBuscando] = useState<boolean>(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);

  // Ativo selecionado para o Raio-X
  const [ativoSelecionado, setAtivoSelecionado] = useState<LongTermAnalysis | null>(null);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const lista = await fetchHotlist();
      setItems(lista);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    carregarDados();
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
    if (ordenacao === "divida") {
      const divA = a.dividaEbitda ?? 99;
      const divB = b.dividaEbitda ?? 99;
      return divA - divB;
    }
    return 0;
  });

  const fmtPreco = (v: number, cur: string) => {
    const symbol = cur === "BRL" ? "R$ " : "$ ";
    return symbol + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
                Pesquisar Ativo Mundial (B3, EUA e Bolsas Globais)
              </h3>
              <p class="muted" style="font-size: 0.8rem; margin: 4px 0 0;">
                Consulte qualquer ação, FII ou ETF fora da Hotlist para calcular o Preço Teto Bazin e Score de Longo Prazo.
              </p>
            </div>

            <button
              class="btn btn--secondary btn--sm"
              onClick={() => {
                setRefreshing(true);
                carregarDados();
              }}
              disabled={refreshing}
            >
              <Icon name="refresh" />
              {refreshing ? "Atualizando..." : "Recarregar Lista"}
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
            <div style="color: var(--out); font-size: 0.82rem; margin-top: 4px;">
              ⚠️ {erroBusca}
            </div>
          )}
        </div>
      </section>

      {/* Cockpit de Filosofia de Investimento & Filtros */}
      <section class="card" style="padding: var(--sp-3) var(--sp-4);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          {/* Segmentos de Mercado */}
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button
              class={`btn btn--sm ${filtroMercado === "todos" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroMercado("todos")}
            >
              Todos ({items.length})
            </button>
            <button
              class={`btn btn--sm ${filtroMercado === "B3" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroMercado("B3")}
            >
              🇧🇷 B3 Brasil
            </button>
            <button
              class={`btn btn--sm ${filtroMercado === "GLOBAL" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroMercado("GLOBAL")}
            >
              🇺🇸 Globais
            </button>
            <button
              class={`btn btn--sm ${filtroBestt ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroBestt(!filtroBestt)}
              style={filtroBestt ? { background: "#9333ea", borderColor: "#9333ea" } : {}}
            >
              ⭐ Apenas BESTT
            </button>
            <button
              class={`btn btn--sm ${filtroStatus === "oportunidade" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroStatus(filtroStatus === "oportunidade" ? "todos" : "oportunidade")}
            >
              🟢 Abaixo do Teto ({items.filter((i) => i.status === "oportunidade").length})
            </button>
            <button
              class={`btn btn--sm ${filtroStatus === "alerta" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setFiltroStatus(filtroStatus === "alerta" ? "todos" : "alerta")}
              style={filtroStatus === "alerta" ? { background: "var(--out)", borderColor: "var(--out)" } : {}}
            >
              🔴 Alerta de Risco ({items.filter((i) => i.status === "alerta").length})
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
              <option value="margem">Maior Margem Bazin</option>
              <option value="yield">Maior Dividend Yield</option>
              <option value="divida">Menor Dívida/EBITDA</option>
            </select>
          </div>
        </div>
      </section>

      {/* Tabela Ranqueada: Hot Market */}
      <section class="card card--table">
        <div class="card__head" style="display: flex; justify-content: space-between; align-items: center;">
          <h2 class="card__title">
            Hot Market: Ranking do Melhor ao Pior Investimento ({ordenados.length} ativos)
          </h2>
          <span class="muted" style="font-size: 0.75rem;">
            Critérios: Barsi (BESTT) + Bazin (DY 6%) + Anti-Armadilha
          </span>
        </div>

        <div class="matriz-scroll-hint only-mobile" style="margin-bottom:var(--sp-2);">
          <Icon name="arrowLeftRight" style="width:12px;height:12px;" />
          <span>Deslize para ver Preço Teto, Margem, Yield, Dívida e Score</span>
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
          <div class="table-wrap table-wrap--mobile-bleed">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 48px; text-align: center;">#</th>
                  <th class="col-reserva" style="text-align: left;">Ativo</th>
                  <th style="text-align: right;">Cotação</th>
                  <th style="text-align: right;">Preço Teto</th>
                  <th style="text-align: right;">Margem Bazin</th>
                  <th style="text-align: right;">DY Anual</th>
                  <th style="text-align: right;">Dív./EBITDA</th>
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
                        {index === 0 && item.score >= 80 ? "🥇" : index === 1 && item.score >= 80 ? "🥈" : index === 2 && item.score >= 80 ? "🥉" : `#${index + 1}`}
                      </td>

                      <td class="col-reserva">
                        <div style="display: flex; align-items: center; gap: 6px;">
                          <span style="font-weight: 800; font-size: 0.85rem; color: var(--text);">
                            {item.symbol}
                          </span>
                          {item.isBestt && (
                            <span
                              class="badge"
                              style="font-size: 0.65rem; padding: 1px 4px; background: rgba(147, 51, 234, 0.12); color: #9333ea; border: 1px solid rgba(147, 51, 234, 0.3);"
                              title={`Setor perene BESTT (${item.besttCategory})`}
                            >
                              ⭐ {item.besttCategory}
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
                        {item.dividaEbitda !== undefined ? `${item.dividaEbitda}x` : "—"}
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

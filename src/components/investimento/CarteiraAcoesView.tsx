import { useState } from "react";
import { Icon } from "../Icon.tsx";
import { ModalOperacaoInvestimento } from "./ModalOperacaoInvestimento.tsx";
import { ModalRaioXAtivo } from "./ModalRaioXAtivo.tsx";
import { operacoesInvestimento } from "../../data/repo.ts";
import { searchTicker } from "../../lib/marketApi.ts";
import type {
  CarteiraInvestimentosConsolidada,
  LongTermAnalysis,
  OperacaoInvestimento,
  PosicaoInvestimento,
} from "../../data/types.ts";

interface Props {
  carteira: CarteiraInvestimentosConsolidada;
  operacoes: OperacaoInvestimento[];
  empresaId: string;
  anoId?: string;
  cambioUsd?: number;
  onRefresh: () => void;
}

export function CarteiraAcoesView({
  carteira,
  operacoes,
  empresaId,
  anoId,
  cambioUsd = 5.35,
  onRefresh,
}: Props) {
  const [abaVisao, setAbaVisao] = useState<"posicoes" | "boladeneve" | "historico">("posicoes");
  const [modalOperacaoAberta, setModalOperacaoAberta] = useState<boolean>(false);
  const [operacaoEdicao, setOperacaoEdicao] = useState<OperacaoInvestimento | null>(null);
  const [tickerParaOperar, setTickerParaOperar] = useState<string>("");
  const [ativoRaioX, setAtivoRaioX] = useState<LongTermAnalysis | null>(null);
  const [carregandoRaioX, setCarregandoRaioX] = useState<boolean>(false);

  const fmtMoeda = (centavos: number, moeda = "BRL") => {
    const v = centavos / 100;
    const prefix = moeda === "USD" ? "$ " : "R$ ";
    return prefix + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const abrirNovaOperacao = (sym = "") => {
    setTickerParaOperar(sym);
    setOperacaoEdicao(null);
    setModalOperacaoAberta(true);
  };

  const abrirEdicaoOperacao = (op: OperacaoInvestimento) => {
    setOperacaoEdicao(op);
    setModalOperacaoAberta(true);
  };

  const abrirRaioX = async (ticker: string) => {
    setCarregandoRaioX(true);
    try {
      const data = await searchTicker(ticker);
      setAtivoRaioX(data);
    } catch (err: any) {
      alert("Não foi possível carregar indicadores deste ativo: " + (err?.message || err));
    } finally {
      setCarregandoRaioX(false);
    }
  };

  const handleSalvarOperacao = async (dados: Omit<OperacaoInvestimento, "id" | "createdAt" | "updatedAt" | "deletedAt">) => {
    if (operacaoEdicao) {
      await operacoesInvestimento.update(operacaoEdicao.id, dados);
    } else {
      await operacoesInvestimento.create(dados);
    }
    onRefresh();
  };

  const handleExcluirOperacao = async (id: string) => {
    await operacoesInvestimento.delete(id);
    onRefresh();
  };

  const posicoes = carteira.posicoes;
  const isPositivo = carteira.lucroPrejuizoTotalCentavos >= 0;
  const temAtivosUsd = posicoes.some((p) => p.moeda === "USD");

  return (
    <div class="stack" style="gap: var(--sp-4);">
      {/* Cockpit Executivo da Carteira */}
      <section class="grid grid--stats">
        {/* Card 1: Patrimônio Atual Consolidado */}
        <div class="stat">
          <span class="stat__label">
            <span class="dot" style="background: var(--primary);" />
            Patrimônio em Custódia
          </span>
          <div class="stat__value" style="color: var(--primary);">
            {fmtMoeda(carteira.valorMercadoAtualCentavos)}
          </div>
          <div class="stat__sub" style={{ color: isPositivo ? "var(--in)" : "var(--out)", fontWeight: "700" }}>
            {isPositivo ? "+" : ""}
            {fmtMoeda(carteira.lucroPrejuizoTotalCentavos)} ({isPositivo ? "+" : ""}
            {carteira.rentabilidadeTotalPct}%)
          </div>
        </div>

        {/* Card 2: Total Investido (Custo Histórico) */}
        <div class="stat">
          <span class="stat__label">
            <span class="dot" style="background: var(--text-muted);" />
            Total Investido (Custo PM)
          </span>
          <div class="stat__value" style="color: var(--text);">
            {fmtMoeda(carteira.totalInvestidoCentavos)}
          </div>
          <div class="stat__sub">
            {carteira.lucroRealizadoTotalCentavos !== 0 && (
              <span style={{ color: carteira.lucroRealizadoTotalCentavos >= 0 ? "var(--in)" : "var(--out)" }}>
                Lucro Realizado: {fmtMoeda(carteira.lucroRealizadoTotalCentavos)} •{" "}
              </span>
            )}
            {posicoes.length} {posicoes.length === 1 ? "ativo em carteira" : "ativos em carteira"}
          </div>
        </div>

        {/* Card 3: Renda Anual Projetada (Dividendos) */}
        <div class="stat">
          <span class="stat__label">
            <span class="dot" style="background: var(--in);" />
            Proventos Anuais Projetados
          </span>
          <div class="stat__value" style="color: var(--in);">
            {fmtMoeda(carteira.proventosAnuaisTotalCentavos)}
          </div>
          <div class="stat__sub">
            R$ {((carteira.rendaMensalEstimadaCentavos) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês • R$ {((carteira.rendaDiariaEstimadaCentavos) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/dia útil
          </div>
        </div>

        {/* Card 4: Yield on Cost Médio (YoC) */}
        <div class="stat">
          <span class="stat__label">
            <span class="dot" style="background: #9333ea;" />
            Yield on Cost Médio
          </span>
          <div class="stat__value" style="color: #9333ea;">
            {carteira.yieldOnCostMedioPct}% a.a.
          </div>
          <div class="stat__sub">
            {temAtivosUsd ? `Taxa Câmbio: 1 USD = R$ ${cambioUsd.toFixed(2)}` : "Retorno em proventos s/ capital investido"}
          </div>
        </div>
      </section>

      {/* Barra de Controles e Navegação Interna */}
      <section class="card" style="padding: var(--sp-3) var(--sp-4);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div class="tabs tabs--sm" style="margin: 0;">
            <button
              type="button"
              class={`tab ${abaVisao === "posicoes" ? "is-active" : ""}`}
              onClick={() => setAbaVisao("posicoes")}
            >
              <Icon name="grid" /> Posições da Carteira ({posicoes.length})
            </button>
            <button
              type="button"
              class={`tab ${abaVisao === "boladeneve" ? "is-active" : ""}`}
              onClick={() => setAbaVisao("boladeneve")}
            >
              <Icon name="trendingUp" /> Projeção Bola de Neve
            </button>
            <button
              type="button"
              class={`tab ${abaVisao === "historico" ? "is-active" : ""}`}
              onClick={() => setAbaVisao("historico")}
            >
              <Icon name="list" /> Notas de Corretagem ({operacoes.length})
            </button>
          </div>

          <button
            type="button"
            class="btn btn--primary"
            onClick={() => abrirNovaOperacao()}
          >
            <Icon name="plus" /> Registrar Compra / Venda
          </button>
        </div>
      </section>

      {/* Visualização 1: Posições Ativas na Carteira */}
      {abaVisao === "posicoes" && (
        <section class="card card--table">
          <div class="card__head" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              <h2 class="card__title" style="display: flex; align-items: center; gap: 6px;">
                <Icon name="chart" /> Ativos em Custódia
              </h2>
              <div class="muted" style="font-size: 0.75rem; margin-top: 2px;">
                Preço Médio, Cotação ao Vivo, Indicadores de Segurança (Graham e Bazin) e Yield on Cost
              </div>
            </div>
          </div>

          {posicoes.length === 0 ? (
            <div style="padding: 40px var(--sp-4); text-align: center;">
              <div
                style="width: 56px; height: 56px; border-radius: 16px; background: rgba(16, 185, 129, 0.12); color: var(--in); display: grid; place-items: center; margin: 0 auto 12px;"
              >
                <Icon name="wallet" style="width: 28px; height: 28px;" />
              </div>
              <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700;">Nenhum ativo registrado na carteira</h3>
              <p class="muted" style="max-width: 480px; margin: 8px auto 16px; font-size: 0.82rem;">
                Registre suas compras de ações nacionais (B3) ou internacionais para monitorar o retorno real,
                Preço Médio ponderado, Preço Justo de Graham e os proventos anuais.
              </p>
              <button
                type="button"
                class="btn btn--primary"
                onClick={() => abrirNovaOperacao()}
              >
                <Icon name="plus" /> Registrar Primeira Compra
              </button>
            </div>
          ) : (
            <>
              <div class="table-wrap table-wrap--mobile-bleed hide-mobile">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-reserva" style="text-align: left;">Ativo</th>
                    <th style="text-align: right;">Cotas</th>
                    <th style="text-align: right;">Preço Médio</th>
                    <th style="text-align: right;">Cotação Atual</th>
                    <th style="text-align: right;">Total Investido</th>
                    <th style="text-align: right;">Valor Atual</th>
                    <th style="text-align: right;">Retorno</th>
                    <th style="text-align: right;" title="Yield on Cost: Proventos anuais / Preço Médio Investido">Yield on Cost</th>
                    <th style="text-align: right;">Teto Bazin</th>
                    <th style="text-align: right;">Preço Graham</th>
                    <th style="text-align: center;">Raio-X</th>
                    <th style="text-align: center;">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {posicoes.map((pos) => {
                    const lucroPos = pos.lucroPrejuizoCentavos >= 0;
                    return (
                      <tr key={pos.ticker}>
                        <td class="col-reserva">
                          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <strong style="color: var(--text); font-size: 0.9rem;">
                              {pos.ticker}
                            </strong>
                            <span class="badge" style="font-size: 0.62rem; padding: 1px 5px; font-weight: 600;">
                              {pos.market}
                            </span>
                            {pos.isBestt && (
                              <span
                                class="badge"
                                style="font-size: 0.62rem; padding: 1px 5px; background: rgba(59, 130, 246, 0.12); color: #2563eb; border: 1px solid rgba(59, 130, 246, 0.25);"
                                title="Setor Perene BESTT (Estratégia Luiz Barsi)"
                              >
                                Perene: {pos.besttCategory}
                              </span>
                            )}
                            {pos.isAristocrat && (
                              <span
                                class="badge"
                                style="font-size: 0.62rem; padding: 1px 5px; background: rgba(234, 179, 8, 0.12); color: #ca8a04; border: 1px solid rgba(234, 179, 8, 0.25);"
                                title="S&P 500 Dividend Aristocrat: 25+ anos ininterruptos de dividendos crescentes"
                              >
                                Aristocrata S&P
                              </span>
                            )}
                          </div>
                          <div
                            class="muted hide-mobile"
                            style="font-size: 0.72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;"
                          >
                            {pos.nome}
                          </div>
                        </td>

                        <td class="num" style="text-align: right; font-weight: 700;">
                          {pos.quantidadeTotal.toLocaleString("pt-BR")}
                        </td>

                        <td class="num muted" style="text-align: right;">
                          {fmtMoeda(pos.precoMedioCentavos, pos.moeda)}
                        </td>

                        <td class="num" style="text-align: right; font-weight: 700;">
                          {fmtMoeda(pos.cotacaoAtualCentavos, pos.moeda)}
                        </td>

                        <td class="num muted" style="text-align: right;">
                          {fmtMoeda(pos.totalInvestidoCentavos, pos.moeda)}
                        </td>

                        <td class="num" style="text-align: right; font-weight: 800; color: var(--text);">
                          {fmtMoeda(pos.valorMercadoAtualCentavos, pos.moeda)}
                          {pos.moeda === "USD" && (
                            <div class="muted" style="font-size: 0.68rem;">
                              ≈ {fmtMoeda(pos.valorMercadoBrlCentavos, "BRL")}
                            </div>
                          )}
                        </td>

                        <td
                          class="num"
                          style={{
                            textAlign: "right",
                            fontWeight: "800",
                            color: lucroPos ? "var(--in)" : "var(--out)",
                          }}
                        >
                          {lucroPos ? "+" : ""}
                          {fmtMoeda(pos.lucroPrejuizoCentavos, pos.moeda)}
                          <div style="font-size: 0.72rem; font-weight: 600;">
                            {lucroPos ? "+" : ""}
                            {pos.rentabilidadePct}%
                          </div>
                        </td>

                        <td class="num" style="text-align: right; font-weight: 800; color: #9333ea;">
                          {pos.yieldOnCostPct}%
                          <div class="muted" style="font-size: 0.7rem;">
                            DY: {pos.dyAtualPct}%
                          </div>
                        </td>

                        <td class="num muted" style="text-align: right;">
                          {pos.precoTetoBazinCentavos > 0 ? fmtMoeda(pos.precoTetoBazinCentavos, pos.moeda) : "—"}
                          {pos.precoTetoBazinCentavos > 0 && (
                            <div
                              style={{
                                fontSize: "0.68rem",
                                fontWeight: "700",
                                color: pos.margemBazinPM >= 0 ? "var(--in)" : "var(--out)",
                              }}
                            >
                              Margem: {pos.margemBazinPM >= 0 ? "+" : ""}{pos.margemBazinPM.toFixed(0)}%
                            </div>
                          )}
                        </td>

                        <td class="num muted" style="text-align: right;">
                          {pos.precoGrahamCentavos && pos.precoGrahamCentavos > 0
                            ? fmtMoeda(pos.precoGrahamCentavos, pos.moeda)
                            : "—"}
                          {pos.margemGrahamAtual !== undefined && (
                            <div
                              style={{
                                fontSize: "0.68rem",
                                fontWeight: "700",
                                color: pos.margemGrahamAtual >= 0 ? "var(--in)" : "var(--out)",
                              }}
                            >
                              Margem: {pos.margemGrahamAtual >= 0 ? "+" : ""}{pos.margemGrahamAtual.toFixed(0)}%
                            </div>
                          )}
                        </td>

                        <td style="text-align: center;">
                          <button
                            type="button"
                            class="btn btn--ghost btn--icon"
                            style="width: 28px; height: 28px;"
                            title="Abrir Análise e Raio-X Fundamentalista Completo"
                            onClick={() => abrirRaioX(pos.ticker)}
                            disabled={carregandoRaioX}
                          >
                            <Icon name="search" style="width: 14px; height: 14px;" />
                          </button>
                        </td>

                        <td style="text-align: center;">
                          <div style="display: flex; gap: 4px; justify-content: center;">
                            <button
                              type="button"
                              class="btn btn--ghost btn--icon"
                              style="width: 28px; height: 28px; color: var(--in);"
                              title="Comprar mais cotas"
                              onClick={() => abrirNovaOperacao(pos.ticker)}
                            >
                              <Icon name="plus" style="width: 14px; height: 14px;" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td class="col-reserva" style="font-weight: 800;">
                      Total Consolidado
                    </td>
                    <td class="num muted" style="text-align: right;">
                      {posicoes.reduce((acc, p) => acc + p.quantidadeTotal, 0).toLocaleString("pt-BR")}
                    </td>
                    <td />
                    <td />
                    <td class="num muted" style="text-align: right; font-weight: 700;">
                      {fmtMoeda(carteira.totalInvestidoCentavos, "BRL")}
                    </td>
                    <td class="num" style="text-align: right; font-weight: 800; font-size: var(--fs-md); color: var(--primary);">
                      {fmtMoeda(carteira.valorMercadoAtualCentavos, "BRL")}
                    </td>
                    <td
                      class="num"
                      style={{
                        textAlign: "right",
                        fontWeight: "800",
                        color: isPositivo ? "var(--in)" : "var(--out)",
                      }}
                    >
                      {isPositivo ? "+" : ""}
                      {fmtMoeda(carteira.lucroPrejuizoTotalCentavos, "BRL")}
                      <div style="font-size: 0.72rem;">
                        {isPositivo ? "+" : ""}
                        {carteira.rentabilidadeTotalPct}%
                      </div>
                    </td>
                    <td class="num" style="text-align: right; font-weight: 800; color: #9333ea;">
                      {carteira.yieldOnCostMedioPct}%
                    </td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Visualização Mobile-First em Cards */}
            <div class="only-mobile invest-mobile-list" style="padding: 12px var(--sp-2);">
              {posicoes.map((pos) => {
                const lucroPos = pos.lucroPrejuizoCentavos >= 0;
                return (
                  <div key={`mob-${pos.ticker}`} class="invest-card-mobile">
                    <div class="invest-card-mobile__header">
                      <div>
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                          <span class="invest-card-mobile__ticker">{pos.ticker}</span>
                          <span class="badge badge--neutral" style="font-size: 0.65rem;">{pos.market}</span>
                          {pos.isBestt && (
                            <span class="badge" style="font-size: 0.62rem; background: rgba(59, 130, 246, 0.12); color: #2563eb;">
                              BESTT: {pos.besttCategory}
                            </span>
                          )}
                          {pos.isAristocrat && (
                            <span class="badge" style="font-size: 0.62rem; background: rgba(234, 179, 8, 0.12); color: #ca8a04;">
                              Aristocrata
                            </span>
                          )}
                        </div>
                        <div class="muted" style="font-size: 0.75rem; margin-top: 2px;">
                          {pos.nome}
                        </div>
                      </div>

                      <div style="text-align: right;">
                        <div class="num" style="font-size: 0.95rem; font-weight: 800; color: var(--text);">
                          {fmtMoeda(pos.cotacaoAtualCentavos, pos.moeda)}
                        </div>
                        <span class={`badge ${lucroPos ? "badge--in" : "badge--out"}`} style="font-size: 0.68rem; margin-top: 2px;">
                          {lucroPos ? "+" : ""}{pos.rentabilidadePct}%
                        </span>
                      </div>
                    </div>

                    <div class="invest-card-mobile__grid">
                      <div>
                        <div class="invest-card-mobile__item-label">Cotas</div>
                        <div class="invest-card-mobile__item-val num">{pos.quantidadeTotal.toLocaleString("pt-BR")}</div>
                      </div>
                      <div>
                        <div class="invest-card-mobile__item-label">Preço Médio</div>
                        <div class="invest-card-mobile__item-val num">{fmtMoeda(pos.precoMedioCentavos, pos.moeda)}</div>
                      </div>
                      <div>
                        <div class="invest-card-mobile__item-label">Total Investido</div>
                        <div class="invest-card-mobile__item-val num">{fmtMoeda(pos.totalInvestidoCentavos, pos.moeda)}</div>
                      </div>
                      <div>
                        <div class="invest-card-mobile__item-label">Valor em Custódia</div>
                        <div class="invest-card-mobile__item-val num" style="color: var(--primary);">
                          {fmtMoeda(pos.valorMercadoAtualCentavos, pos.moeda)}
                        </div>
                      </div>
                      <div>
                        <div class="invest-card-mobile__item-label">Retorno Líquido</div>
                        <div class="invest-card-mobile__item-val num" style={{ color: lucroPos ? "var(--in)" : "var(--out)" }}>
                          {lucroPos ? "+" : ""}{fmtMoeda(pos.lucroPrejuizoCentavos, pos.moeda)}
                        </div>
                      </div>
                      <div>
                        <div class="invest-card-mobile__item-label">Yield on Cost</div>
                        <div class="invest-card-mobile__item-val num" style="color: #9333ea;">
                          {pos.yieldOnCostPct}% a.a.
                        </div>
                      </div>
                    </div>

                    {/* Indicadores de Teto Bazin e Graham */}
                    {(pos.precoTetoBazinCentavos > 0 || (pos.precoGrahamCentavos && pos.precoGrahamCentavos > 0)) && (
                      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-soft); padding:6px 10px; border-radius:var(--r-sm); font-size:0.75rem;">
                        {pos.precoTetoBazinCentavos > 0 && (
                          <div>
                            <span class="muted">Teto Bazin: </span>
                            <strong>{fmtMoeda(pos.precoTetoBazinCentavos, pos.moeda)}</strong>
                            <span style={{ color: pos.margemBazinPM >= 0 ? "var(--in)" : "var(--out)", fontWeight: "700", marginLeft: "4px" }}>
                              ({pos.margemBazinPM >= 0 ? "+" : ""}{pos.margemBazinPM.toFixed(0)}%)
                            </span>
                          </div>
                        )}
                        {pos.precoGrahamCentavos && pos.precoGrahamCentavos > 0 && (
                          <div>
                            <span class="muted">Graham: </span>
                            <strong>{fmtMoeda(pos.precoGrahamCentavos, pos.moeda)}</strong>
                          </div>
                        )}
                      </div>
                    )}

                    <div class="invest-card-mobile__footer">
                      <button
                        type="button"
                        class="btn btn--secondary btn--xs"
                        style="flex: 1; justify-content: center; min-height: 32px;"
                        onClick={() => abrirRaioX(pos.ticker)}
                        disabled={carregandoRaioX}
                      >
                        <Icon name="chart" /> Raio-X
                      </button>
                      <button
                        type="button"
                        class="btn btn--primary btn--xs"
                        style="flex: 1; justify-content: center; min-height: 32px;"
                        onClick={() => abrirNovaOperacao(pos.ticker)}
                      >
                        <Icon name="plus" /> Operar Ativo
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        </section>
      )}

      {/* Visualização 2: Projeção de Crescimento da Bola de Neve */}
      {abaVisao === "boladeneve" && (
        <section class="card" style="padding: var(--sp-4);">
          <div class="card__head" style="margin-bottom: var(--sp-4);">
            <div>
              <h2 class="card__title" style="display: flex; align-items: center; gap: 6px;">
                <Icon name="trendingUp" /> Projeção do Efeito Bola de Neve (Renda Passiva)
              </h2>
              <p class="muted" style="margin-top: 4px; font-size: 0.8rem;">
                Cálculo de crescimento patrimonial e expansão de fluxo de caixa considerando o reinvestimento integral dos proventos
                à taxa média da carteira ({carteira.yieldOnCostMedioPct > 0 ? carteira.yieldOnCostMedioPct : 6.5}% a.a.).
              </p>
            </div>
          </div>

          <div class="grid grid--stats" style="margin-bottom: var(--sp-4);">
            <div class="stat">
              <span class="stat__label">Em 1 Ano (Reinvestindo)</span>
              <div class="stat__value" style="color: var(--text);">
                {fmtMoeda(carteira.projecaoBolaDeNeve.em1AnoCentavos)}
              </div>
              <div class="stat__sub tone-in">
                +{fmtMoeda(carteira.projecaoBolaDeNeve.em1AnoCentavos - carteira.valorMercadoAtualCentavos)} em proventos acumulados
              </div>
            </div>

            <div class="stat">
              <span class="stat__label">Em 3 Anos</span>
              <div class="stat__value" style="color: var(--text);">
                {fmtMoeda(carteira.projecaoBolaDeNeve.em3AnosCentavos)}
              </div>
              <div class="stat__sub tone-in">
                +{fmtMoeda(carteira.projecaoBolaDeNeve.em3AnosCentavos - carteira.valorMercadoAtualCentavos)}
              </div>
            </div>

            <div class="stat">
              <span class="stat__label">Em 5 Anos</span>
              <div class="stat__value" style="color: var(--primary);">
                {fmtMoeda(carteira.projecaoBolaDeNeve.em5AnosCentavos)}
              </div>
              <div class="stat__sub tone-in">
                +{fmtMoeda(carteira.projecaoBolaDeNeve.em5AnosCentavos - carteira.valorMercadoAtualCentavos)}
              </div>
            </div>

            <div class="stat">
              <span class="stat__label">Renda Mensal Estimada em 5 Anos</span>
              <div class="stat__value" style="color: var(--in);">
                {fmtMoeda(carteira.projecaoBolaDeNeve.rendaMensalEm5AnosCentavos)}/mês
              </div>
              <div class="stat__sub">
                Fluxo mensal passivo projetado
              </div>
            </div>
          </div>

          <div style="background: var(--surface-soft); padding: 14px 18px; border-radius: var(--r-md); border: 1px solid var(--border); font-size: 0.8rem; line-height: 1.6;">
            <strong>Princípio Fundamental do Reinvestimento:</strong> Ao utilizar 100% dos dividendos recebidos para adquirir novas cotas das empresas abaixo do Preço Teto, a quantidade de cotas em custódia se multiplica exponencialmente sem a necessidade de novos aportes do próprio bolso, acelerando a conquista da renda passiva perene.
          </div>
        </section>
      )}

      {/* Visualização 3: Histórico de Notas de Corretagem */}
      {abaVisao === "historico" && (
        <section class="card card--table">
          <div class="card__head" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              <h2 class="card__title" style="display: flex; align-items: center; gap: 6px;">
                <Icon name="list" /> Histórico de Transações de Corretagem
              </h2>
              <div class="muted" style="font-size: 0.75rem; margin-top: 2px;">
                Registro cronológico de todas as compras e vendas efetuadas
              </div>
            </div>
          </div>

          {operacoes.length === 0 ? (
            <div style="padding: 30px var(--sp-4); text-align: center;">
              <p class="muted" style="font-size: 0.85rem;">Nenhuma transação registrada.</p>
            </div>
          ) : (
            <div class="table-wrap table-wrap--mobile-bleed">
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="text-align: left;">Data</th>
                    <th style="text-align: left;">Tipo</th>
                    <th style="text-align: left;">Ativo</th>
                    <th style="text-align: right;">Quantidade</th>
                    <th style="text-align: right;">Preço Unitário</th>
                    <th style="text-align: right;">Taxas</th>
                    <th style="text-align: right;">Total Líquido</th>
                    <th style="text-align: left;">Corretora</th>
                    <th style="text-align: center;">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {[...operacoes]
                    .sort((a, b) => b.data.localeCompare(a.data))
                    .map((op) => {
                      const totalOp = op.quantidade * op.precoUnitarioCentavos + (op.tipo === "compra" ? (op.taxasCentavos || 0) : -(op.taxasCentavos || 0));
                      return (
                        <tr key={op.id}>
                          <td style="font-size: 0.82rem; white-space: nowrap;">
                            {op.data.split("-").reverse().join("/")}
                          </td>
                          <td>
                            <span
                              class="badge"
                              style={{
                                fontSize: "0.68rem",
                                padding: "2px 6px",
                                fontWeight: "700",
                                background: op.tipo === "compra" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                                color: op.tipo === "compra" ? "var(--in)" : "var(--out)",
                                border: `1px solid ${op.tipo === "compra" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                              }}
                            >
                              {op.tipo.toUpperCase()}
                            </span>
                          </td>
                          <td style="font-weight: 700;">
                            {op.ticker}
                            <span class="muted" style="font-size: 0.72rem; margin-left: 6px; font-weight: normal;">
                              {op.moeda}
                            </span>
                          </td>
                          <td class="num" style="text-align: right; font-weight: 700;">
                            {op.quantidade.toLocaleString("pt-BR")}
                          </td>
                          <td class="num muted" style="text-align: right;">
                            {fmtMoeda(op.precoUnitarioCentavos, op.moeda)}
                          </td>
                          <td class="num muted" style="text-align: right;">
                            {op.taxasCentavos ? fmtMoeda(op.taxasCentavos, op.moeda) : "—"}
                          </td>
                          <td class="num" style="text-align: right; font-weight: 800; color: var(--text);">
                            {fmtMoeda(totalOp, op.moeda)}
                          </td>
                          <td style="font-size: 0.8rem; color: var(--text-muted);">
                            {op.corretora || "—"}
                          </td>
                          <td style="text-align: center;">
                            <div style="display: flex; gap: 4px; justify-content: center;">
                              <button
                                type="button"
                                class="btn btn--ghost btn--icon"
                                style="width: 26px; height: 26px;"
                                title="Editar Transação"
                                onClick={() => abrirEdicaoOperacao(op)}
                              >
                                <Icon name="pencil" style="width: 12px; height: 12px;" />
                              </button>
                              <button
                                type="button"
                                class="btn btn--ghost btn--icon"
                                style="width: 26px; height: 26px; color: var(--out);"
                                title="Excluir Transação"
                                onClick={() => {
                                  if (confirm(`Deseja realmente excluir esta operação de ${op.ticker}?`)) {
                                    handleExcluirOperacao(op.id);
                                  }
                                }}
                              >
                                <Icon name="trash" style="width: 12px; height: 12px;" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Modal de Cadastro / Edição de Transação */}
      {modalOperacaoAberta && (
        <ModalOperacaoInvestimento
          isOpen={true}
          operacao={operacaoEdicao}
          tickerInicial={tickerParaOperar}
          empresaId={empresaId}
          anoId={anoId}
          onClose={() => {
            setModalOperacaoAberta(false);
            setOperacaoEdicao(null);
            setTickerParaOperar("");
          }}
          onSave={handleSalvarOperacao}
          onDelete={operacaoEdicao ? () => handleExcluirOperacao(operacaoEdicao.id) : undefined}
        />
      )}

      {/* Modal de Raio-X Fundamentalista */}
      {ativoRaioX && (
        <ModalRaioXAtivo
          ativo={ativoRaioX}
          onClose={() => setAtivoRaioX(null)}
        />
      )}
    </div>
  );
}

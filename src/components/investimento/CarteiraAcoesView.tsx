import { useState } from "preact/hooks";
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
  onRefresh: () => void;
}

export function CarteiraAcoesView({
  carteira,
  operacoes,
  empresaId,
  anoId,
  onRefresh,
}: Props) {
  const [abaVisao, setAbaVisao] = useState<"posicoes" | "historico">("posicoes");
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

  return (
    <div class="stack" style="gap: var(--sp-4);">
      {/* Cockpit da Carteira (Métricas de Longo Prazo e Retorno) */}
      <section class="grid grid--stats">
        {/* Card 1: Patrimônio Atual */}
        <div class="stat">
          <span class="stat__label">
            <span class="dot" style="background: var(--primary);" />
            Patrimônio em Ações
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

        {/* Card 2: Total Investido (Custo de Aquisição) */}
        <div class="stat">
          <span class="stat__label">
            <span class="dot" style="background: var(--text-muted);" />
            Total Investido (Custo)
          </span>
          <div class="stat__value" style="color: var(--text);">
            {fmtMoeda(carteira.totalInvestidoCentavos)}
          </div>
          <div class="stat__sub">
            {posicoes.length} {posicoes.length === 1 ? "ativo sob custódia" : "ativos sob custódia"}
          </div>
        </div>

        {/* Card 3: Renda Passiva Anual Estimada (Dividendos) */}
        <div class="stat">
          <span class="stat__label">
            <span class="dot" style="background: var(--in);" />
            Renda Anual Projetada
          </span>
          <div class="stat__value" style="color: var(--in);">
            {fmtMoeda(carteira.proventosAnuaisTotalCentavos)}/ano
          </div>
          <div class="stat__sub">
            Média de {fmtMoeda(carteira.rendaMensalEstimadaCentavos)}/mês
          </div>
        </div>

        {/* Card 4: Yield on Cost Médio (YoC) */}
        <div class="stat">
          <span class="stat__label">
            <span class="dot" style="background: #9333ea;" />
            Yield on Cost (YoC)
          </span>
          <div class="stat__value" style="color: #9333ea;">
            {carteira.yieldOnCostMedioPct}% a.a.
          </div>
          <div class="stat__sub">
            Retorno em dividendos s/ capital aplicado
          </div>
        </div>
      </section>

      {/* Barra de Controles e Ação de Compra */}
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
              class={`tab ${abaVisao === "historico" ? "is-active" : ""}`}
              onClick={() => setAbaVisao("historico")}
            >
              <Icon name="list" /> Histórico de Compras ({operacoes.length})
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

      {/* Visualização: Posições Ativas na Carteira */}
      {abaVisao === "posicoes" && (
        <section class="card card--table">
          <div class="card__head" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              <h2 class="card__title" style="display: flex; align-items: center; gap: 6px;">
                <Icon name="chart" /> Minhas Ações & FIIs em Custódia
              </h2>
              <div class="muted" style="font-size: 0.75rem; margin-top: 2px;">
                Cotações e dividendos atualizados ao vivo para apuração de retorno e Yield on Cost
              </div>
            </div>
          </div>

          {posicoes.length === 0 ? (
            <div style="padding: 40px var(--sp-4); text-align: center;">
              <div
                style="width: 56px; height: 56px; border-radius: 16px; background: rgba(16, 185, 129, 0.12); color: var(--in); display: grid; place-items: center; margin: 0 auto 12px;"
              >
                <Icon name="sparkles" style="width: 28px; height: 28px;" />
              </div>
              <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700;">Nenhum ativo registrado na carteira</h3>
              <p class="muted" style="max-width: 480px; margin: 8px auto 16px; font-size: 0.82rem;">
                Registre suas compras de ações brasileiras (B3) ou do exterior para acompanhar sua valorização real,
                Preço Médio, Yield on Cost e o efeito bola de neve dos dividendos.
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
            <div class="table-wrap table-wrap--mobile-bleed">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-reserva" style="text-align: left;">Ativo</th>
                    <th style="text-align: right;">Cotas</th>
                    <th style="text-align: right;">Preço Médio</th>
                    <th style="text-align: right;">Cotação Atual</th>
                    <th style="text-align: right;">Total Investido</th>
                    <th style="text-align: right;">Valor Atual</th>
                    <th style="text-align: right;">Lucro / Prejuízo</th>
                    <th style="text-align: right;" title="Yield on Cost: Proventos anuais / Preço Médio Investido">Yield on Cost</th>
                    <th style="text-align: right;">Preço Teto</th>
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
                          <div style="display: flex; align-items: center; gap: 6px;">
                            <strong style="color: var(--text); font-size: 0.9rem;">
                              {pos.ticker}
                            </strong>
                            <span class="badge" style="font-size: 0.62rem; padding: 1px 4px;">
                              {pos.market}
                            </span>
                            {pos.isBestt && (
                              <span
                                class="badge"
                                style="font-size: 0.65rem; padding: 1px 4px; background: rgba(147, 51, 234, 0.12); color: #9333ea; border: 1px solid rgba(147, 51, 234, 0.3);"
                                title="Setor perene BESTT (Barsi)"
                              >
                                ⭐ {pos.besttCategory}
                              </span>
                            )}
                            {pos.isAristocrat && (
                              <span
                                class="badge"
                                style="font-size: 0.65rem; padding: 1px 4px; background: rgba(234, 179, 8, 0.12); color: #ca8a04; border: 1px solid rgba(234, 179, 8, 0.3);"
                                title="S&P 500 Dividend Aristocrat: 25+ anos de dividendos crescentes"
                              >
                                👑 Aristocrata
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

                        <td style="text-align: center;">
                          <button
                            type="button"
                            class="btn btn--secondary btn--sm"
                            style="padding: 2px 8px; font-size: 0.72rem;"
                            onClick={() => abrirRaioX(pos.ticker)}
                            disabled={carregandoRaioX}
                          >
                            Raio-X
                          </button>
                        </td>

                        <td style="text-align: center;">
                          <div style="display: inline-flex; gap: 4px;">
                            <button
                              type="button"
                              class="btn btn--sm"
                              style="padding: 2px 6px; font-size: 0.72rem; background: var(--in-soft); color: var(--in); border-color: transparent;"
                              title="Comprar mais cotas deste ativo"
                              onClick={() => abrirNovaOperacao(pos.ticker)}
                            >
                              + Compra
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

      {/* Visualização: Histórico Completo de Compras e Vendas */}
      {abaVisao === "historico" && (
        <section class="card card--table">
          <div class="card__head" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <h2 class="card__title" style="display: flex; align-items: center; gap: 6px;">
              <Icon name="list" /> Histórico de Notas e Pregões ({operacoes.length} registros)
            </h2>
          </div>

          {operacoes.length === 0 ? (
            <div style="padding: 32px; text-align: center;" class="muted">
              Nenhuma operação cadastrada no histórico.
            </div>
          ) : (
            <div class="table-wrap table-wrap--mobile-bleed">
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="text-align: left;">Data</th>
                    <th style="text-align: center;">Tipo</th>
                    <th class="col-reserva" style="text-align: left;">Ativo</th>
                    <th style="text-align: right;">Quantidade</th>
                    <th style="text-align: right;">Preço Unitário</th>
                    <th style="text-align: right;">Taxas</th>
                    <th style="text-align: right;">Total da Nota</th>
                    <th style="text-align: left;">Corretora</th>
                    <th style="text-align: center;">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {operacoes.map((op) => {
                    const isCompra = op.tipo === "compra";
                    const totalNota = op.quantidade * op.precoUnitarioCentavos + (isCompra ? op.taxasCentavos || 0 : -(op.taxasCentavos || 0));

                    return (
                      <tr key={op.id}>
                        <td style="font-weight: 600; white-space: nowrap;">
                          {op.data.split("-").reverse().join("/")}
                        </td>

                        <td style="text-align: center;">
                          <span
                            class={`badge ${isCompra ? "badge--in" : "badge--out"}`}
                            style="font-size: 0.68rem; padding: 2px 6px;"
                          >
                            {isCompra ? "Compra" : "Venda"}
                          </span>
                        </td>

                        <td class="col-reserva">
                          <strong style="color: var(--text);">{op.ticker}</strong>
                          {op.nome && <span class="muted hide-mobile" style="font-size: 0.72rem; margin-left: 6px;">{op.nome}</span>}
                          {op.obs && <div class="muted" style="font-size: 0.7rem; font-style: italic;">{op.obs}</div>}
                        </td>

                        <td class="num" style="text-align: right; font-weight: 700;">
                          {op.quantidade.toLocaleString("pt-BR")}
                        </td>

                        <td class="num" style="text-align: right;">
                          {fmtMoeda(op.precoUnitarioCentavos, op.moeda)}
                        </td>

                        <td class="num muted" style="text-align: right;">
                          {op.taxasCentavos ? fmtMoeda(op.taxasCentavos, op.moeda) : "—"}
                        </td>

                        <td
                          class="num"
                          style={{
                            textAlign: "right",
                            fontWeight: "800",
                            color: isCompra ? "var(--text)" : "var(--in)",
                          }}
                        >
                          {fmtMoeda(totalNota, op.moeda)}
                        </td>

                        <td class="muted" style="font-size: 0.78rem;">
                          {op.corretora || "—"}
                        </td>

                        <td style="text-align: center;">
                          <button
                            type="button"
                            class="btn btn--ghost btn--icon"
                            style="width: 28px; height: 28px;"
                            title="Editar operação"
                            onClick={() => abrirEdicaoOperacao(op)}
                          >
                            <Icon name="pencil" style="width: 14px; height: 14px;" />
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
      )}

      {/* Modal de Cadastro / Edição de Operação */}
      {modalOperacaoAberta && (
        <ModalOperacaoInvestimento
          isOpen={true}
          operacao={operacaoEdicao}
          tickerInicial={tickerParaOperar}
          empresaId={empresaId}
          anoId={anoId}
          onClose={() => setModalOperacaoAberta(false)}
          onSave={handleSalvarOperacao}
          onDelete={handleExcluirOperacao}
        />
      )}

      {/* Modal de Raio-X Detalhado */}
      {ativoRaioX && (
        <ModalRaioXAtivo
          ativo={ativoRaioX}
          onClose={() => setAtivoRaioX(null)}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { Icon } from "../Icon.tsx";
import { Modal } from "../Modal.tsx";
import type { LongTermAnalysis } from "../../data/types.ts";

interface Props {
  ativo: LongTermAnalysis | null;
  onClose: () => void;
}

export function ModalRaioXAtivo({ ativo, onClose }: Props) {
  if (!ativo) return null;

  const [rendaDesejadaMensal, setRendaDesejadaMensal] = useState<number>(500);

  // Cálculos do Efeito Bola de Neve (Barsi)
  const dpaAnual = ativo.dividendRateAnual > 0 ? ativo.dividendRateAnual : (ativo.dividendYield / 100) * ativo.price;
  const rendaDesejadaAnual = rendaDesejadaMensal * 12;
  const cotasParaMeta = dpaAnual > 0 ? Math.ceil(rendaDesejadaAnual / dpaAnual) : 0;
  const capitalParaMeta = cotasParaMeta * ativo.price;

  // Ponto de inflexão: quando os proventos anuais compram 1 cota nova
  const cotasPontoInflexao = dpaAnual > 0 ? Math.ceil(ativo.price / dpaAnual) : 0;
  const capitalPontoInflexao = cotasPontoInflexao * ativo.price;

  // Moeda formatada
  const fmtMoney = (v: number) => {
    return (
      (ativo.currency === "BRL" ? "R$ " : "$ ") +
      v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  };

  // Cores do Score
  const scoreColor =
    ativo.score >= 75
      ? "var(--in)"
      : ativo.score >= 50
      ? "var(--alerta, #f59e0b)"
      : "var(--out)";

  const statusLabel =
    ativo.status === "oportunidade"
      ? "Excelente Oportunidade (Abaixo do Teto)"
      : ativo.status === "neutro"
      ? "Em Observação (Preço Esticado ou Yield Moderado)"
      : "Alerta de Risco (Armadilha ou Sem Proventos)";

  const statusBadge =
    ativo.status === "oportunidade"
      ? "badge--receber"
      : ativo.status === "neutro"
      ? "badge--neutro"
      : "badge--pagar";

  return (
    <Modal
      isOpen={true}
      title={`Raio-X de Longo Prazo: ${ativo.symbol}`}
      onClose={onClose}
      size="lg"
    >
      <div class="stack" style="gap: var(--sp-4);">
        {/* Cabeçalho do Ativo */}
        <div
          style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); flex-wrap: wrap; padding-bottom: var(--sp-3); border-bottom: 1px solid var(--border);"
        >
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h2 style="margin: 0; font-size: 1.4rem; font-weight: 800;">{ativo.symbol}</h2>
              <span class="badge">{ativo.market}</span>
              {ativo.isBestt && (
                <span
                  class="badge"
                  style="background: rgba(37, 99, 235, 0.12); color: #2563eb; border: 1px solid rgba(37, 99, 235, 0.3); font-weight: 700;"
                  title="Empresa em setor perene da metodologia Luiz Barsi"
                >
                  Setor Perene BESTT ({ativo.besttCategory})
                </span>
              )}
              {ativo.isAristocrat && (
                <span
                  class="badge"
                  style="background: rgba(234, 179, 8, 0.12); color: #ca8a04; border: 1px solid rgba(234, 179, 8, 0.3); font-weight: 700;"
                  title="Empresa do S&P 500 Dividend Aristocrats com mais de 25 anos consecutivos elevando proventos em dólar (Critério Graham)"
                >
                  Aristocrata S&P (25+ anos)
                </span>
              )}
            </div>
            <div class="muted" style="font-size: 0.85rem; margin-top: 4px;">
              {ativo.name}
            </div>
          </div>

          <div style="text-align: right;">
            <div class="muted" style="font-size: 0.75rem;">Cotação Atual</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: var(--text);">
              {fmtMoney(ativo.price)}
            </div>
          </div>
        </div>

        {/* Card de Veredito & Score Geral */}
        <div
          class="card"
          style="background: var(--surface-card); border-left: 4px solid ${scoreColor}; padding: var(--sp-3) var(--sp-4);"
        >
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
            <span class={`badge ${statusBadge}`} style="font-size: 0.8rem; padding: 4px 10px;">
              {statusLabel}
            </span>
            <div style="display: flex; align-items: baseline; gap: 4px;">
              <span class="muted" style="font-size: 0.8rem;">Score de Qualidade:</span>
              <span style={{ fontSize: "1.4rem", fontWeight: "900", color: scoreColor }}>
                {ativo.score}
              </span>
              <span class="muted" style="font-size: 0.8rem;">/100</span>
            </div>
          </div>

          {/* Barra de Progresso do Score */}
          <div
            style="width: 100%; height: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden; margin-bottom: var(--sp-3);"
          >
            <div
              style={{
                width: `${ativo.score}%`,
                height: "100%",
                background: scoreColor,
                borderRadius: "4px",
                transition: "width 0.4s ease",
              }}
            />
          </div>

          {/* Comparativo Preço Teto Bazin */}
          <div
            style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; background: var(--surface-bg); padding: 12px; border-radius: var(--rad-md); border: 1px solid var(--border);"
          >
            <div>
              <div class="muted" style="font-size: 0.75rem;">
                Preço Teto Bazin ({ativo.market === "GLOBAL" ? "DY 2,5%" : "DY 6%"})
              </div>
              <div style="font-size: 1.1rem; font-weight: 700; color: var(--text);">
                {ativo.precoTetoBazin > 0 ? fmtMoney(ativo.precoTetoBazin) : "—"}
              </div>
            </div>

            <div>
              <div class="muted" style="font-size: 0.75rem;">Margem Bazin</div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: "800",
                  color: ativo.margemSegurancaBazin >= 0 ? "var(--in)" : "var(--out)",
                }}
              >
                {ativo.margemSegurancaBazin > -100
                  ? `${ativo.margemSegurancaBazin >= 0 ? "+" : ""}${ativo.margemSegurancaBazin.toFixed(1)}%`
                  : "Sem margem"}
              </div>
            </div>

            <div>
              <div class="muted" style="font-size: 0.75rem;" title="Fórmula de Benjamin Graham: raiz(22.5 * LPA * VPA)">
                Preço Graham
              </div>
              <div style="font-size: 1.1rem; font-weight: 700; color: var(--text);">
                {ativo.precoGraham && ativo.precoGraham > 0 ? fmtMoney(ativo.precoGraham) : "—"}
              </div>
            </div>

            <div>
              <div class="muted" style="font-size: 0.75rem;">Dividendo Anual (DPA)</div>
              <div style="font-size: 1.1rem; font-weight: 700; color: var(--text);">
                {fmtMoney(dpaAnual)}
              </div>
            </div>
          </div>
        </div>

        {/* Grade de Indicadores Fundamentalistas */}
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;">
          <div class="stat" style="padding: 10px;">
            <span class="stat__label">Dividend Yield</span>
            <div class="stat__value" style="font-size: 1.1rem; color: var(--in);">
              {ativo.dividendYield.toFixed(2)}%
            </div>
            {ativo.fiveYearAvgDividendYield && (
              <div class="stat__sub">Média 5a: {ativo.fiveYearAvgDividendYield.toFixed(2)}%</div>
            )}
          </div>

          <div class="stat" style="padding: 10px;">
            <span class="stat__label">P/L (Preço/Lucro)</span>
            <div class="stat__value" style="font-size: 1.1rem;">
              {ativo.pl !== undefined && ativo.pl > 0 ? `${ativo.pl}x` : "—"}
            </div>
            <div class="stat__sub">Anos p/ retorno</div>
          </div>

          <div class="stat" style="padding: 10px;">
            <span class="stat__label">Payout Ratio</span>
            <div
              class="stat__value"
              style={{
                fontSize: "1.1rem",
                color:
                  ativo.payoutRatio !== undefined && ativo.payoutRatio > 90
                    ? "var(--out)"
                    : "var(--text)",
              }}
            >
              {ativo.payoutRatio !== undefined ? `${ativo.payoutRatio.toFixed(0)}%` : "—"}
            </div>
            <div class="stat__sub">
              {ativo.payoutRatio !== undefined && ativo.payoutRatio > 100
                ? "Alerta: >100%"
                : "Lucro distribuído"}
            </div>
          </div>

          <div class="stat" style="padding: 10px;">
            <span class="stat__label">ROE (Rentabilidade)</span>
            <div
              class="stat__value"
              style={{
                fontSize: "1.1rem",
                color: ativo.roe !== undefined && ativo.roe < 0 ? "var(--out)" : "var(--primary)",
              }}
            >
              {ativo.roe !== undefined ? `${ativo.roe.toFixed(1)}%` : "—"}
            </div>
            <div class="stat__sub">Retorno s/ Patrimônio</div>
          </div>

          <div class="stat" style="padding: 10px;">
            <span class="stat__label">P/VP</span>
            <div class="stat__value" style="font-size: 1.1rem;">
              {ativo.pvp !== undefined ? `${ativo.pvp}x` : "—"}
            </div>
            <div class="stat__sub">Preço / Valor Patr.</div>
          </div>

          <div class="stat" style="padding: 10px;">
            <span class="stat__label">Dívida / EBITDA</span>
            <div
              class="stat__value"
              style={{
                fontSize: "1.1rem",
                color:
                  ativo.dividaEbitda !== undefined && ativo.dividaEbitda > 3.5
                    ? "var(--out)"
                    : "var(--text)",
              }}
            >
              {ativo.besttCategory === "Bancos" || ativo.besttCategory === "Seguros"
                ? "Financeiro"
                : ativo.dividaEbitda !== undefined
                ? `${ativo.dividaEbitda}x`
                : "Baixa / Estável"}
            </div>
            <div class="stat__sub">
              {ativo.besttCategory === "Bancos" || ativo.besttCategory === "Seguros"
                ? "EBITDA não aplicável"
                : "Alavancagem"}
            </div>
          </div>

          <div class="stat" style="padding: 10px;">
            <span class="stat__label">Margem Líquida</span>
            <div
              class="stat__value"
              style={{
                fontSize: "1.1rem",
                color:
                  ativo.margemLiquida !== undefined && ativo.margemLiquida >= 15
                    ? "var(--in)"
                    : "var(--text)",
              }}
            >
              {ativo.margemLiquida !== undefined ? `${ativo.margemLiquida.toFixed(1)}%` : "—"}
            </div>
            <div class="stat__sub">Poder de Precificação</div>
          </div>

          <div class="stat" style="padding: 10px;">
            <span class="stat__label">Liquidez Corrente</span>
            <div
              class="stat__value"
              style={{
                fontSize: "1.1rem",
                color:
                  ativo.liquidezCorrente !== undefined && ativo.liquidezCorrente >= 1.5
                    ? "var(--in)"
                    : "var(--text)",
              }}
            >
              {ativo.liquidezCorrente !== undefined ? `${ativo.liquidezCorrente.toFixed(2)}x` : "—"}
            </div>
            <div class="stat__sub">Solvência Curto Prazo</div>
          </div>
        </div>

        {/* Diagnóstico Automatizado: Pontos Fortes e Atenção */}
        <div class="stack" style="gap: var(--sp-2);">
          <h4 style="margin: 0; font-size: 0.9rem; font-weight: 700;">Diagnóstico Automatizado</h4>

          {ativo.pontosFortes.length > 0 && (
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--rad-md); padding: 10px 14px;">
              <ul style="margin: 0; padding-left: 18px; font-size: 0.82rem; color: var(--text);">
                {ativo.pontosFortes.map((p, idx) => (
                  <li key={idx} style="margin-bottom: 4px;">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ativo.pontosAtencao.length > 0 && (
            <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--rad-md); padding: 10px 14px;">
              <ul style="margin: 0; padding-left: 18px; font-size: 0.82rem; color: var(--text);">
                {ativo.pontosAtencao.map((p, idx) => (
                  <li key={idx} style="margin-bottom: 4px;">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Simulador do Efeito Bola de Neve (Barsi) */}
        {dpaAnual > 0 && (
          <div
            class="card"
            style="background: var(--surface-bg); border: 1px dashed var(--border); padding: 14px;"
          >
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.88rem;">
                <Icon name="sparkles" style="color: var(--primary);" />
                <span>Simulador Bola de Neve (Renda Passiva)</span>
              </div>

              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="muted" style="font-size: 0.78rem;">Meta mensal:</span>
                <select
                  class="select"
                  style="padding: 2px 8px; font-size: 0.78rem; height: auto;"
                  value={rendaDesejadaMensal}
                  onChange={(e) => setRendaDesejadaMensal(Number((e.target as HTMLSelectElement).value))}
                >
                  <option value={100}>{fmtMoney(100)}/mês</option>
                  <option value={500}>{fmtMoney(500)}/mês</option>
                  <option value={1000}>{fmtMoney(1000)}/mês</option>
                  <option value={2000}>{fmtMoney(2000)}/mês</option>
                  <option value={5000}>{fmtMoney(5000)}/mês</option>
                </select>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.82rem;">
              <div style="background: var(--surface-card); padding: 10px; border-radius: var(--rad-sm);">
                <div class="muted">Para {fmtMoney(rendaDesejadaMensal)}/mês:</div>
                <div style="font-weight: 800; font-size: 1.05rem; margin-top: 2px; color: var(--primary);">
                  {cotasParaMeta.toLocaleString("pt-BR")} cotas
                </div>
                <div class="muted" style="font-size: 0.72rem;">
                  Total estimado: {fmtMoney(capitalParaMeta)}
                </div>
              </div>

              <div style="background: var(--surface-card); padding: 10px; border-radius: var(--rad-sm);">
                <div class="muted">Ponto de Inflexão (1 cota nova/ano por dividendo):</div>
                <div style="font-weight: 800; font-size: 1.05rem; margin-top: 2px; color: var(--in);">
                  {cotasPontoInflexao.toLocaleString("pt-BR")} cotas
                </div>
                <div class="muted" style="font-size: 0.72rem;">
                  Investimento: {fmtMoney(capitalPontoInflexao)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style="display: flex; justify-content: flex-end; padding-top: var(--sp-2);">
          <button class="btn btn--secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}

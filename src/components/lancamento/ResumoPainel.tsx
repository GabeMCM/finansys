import type { Natureza } from "../../data/types.ts";
import { formatCentavosBRL, money, MONTHS } from "../../lib/format.ts";
import { NATURE_META } from "../../lib/natureza.ts";
import { Icon } from "../Icon.tsx";
import type { ModoDistribuicaoProjecao, TipoRepeticaoReal } from "./RepeticaoSelector.tsx";

export interface ResumoRealProps {
  modo: "real";
  natureza: Natureza;
  contaNome?: string;
  categoriaNome?: string;
  valorCentavos: number;
  data: string; // YYYY-MM-DD
  tipoRepeticao: TipoRepeticaoReal;
  numRepeticoes: number;
  dividirValor: boolean;
  tetoOrcamentario?: {
    mes: number;
    projetado: number;
    realizadoSemEste: number;
  };
  descricao?: string;
  obs?: string;
}

export interface ResumoProjecaoProps {
  modo: "projecao";
  natureza: Natureza;
  contaNome?: string;
  categoriaNome?: string;
  distribuicao: ModoDistribuicaoProjecao;
  ano: number;
  mesesValores: number[]; // 12 números em centavos
  parcelaInfo?: {
    qtd: number;
    mesInicio: number;
    dividir: boolean;
    valorInformadoCentavos: number;
  };
  obs?: string;
}

export type ResumoPainelProps = ResumoRealProps | ResumoProjecaoProps;

export function ResumoPainel(props: ResumoPainelProps) {
  const meta = NATURE_META[props.natureza];

  if (props.modo === "real") {
    const {
      contaNome,
      categoriaNome,
      valorCentavos,
      data,
      tipoRepeticao,
      numRepeticoes,
      dividirValor,
      tetoOrcamentario,
      descricao,
      obs,
    } = props;

    // Cálculo das parcelas
    let valorParcelaCentavos = valorCentavos;
    let totalRealCentavos = valorCentavos;
    let textoRepeticao = "Lançamento Único";
    let intervaloDatas = "";

    const [anoStr, mStr, diaStr] = (data || "").split("-");
    const anoBase = parseInt(anoStr, 10) || new Date().getFullYear();
    const mesBase = (parseInt(mStr, 10) || 1) - 1;
    const diaBase = parseInt(diaStr, 10) || new Date().getDate();

    if (tipoRepeticao === "parcelado") {
      const qtd = Math.max(2, numRepeticoes);
      if (dividirValor) {
        valorParcelaCentavos = Math.floor(valorCentavos / qtd);
        totalRealCentavos = valorCentavos;
      } else {
        valorParcelaCentavos = valorCentavos;
        totalRealCentavos = valorCentavos * qtd;
      }
      textoRepeticao = `${qtd}x de ${formatCentavosBRL(valorParcelaCentavos)}`;
      const mesFimTotal = mesBase + (qtd - 1);
      const anoFim = anoBase + Math.floor(mesFimTotal / 12);
      const mesFim = mesFimTotal % 12;
      intervaloDatas = `${MONTHS[mesBase]}/${anoBase} → ${MONTHS[mesFim]}/${anoFim}`;
    } else if (tipoRepeticao === "recorrente") {
      const qtd = Math.max(2, numRepeticoes);
      totalRealCentavos = valorCentavos * qtd;
      textoRepeticao = `Fixo por ${qtd} meses`;
      const mesFimTotal = mesBase + (qtd - 1);
      const anoFim = anoBase + Math.floor(mesFimTotal / 12);
      const mesFim = mesFimTotal % 12;
      intervaloDatas = `${MONTHS[mesBase]}/${anoBase} → ${MONTHS[mesFim]}/${anoFim}`;
    } else {
      if (data) {
        intervaloDatas = `${String(diaBase).padStart(2, "0")}/${String(mesBase + 1).padStart(2, "0")}/${anoBase}`;
      }
    }

    // Teto Orçamentário
    let alertaTeto = null;
    if (tetoOrcamentario && (props.natureza === "pagar" || props.natureza === "saida")) {
      const { mes, projetado, realizadoSemEste } = tetoOrcamentario;
      if (projetado > 0) {
        const impactoMes = tipoRepeticao === "parcelado" && dividirValor ? valorParcelaCentavos : valorCentavos;
        const totalComLanc = realizadoSemEste + impactoMes;
        const pct = Math.round((totalComLanc / projetado) * 100);
        const excesso = totalComLanc - projetado;

        if (totalComLanc > projetado) {
          alertaTeto = (
            <div class="summary-box__alert summary-box__alert--danger">
              <Icon name="alertTriangle" style="width:16px;height:16px;flex-shrink:0;margin-top:2px;" />
              <div>
                <strong>Teto de {MONTHS[mes]} excedido!</strong>
                <div>{pct}% do teto (+{money(excesso)} além do projetado de {money(projetado)}).</div>
              </div>
            </div>
          );
        } else if (pct >= 80) {
          alertaTeto = (
            <div class="summary-box__alert summary-box__alert--warn">
              <Icon name="alertTriangle" style="width:16px;height:16px;flex-shrink:0;margin-top:2px;" />
              <div>
                <strong>Limite de {MONTHS[mes]} próximo ({pct}%)</strong>
                <div>Realizado totalizará {money(totalComLanc)} de {money(projetado)}.</div>
              </div>
            </div>
          );
        }
      }
    }

    return (
      <div class="summary-box">
        <div class="summary-box__title">
          <span>Resumo do Lançamento</span>
          <span
            class="badge"
            style={`background:var(--${meta.tone}-soft);color:var(--${meta.tone});font-size:10px;padding:2px 6px;border-radius:var(--r-sm);`}
          >
            {meta.label}
          </span>
        </div>

        <div>
          <div style="font-size:var(--fs-xs);color:var(--text-muted);margin-bottom:2px;">
            {categoriaNome ? `${categoriaNome} ›` : "Sem categoria"}
          </div>
          <strong style="font-size:var(--fs-sm);color:var(--text);">
            {contaNome || "Selecione uma conta..."}
          </strong>
        </div>

        <div class="summary-box__divider" />

        <div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">
            {tipoRepeticao === "unico" ? "Valor do Lançamento" : "Valor Total"}
          </div>
          <div class="summary-box__valor" style={`color:var(--${meta.tone});`}>
            {formatCentavosBRL(totalRealCentavos)}
          </div>
        </div>

        <div class="summary-box__row">
          <span>Repetição:</span>
          <strong>{textoRepeticao}</strong>
        </div>

        {intervaloDatas && (
          <div class="summary-box__row">
            <span>Período:</span>
            <strong>{intervaloDatas}</strong>
          </div>
        )}

        {descricao && (
          <div class="summary-box__row">
            <span>Descrição:</span>
            <strong style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              {descricao}
            </strong>
          </div>
        )}

        {obs && (
          <div class="summary-box__row">
            <span>Obs:</span>
            <strong style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              {obs}
            </strong>
          </div>
        )}

        {alertaTeto}
      </div>
    );
  }

  // Modo Projeção
  const {
    contaNome,
    categoriaNome,
    distribuicao,
    ano,
    mesesValores,
    parcelaInfo,
    obs,
  } = props;

  const totalAnual = mesesValores.reduce((acc, v) => acc + (v || 0), 0);
  const mediaMensal = Math.round(totalAnual / 12);

  let detalheParcelamento = null;
  if (distribuicao === "parcelado" && parcelaInfo) {
    const { qtd, mesInicio, dividir, valorInformadoCentavos } = parcelaInfo;
    const valorParcela = dividir ? Math.round(valorInformadoCentavos / qtd) : valorInformadoCentavos;
    const mesFimTotal = mesInicio + qtd - 1;
    const anoFim = ano + Math.floor(mesFimTotal / 12);
    const mesFim = mesFimTotal % 12;

    detalheParcelamento = (
      <div style="font-size:var(--fs-xs);color:var(--text-muted);line-height:1.35;">
        <div>{qtd} parcelas de <b>~{money(valorParcela)}</b></div>
        <div>{MONTHS[mesInicio]}/{ano} até {MONTHS[mesFim]}/{anoFim}</div>
        {anoFim > ano && (
          <div style="color:var(--primary);margin-top:2px;font-size:11px;">
            ℹ️ Parcelas após dezembro serão geradas no ano {anoFim}.
          </div>
        )}
      </div>
    );
  }

  return (
    <div class="summary-box">
      <div class="summary-box__title">
        <span>Resumo da Projeção {ano}</span>
        <span
          class="badge"
          style={`background:var(--${meta.tone}-soft);color:var(--${meta.tone});font-size:10px;padding:2px 6px;border-radius:var(--r-sm);`}
        >
          {meta.label}
        </span>
      </div>

      <div>
        <div style="font-size:var(--fs-xs);color:var(--text-muted);margin-bottom:2px;">
          {categoriaNome ? `${categoriaNome} ›` : "Sem categoria"}
        </div>
        <strong style="font-size:var(--fs-sm);color:var(--text);">
          {contaNome || "Selecione uma conta..."}
        </strong>
      </div>

      <div class="summary-box__divider" />

      <div>
        <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">
          Total Projetado ({ano})
        </div>
        <div class="summary-box__valor" style={`color:var(--${meta.tone});`}>
          {formatCentavosBRL(totalAnual)}
        </div>
        <div style="font-size:var(--fs-xs);color:var(--text-muted);margin-top:2px;">
          Média mensal: {formatCentavosBRL(mediaMensal)}
        </div>
      </div>

      {detalheParcelamento}

      {obs && (
        <div class="summary-box__row">
          <span>Obs:</span>
          <strong style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            {obs}
          </strong>
        </div>
      )}

      <div class="summary-box__divider" />

      <div>
        <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">
          Distribuição dos 12 Meses:
        </div>
        <div class="summary-box__mini-grid">
          {MONTHS.map((m, idx) => {
            const val = mesesValores[idx] || 0;
            return (
              <div key={m} class="summary-box__cell">
                <div class="summary-box__cell-label">{m}</div>
                <div
                  class="summary-box__cell-val"
                  style={val > 0 ? `color:var(--${meta.tone});` : "color:var(--text-muted);"}
                >
                  {val > 0 ? money(val) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

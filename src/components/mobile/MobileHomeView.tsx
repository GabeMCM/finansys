import { useEffect, useState } from "react";
import { Icon } from "../Icon.tsx";
import { toast } from "../Toast.tsx";
import { CardPendencias } from "../lancamento/CardPendencias.tsx";
import { anos, empresas, lancamentos } from "../../data/repo.ts";
import { db } from "../../data/db.ts";
import { calcularPosicaoBancos, type ProjecaoPendente } from "../../data/calc.ts";
import { money, moneyPrivacidade, MONTHS, signedPrivacidade } from "../../lib/format.ts";
import { NATURE_META } from "../../lib/natureza.ts";
import type { Categoria, Conta, ContaBancaria, Natureza, Reserva, TipoContaBancaria } from "../../data/types.ts";
import { anoAtivo, empresaAtiva } from "../../state.ts";
import { useSignal } from "../../lib/signal.ts";
import { useLive } from "../../data/useLive.ts";

export interface MobileLancamentoItem {
  id: string;
  data: string;
  valor: number;
  descricao?: string;
  contaNome: string;
  catNome: string;
  natureza: Natureza;
}

export interface MobileHomeViewProps {
  saldoFinalReal: number;
  saldoFinalProj?: number;
  desvio?: number;
  totEntradasReal: number;
  totSaidasReal: number;
  patrimonioConsolidado: number;
  reservasTotal: number;
  reservas: Reserva[];
  reservasSaldos: Map<string, number>;
  ultimosLancamentos: MobileLancamentoItem[];
  resultadoProj?: number[];
  resultadoReal?: number[];
  mesRef?: number;
  pendencias?: ProjecaoPendente[];
  controleTeto?: {
    cat: Categoria;
    proj: number;
    real: number;
    pct: number;
    status: "estourado" | "alerta" | "sem_teto" | "ok";
    excesso: number;
  }[];
  contas?: Conta[];
  categorias?: Categoria[];
  bancos?: ContaBancaria[];
  anoId?: string;
  anoNum?: number;
  initialAba?: "visao" | "bancos" | "dre" | "fluxo" | "razao";
  onVerRelatorioCompleto?: () => void;
}

function formatarDataCurta(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length < 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

export function MobileHomeView({
  saldoFinalReal,
  saldoFinalProj,
  desvio = 0,
  totEntradasReal,
  totSaidasReal,
  patrimonioConsolidado,
  reservasTotal: _reservasTotal,
  reservas,
  reservasSaldos,
  ultimosLancamentos,
  resultadoProj,
  resultadoReal,
  mesRef = new Date().getMonth(),
  pendencias = [],
  controleTeto = [],
  contas = [],
  categorias = [],
  bancos = [],
  anoId,
  anoNum: _anoNum,
  initialAba = "visao",
  onVerRelatorioCompleto,
}: MobileHomeViewProps) {
  const empId = useSignal(empresaAtiva);
  const anoAtivoNum = useSignal(anoAtivo);
  const anoFinalNum = _anoNum || anoAtivoNum;

  const [abaAtiva, setAbaAtiva] = useState<"visao" | "bancos" | "dre" | "fluxo" | "razao">(initialAba || "visao");

  useEffect(() => {
    if (initialAba) setAbaAtiva(initialAba);
  }, [initialAba]);

  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const anoHoje = hoje.getFullYear();

  const [presetAtivo, setPresetAtivo] = useState<string>(anoFinalNum === anoHoje ? "ano_ate_hoje" : "ano");
  const [dataInicio, setDataInicio] = useState<string>(`${anoFinalNum}-01-01`);
  const [dataFim, setDataFim] = useState<string>(anoFinalNum === anoHoje ? hojeStr : `${anoFinalNum}-12-31`);
  const [filtroTipoBanco, setFiltroTipoBanco] = useState<"todos" | TipoContaBancaria>("todos");
  const [buscaRazao, setBuscaRazao] = useState<string>("");

  useEffect(() => {
    setDataInicio(`${anoFinalNum}-01-01`);
    if (anoFinalNum === anoHoje) {
      setDataFim(hojeStr);
      setPresetAtivo("ano_ate_hoje");
    } else {
      setDataFim(`${anoFinalNum}-12-31`);
      setPresetAtivo("ano");
    }
  }, [anoFinalNum]);

  const aplicarPreset = (tipo: string) => {
    setPresetAtivo(tipo);
    const d = new Date();
    if (tipo === "ano_ate_hoje") {
      setDataInicio(`${anoFinalNum}-01-01`);
      setDataFim(anoFinalNum === anoHoje ? hojeStr : `${anoFinalNum}-12-31`);
    } else if (tipo === "ano") {
      setDataInicio(`${anoFinalNum}-01-01`);
      setDataFim(`${anoFinalNum}-12-31`);
    } else if (tipo === "mes_atual") {
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const ultimoDia = new Date(y, m, 0).getDate();
      setDataInicio(`${y}-${String(m).padStart(2, "0")}-01`);
      setDataFim(`${y}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`);
    } else if (tipo === "mes_anterior") {
      const dAnt = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const y = dAnt.getFullYear();
      const m = dAnt.getMonth() + 1;
      const ultimoDia = new Date(y, m, 0).getDate();
      setDataInicio(`${y}-${String(m).padStart(2, "0")}-01`);
      setDataFim(`${y}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`);
    }
  };

  // Carrega dados analíticos detalhados quando em abas de relatório
  const dadosAnaliticos = useLive(async () => {
    if (!empId) return null;
    const [emp, todosAnos] = await Promise.all([empresas.get(empId), anos.byEmpresa(empId)]);
    if (!emp || todosAnos.length === 0) return null;
    const anoIds = todosAnos.map((a) => a.id);
    const [ps, ls, movList] = await Promise.all([
      db.projecoes.where("anoId").anyOf(anoIds).filter((p) => !p.deletedAt).toArray(),
      db.lancamentos.where("anoId").anyOf(anoIds).filter((l) => !l.deletedAt).toArray(),
      db.reservaMovimentos.where("empresaId").equals(empId).filter((m) => !m.deletedAt).toArray(),
    ]);
    return { emp, todosAnos, ps, ls, movList };
  }, [empId, anoFinalNum], null);

  const superavit = totEntradasReal - totSaidasReal;

  // Estado para Quitação Rápida de Pendência
  const [modalQuitarPendencia, setModalQuitarPendencia] = useState<ProjecaoPendente | null>(null);
  const [quitarBancoId, setQuitarBancoId] = useState<string>("");

  const estouradas = controleTeto.filter((c) => c.status === "estourado");
  const alertas = controleTeto.filter((c) => c.status === "alerta");

  // Dados calculados para os relatórios analíticos
  const lsAnalitico = dadosAnaliticos?.ls || [];
  const psAnalitico = dadosAnaliticos?.ps || [];
  const movListAnalitico = dadosAnaliticos?.movList || [];
  const todosAnos = dadosAnaliticos?.todosAnos || [];

  const lsNoPeriodo = lsAnalitico.filter((l) => l.data >= dataInicio && l.data <= dataFim);
  const lsAteFim = lsAnalitico.filter((l) => l.data <= dataFim);
  const movsPeriodo = movListAnalitico.filter((m) => m.data >= dataInicio && m.data <= dataFim);
  const movsAteFim = movListAnalitico.filter((m) => m.data <= dataFim);

  const posicaoBancosAteFim = calcularPosicaoBancos(bancos, lsAteFim, contas, movsAteFim);
  const posicaoBancosPeriodo = calcularPosicaoBancos(bancos, lsNoPeriodo, contas, movsPeriodo);

  const contaMap = new Map(contas.map((c) => [c.id, c]));
  const catMap = new Map(categorias.map((c) => [c.id, c.nome]));
  const bancoMap = new Map(bancos.map((b) => [b.id, b.nome]));

  // DRE por categoria
  interface LinhaCatDRE {
    id: string;
    nome: string;
    natureza: Natureza;
    proj: number;
    real: number;
  }
  const mapCatDRE = new Map<string, LinhaCatDRE>();
  for (const c of categorias) {
    mapCatDRE.set(c.id, { id: c.id, nome: c.nome, natureza: c.natureza, proj: 0, real: 0 });
  }

  for (const l of lsNoPeriodo) {
    if (l.bancoDestinoId) continue;
    const c = contaMap.get(l.contaId);
    if (c) {
      const entry = mapCatDRE.get(c.categoriaId);
      if (entry) entry.real += l.valor;
    }
  }

  const [yIni, mIni] = dataInicio.split("-").map(Number);
  const [yFim, mFim] = dataFim.split("-").map(Number);
  for (const p of psAnalitico) {
    const anoObj = todosAnos.find((a) => a.id === p.anoId);
    if (!anoObj) continue;
    const pDate = `${anoObj.ano}-${String(p.mes + 1).padStart(2, "0")}-01`;
    if (pDate >= `${yIni}-${String(mIni).padStart(2, "0")}-01` && pDate <= `${yFim}-${String(mFim).padStart(2, "0")}-28`) {
      const c = contaMap.get(p.contaId);
      if (c) {
        const entry = mapCatDRE.get(c.categoriaId);
        if (entry) entry.proj += p.valor;
      }
    }
  }

  // Fluxo diário
  const diasUnicosFluxo = Array.from(new Set(lsNoPeriodo.map((l) => l.data))).sort();
  let saldoCorrente = 0;
  const fluxoDiario = diasUnicosFluxo.map((dia) => {
    const itens = lsNoPeriodo.filter((l) => l.data === dia);
    let ent = 0;
    let sai = 0;
    for (const l of itens) {
      if (l.bancoDestinoId) continue;
      const c = contaMap.get(l.contaId);
      if (c) {
        if (c.natureza === "receber" || c.natureza === "aporte") ent += l.valor;
        else sai += l.valor;
      }
    }
    const res = ent - sai;
    saldoCorrente += res;
    return { data: dia, entradas: ent, saidas: sai, resultado: res, saldoAcumulado: saldoCorrente, itens };
  });

  const bancosFiltrados = bancos.filter((b) => {
    if (filtroTipoBanco === "todos") return true;
    return b.tipo === filtroTipoBanco;
  });

  let totReceitasReal = 0;
  let totReceitasProj = 0;
  let totDespesasReal = 0;
  let totDespesasProj = 0;

  for (const cat of mapCatDRE.values()) {
    if (cat.natureza === "receber" || cat.natureza === "aporte") {
      totReceitasReal += cat.real;
      totReceitasProj += cat.proj;
    } else {
      totDespesasReal += cat.real;
      totDespesasProj += cat.proj;
    }
  }
  const resultadoDRE = totReceitasReal - totDespesasReal;
  const resultadoDREProj = totReceitasProj - totDespesasProj;

  const termo = buscaRazao.toLowerCase().trim();
  const razaoFiltrado = lsNoPeriodo.filter((l) => {
    if (!termo) return true;
    const c = contaMap.get(l.contaId);
    const catNome = c ? catMap.get(c.categoriaId) || "" : "";
    const bNome = l.bancoId ? bancoMap.get(l.bancoId) || "" : "";
    return (
      (l.descricao && l.descricao.toLowerCase().includes(termo)) ||
      (c && c.nome.toLowerCase().includes(termo)) ||
      catNome.toLowerCase().includes(termo) ||
      bNome.toLowerCase().includes(termo)
    );
  });
  const volTotalRazao = razaoFiltrado.reduce((acc, x) => acc + x.valor, 0);

  const exportarCSV = () => {
    const separador = ";";
    let csv = `\uFEFF`;
    csv += `Finansys Mobile - Relatório ${abaAtiva.toUpperCase()} (${anoFinalNum})\n`;
    csv += `Período: ${dataInicio} a ${dataFim}\n\n`;

    if (abaAtiva === "bancos") {
      csv += `Conta Bancária;Tipo;Saldo Inicial (R$);Entradas (+) (R$);Saídas (−) (R$);Saldo Atual (R$)\n`;
      for (const b of bancos) {
        const bAteFim = posicaoBancosAteFim.bancos.find((x) => x.banco.id === b.id);
        const bPeriodo = posicaoBancosPeriodo.bancos.find((x) => x.banco.id === b.id);
        csv += [
          `"${b.nome}"`,
          `"${b.tipo || "corrente"}"`,
          ((b.saldoInicialCentavos || 0) / 100).toFixed(2).replace(".", ","),
          ((bPeriodo?.totalEntradas || 0) / 100).toFixed(2).replace(".", ","),
          ((bPeriodo?.totalSaidas || 0) / 100).toFixed(2).replace(".", ","),
          ((bAteFim?.saldoAtual || 0) / 100).toFixed(2).replace(".", ","),
        ].join(separador) + "\n";
      }
    } else if (abaAtiva === "fluxo") {
      csv += `Data;Entradas (R$);Saídas (R$);Resultado do Dia (R$);Saldo Acumulado (R$)\n`;
      for (const f of fluxoDiario) {
        csv += [
          f.data.split("-").reverse().join("/"),
          (f.entradas / 100).toFixed(2).replace(".", ","),
          (f.saidas / 100).toFixed(2).replace(".", ","),
          (f.resultado / 100).toFixed(2).replace(".", ","),
          (f.saldoAcumulado / 100).toFixed(2).replace(".", ","),
        ].join(separador) + "\n";
      }
    } else if (abaAtiva === "razao") {
      csv += `Data;Descrição;Conta;Categoria;Banco;Valor (R$)\n`;
      for (const l of lsNoPeriodo) {
        const c = contaMap.get(l.contaId);
        csv += [
          l.data.split("-").reverse().join("/"),
          `"${(l.descricao || "").replace(/"/g, '""')}"`,
          `"${c?.nome || ""}"`,
          `"${c ? (catMap.get(c.categoriaId) || "") : ""}"`,
          `"${l.bancoId ? (bancoMap.get(l.bancoId) || "") : ""}"`,
          (l.valor / 100).toFixed(2).replace(".", ","),
        ].join(separador) + "\n";
      }
    } else {
      csv += `Categoria;Natureza;Projetado (R$);Realizado (R$);Diferença (R$)\n`;
      for (const cat of mapCatDRE.values()) {
        csv += [
          `"${cat.nome}"`,
          `"${cat.natureza}"`,
          (cat.proj / 100).toFixed(2).replace(".", ","),
          (cat.real / 100).toFixed(2).replace(".", ","),
          ((cat.real - cat.proj) / 100).toFixed(2).replace(".", ","),
        ].join(separador) + "\n";
      }
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finansys-${abaAtiva}-${dataInicio}_a_${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
  };

  return (
    <div class="mobile-home-container" style="display:flex;flex-direction:column;gap:14px;padding-bottom:24px;">
      {/* Abas Superiores Unificadas: Início + Relatórios */}
      <div
        class="mobile-tabs-scroll"
        style={{
          display: "flex",
          gap: "6px",
          overflowX: "auto",
          paddingBottom: "2px",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <button
          type="button"
          class={`chip ${abaAtiva === "visao" ? "chip--active" : ""}`}
          onClick={() => setAbaAtiva("visao")}
          style="flex-shrink:0;font-size:0.75rem;padding:6px 12px;font-weight:700;"
        >
          <Icon name="grid" style="width:13px;height:13px;margin-right:4px;" />
          Visão Geral
        </button>
        <button
          type="button"
          class={`chip ${abaAtiva === "bancos" ? "chip--active" : ""}`}
          onClick={() => setAbaAtiva("bancos")}
          style="flex-shrink:0;font-size:0.75rem;padding:6px 12px;font-weight:700;"
        >
          <Icon name="bank" style="width:13px;height:13px;margin-right:4px;" />
          Bancos
        </button>
        <button
          type="button"
          class={`chip ${abaAtiva === "dre" ? "chip--active" : ""}`}
          onClick={() => setAbaAtiva("dre")}
          style="flex-shrink:0;font-size:0.75rem;padding:6px 12px;font-weight:700;"
        >
          <Icon name="chart" style="width:13px;height:13px;margin-right:4px;" />
          DRE & Contas
        </button>
        <button
          type="button"
          class={`chip ${abaAtiva === "fluxo" ? "chip--active" : ""}`}
          onClick={() => setAbaAtiva("fluxo")}
          style="flex-shrink:0;font-size:0.75rem;padding:6px 12px;font-weight:700;"
        >
          <Icon name="trendUp" style="width:13px;height:13px;margin-right:4px;" />
          Fluxo Diário
        </button>
        <button
          type="button"
          class={`chip ${abaAtiva === "razao" ? "chip--active" : ""}`}
          onClick={() => setAbaAtiva("razao")}
          style="flex-shrink:0;font-size:0.75rem;padding:6px 12px;font-weight:700;"
        >
          <Icon name="list" style="width:13px;height:13px;margin-right:4px;" />
          Razão Analítico
        </button>
      </div>

      {abaAtiva === "visao" && (
        <>
          {/* 1. Hero Card de Saldo em Conta & Cockpit */}
          <section class="bank-hero-card" aria-label="Saldo e resumo financeiro">
        <div class="bank-hero-card__header">
          <span class="bank-hero-card__title">
            <Icon name="bank" style="width:16px;height:16px;color:var(--primary);" />
            Saldo em Conta
          </span>
          <span
            class="badge"
            style={{
              background: saldoFinalReal >= 0 ? "var(--in-soft)" : "var(--out-soft)",
              color: saldoFinalReal >= 0 ? "var(--in)" : "var(--out)",
              fontWeight: "700",
              fontSize: "0.72rem",
            }}
          >
            {saldoFinalReal >= 0 ? "Positivo" : "Negativo"}
          </span>
        </div>

        <div class="bank-hero-card__value">
          {moneyPrivacidade(saldoFinalReal)}
        </div>

        <div class="bank-hero-card__meta-row">
          <div class="bank-hero-card__meta-item">
            <span class="bank-hero-card__meta-label">Entradas Realizadas</span>
            <span class="bank-hero-card__meta-val" style="color:var(--in);">
              +{moneyPrivacidade(totEntradasReal)}
            </span>
          </div>
          <div class="bank-hero-card__meta-item" style="text-align:right;">
            <span class="bank-hero-card__meta-label">Saídas Realizadas</span>
            <span class="bank-hero-card__meta-val" style="color:var(--out);">
              -{moneyPrivacidade(totSaidasReal)}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "8px",
            borderTop: "1px dashed var(--border-soft)",
            fontSize: "0.74rem",
          }}
        >
          {saldoFinalProj !== undefined ? (
            <span style="color:var(--text-muted);">
              Proj: <strong style="color:var(--text);font-variant-numeric:tabular-nums;">{moneyPrivacidade(saldoFinalProj)}</strong>
              {" · "}Desvio: <strong style={{ color: desvio >= 0 ? "var(--in)" : "var(--out)", fontVariantNumeric: "tabular-nums" }}>{signedPrivacidade(desvio)}</strong>
            </span>
          ) : (
            <span style="color:var(--text-muted);">Patrimônio Total:</span>
          )}
          <strong style="color:var(--text);font-variant-numeric:tabular-nums;">
            {moneyPrivacidade(patrimonioConsolidado)}
          </strong>
        </div>
      </section>

      {/* 2. Fileira de Ações Rápidas (Estilo Banco Digital - 6 Pílulas) */}
      <section class="bank-quick-actions" aria-label="Ações rápidas">
        <a href="#/realizacoes/novo" class="bank-quick-action bank-quick-action--primary">
          <div class="bank-quick-action__btn">
            <Icon name="plus" />
          </div>
          <span class="bank-quick-action__label">Nova Realização</span>
        </a>

        <a href="#/projecoes" class="bank-quick-action">
          <div class="bank-quick-action__btn">
            <Icon name="grid" />
          </div>
          <span class="bank-quick-action__label">Projeções</span>
        </a>

        <a href="#/realizacoes" class="bank-quick-action">
          <div class="bank-quick-action__btn">
            <Icon name="list" />
          </div>
          <span class="bank-quick-action__label">Realizações</span>
        </a>

        <a href="#/reservas" class="bank-quick-action">
          <div class="bank-quick-action__btn">
            <Icon name="wallet" />
          </div>
          <span class="bank-quick-action__label">Reservas</span>
        </a>

        <a href="#/investimentos" class="bank-quick-action">
          <div class="bank-quick-action__btn">
            <Icon name="sparkles" />
          </div>
          <span class="bank-quick-action__label">Investimentos</span>
        </a>

        <div class="bank-quick-action" onClick={() => (onVerRelatorioCompleto ? onVerRelatorioCompleto() : setAbaAtiva("dre"))} role="button" tabIndex={0}>
          <div class="bank-quick-action__btn">
            <Icon name="chart" />
          </div>
          <span class="bank-quick-action__label">Relatórios</span>
        </div>
      </section>

      {/* 3. Alerta de Pendências Financeiras com Quitação Rápida */}
      {pendencias.length > 0 && contas.length > 0 && categorias.length > 0 && (
        <CardPendencias
          pendencias={pendencias}
          contas={contas}
          categorias={categorias}
          mesFiltro={mesRef}
          onLancar={(p) => {
            setQuitarBancoId(bancos[0]?.id || "");
            setModalQuitarPendencia(p);
          }}
          onIgnorar={(_p) => {}}
        />
      )}

      {/* 4. Indicador do Mês Atual (Entradas x Saídas) */}
      <section
        class="card"
        style={{
          borderRadius: "16px",
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:6px;">
            <Icon name="chart" style="width:16px;height:16px;color:var(--primary);" />
            <strong style="font-size:0.86rem;color:var(--text);">Resultado de {MONTHS[mesRef]}</strong>
          </div>
          <span
            style={{
              fontSize: "0.85rem",
              fontWeight: "800",
              color: superavit >= 0 ? "var(--in)" : "var(--out)",
            }}
          >
            {signedPrivacidade(superavit)}
          </span>
        </div>

        <div
          style={{
            height: "8px",
            borderRadius: "4px",
            background: "var(--surface-soft)",
            display: "flex",
            overflow: "hidden",
            marginTop: "2px",
          }}
        >
          {totEntradasReal + totSaidasReal > 0 && (
            <>
              <div
                style={{
                  height: "100%",
                  background: "var(--in)",
                  width: `${Math.round((totEntradasReal / (totEntradasReal + totSaidasReal)) * 100)}%`,
                }}
                title="Entradas"
              />
              <div
                style={{
                  height: "100%",
                  background: "var(--out)",
                  width: `${Math.round((totSaidasReal / (totEntradasReal + totSaidasReal)) * 100)}%`,
                }}
                title="Saídas"
              />
            </>
          )}
        </div>
      </section>

      {/* 5. Gráfico de Resultado Mensal dos 12 Meses (Proj vs Real) */}
      {resultadoProj && resultadoReal && resultadoProj.length === 12 && (
        <section
          class="card"
          style={{
            borderRadius: "16px",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:6px;">
              <Icon name="chart" style="width:16px;height:16px;color:var(--primary);" />
              <strong style="font-size:0.86rem;color:var(--text);">Resultado Mensal (12 Meses)</strong>
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:0.68rem;color:var(--text-muted);">
              <span style="display:flex;align-items:center;gap:4px;">
                <i class="dot" style="background:color-mix(in srgb, var(--primary) 30%, transparent);width:6px;height:6px;" />
                Proj.
              </span>
              <span style="display:flex;align-items:center;gap:4px;">
                <i class="dot" style="background:var(--primary);width:6px;height:6px;" />
                Real
              </span>
            </div>
          </div>

          {(() => {
            const maxVal = Math.max(1, ...resultadoProj.map(Math.abs), ...resultadoReal.map(Math.abs));
            return (
              <div class="bars" role="img" aria-label="Resultado projetado versus real por mês" style="height:110px;gap:3px;">
                {MONTHS.map((m, i) => {
                  const projH = (Math.abs(resultadoProj[i]) / maxVal) * 100;
                  const realH = (Math.abs(resultadoReal[i]) / maxVal) * 100;
                  const isCurrent = i === mesRef;
                  return (
                    <div
                      key={m}
                      class={`bars__col ${isCurrent ? "is-current" : ""}`}
                      title={`${m}: Proj ${money(resultadoProj[i])} · Real ${money(resultadoReal[i])}`}
                    >
                      <div class="bars__pair">
                        <div
                          class="bars__bar bars__bar--proj"
                          style={{ height: `${projH}%` }}
                        />
                        <div
                          class={`bars__bar ${i <= mesRef ? "bars__bar--real" : "bars__bar--future"} ${resultadoReal[i] < 0 ? "is-neg" : ""}`}
                          style={{ height: `${realH}%` }}
                        />
                      </div>
                      <span class="bars__label">{m[0]}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
      )}

      {/* 6. Controle de Teto Orçamentário */}
      {controleTeto.length > 0 && (
        <section
          class="card"
          style={{
            borderRadius: "16px",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                <Icon name="wallet" style="width:16px;height:16px;color:var(--primary);" />
                <strong style="font-size:0.86rem;color:var(--text);">Teto Orçamentário</strong>
              </div>
              <span style="font-size:0.68rem;color:var(--text-muted);">
                Despesas em {MONTHS[mesRef]}
              </span>
            </div>
            {estouradas.length > 0 ? (
              <span class="badge" style="background:var(--out-soft);color:var(--out);font-weight:700;font-size:0.68rem;padding:2px 6px;">
                <Icon name="alertTriangle" style="width:11px;height:11px;" /> {estouradas.length} estourada{estouradas.length > 1 ? "s" : ""}
              </span>
            ) : alertas.length > 0 ? (
              <span class="badge" style="background:var(--warn-soft);color:var(--warn);font-weight:700;font-size:0.68rem;padding:2px 6px;">
                <Icon name="alertTriangle" style="width:11px;height:11px;" /> {alertas.length} em alerta
              </span>
            ) : (
              <span class="badge" style="background:var(--in-soft);color:var(--in);font-weight:700;font-size:0.68rem;padding:2px 6px;">
                <Icon name="check" style="width:11px;height:11px;" /> No teto
              </span>
            )}
          </div>

          {estouradas.length > 0 && (
            <div
              style={{
                background: "var(--out-soft)",
                color: "var(--out)",
                padding: "8px 12px",
                borderRadius: "10px",
                fontSize: "0.72rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Icon name="alertTriangle" style="width:14px;height:14px;flex-shrink:0;" />
              <span>
                {estouradas.length === 1
                  ? `"${estouradas[0].cat.nome}" ultrapassou o teto projetado em +${moneyPrivacidade(estouradas[0].excesso)}.`
                  : `${estouradas.length} categorias ultrapassaram o teto projetado para este mês.`}
              </span>
            </div>
          )}

          <div style="display:flex;flex-direction:column;gap:8px;">
            {controleTeto.slice(0, 5).map((item) => {
              const barColor =
                item.status === "estourado"
                  ? "var(--out)"
                  : item.status === "alerta"
                  ? "var(--warn)"
                  : "var(--in)";
              return (
                <div key={item.cat.id} style="display:flex;flex-direction:column;gap:3px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.74rem;">
                    <span style="font-weight:600;display:flex;align-items:center;gap:6px;color:var(--text);">
                      <i class="dot" style={`background:${barColor}`} />
                      {item.cat.nome}
                    </span>
                    <div style="display:flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums;">
                      <span>
                        <strong>{moneyPrivacidade(item.real)}</strong>
                        <span style="color:var(--text-muted);font-size:0.68rem;"> / {moneyPrivacidade(item.proj)}</span>
                      </span>
                      <span
                        class="badge"
                        style={{
                          background: `${barColor}22`,
                          color: barColor,
                          fontSize: "0.64rem",
                          padding: "1px 5px",
                          fontWeight: "700",
                        }}
                      >
                        {item.pct}%
                      </span>
                    </div>
                  </div>
                  <div style="height:5px;border-radius:3px;background:var(--surface-soft);overflow:hidden;">
                    <div
                      style={{
                        width: `${Math.min(100, item.pct)}%`,
                        height: "100%",
                        background: barColor,
                        borderRadius: "3px",
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 7. Minhas Reservas */}
      <section style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;">
          <h2 style="font-size:0.92rem;font-weight:800;color:var(--text);margin:0;">
            Minhas Reservas
          </h2>
          <a
            href="#/reservas"
            style="font-size:0.75rem;font-weight:700;color:var(--primary);text-decoration:none;"
          >
            Ver todas &rarr;
          </a>
        </div>

        {reservas.length === 0 ? (
          <div
            class="card"
            style="text-align:center;padding:18px;border-radius:16px;display:flex;flex-direction:column;align-items:center;gap:6px;"
          >
            <Icon name="wallet" style="width:24px;height:24px;color:var(--text-muted);" />
            <span style="font-size:0.80rem;color:var(--text-muted);">Você ainda não tem caixinhas</span>
            <a href="#/reservas" class="btn btn--primary btn--sm" style="margin-top:2px;font-size:0.75rem;">
              Criar Caixinha
            </a>
          </div>
        ) : (
          <div style="display:flex;flex-direction:column;gap:8px;">
            {reservas.slice(0, 3).map((r) => {
              const saldo = reservasSaldos.get(r.id) || 0;
              const meta = r.metaCentavos || 0;
              const pct = meta > 0 ? Math.min(100, Math.round((saldo / meta) * 100)) : 0;

              return (
                <div key={r.id} class="caixinha-card" style="padding:12px 14px;">
                  <div class="caixinha-card__top">
                    <div class="caixinha-card__title">
                      <Icon name="wallet" style="width:15px;height:15px;color:var(--primary);" />
                      <span style="font-size:0.84rem;">{r.nome}</span>
                    </div>
                    {meta > 0 && (
                      <span class="caixinha-card__badge" style="background:var(--primary-soft);color:var(--primary);font-size:0.68rem;">
                        {pct}% da meta
                      </span>
                    )}
                  </div>

                  <div class="caixinha-card__val" style="font-size:1.15rem;">
                    {moneyPrivacidade(saldo)}
                  </div>

                  {meta > 0 && (
                    <div class="caixinha-card__progress-wrap">
                      <div class="caixinha-card__progress-bar">
                        <div class="caixinha-card__progress-fill" style={`width:${pct}%;`} />
                      </div>
                      <div style="display:flex;justify-content:space-between;font-size:0.66rem;color:var(--text-muted);">
                        <span>Atual</span>
                        <span>Meta: {moneyPrivacidade(meta)}</span>
                      </div>
                    </div>
                  )}

                  <div class="caixinha-card__actions" style="margin-top:6px;">
                    <a href="#/reservas" class="caixinha-card__btn caixinha-card__btn--primary" style="font-size:0.72rem;padding:4px 8px;">
                      <Icon name="plus" style="width:13px;height:13px;" /> Guardar
                    </a>
                    <a href="#/reservas" class="caixinha-card__btn" style="font-size:0.72rem;padding:4px 8px;">
                      Resgatar
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 8. Últimas Transações do Extrato */}
      <section style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;">
          <h2 style="font-size:0.92rem;font-weight:800;color:var(--text);margin:0;">
            Últimas Transações
          </h2>
          <a
            href="#/realizacoes"
            style="font-size:0.75rem;font-weight:700;color:var(--primary);text-decoration:none;"
          >
            Extrato completo
          </a>
        </div>

        {ultimosLancamentos.length === 0 ? (
          <div
            class="card"
            style="text-align:center;padding:20px;border-radius:16px;color:var(--text-muted);font-size:0.80rem;"
          >
            Nenhuma transação recente no período.
          </div>
        ) : (
          <div>
            {ultimosLancamentos.map((tx) => {
              const isEntrada = tx.natureza === "receber" || tx.natureza === "aporte";

              return (
                <a key={tx.id} href="#/realizacoes" class="mobile-tx-card" style="padding:10px 12px;gap:10px;">
                  <div
                    class="mobile-tx-card__icon"
                    style={{
                      background: isEntrada ? "var(--in-soft)" : "var(--out-soft)",
                      color: isEntrada ? "var(--in)" : "var(--out)",
                      width: "34px",
                      height: "34px",
                    }}
                  >
                    <Icon name={isEntrada ? "arrowDown" : "arrowUp"} style="width:16px;height:16px;" />
                  </div>

                  <div class="mobile-tx-card__main">
                    <div class="mobile-tx-card__title" style="font-size:0.82rem;">
                      {tx.descricao || tx.contaNome}
                    </div>
                    <div class="mobile-tx-card__sub" style="font-size:0.68rem;">
                      <span>{formatarDataCurta(tx.data)}</span>
                      <span>•</span>
                      <span>{tx.catNome}</span>
                    </div>
                  </div>

                  <div class="mobile-tx-card__val">
                    <div
                      class="mobile-tx-card__amount"
                      style={{ color: isEntrada ? "var(--in)" : "var(--text)", fontSize: "0.86rem" }}
                    >
                      {isEntrada ? "+" : "-"}{moneyPrivacidade(tx.valor)}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>
        </>
      )}

      {/* Visões Analíticas Unificadas no Início (quando não estiver em 'visao') */}
      {abaAtiva !== "visao" && (
        <div class="card" style="padding:12px;display:flex;flex-direction:column;gap:10px;border-radius:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">
              Filtro de Período
            </div>
            <button
              type="button"
              class="btn btn--sm btn--primary"
              onClick={exportarCSV}
              style="font-size:0.72rem;padding:4px 10px;gap:5px;border-radius:8px;"
            >
              <Icon name="download" style="width:12px;height:12px;" /> Exportar CSV
            </button>
          </div>

          <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none;">
            <button
              type="button"
              class={`chip ${presetAtivo === "ano_ate_hoje" ? "chip--active" : ""}`}
              onClick={() => aplicarPreset("ano_ate_hoje")}
              style="font-size:0.70rem;padding:4px 8px;flex-shrink:0;"
            >
              Ano até Hoje
            </button>
            <button
              type="button"
              class={`chip ${presetAtivo === "mes_atual" ? "chip--active" : ""}`}
              onClick={() => aplicarPreset("mes_atual")}
              style="font-size:0.70rem;padding:4px 8px;flex-shrink:0;"
            >
              Este Mês
            </button>
            <button
              type="button"
              class={`chip ${presetAtivo === "mes_anterior" ? "chip--active" : ""}`}
              onClick={() => aplicarPreset("mes_anterior")}
              style="font-size:0.70rem;padding:4px 8px;flex-shrink:0;"
            >
              Mês Anterior
            </button>
            <button
              type="button"
              class={`chip ${presetAtivo === "ano" ? "chip--active" : ""}`}
              onClick={() => aplicarPreset("ano")}
              style="font-size:0.70rem;padding:4px 8px;flex-shrink:0;"
            >
              Ano Todo
            </button>
          </div>

          <div style="display:flex;gap:8px;">
            <div style="flex:1;">
              <label style="font-size:0.68rem;color:var(--text-muted);display:block;margin-bottom:2px;">Início</label>
              <input
                type="date"
                class="input"
                style="font-size:0.75rem;padding:6px 8px;"
                value={dataInicio}
                onChange={(e) => {
                  setPresetAtivo("custom");
                  setDataInicio((e.currentTarget as HTMLInputElement).value);
                }}
              />
            </div>
            <div style="flex:1;">
              <label style="font-size:0.68rem;color:var(--text-muted);display:block;margin-bottom:2px;">Fim</label>
              <input
                type="date"
                class="input"
                style="font-size:0.75rem;padding:6px 8px;"
                value={dataFim}
                onChange={(e) => {
                  setPresetAtivo("custom");
                  setDataFim((e.currentTarget as HTMLInputElement).value);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Relatório 1: Posição de Bancos */}
      {abaAtiva === "bancos" && (
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div class="card" style="padding:14px;border-radius:16px;">
            <div style="font-size:0.72rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;">
              Saldo Consolidado em Bancos
            </div>
            <div style="font-size:1.4rem;font-weight:900;margin-top:4px;color:var(--text);font-variant-numeric:tabular-nums;">
              {moneyPrivacidade(posicaoBancosAteFim.totalGeral)}
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px dashed var(--border-soft);font-size:0.72rem;">
              <span style="color:var(--in);">Entradas: +{moneyPrivacidade(posicaoBancosPeriodo.totalEntradas)}</span>
              <span style="color:var(--out);">Saídas: -{moneyPrivacidade(posicaoBancosPeriodo.totalSaidas)}</span>
            </div>
          </div>

          <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none;">
            {(["todos", "corrente", "poupanca", "investimento", "caixa"] as const).map((tipo) => (
              <button
                key={tipo}
                type="button"
                class={`chip ${filtroTipoBanco === tipo ? "chip--active" : ""}`}
                onClick={() => setFiltroTipoBanco(tipo)}
                style="font-size:0.70rem;padding:4px 8px;flex-shrink:0;text-transform:capitalize;"
              >
                {tipo === "todos" ? "Todos os tipos" : tipo}
              </button>
            ))}
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;">
            {bancosFiltrados.length === 0 ? (
              <div class="card" style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.80rem;">
                Nenhum banco encontrado com os filtros selecionados.
              </div>
            ) : (
              bancosFiltrados.map((b) => {
                const bAteFim = posicaoBancosAteFim.bancos.find((x) => x.banco.id === b.id);
                const bPeriodo = posicaoBancosPeriodo.bancos.find((x) => x.banco.id === b.id);
                const saldoAtual = bAteFim?.saldoAtual ?? b.saldoInicialCentavos ?? 0;
                const ent = bPeriodo?.totalEntradas ?? 0;
                const sai = bPeriodo?.totalSaidas ?? 0;

                return (
                  <div key={b.id} class="card" style="padding:14px;border-radius:14px;display:flex;flex-direction:column;gap:8px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                      <div style="display:flex;align-items:center;gap:8px;">
                        <div style="width:32px;height:32px;border-radius:10px;background:var(--primary-soft);color:var(--primary);display:flex;align-items:center;justify-content:center;">
                          <Icon name="bank" style="width:16px;height:16px;" />
                        </div>
                        <div>
                          <div style="font-weight:700;font-size:0.86rem;color:var(--text);">{b.nome}</div>
                          <div style="font-size:0.68rem;color:var(--text-muted);text-transform:capitalize;">{b.tipo || "corrente"}</div>
                        </div>
                      </div>
                      <div style="text-align:right;">
                        <div style={{ fontSize: "0.95rem", fontWeight: "800", color: saldoAtual >= 0 ? "var(--text)" : "var(--out)", fontVariantNumeric: "tabular-nums" }}>
                          {moneyPrivacidade(saldoAtual)}
                        </div>
                        <div style="font-size:0.65rem;color:var(--text-muted);">Saldo no Período</div>
                      </div>
                    </div>

                    <div style="display:flex;justify-content:space-between;background:var(--surface-soft);padding:8px 10px;border-radius:8px;font-size:0.72rem;margin-top:2px;">
                      <span>Inicial: <strong>{moneyPrivacidade(b.saldoInicialCentavos || 0)}</strong></span>
                      <span style="color:var(--in);">+{moneyPrivacidade(ent)}</span>
                      <span style="color:var(--out);">-{moneyPrivacidade(sai)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Relatório 2: DRE & Demonstrativo por Categoria */}
      {abaAtiva === "dre" && (
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div class="card" style="padding:12px;border-radius:14px;">
              <span style="font-size:0.68rem;color:var(--text-muted);font-weight:700;">RECEITAS</span>
              <div style="font-size:1rem;font-weight:900;color:var(--in);margin-top:2px;font-variant-numeric:tabular-nums;">
                {moneyPrivacidade(totReceitasReal)}
              </div>
              <span style="font-size:0.64rem;color:var(--text-muted);">
                Proj: {moneyPrivacidade(totReceitasProj)}
              </span>
            </div>

            <div class="card" style="padding:12px;border-radius:14px;">
              <span style="font-size:0.68rem;color:var(--text-muted);font-weight:700;">DESPESAS</span>
              <div style="font-size:1rem;font-weight:900;color:var(--out);margin-top:2px;font-variant-numeric:tabular-nums;">
                {moneyPrivacidade(totDespesasReal)}
              </div>
              <span style="font-size:0.64rem;color:var(--text-muted);">
                Proj: {moneyPrivacidade(totDespesasProj)}
              </span>
            </div>
          </div>

          <div class="card" style="padding:12px 14px;border-radius:14px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="font-size:0.68rem;color:var(--text-muted);font-weight:700;">RESULTADO DO PERÍODO</span>
              <div style={{ fontSize: "1.15rem", fontWeight: "900", color: resultadoDRE >= 0 ? "var(--in)" : "var(--out)", fontVariantNumeric: "tabular-nums" }}>
                {signedPrivacidade(resultadoDRE)}
              </div>
            </div>
            <div style="text-align:right;font-size:0.70rem;color:var(--text-muted);">
              <div>Proj: {signedPrivacidade(resultadoDREProj)}</div>
              <div style={{ color: resultadoDRE - resultadoDREProj >= 0 ? "var(--in)" : "var(--out)", fontWeight: "700" }}>
                Desvio: {signedPrivacidade(resultadoDRE - resultadoDREProj)}
              </div>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;padding:0 2px;">
              Demonstrativo por Categoria
            </div>

            {Array.from(mapCatDRE.values()).length === 0 ? (
              <div class="card" style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.80rem;">
                Nenhuma movimentação neste período.
              </div>
            ) : (
              Array.from(mapCatDRE.values())
                .sort((a, b) => b.real - a.real)
                .map((cat) => {
                  const diff = cat.real - cat.proj;
                  const pct = cat.proj > 0 ? Math.round((cat.real / cat.proj) * 100) : 0;
                  const isEntrada = cat.natureza === "receber" || cat.natureza === "aporte";

                  return (
                    <div key={cat.id} class="card" style="padding:12px 14px;border-radius:14px;display:flex;flex-direction:column;gap:6px;">
                      <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-weight:700;font-size:0.82rem;color:var(--text);">
                          {cat.nome}
                        </span>
                        <span
                          class="badge"
                          style={{
                            fontSize: "0.65rem",
                            padding: "1px 6px",
                            fontWeight: "700",
                            background: isEntrada ? "var(--in-soft)" : "var(--out-soft)",
                            color: isEntrada ? "var(--in)" : "var(--out)",
                            textTransform: "capitalize",
                          }}
                        >
                          {cat.natureza}
                        </span>
                      </div>

                      <div style="display:flex;justify-content:space-between;font-size:0.74rem;font-variant-numeric:tabular-nums;">
                        <span style="color:var(--text-muted);">
                          Proj: <strong>{moneyPrivacidade(cat.proj)}</strong>
                        </span>
                        <span style={{ fontWeight: "800", color: isEntrada ? "var(--in)" : "var(--out)" }}>
                          Real: {moneyPrivacidade(cat.real)}
                        </span>
                      </div>

                      <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-muted);border-top:1px dashed var(--border-soft);padding-top:4px;">
                        <span>Diferença: <strong style={{ color: diff >= 0 ? "var(--in)" : "var(--out)" }}>{signedPrivacidade(diff)}</strong></span>
                        {cat.proj > 0 && <span>{pct}% atingido</span>}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* Relatório 3: Fluxo de Caixa Diário */}
      {abaAtiva === "fluxo" && (
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;padding:0 2px;">
            Linha do Tempo de Saldo Diário ({fluxoDiario.length} dias)
          </div>

          {fluxoDiario.length === 0 ? (
            <div class="card" style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.80rem;">
              Nenhum lançamento no período selecionado.
            </div>
          ) : (
            fluxoDiario.map((dia) => {
              const diaFmt = dia.data.split("-").reverse().join("/");
              return (
                <div key={dia.data} class="card" style="padding:12px 14px;border-radius:14px;display:flex;flex-direction:column;gap:6px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:6px;">
                      <Icon name="calendar" style="width:14px;height:14px;color:var(--primary);" />
                      <strong style="font-size:0.82rem;color:var(--text);">{diaFmt}</strong>
                    </div>
                    <span style={{ fontSize: "0.80rem", fontWeight: "800", color: dia.resultado >= 0 ? "var(--in)" : "var(--out)", fontVariantNumeric: "tabular-nums" }}>
                      Dia: {signedPrivacidade(dia.resultado)}
                    </span>
                  </div>

                  <div style="display:flex;justify-content:space-between;font-size:0.72rem;background:var(--surface-soft);padding:6px 10px;border-radius:8px;">
                    <span style="color:var(--in);">+{moneyPrivacidade(dia.entradas)}</span>
                    <span style="color:var(--out);">-{moneyPrivacidade(dia.saidas)}</span>
                    <span style="color:var(--text-muted);">
                      Saldo Acum: <strong style={{ color: dia.saldoAcumulado >= 0 ? "var(--text)" : "var(--out)" }}>{moneyPrivacidade(dia.saldoAcumulado)}</strong>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Relatório 4: Razão Analítico */}
      {abaAtiva === "razao" && (
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div class="field" style="margin:0;">
            <input
              type="search"
              class="input"
              placeholder="Buscar lançamento, descrição, conta..."
              value={buscaRazao}
              onChange={(e) => setBuscaRazao((e.currentTarget as HTMLInputElement).value)}
              style="font-size:0.80rem;padding:8px 12px;border-radius:10px;"
            />
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.72rem;color:var(--text-muted);padding:0 2px;">
            <span>{razaoFiltrado.length} lançamentos encontrados</span>
            <span>Volume: <strong>{moneyPrivacidade(volTotalRazao)}</strong></span>
          </div>

          <div style="display:flex;flex-direction:column;gap:6px;">
            {razaoFiltrado.length === 0 ? (
              <div class="card" style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.80rem;">
                Nenhum lançamento correspondente à busca.
              </div>
            ) : (
              razaoFiltrado.map((l) => {
                const c = contaMap.get(l.contaId);
                const catNome = c ? catMap.get(c.categoriaId) : "";
                const bNome = l.bancoId ? bancoMap.get(l.bancoId) : "";
                const isEntrada = c?.natureza === "receber" || c?.natureza === "aporte";

                return (
                  <div key={l.id} class="card" style="padding:10px 12px;border-radius:12px;display:flex;flex-direction:column;gap:4px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <span style="font-size:0.80rem;font-weight:700;color:var(--text);">
                        {l.descricao || c?.nome || "Lançamento"}
                      </span>
                      <span style={{ fontSize: "0.82rem", fontWeight: "800", color: isEntrada ? "var(--in)" : "var(--out)", fontVariantNumeric: "tabular-nums" }}>
                        {isEntrada ? "+" : "-"}{moneyPrivacidade(l.valor)}
                      </span>
                    </div>

                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.68rem;color:var(--text-muted);">
                      <span>{l.data.split("-").reverse().join("/")} • {c?.nome || "Conta"}</span>
                      {bNome && <span class="badge" style="font-size:0.62rem;padding:1px 5px;">{bNome}</span>}
                    </div>

                    {catNome && (
                      <div style="font-size:0.64rem;color:var(--text-muted);">
                        Cat: {catNome}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Modal Bottom-Sheet de Quitação Rápida de Pendência */}
      {modalQuitarPendencia && (() => {
        const c = contas.find((x) => x.id === modalQuitarPendencia.contaId);
        const cat = categorias.find((x) => x.id === c?.categoriaId);
        return (
          <div class="modal-backdrop" onClick={() => setModalQuitarPendencia(null)}>
            <div class="modal" onClick={(e) => e.stopPropagation()} style="max-width:400px;border-radius:20px;padding:18px;">
              <div class="modal__head" style="margin-bottom:12px;">
                <h3 class="modal__title" style="font-size:0.95rem;">Quitar Conta Pendente</h3>
                <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalQuitarPendencia(null)}>
                  <Icon name="x" />
                </button>
              </div>

              <div style="display:flex;flex-direction:column;gap:12px;">
                <div style="background:var(--surface-soft);padding:12px;border-radius:12px;display:flex;flex-direction:column;gap:4px;">
                  <span style="font-size:0.70rem;color:var(--text-muted);font-weight:700;">VALOR A QUITAR</span>
                  <div style="font-size:1.3rem;font-weight:900;color:var(--out);font-variant-numeric:tabular-nums;">
                    {money(modalQuitarPendencia.valorPendente)}
                  </div>
                  <div style="font-size:0.82rem;font-weight:700;color:var(--text);">
                    {c?.nome || "Conta"}
                  </div>
                  <div style="font-size:0.70rem;color:var(--text-muted);">
                    {cat?.nome || "Geral"} • Vencimento: {modalQuitarPendencia.dataSugerida.split("-").reverse().join("/")}
                  </div>
                </div>

                {bancos.length > 0 && (
                  <div class="field">
                    <label class="field__label" style="font-size:0.75rem;">Banco de Pagamento</label>
                    <select
                      class="input"
                      style="font-size:0.82rem;"
                      value={quitarBancoId}
                      onChange={(e) => setQuitarBancoId((e.currentTarget as HTMLSelectElement).value)}
                    >
                      <option value="">Sem vínculo bancário específico</option>
                      {bancos.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nome} ({b.tipo})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div class="modal__foot" style="display:flex;gap:8px;margin-top:16px;">
                <button type="button" class="btn" style="flex:1;font-size:0.80rem;" onClick={() => setModalQuitarPendencia(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  class="btn btn--primary"
                  style="flex:1;font-size:0.80rem;"
                  onClick={async () => {
                    if (!anoId) return;
                    await lancamentos.create({
                      anoId,
                      contaId: modalQuitarPendencia.contaId,
                      mes: modalQuitarPendencia.mes,
                      data: modalQuitarPendencia.dataSugerida,
                      valor: modalQuitarPendencia.valorPendente,
                      descricao: c?.nome || "Quitação de pendência",
                      bancoId: quitarBancoId || undefined,
                      pago: true,
                      dataQuitacao: modalQuitarPendencia.dataSugerida,
                    });
                    toast.success("Conta quitada com sucesso!");
                    setModalQuitarPendencia(null);
                  }}
                >
                  <Icon name="check" /> Confirmar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.tsx";
import { calcular, calcularCarteiraReservas, calcularPosicaoBancos } from "../data/calc.ts";
import { db } from "../data/db.ts";
import {
  anos,
  categorias,
  contas,
  contasBancarias,
  empresas,
  lancamentos,
  projecoes,
  reservaMovimentos,
  reservaProjecoes,
  reservas,
} from "../data/repo.ts";
import { seedExemplo } from "../data/seed.ts";
import {
  type Ano,
  type Conta,
  type ContaBancaria,
  NATUREZAS,
  SINAL,
  type TipoContaBancaria,
} from "../data/types.ts";
import { cloudUser } from "../data/cloudSync.ts";
import { useLive } from "../data/useLive.ts";
import { labelCpfCnpj, money, moneyCompact, MONTHS, signed } from "../lib/format.ts";
import { NATURE_META } from "../lib/natureza.ts";
import { anoAtivo, empresaAtiva, setAno, setEmpresa } from "../state.ts";
import { useSignal } from "../lib/signal.ts";

const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

function formatarDataBR(isoDate: string): string {
  if (!isoDate) return "";
  const [yyyy, mm, dd] = isoDate.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function Vazio() {
  const carregar = async () => {
    const id = await seedExemplo();
    setEmpresa(id);
    setAno(new Date().getFullYear());
  };
  return (
    <section class="card empty">
      <Icon name="building" />
      <h2>Bem-vindo ao Finansys</h2>
      <p>Cadastre sua primeira empresa em Ajustes, ou carregue um exemplo para conhecer o sistema.</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap">
        <button id="seed-demo" class="btn" type="button" onClick={carregar}>Carregar exemplo</button>
        <a id="go-settings" class="btn btn--primary" href="#/ajustes">Cadastrar empresa</a>
      </div>
    </section>
  );
}

export function Dashboard() {
  const empId = useSignal(empresaAtiva);
  const anoNum = useSignal(anoAtivo);
  const user = useSignal(cloudUser);

  // Aba ativa: Visão Geral Executiva ou Relatórios Especializados
  const [abaAtiva, setAbaAtiva] = useState<"visao" | "bancos" | "dre" | "fluxo" | "razao">(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("relatorios")) {
      return "dre";
    }
    return "visao";
  });

  // Data atual
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const anoHoje = hoje.getFullYear();

  // Filtro de intervalo de datas para relatórios analíticos
  const [dataInicio, setDataInicio] = useState<string>(`${anoNum}-01-01`);
  const [dataFim, setDataFim] = useState<string>(() => {
    if (anoNum === anoHoje) return hojeStr;
    if (anoNum < anoHoje) return `${anoNum}-12-31`;
    return `${anoNum}-01-01`;
  });
  const [presetAtivo, setPresetAtivo] = useState<string>(() => (anoNum === anoHoje ? "ano_ate_hoje" : "ano"));
  const [filtroTipoBanco, setFiltroTipoBanco] = useState<"todos" | TipoContaBancaria>("todos");
  const [agruparPorTipo, setAgruparPorTipo] = useState<boolean>(true);
  const [buscaRazao, setBuscaRazao] = useState<string>("");

  useEffect(() => {
    setDataInicio(`${anoNum}-01-01`);
    if (anoNum === anoHoje) {
      setDataFim(hojeStr);
      setPresetAtivo("ano_ate_hoje");
    } else {
      setDataFim(`${anoNum}-12-31`);
      setPresetAtivo("ano");
    }
  }, [anoNum]);

  // Carrega todos os dados da empresa e de todos os anos
  const dados = useLive(async () => {
    if (!empId) return null;
    const [emp, todosAnos, anoAtualObj] = await Promise.all([
      empresas.get(empId),
      anos.byEmpresa(empId),
      anos.find(empId, anoNum),
    ]);
    if (!emp || todosAnos.length === 0) return { emp, ano: undefined, todosAnos: [] } as const;

    const anoIds = todosAnos.map((a) => a.id);
    const [cs, cats, ps, ls, resList, movList, projResList, bancoList] = await Promise.all([
      contas.byEmpresa(empId),
      categorias.byEmpresa(empId),
      db.projecoes.where("anoId").anyOf(anoIds).filter((p) => !p.deletedAt).toArray(),
      db.lancamentos.where("anoId").anyOf(anoIds).filter((l) => !l.deletedAt).toArray(),
      reservas.byEmpresa(empId),
      db.reservaMovimentos.where("empresaId").equals(empId).filter((m) => !m.deletedAt).toArray(),
      anoAtualObj ? reservaProjecoes.byAno(anoAtualObj.id) : Promise.resolve([]),
      contasBancarias.byEmpresa(empId),
    ]);

    return {
      emp,
      ano: anoAtualObj,
      todosAnos,
      cs,
      cats,
      ps,
      ls,
      resList,
      movList,
      projResList,
      bancoList,
    } as const;
  }, [empId, anoNum], undefined);

  if (dados === undefined) return null;
  if (!dados || !dados.emp) return <Vazio />;
  if (!dados.ano) {
    return (
      <section class="card empty">
        <Icon name="calendar" />
        <h2>Nenhum ano aberto para {anoNum}</h2>
        <p>Abra o ano e informe a banca inicial em Ajustes.</p>
      </section>
    );
  }

  const { emp, ano, todosAnos, cs, cats, ps, ls, resList, movList, projResList, bancoList } = dados;

  // Mapa de IDs
  const anoIdParaAnoNum = new Map<string, number>(todosAnos.map((a) => [a.id, a.ano]));
  const catMap = new Map<string, string>(cats.map((c) => [c.id, c.nome]));
  const contaMap = new Map<string, Conta>(cs.map((c) => [c.id, c]));
  const bancoMap = new Map<string, string>(bancoList.map((b) => [b.id, b.nome]));

  // Dados filtrados pelo ano corrente para o painel executivo
  const lsAnoAtual = ls.filter((l) => (anoIdParaAnoNum.get(l.anoId) ?? 0) === ano.ano);
  const psAnoAtual = ps.filter((p) => (anoIdParaAnoNum.get(p.anoId) ?? 0) === ano.ano);

  const mesRef = ano.ano < hoje.getFullYear() ? 11 : ano.ano > hoje.getFullYear() ? -1 : hoje.getMonth();
  const idx = Math.max(0, mesRef);
  const rAnoAtual = calcular(ano.bancaInicial, cs, psAnoAtual, lsAnoAtual, mesRef);
  const saldoRealExec = rAnoAtual.saldoReal[idx];
  const saldoProjExec = rAnoAtual.saldoProj[idx];
  const desvioExec = saldoRealExec - saldoProjExec;
  const maxExec = Math.max(1, ...rAnoAtual.resultadoProj.map(Math.abs), ...rAnoAtual.resultadoReal.map(Math.abs));

  const carteiraExec = calcularCarteiraReservas(resList, movList, projResList, idx);
  const totalReservasRealExec = carteiraExec.totalPatrimonioReal;
  const patrimonioConsolidadoExec = saldoRealExec + totalReservasRealExec;

  // Lançamentos recentes
  const recentes = [...lsAnoAtual]
    .sort((a, b) => b.data.localeCompare(a.data) || b.createdAt - a.createdAt)
    .slice(0, 6);

  // Controle de teto orçamentário
  const catDespesas = cats.filter((c) => c.natureza === "pagar" || c.natureza === "saida");
  const controleTeto = catDespesas.map((cat) => {
    const contasDestaCat = cs.filter((c) => c.categoriaId === cat.id);
    const cIds = new Set(contasDestaCat.map((c) => c.id));
    const projVal = psAnoAtual.filter((p) => cIds.has(p.contaId) && p.mes === idx).reduce((s, p) => s + p.valor, 0);
    const realVal = lsAnoAtual.filter((l) => !l.bancoDestinoId && cIds.has(l.contaId) && l.mes === idx).reduce((s, l) => s + l.valor, 0);
    const pct = projVal > 0 ? Math.round((realVal / projVal) * 100) : (realVal > 0 ? 100 : 0);
    const status: "estourado" | "alerta" | "sem_teto" | "ok" =
      projVal === 0 && realVal > 0 ? "sem_teto" : realVal > projVal ? "estourado" : pct >= 80 ? "alerta" : "ok";
    return { cat, proj: projVal, real: realVal, pct, status, excesso: realVal - projVal };
  }).filter((item) => item.proj > 0 || item.real > 0)
    .sort((a, b) => {
      const peso: Record<string, number> = { estourado: 3, alerta: 2, sem_teto: 1, ok: 0 };
      return (peso[b.status] - peso[a.status]) || (b.pct - a.pct) || (b.real - a.real);
    });

  const estouradas = controleTeto.filter((c) => c.status === "estourado");
  const alertas = controleTeto.filter((c) => c.status === "alerta");

  // ================= CÁLCULOS ANALÍTICOS DO PERÍODO SELECIONADO =================
  const dInicio = dataInicio || "1900-01-01";
  const dFim = dataFim || "2099-12-31";
  const mesInicioStr = dInicio.slice(0, 7);
  const mesFimStr = dFim.slice(0, 7);

  const lsNoPeriodo = ls.filter((l) => l.data >= dInicio && l.data <= dFim);
  const psNoPeriodo = ps.filter((p) => {
    const aNum = anoIdParaAnoNum.get(p.anoId);
    if (!aNum) return false;
    const mesFmt = `${aNum}-${String(p.mes + 1).padStart(2, "0")}`;
    return mesFmt >= mesInicioStr && mesFmt <= mesFimStr;
  });

  const linhasDRE = cs
    .map((c) => {
      const realCentavos = lsNoPeriodo
        .filter((l) => !l.bancoDestinoId && l.contaId === c.id)
        .reduce((s, l) => s + l.valor, 0);
      const projCentavos = psNoPeriodo
        .filter((p) => p.contaId === c.id)
        .reduce((s, p) => s + p.valor, 0);
      const diff = realCentavos - projCentavos;
      const pct = projCentavos > 0 ? (realCentavos / projCentavos) * 100 : 0;
      return {
        conta: c,
        categoriaNome: catMap.get(c.categoriaId) || "Geral",
        proj: projCentavos,
        real: realCentavos,
        diff,
        pct,
      };
    })
    .filter((linha) => linha.proj > 0 || linha.real > 0);

  let totEntradasProj = 0;
  let totEntradasReal = 0;
  let totSaidasProj = 0;
  let totSaidasReal = 0;

  for (const l of linhasDRE) {
    if (l.conta.natureza === "receber" || l.conta.natureza === "aporte") {
      totEntradasProj += l.proj;
      totEntradasReal += l.real;
    } else {
      totSaidasProj += l.proj;
      totSaidasReal += l.real;
    }
  }

  const resultadoLiqProj = totEntradasProj - totSaidasProj;
  const resultadoLiqReal = totEntradasReal - totSaidasReal;

  // Saldo anterior e conciliação do período
  const anoInicioNum = parseInt(dInicio.split("-")[0], 10);
  const anoObj = todosAnos.find((a) => a.ano === anoInicioNum) || todosAnos[0];
  const bancaInicialAno = anoObj ? anoObj.bancaInicial : 0;

  const lsAnteriores = ls.filter(
    (l) => !l.bancoDestinoId && l.data < dInicio && (anoIdParaAnoNum.get(l.anoId) ?? 0) === anoInicioNum,
  );
  let saldoAnteriorAcumulado = 0;
  for (const l of lsAnteriores) {
    const c = contaMap.get(l.contaId);
    if (c) saldoAnteriorAcumulado += SINAL[c.natureza] * l.valor;
  }

  const saldoInicialPeriodo = bancaInicialAno + saldoAnteriorAcumulado;
  const saldoFinalPeriodoReal = saldoInicialPeriodo + resultadoLiqReal;
  const saldoFinalPeriodoProj = saldoInicialPeriodo + resultadoLiqProj;

  // Posição dos Bancos no Período
  const lsAteFim = ls.filter((l) => l.data <= dFim);
  const movsAteFim = movList.filter((m) => m.data <= dFim);
  const movsPeriodo = movList.filter((m) => m.data >= dInicio && m.data <= dFim);
  const posicaoBancosAteFim = calcularPosicaoBancos(bancoList, lsAteFim, cs, movsAteFim);
  const posicaoBancosPeriodo = calcularPosicaoBancos(bancoList, lsNoPeriodo, cs, movsPeriodo);

  // Fluxo de Caixa Diário
  const diasUnicos = Array.from(new Set(lsNoPeriodo.map((l) => l.data))).sort();
  let saldoCorrenteFluxo = saldoInicialPeriodo;
  const fluxoDiario = diasUnicos.map((dia) => {
    const lancsDoDia = lsNoPeriodo.filter((l) => l.data === dia);
    let entradasDia = 0;
    let saidasDia = 0;
    for (const l of lancsDoDia) {
      if (l.bancoDestinoId) continue;
      const c = contaMap.get(l.contaId);
      if (c) {
        if (c.natureza === "receber" || c.natureza === "aporte") entradasDia += l.valor;
        else saidasDia += l.valor;
      }
    }
    const resultadoDia = entradasDia - saidasDia;
    saldoCorrenteFluxo += resultadoDia;
    return {
      data: dia,
      entradas: entradasDia,
      saidas: saidasDia,
      resultado: resultadoDia,
      saldoAcumulado: saldoCorrenteFluxo,
      lancamentos: lancsDoDia,
    };
  });

  // Presets rápidos de data
  const aplicarPreset = (tipo: string) => {
    setPresetAtivo(tipo);
    const dHoje = new Date();
    if (tipo === "ano_ate_hoje") {
      setDataInicio(`${anoNum}-01-01`);
      setDataFim(anoNum === anoHoje ? hojeStr : `${anoNum}-12-31`);
    } else if (tipo === "mes_atual") {
      const y = dHoje.getFullYear();
      const m = dHoje.getMonth() + 1;
      const ultimoDia = new Date(y, m, 0).getDate();
      setDataInicio(`${y}-${String(m).padStart(2, "0")}-01`);
      setDataFim(`${y}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`);
    } else if (tipo === "mes_anterior") {
      const ref = new Date(dHoje.getFullYear(), dHoje.getMonth() - 1, 1);
      const y = ref.getFullYear();
      const m = ref.getMonth() + 1;
      const ultimoDia = new Date(y, m, 0).getDate();
      setDataInicio(`${y}-${String(m).padStart(2, "0")}-01`);
      setDataFim(`${y}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`);
    } else if (tipo === "ano") {
      setDataInicio(`${anoNum}-01-01`);
      setDataFim(`${anoNum}-12-31`);
    } else if (tipo === "ano_anterior") {
      setDataInicio(`${anoNum - 1}-01-01`);
      setDataFim(`${anoNum - 1}-12-31`);
    } else if (tipo === "tudo") {
      const minAno = Math.min(...todosAnos.map((a) => a.ano));
      const maxAno = Math.max(...todosAnos.map((a) => a.ano));
      setDataInicio(`${minAno}-01-01`);
      setDataFim(`${maxAno}-12-31`);
    }
  };

  const labelPeriodoExibicao = `${formatarDataBR(dataInicio)} até ${formatarDataBR(dataFim)}`;

  // Exportar CSV
  const exportarCSV = () => {
    const separador = ";";
    let csv = `\uFEFF`;
    csv += `Finansys - Relatório Consolidado: ${emp.nome}\n`;
    csv += `Período: ${labelPeriodoExibicao}\n\n`;

    if (abaAtiva === "bancos") {
      csv += `Conta Bancária;Tipo;Saldo Inicial (R$);Entradas (+) (R$);Saídas (−) (R$);Saldo Atual (R$)\n`;
      for (const b of bancoList) {
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
          formatarDataBR(f.data),
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
          formatarDataBR(l.data),
          `"${l.descricao || ""}"`,
          `"${c?.nome || ""}"`,
          `"${c ? (catMap.get(c.categoriaId) || "") : ""}"`,
          `"${l.bancoId ? (bancoMap.get(l.bancoId) || "") : ""}"`,
          (l.valor / 100).toFixed(2).replace(".", ","),
        ].join(separador) + "\n";
      }
    } else {
      // DRE padrão
      csv += `Conta;Categoria;Natureza;Projetado (R$);Real (R$);Diferenca (R$);Execucao (%)\n`;
      for (const l of linhasDRE) {
        csv += [
          `"${l.conta.nome}"`,
          `"${l.categoriaNome}"`,
          `"${NATURE_META[l.conta.natureza].label}"`,
          (l.proj / 100).toFixed(2).replace(".", ","),
          (l.real / 100).toFixed(2).replace(".", ","),
          (l.diff / 100).toFixed(2).replace(".", ","),
          l.pct.toFixed(1).replace(".", ",") + "%",
        ].join(separador) + "\n";
      }
      csv += `\nTOTAIS DO PERÍODO\n`;
      csv += `Total Entradas;;;${(totEntradasProj / 100).toFixed(2).replace(".", ",")};${(totEntradasReal / 100).toFixed(2).replace(".", ",")}\n`;
      csv += `Total Saídas;;;${(totSaidasProj / 100).toFixed(2).replace(".", ",")};${(totSaidasReal / 100).toFixed(2).replace(".", ",")}\n`;
      csv += `Resultado Líquido;;;${(resultadoLiqProj / 100).toFixed(2).replace(".", ",")};${(resultadoLiqReal / 100).toFixed(2).replace(".", ",")}\n`;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finansys-${abaAtiva}-${emp.nome.replace(/\s+/g, "_")}-${dataInicio}_a_${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const imprimirPDF = () => {
    window.print();
  };

  return (
    <>
      {/* 1. CABEÇALHO UNIFICADO DO PAINEL */}
      <div class="page-head no-print" style="margin-bottom:var(--sp-3);">
        <div>
          <h1 style="display:flex;align-items:center;gap:10px;">
            <Icon name="chart" style="color:var(--primary);" /> Painel & Relatórios
          </h1>
          <p style="margin-top:2px;">Centro de Gestão Financeira, Análise e Conciliação de {emp.nome}</p>
        </div>

        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn--secondary btn--sm" onClick={exportarCSV} title="Exportar visão ativa para CSV">
            <Icon name="download" /> Exportar CSV
          </button>
          <button type="button" class="btn btn--primary btn--sm" onClick={imprimirPDF} title="Imprimir ou Salvar PDF">
            <Icon name="download" /> Imprimir / PDF
          </button>
        </div>
      </div>

      {/* 2. SELETOR DE ABAS PRINCIPAIS */}
      <div class="tabs-segmented no-print" style="display:flex;gap:6px;margin-bottom:var(--sp-3);background:var(--surface-sunken);padding:4px;border-radius:var(--r-md);overflow-x:auto;">
        <button
          type="button"
          class={`btn btn--sm ${abaAtiva === "visao" ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setAbaAtiva("visao")}
          style="gap:6px;white-space:nowrap;"
        >
          <Icon name="chart" style="width:14px;height:14px;" /> Visão Geral Executiva
        </button>
        <button
          type="button"
          class={`btn btn--sm ${abaAtiva === "bancos" ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setAbaAtiva("bancos")}
          style="gap:6px;white-space:nowrap;"
        >
          <Icon name="bank" style="width:14px;height:14px;" /> Posição dos Bancos
        </button>
        <button
          type="button"
          class={`btn btn--sm ${abaAtiva === "dre" ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setAbaAtiva("dre")}
          style="gap:6px;white-space:nowrap;"
        >
          <Icon name="fileText" style="width:14px;height:14px;" /> Demonstrativo & DRE
        </button>
        <button
          type="button"
          class={`btn btn--sm ${abaAtiva === "fluxo" ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setAbaAtiva("fluxo")}
          style="gap:6px;white-space:nowrap;"
        >
          <Icon name="arrowLeftRight" style="width:14px;height:14px;" /> Fluxo de Caixa
        </button>
        <button
          type="button"
          class={`btn btn--sm ${abaAtiva === "razao" ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setAbaAtiva("razao")}
          style="gap:6px;white-space:nowrap;"
        >
          <Icon name="list" style="width:14px;height:14px;" /> Razão Contábil
        </button>
      </div>

      {/* 3. FILTRO DE INTERVALO DE DATAS (Para as abas analíticas) */}
      {abaAtiva !== "visao" && (
        <section class="date-filter-card no-print" style="margin-bottom:var(--sp-4);">
          <div class="date-filter-row">
            <div class="date-filter-inputs">
              <div class="date-field">
                <label class="date-field__label" for="dash-data-inicio">
                  <Icon name="calendar" /> De:
                </label>
                <input
                  id="dash-data-inicio"
                  type="date"
                  class="date-field__input"
                  value={dataInicio}
                  onChange={(e) => {
                    setDataInicio(e.currentTarget.value);
                    setPresetAtivo("custom");
                  }}
                />
              </div>

              <span class="date-filter-separator">até</span>

              <div class="date-field">
                <label class="date-field__label" for="dash-data-fim">
                  <Icon name="calendar" /> Até:
                </label>
                <input
                  id="dash-data-fim"
                  type="date"
                  class="date-field__input"
                  value={dataFim}
                  onChange={(e) => {
                    setDataFim(e.currentTarget.value);
                    setPresetAtivo("custom");
                  }}
                />
              </div>
            </div>

            <div class="date-presets-scroll" aria-label="Atalhos de período">
              <button
                type="button"
                class={`date-preset-chip ${presetAtivo === "ano_ate_hoje" ? "is-active" : ""}`}
                onClick={() => aplicarPreset("ano_ate_hoje")}
              >
                Ano {anoNum} até Hoje
              </button>
              <button
                type="button"
                class={`date-preset-chip ${presetAtivo === "mes_atual" ? "is-active" : ""}`}
                onClick={() => aplicarPreset("mes_atual")}
              >
                Este Mês
              </button>
              <button
                type="button"
                class={`date-preset-chip ${presetAtivo === "mes_anterior" ? "is-active" : ""}`}
                onClick={() => aplicarPreset("mes_anterior")}
              >
                Mês Anterior
              </button>
              <button
                type="button"
                class={`date-preset-chip ${presetAtivo === "ano" ? "is-active" : ""}`}
                onClick={() => aplicarPreset("ano")}
              >
                Ano {anoNum} Todo
              </button>
              <button
                type="button"
                class={`date-preset-chip ${presetAtivo === "ano_anterior" ? "is-active" : ""}`}
                onClick={() => aplicarPreset("ano_anterior")}
              >
                Ano {anoNum - 1}
              </button>
              <button
                type="button"
                class={`date-preset-chip ${presetAtivo === "tudo" ? "is-active" : ""}`}
                onClick={() => aplicarPreset("tudo")}
              >
                Todo o Período
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ================= ABA 1: VISÃO GERAL EXECUTIVA ================= */}
      {abaAtiva === "visao" && (
        <div class="grid grid--dash">
          <div class="stack">
            <section class="hero" aria-label="Saldo em conta">
              <div class="hero__label">Saldo em Conta Operacional</div>
              <div class="hero__value num">{money(saldoRealExec)}</div>
              <div class="hero__row num">
                <div><span>Projetado </span>{money(saldoProjExec)}</div>
                <div><span>Desvio </span><b>{signed(desvioExec)}</b></div>
                {resList.length > 0 && (
                  <>
                    <div>
                      <span>Reservas </span>
                      <a href="#/reservas" style="color:inherit;text-decoration:underline;">
                        {money(totalReservasRealExec)}
                      </a>
                    </div>
                    <div>
                      <span>Patrimônio Total </span>
                      <b>{money(patrimonioConsolidadoExec)}</b>
                    </div>
                  </>
                )}
                <div><span>Banca Inicial </span>{money(ano.bancaInicial)}</div>
              </div>
            </section>

            <div class="grid grid--stats">
              {NATUREZAS.map((k) => {
                const meta = NATURE_META[k];
                const projVal = rAnoAtual.projetado[k].slice(0, idx + 1).reduce((a, b) => a + b, 0);
                const realVal = rAnoAtual.real[k].slice(0, idx + 1).reduce((a, b) => a + b, 0);
                const pct = projVal ? Math.round((realVal / projVal) * 100) : 0;
                return (
                  <div key={k} class="stat">
                    <div class="stat__label"><i class="dot" style={`background:var(--${meta.tone})`} />{meta.label}</div>
                    <div class="stat__value num">{moneyCompact(realVal)}</div>
                    <div class="stat__sub num">de {moneyCompact(projVal)} · {pct}%</div>
                    <div class="progress" style="margin-top:8px">
                      <i style={`width:${Math.min(100, pct)}%;background:var(--${meta.tone})`} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Gráfico de 12 Meses */}
            <section class="card">
              <div class="card__head">
                <h2 class="card__title">Resultado Mensal (Projetado × Real)</h2>
                <div class="legend">
                  <span><i class="dot" style="background:color-mix(in srgb, var(--primary) 30%, transparent)" />Projetado</span>
                  <span><i class="dot" style="background:var(--primary)" />Real</span>
                </div>
              </div>
              <div class="bars" role="img" aria-label="Resultado projetado versus real por mês">
                {MONTHS.map((m, i) => (
                  <div key={m} class={`bars__col ${i === mesRef ? "is-current" : ""}`} title={`${m}: proj. ${money(rAnoAtual.resultadoProj[i])} · real ${money(rAnoAtual.resultadoReal[i])}`}>
                    <div class="bars__pair">
                      <div class="bars__bar bars__bar--proj" style={`height:${(Math.abs(rAnoAtual.resultadoProj[i]) / maxExec) * 100}%;animation-delay:${i * 30}ms`} />
                      <div
                        class={`bars__bar ${i <= mesRef ? "bars__bar--real" : "bars__bar--future"} ${rAnoAtual.resultadoReal[i] < 0 ? "is-neg" : ""}`}
                        style={`height:${(Math.abs(rAnoAtual.resultadoReal[i]) / maxExec) * 100}%;animation-delay:${i * 30 + 80}ms`}
                      />
                    </div>
                    <span class="bars__label">{m[0]}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Controle de Teto Orçamentário */}
            <section class="card">
              <div class="card__head">
                <div>
                  <h2 class="card__title" style="display:flex;align-items:center;gap:8px;">
                    <Icon name="wallet" /> Controle de Teto Orçamentário
                  </h2>
                  <span class="muted" style="font-size:var(--fs-xs);">
                    Categorias de despesa em {MESES_LONGOS[idx]} de {ano.ano}
                  </span>
                </div>
                {estouradas.length > 0 ? (
                  <span class="badge badge--out">
                    <Icon name="alertTriangle" style="width:12px;height:12px;" /> {estouradas.length} estourada{estouradas.length > 1 ? "s" : ""}
                  </span>
                ) : alertas.length > 0 ? (
                  <span class="badge badge--warn">
                    <Icon name="alertTriangle" style="width:12px;height:12px;" /> {alertas.length} em alerta
                  </span>
                ) : controleTeto.length > 0 ? (
                  <span class="badge badge--in">
                    <Icon name="check" style="width:12px;height:12px;" /> No teto
                  </span>
                ) : null}
              </div>

              {estouradas.length > 0 && (
                <div class="alert alert--danger" style="margin-bottom:var(--sp-3);padding:10px 14px;border-radius:var(--r-md);">
                  <div class="alert__icon">
                    <Icon name="alertTriangle" />
                  </div>
                  <div class="alert__body">
                    <div class="alert__title">Atenção ao teto orçamentário!</div>
                    <div style="font-size:var(--fs-xs);">
                      {estouradas.length === 1
                        ? `A categoria "${estouradas[0].cat.nome}" ultrapassou o teto projetado em +${money(estouradas[0].excesso)}.`
                        : `${estouradas.length} categorias ultrapassaram o teto projetado para este mês.`}
                    </div>
                  </div>
                </div>
              )}

              {controleTeto.length === 0 ? (
                <p class="muted" style="font-size:var(--fs-xs);padding:var(--sp-2) 0;">
                  Nenhuma despesa ou projeção registrada para {MESES_LONGOS[idx]}.
                </p>
              ) : (
                <div style="display:flex;flex-direction:column;gap:14px;">
                  {controleTeto.map((item) => {
                    const barColor =
                      item.status === "estourado"
                        ? "var(--out)"
                        : item.status === "alerta"
                        ? "var(--warn)"
                        : item.status === "sem_teto"
                        ? "var(--warn)"
                        : "var(--in)";
                    return (
                      <div key={item.cat.id} style="display:flex;flex-direction:column;gap:5px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;font-size:var(--fs-xs);gap:8px;flex-wrap:wrap;">
                          <span style="font-weight:600;display:flex;align-items:center;gap:6px;">
                            <i class="dot" style={`background:${barColor}`} />
                            {item.cat.nome}
                          </span>
                          <div style="display:flex;align-items:center;gap:8px;">
                            <span class="num" style="color:var(--text);">
                              <b>{money(item.real)}</b>{" "}
                              <span class="muted" style="font-weight:normal;">/ {money(item.proj)}</span>
                            </span>
                            <span class="badge" style={`font-size:0.65rem;background:${item.status === "estourado" ? "var(--out-soft)" : "var(--surface-soft)"};color:${barColor};`}>
                              {item.status === "sem_teto" ? "Sem teto" : `${item.pct}%`}
                            </span>
                          </div>
                        </div>
                        <div class="progress" style="height:6px;">
                          <i style={`width:${Math.min(100, item.pct)}%;background:${barColor};`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Lado Direito: Atalhos Rápidos e Transações Recentes */}
          <div class="stack">
            <section class="card">
              <div class="card__head">
                <h2 class="card__title">Atalhos Operacionais</h2>
              </div>
              <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
                <a href="#/realizacoes/novo" class="btn btn--primary btn--sm" style="justify-content:center;">
                  <Icon name="plus" /> Nova Realização
                </a>
                <button type="button" class="btn btn--secondary btn--sm" onClick={() => setAbaAtiva("bancos")} style="justify-content:center;">
                  <Icon name="bank" /> Ver Bancos
                </button>
                <button type="button" class="btn btn--secondary btn--sm" onClick={() => setAbaAtiva("dre")} style="justify-content:center;">
                  <Icon name="fileText" /> Demonstrativo DRE
                </button>
                <a href="#/projecoes" class="btn btn--secondary btn--sm" style="justify-content:center;">
                  <Icon name="grid" /> Projeções 12M
                </a>
              </div>
            </section>

            <section class="card">
              <div class="card__head">
                <h2 class="card__title">Últimos Lançamentos</h2>
                <a href="#/realizacoes" class="btn btn--ghost btn--sm">Ver todos</a>
              </div>
              {recentes.length === 0 ? (
                <p class="muted" style="font-size:var(--fs-xs);">Nenhum lançamento registrado neste ano.</p>
              ) : (
                <div class="list">
                  {recentes.map((l) => {
                    const c = contaNome.get(l.contaId);
                    const meta = c ? NATURE_META[c.natureza] : NATURE_META.saida;
                    return (
                      <div key={l.id} class="list__item">
                        <div class={`list__icon bg-${meta.tone}`}>
                          <Icon name={meta.icon} />
                        </div>
                        <div class="list__body">
                          <div class="list__title">{l.descricao || c?.nome || "Lançamento"}</div>
                          <div class="list__sub">{formatarDataBR(l.data)} · {c?.nome}</div>
                        </div>
                        <div class={`list__val num tone-${meta.tone}`}>
                          {l.valor ? money(l.valor) : "R$ 0,00"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ================= ABA 2: POSIÇÃO DOS BANCOS ================= */}
      {abaAtiva === "bancos" && (
        <div class="stack" style="gap:var(--sp-4);">
          {bancoList.length === 0 ? (
            <section class="card empty">
              <Icon name="bank" />
              <h2>Nenhuma conta bancária cadastrada</h2>
              <p>Adicione contas bancárias em Ajustes para acompanhar saldos e conciliação.</p>
              <a href="#/ajustes" class="btn btn--primary" style="margin-top:12px;">Cadastrar Conta Bancária</a>
            </section>
          ) : (
            <section class="card card--table">
              <div class="card__head" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                <div>
                  <h2 class="card__title" style="display:flex;align-items:center;gap:8px;">
                    <Icon name="bank" /> Saldos e Posição Bancária
                  </h2>
                  <span class="muted" style="font-size:var(--fs-xs);">
                    Posição acumulada até {formatarDataBR(dataFim)}
                  </span>
                </div>

                <div style="display:flex;gap:6px;">
                  <button
                    type="button"
                    class={`btn btn--xs ${filtroTipoBanco === "todos" ? "btn--primary" : "btn--subtle"}`}
                    onClick={() => setFiltroTipoBanco("todos")}
                  >
                    Todas ({bancoList.length})
                  </button>
                  <button
                    type="button"
                    class={`btn btn--xs ${filtroTipoBanco === "corrente" ? "btn--primary" : "btn--subtle"}`}
                    onClick={() => setFiltroTipoBanco("corrente")}
                  >
                    Corrente
                  </button>
                  <button
                    type="button"
                    class={`btn btn--xs ${filtroTipoBanco === "investimento" ? "btn--primary" : "btn--subtle"}`}
                    onClick={() => setFiltroTipoBanco("investimento")}
                  >
                    Investimento
                  </button>
                  <button
                    type="button"
                    class={`btn btn--xs ${filtroTipoBanco === "poupanca" ? "btn--primary" : "btn--subtle"}`}
                    onClick={() => setFiltroTipoBanco("poupanca")}
                  >
                    Poupança
                  </button>
                </div>
              </div>

              {/* Cards de Resumo dos Bancos */}
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--sp-3);padding:var(--sp-2) 0;">
                <div class="stat" style="background:var(--surface-solid);">
                  <div class="stat__label">Saldo Inicial Total</div>
                  <div class="stat__value num">{money(posicaoBancosAteFim.totalSaldoInicial)}</div>
                </div>
                <div class="stat" style="background:var(--surface-solid);">
                  <div class="stat__label" style="color:var(--in);">(+) Entradas no Período</div>
                  <div class="stat__value num tone-in">{money(posicaoBancosPeriodo.totalEntradas)}</div>
                </div>
                <div class="stat" style="background:var(--surface-solid);">
                  <div class="stat__label" style="color:var(--out);">(−) Saídas no Período</div>
                  <div class="stat__value num tone-out">{money(posicaoBancosPeriodo.totalSaidas)}</div>
                </div>
                <div class="stat" style="background:var(--surface-solid);">
                  <div class="stat__label" style="color:var(--primary);">Saldo Atual Total</div>
                  <div class="stat__value num" style="color:var(--primary);font-weight:800;">{money(posicaoBancosAteFim.totalSaldoAtual)}</div>
                </div>
              </div>

              <div class="table-wrap" style="margin-top:var(--sp-2);">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th style="text-align:left;">Conta Bancária</th>
                      <th>Tipo</th>
                      <th style="text-align:right;">Saldo Inicial</th>
                      <th style="text-align:right;">Entradas (+)</th>
                      <th style="text-align:right;">Saídas (−)</th>
                      <th style="text-align:right;">Saldo Atual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bancoList
                      .filter((b) => filtroTipoBanco === "todos" || (b.tipo || "corrente") === filtroTipoBanco)
                      .map((b) => {
                        const bAteFim = posicaoBancosAteFim.bancos.find((x) => x.banco.id === b.id);
                        const bPeriodo = posicaoBancosPeriodo.bancos.find((x) => x.banco.id === b.id);
                        const saldoAtual = bAteFim ? bAteFim.saldoAtual : (b.saldoInicialCentavos || 0);
                        const entradas = bPeriodo ? bPeriodo.totalEntradas : 0;
                        const saidas = bPeriodo ? bPeriodo.totalSaidas : 0;
                        return (
                          <tr key={b.id}>
                            <td style="font-weight:600;">{b.nome}</td>
                            <td>
                              <span class="badge" style="font-size:0.68rem;text-transform:capitalize;">
                                {b.tipo || "corrente"}
                              </span>
                            </td>
                            <td class="num muted" style="text-align:right;">{money(b.saldoInicialCentavos || 0)}</td>
                            <td class="num tone-in" style="text-align:right;font-weight:600;">{money(entradas)}</td>
                            <td class="num tone-out" style="text-align:right;font-weight:600;">{money(saidas)}</td>
                            <td class={`num ${saldoAtual >= 0 ? "tone-in" : "tone-out"}`} style="text-align:right;font-weight:800;">
                              {money(saldoAtual)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colspan={2} style="font-weight:700;">Total Geral</td>
                      <td class="num muted" style="text-align:right;">{money(posicaoBancosAteFim.totalSaldoInicial)}</td>
                      <td class="num tone-in" style="text-align:right;font-weight:700;">{money(posicaoBancosPeriodo.totalEntradas)}</td>
                      <td class="num tone-out" style="text-align:right;font-weight:700;">{money(posicaoBancosPeriodo.totalSaidas)}</td>
                      <td class="num tone-in" style="text-align:right;font-weight:800;font-size:var(--fs-md);">{money(posicaoBancosAteFim.totalSaldoAtual)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ================= ABA 3: DEMONSTRATIVO & DRE ================= */}
      {abaAtiva === "dre" && (
        <div class="stack" style="gap:var(--sp-4);">
          <div class="grid grid--2">
            <section class="card">
              <div class="card__head">
                <h2 class="card__title" style="color:var(--in);">Entradas (Receitas + Aportes)</h2>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--sp-2) 0;">
                <div>
                  <div class="muted" style="font-size:var(--fs-xs);">Projetado</div>
                  <div class="num" style="font-weight:700;font-size:var(--fs-md);">{money(totEntradasProj)}</div>
                </div>
                <div>
                  <div class="muted" style="font-size:var(--fs-xs);">Realizado</div>
                  <div class="num tone-in" style="font-weight:800;font-size:var(--fs-lg);">{money(totEntradasReal)}</div>
                </div>
                <div>
                  <div class="muted" style="font-size:var(--fs-xs);">Diferença</div>
                  <div class="num" style="font-weight:700;">{signed(totEntradasReal - totEntradasProj)}</div>
                </div>
              </div>
            </section>

            <section class="card">
              <div class="card__head">
                <h2 class="card__title" style="color:var(--out);">Saídas (Despesas + Saídas Livres)</h2>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--sp-2) 0;">
                <div>
                  <div class="muted" style="font-size:var(--fs-xs);">Projetado</div>
                  <div class="num" style="font-weight:700;font-size:var(--fs-md);">{money(totSaidasProj)}</div>
                </div>
                <div>
                  <div class="muted" style="font-size:var(--fs-xs);">Realizado</div>
                  <div class="num tone-out" style="font-weight:800;font-size:var(--fs-lg);">{money(totSaidasReal)}</div>
                </div>
                <div>
                  <div class="muted" style="font-size:var(--fs-xs);">Diferença</div>
                  <div class="num" style="font-weight:700;">{signed(totSaidasReal - totSaidasProj)}</div>
                </div>
              </div>
            </section>
          </div>

          <section class="card card--table">
            <div class="card__head">
              <h2 class="card__title">Demonstrativo por Conta ({linhasDRE.length} contas movimentadas)</h2>
              <span class="muted" style="font-size:var(--fs-xs);">{labelPeriodoExibicao}</span>
            </div>

            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="text-align:left;">Conta</th>
                    <th style="text-align:left;">Categoria</th>
                    <th style="text-align:left;">Natureza</th>
                    <th style="text-align:right;">Projetado</th>
                    <th style="text-align:right;">Realizado</th>
                    <th style="text-align:right;">Diferença</th>
                    <th style="text-align:center;">Execução</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasDRE.map((l) => (
                    <tr key={l.conta.id}>
                      <td style="font-weight:600;">{l.conta.nome}</td>
                      <td class="muted">{l.categoriaNome}</td>
                      <td>
                        <span class={`badge badge--${NATURE_META[l.conta.natureza].tone}`} style="font-size:0.68rem;">
                          {NATURE_META[l.conta.natureza].label}
                        </span>
                      </td>
                      <td class="num muted" style="text-align:right;">{money(l.proj)}</td>
                      <td class="num" style="text-align:right;font-weight:700;">{money(l.real)}</td>
                      <td class={`num ${l.diff >= 0 ? "tone-in" : "tone-out"}`} style="text-align:right;">{signed(l.diff)}</td>
                      <td style="text-align:center;">
                        <span class="badge" style="font-size:0.68rem;">{l.pct.toFixed(1)}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan={3} style="font-weight:700;">Resultado Líquido do Período</td>
                    <td class="num muted" style="text-align:right;">{money(resultadoLiqProj)}</td>
                    <td class={`num ${resultadoLiqReal >= 0 ? "tone-in" : "tone-out"}`} style="text-align:right;font-weight:800;font-size:var(--fs-md);">
                      {money(resultadoLiqReal)}
                    </td>
                    <td class="num" style="text-align:right;font-weight:700;">{signed(resultadoLiqReal - resultadoLiqProj)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ================= ABA 4: FLUXO DE CAIXA ================= */}
      {abaAtiva === "fluxo" && (
        <div class="stack" style="gap:var(--sp-4);">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--sp-3);">
            <div class="stat" style="background:var(--surface-solid);">
              <div class="stat__label">Saldo Inicial do Período</div>
              <div class="stat__value num">{money(saldoInicialPeriodo)}</div>
            </div>
            <div class="stat" style="background:var(--surface-solid);">
              <div class="stat__label" style="color:var(--in);">(+) Total de Entradas</div>
              <div class="stat__value num tone-in">{money(totEntradasReal)}</div>
            </div>
            <div class="stat" style="background:var(--surface-solid);">
              <div class="stat__label" style="color:var(--out);">(−) Total de Saídas</div>
              <div class="stat__value num tone-out">{money(totSaidasReal)}</div>
            </div>
            <div class="stat" style="background:var(--surface-solid);">
              <div class="stat__label" style="color:var(--primary);">Saldo Final Acumulado</div>
              <div class="stat__value num" style="color:var(--primary);font-weight:800;">{money(saldoFinalPeriodoReal)}</div>
            </div>
          </div>

          <section class="card card--table">
            <div class="card__head">
              <h2 class="card__title">Fluxo Diário de Entradas e Saídas</h2>
              <span class="muted" style="font-size:var(--fs-xs);">{fluxoDiario.length} dias com movimentação</span>
            </div>

            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="text-align:left;">Data</th>
                    <th style="text-align:right;">Entradas (+)</th>
                    <th style="text-align:right;">Saídas (−)</th>
                    <th style="text-align:right;">Resultado do Dia</th>
                    <th style="text-align:right;">Saldo Corrente</th>
                    <th style="text-align:center;">Lançamentos</th>
                  </tr>
                </thead>
                <tbody>
                  {fluxoDiario.map((f) => (
                    <tr key={f.data}>
                      <td style="font-weight:600;">{formatarDataBR(f.data)}</td>
                      <td class="num tone-in" style="text-align:right;font-weight:600;">{money(f.entradas)}</td>
                      <td class="num tone-out" style="text-align:right;font-weight:600;">{money(f.saidas)}</td>
                      <td class={`num ${f.resultado >= 0 ? "tone-in" : "tone-out"}`} style="text-align:right;font-weight:700;">
                        {signed(f.resultado)}
                      </td>
                      <td class="num" style="text-align:right;font-weight:800;color:var(--text);">
                        {money(f.saldoAcumulado)}
                      </td>
                      <td style="text-align:center;">
                        <span class="badge" style="font-size:0.68rem;">{f.lancamentos.length} ops</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ================= ABA 5: RAZÃO CONTÁBIL ANALÍTICO ================= */}
      {abaAtiva === "razao" && (
        <section class="card card--table">
          <div class="card__head" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <h2 class="card__title">Livro Razão Analítico ({lsNoPeriodo.length} lançamentos)</h2>
              <span class="muted" style="font-size:var(--fs-xs);">Extrato completo de lançamentos e conciliação</span>
            </div>

            <input
              type="text"
              class="input input--sm"
              placeholder="Buscar por descrição..."
              value={buscaRazao}
              onInput={(e) => setBuscaRazao((e.currentTarget as HTMLInputElement).value)}
              style="max-width:240px;"
            />
          </div>

          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="text-align:left;">Data</th>
                  <th style="text-align:left;">Descrição</th>
                  <th style="text-align:left;">Conta</th>
                  <th style="text-align:left;">Categoria</th>
                  <th style="text-align:left;">Banco</th>
                  <th style="text-align:right;">Valor</th>
                </tr>
              </thead>
              <tbody>
                {lsNoPeriodo
                  .filter((l) => {
                    if (!buscaRazao) return true;
                    return (l.descricao || "").toLowerCase().includes(buscaRazao.toLowerCase());
                  })
                  .sort((a, b) => b.data.localeCompare(a.data))
                  .map((l) => {
                    const c = contaMap.get(l.contaId);
                    const bNome = l.bancoId ? bancoMap.get(l.bancoId) : null;
                    const meta = c ? NATURE_META[c.natureza] : NATURE_META.saida;
                    return (
                      <tr key={l.id}>
                        <td style="font-weight:600;">{formatarDataBR(l.data)}</td>
                        <td>{l.descricao || c?.nome || "Lançamento"}</td>
                        <td class="muted">{c?.nome}</td>
                        <td class="muted">{c ? (catMap.get(c.categoriaId) || "Geral") : "Geral"}</td>
                        <td>{bNome ? <span class="badge" style="font-size:0.68rem;">{bNome}</span> : "-"}</td>
                        <td class={`num tone-${meta.tone}`} style="text-align:right;font-weight:700;">
                          {money(l.valor)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

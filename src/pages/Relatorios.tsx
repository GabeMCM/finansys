import { useEffect, useState } from "preact/hooks";
import { Icon } from "../components/Icon.tsx";
import { calcularPosicaoBancos } from "../data/calc.ts";
import { db } from "../data/db.ts";
import { anos, categorias, contas, contasBancarias, empresas, reservas } from "../data/repo.ts";
import { type Ano, type Conta, type ContaBancaria, SINAL, type TipoContaBancaria } from "../data/types.ts";
import { cloudUser } from "../data/cloudSync.ts";
import { useLive } from "../data/useLive.ts";
import { labelCpfCnpj, money, signed } from "../lib/format.ts";
import { NATURE_META } from "../lib/natureza.ts";
import { anoAtivo, empresaAtiva } from "../state.ts";

function formatarDataBR(isoDate: string): string {
  if (!isoDate) return "";
  const [yyyy, mm, dd] = isoDate.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

export function Relatorios() {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  // Data atual
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const anoHoje = hoje.getFullYear();

  // Estado do filtro com intervalo livre de datas: por padrão do início do ano até o dia atual
  const [dataInicio, setDataInicio] = useState<string>(`${anoNum}-01-01`);
  const [dataFim, setDataFim] = useState<string>(() => {
    if (anoNum === anoHoje) return hojeStr;
    if (anoNum < anoHoje) return `${anoNum}-12-31`;
    return `${anoNum}-01-01`;
  });
  const [presetAtivo, setPresetAtivo] = useState<string>(() => {
    return anoNum === anoHoje ? "ano_ate_hoje" : "ano";
  });
  const [filtroTipoBanco, setFiltroTipoBanco] = useState<"todos" | TipoContaBancaria>("todos");
  const [agruparPorTipo, setAgruparPorTipo] = useState<boolean>(true);
  const [incluirRazaoAnalitico, setIncluirRazaoAnalitico] = useState<boolean>(true);

  // Sincroniza as datas quando o ano ativo mudar
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

  const dados = useLive(async () => {
    if (!empId) return null;
    const [emp, todosAnos] = await Promise.all([
      empresas.get(empId),
      anos.byEmpresa(empId),
    ]);
    if (!emp || todosAnos.length === 0) return null;

    const anoIds = todosAnos.map((a) => a.id);
    const [cs, cats, ps, ls, resList, movList, bancoList] = await Promise.all([
      contas.byEmpresa(empId),
      categorias.byEmpresa(empId),
      db.projecoes.where("anoId").anyOf(anoIds).filter((p) => !p.deletedAt).toArray(),
      db.lancamentos.where("anoId").anyOf(anoIds).filter((l) => !l.deletedAt).toArray(),
      reservas.byEmpresa(empId),
      db.reservaMovimentos.where("empresaId").equals(empId).filter((m) => !m.deletedAt).toArray(),
      contasBancarias.byEmpresa(empId),
    ]);

    return { emp, todosAnos, cs, cats, ps, ls, resList, movList, bancoList };
  }, [empId], null);

  if (!empId) {
    return (
      <section class="card empty">
        <Icon name="building" />
        <h2>Selecione uma empresa</h2>
        <p>Acesse os Ajustes para selecionar ou cadastrar uma empresa.</p>
      </section>
    );
  }

  if (!dados) {
    return (
      <section class="card empty">
        <Icon name="calendar" />
        <h2>Nenhum ano configurado</h2>
        <p>Cadastre um ano fiscal em Ajustes para visualizar os relatórios.</p>
      </section>
    );
  }

  const { emp, todosAnos, cs, cats, ps, ls, resList, movList, bancoList } = dados;
  const anoIdParaAnoNum = new Map<string, number>(todosAnos.map((a) => [a.id, a.ano]));
  const catMap = new Map<string, string>(cats.map((c) => [c.id, c.nome]));
  const contaMap = new Map<string, Conta>(cs.map((c) => [c.id, c]));

  // Normalização do intervalo selecionado
  const dInicio = dataInicio || "1900-01-01";
  const dFim = dataFim || "2099-12-31";
  const mesInicioStr = dInicio.slice(0, 7); // "YYYY-MM"
  const mesFimStr = dFim.slice(0, 7);       // "YYYY-MM"

  // 1. Filtra lançamentos dentro do período de datas
  const lsNoPeriodo = ls.filter((l) => l.data >= dInicio && l.data <= dFim);

  // 2. Filtra projeções dentro dos meses abrangidos pelo período
  const psNoPeriodo = ps.filter((p) => {
    const anoNumP = anoIdParaAnoNum.get(p.anoId);
    if (!anoNumP) return false;
    const mesFormatado = `${anoNumP}-${String(p.mes + 1).padStart(2, "0")}`;
    return mesFormatado >= mesInicioStr && mesFormatado <= mesFimStr;
  });

  // 3. Monta as linhas do relatório por conta
  const linhasTabela = cs
    .map((c) => {
      const realCentavos = lsNoPeriodo
        .filter((l) => l.contaId === c.id)
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

  // 4. Totais de Entradas e Saídas do Período
  let totEntradasProj = 0;
  let totEntradasReal = 0;
  let totSaidasProj = 0;
  let totSaidasReal = 0;

  for (const l of linhasTabela) {
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

  // 5. Saldo e Conciliação do Período
  const anoInicioNum = parseInt(dInicio.split("-")[0], 10);
  const anoObj = todosAnos.find((a) => a.ano === anoInicioNum) || todosAnos[0];
  const bancaInicialAno = anoObj ? anoObj.bancaInicial : 0;

  // Lançamentos anteriores dentro do mesmo ano inicial para conciliar banca inicial
  const lsAnteriores = ls.filter(
    (l) => l.data < dInicio && (anoIdParaAnoNum.get(l.anoId) ?? 0) === anoInicioNum,
  );
  let saldoAnteriorAcumulado = 0;
  for (const l of lsAnteriores) {
    const c = contaMap.get(l.contaId);
    if (c) {
      saldoAnteriorAcumulado += SINAL[c.natureza] * l.valor;
    }
  }

  const saldoInicialPeriodo = bancaInicialAno + saldoAnteriorAcumulado;
  const saldoFinalReal = saldoInicialPeriodo + resultadoLiqReal;
  const saldoFinalProj = saldoInicialPeriodo + resultadoLiqProj;
  const desvioSaldoFinal = saldoFinalReal - saldoFinalProj;

  // 6. Investimentos e Reservas Patrimoniais no Período
  const movsPeriodoRes = movList.filter((m) => m.data >= dInicio && m.data <= dFim);
  const totAportesResReal = movsPeriodoRes.filter((m) => m.tipo === "aporte").reduce((s, m) => s + m.valor, 0);
  const totResgatesResReal = movsPeriodoRes.filter((m) => m.tipo === "resgate").reduce((s, m) => s + m.valor, 0);
  const totRendimentosResReal = movsPeriodoRes.filter((m) => m.tipo === "rendimento").reduce((s, m) => s + m.valor, 0);

  let totalReservasAteFim = 0;
  for (const r of resList) {
    const inicial = r.saldoInicialCentavos || 0;
    const movsAteFim = movList.filter((m) => m.reservaId === r.id && m.data <= dFim);
    let saldo = inicial;
    for (const m of movsAteFim) {
      if (m.tipo === "aporte" || m.tipo === "rendimento") saldo += m.valor;
      else if (m.tipo === "resgate") saldo -= m.valor;
    }
    totalReservasAteFim += saldo;
  }
  const patrimonioConsolidadoReal = saldoFinalReal + totalReservasAteFim;

  // 7. Posição e Movimentação das Contas Bancárias
  const lsAteFim = ls.filter((l) => l.data <= dFim);
  const movsAteFim = movList.filter((m) => m.data <= dFim);
  const posicaoBancosAteFim = calcularPosicaoBancos(bancoList, lsAteFim, cs, movsAteFim);
  const posicaoBancosPeriodo = calcularPosicaoBancos(bancoList, lsNoPeriodo, cs, movsPeriodoRes);

  // Presets rápidos de intervalo
  const aplicarPreset = (tipo: string) => {
    setPresetAtivo(tipo);
    const hoje = new Date();

    if (tipo === "ano_ate_hoje") {
      setDataInicio(`${anoNum}-01-01`);
      if (anoNum === anoHoje) {
        setDataFim(hojeStr);
      } else {
        setDataFim(`${anoNum}-12-31`);
      }
    } else if (tipo === "mes_atual") {
      const y = hoje.getFullYear();
      const m = hoje.getMonth() + 1;
      const ultimoDia = new Date(y, m, 0).getDate();
      setDataInicio(`${y}-${String(m).padStart(2, "0")}-01`);
      setDataFim(`${y}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`);
    } else if (tipo === "mes_anterior") {
      const ref = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
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
    } else if (tipo === "ultimos_12_meses") {
      const yFim = hoje.getFullYear();
      const mFim = hoje.getMonth() + 1;
      const diaFim = hoje.getDate();
      const refInicio = new Date(yFim - 1, mFim - 1, diaFim);
      setDataInicio(refInicio.toISOString().split("T")[0]);
      setDataFim(hoje.toISOString().split("T")[0]);
    } else if (tipo === "tudo") {
      const minAno = Math.min(...todosAnos.map((a) => a.ano));
      const maxAno = Math.max(...todosAnos.map((a) => a.ano));
      setDataInicio(`${minAno}-01-01`);
      setDataFim(`${maxAno}-12-31`);
    }
  };

  const labelPeriodoExibicao = `${formatarDataBR(dataInicio)} até ${formatarDataBR(dataFim)}`;

  // Exportar para CSV
  const exportarCSV = () => {
    const separador = ";";
    let csv = `\uFEFF`; // BOM UTF-8 para Excel
    csv += `Finansys - Relatório Financeiro: ${emp.nome}\n`;
    csv += `Período: ${labelPeriodoExibicao}\n\n`;
    csv += `Conta;Categoria;Natureza;Projetado (R$);Real (R$);Diferenca (R$);Execucao (%)\n`;

    for (const l of linhasTabela) {
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

    csv += `\nRESUMO GERAL\n`;
    csv += `Saldo Inicial no Período;;;${(saldoInicialPeriodo / 100).toFixed(2).replace(".", ",")}\n`;
    csv += `Total Entradas;;;${(totEntradasProj / 100).toFixed(2).replace(".", ",")};${(totEntradasReal / 100).toFixed(2).replace(".", ",")}\n`;
    csv += `Total Saídas;;;${(totSaidasProj / 100).toFixed(2).replace(".", ",")};${(totSaidasReal / 100).toFixed(2).replace(".", ",")}\n`;
    csv += `Resultado Líquido;;;${(resultadoLiqProj / 100).toFixed(2).replace(".", ",")};${(resultadoLiqReal / 100).toFixed(2).replace(".", ",")}\n`;
    csv += `Saldo Final em Conta;;;${(saldoFinalProj / 100).toFixed(2).replace(".", ",")};${(saldoFinalReal / 100).toFixed(2).replace(".", ",")}\n`;
    if (resList.length > 0) {
      csv += `Alocado em Investimentos & Reservas;;;;${(totalReservasAteFim / 100).toFixed(2).replace(".", ",")}\n`;
      csv += `Patrimônio Líquido Consolidado;;;;${(patrimonioConsolidadoReal / 100).toFixed(2).replace(".", ",")}\n`;
    }

    if (bancoList.length > 0) {
      csv += `\nPOSIÇÃO DAS CONTAS BANCÁRIAS\n`;
      csv += `Conta Bancária;Saldo Inicial (R$);Entradas (+) (R$);Saídas (−) (R$);Saldo Atual (R$)\n`;
      for (const b of bancoList) {
        const bAteFim = posicaoBancosAteFim.bancos.find((x) => x.banco.id === b.id);
        const bPeriodo = posicaoBancosPeriodo.bancos.find((x) => x.banco.id === b.id);
        const saldoAtual = bAteFim ? bAteFim.saldoAtual : (b.saldoInicialCentavos || 0);
        const entradas = bPeriodo ? bPeriodo.totalEntradas : 0;
        const saidas = bPeriodo ? bPeriodo.totalSaidas : 0;
        csv += [
          `"${b.nome}"`,
          ((b.saldoInicialCentavos || 0) / 100).toFixed(2).replace(".", ","),
          (entradas / 100).toFixed(2).replace(".", ","),
          (saidas / 100).toFixed(2).replace(".", ","),
          (saldoAtual / 100).toFixed(2).replace(".", ","),
        ].join(separador) + "\n";
      }
      csv += `Total Consolidado em Bancos;${(posicaoBancosAteFim.totalSaldoInicial / 100).toFixed(2).replace(".", ",")};${(posicaoBancosPeriodo.totalEntradas / 100).toFixed(2).replace(".", ",")};${(posicaoBancosPeriodo.totalSaidas / 100).toFixed(2).replace(".", ",")};${(posicaoBancosAteFim.totalSaldoAtual / 100).toFixed(2).replace(".", ",")}\n`;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${emp.nome.replace(/\s+/g, "_")}-${dataInicio}_ate_${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exportar para JSON
  const exportarJSON = () => {
    const obj = {
      empresa: emp,
      periodo: {
        inicio: dataInicio,
        fim: dataFim,
        descricao: labelPeriodoExibicao,
      },
      saldoInicialPeriodo,
      linhas: linhasTabela.map((l) => ({
        conta: l.conta.nome,
        categoria: l.categoriaNome,
        natureza: l.conta.natureza,
        projetado: l.proj,
        real: l.real,
        diferenca: l.diff,
      })),
      contasBancarias: bancoList.map((b) => {
        const bAteFim = posicaoBancosAteFim.bancos.find((x) => x.banco.id === b.id);
        const bPeriodo = posicaoBancosPeriodo.bancos.find((x) => x.banco.id === b.id);
        return {
          id: b.id,
          nome: b.nome,
          saldoInicial: b.saldoInicialCentavos || 0,
          entradasPeriodo: bPeriodo?.totalEntradas || 0,
          saidasPeriodo: bPeriodo?.totalSaidas || 0,
          saldoAtual: bAteFim?.saldoAtual || (b.saldoInicialCentavos || 0),
        };
      }),
      totais: {
        entradasProj: totEntradasProj,
        entradasReal: totEntradasReal,
        saidasProj: totSaidasProj,
        saidasReal: totSaidasReal,
        saldoFinalProj,
        saldoFinalReal,
        totalSaldoBancos: posicaoBancosAteFim.totalSaldoAtual,
        reservasReal: totalReservasAteFim,
        patrimonioConsolidado: patrimonioConsolidadoReal,
      },
    };
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dados-${emp.nome.replace(/\s+/g, "_")}-${dataInicio}_a_${dataFim}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Imprimir / Salvar como PDF
  const imprimirPDF = () => {
    window.print();
  };

  return (
    <>
      <div class="page-head no-print">
        <div>
          <h1>Visão Geral & Relatório Financeiro</h1>
          <p>Demonstrativo Projetado × Real por período personalizado de {emp.nome}</p>
        </div>

        <div class="relatorios-header-actions" style="display:flex;gap:var(--sp-2);flex-wrap:wrap;align-items:center;">
          <label class="chip" style="cursor:pointer;user-select:none;gap:6px;min-height:36px;" title="Inclui livro-razão analítico de todas as transações para servir como backup completo contra perda de dados">
            <input
              type="checkbox"
              checked={incluirRazaoAnalitico}
              onChange={(e) => setIncluirRazaoAnalitico((e.target as HTMLInputElement).checked)}
              style="cursor:pointer;"
            />
            <span style="font-size:var(--fs-xs);font-weight:600;">Incluir Lançamentos Analíticos (Backup)</span>
          </label>

          <button type="button" class="btn btn--secondary" onClick={exportarCSV} title="Exportar tabela para CSV/Excel">
            <Icon name="download" /> Exportar CSV
          </button>
          <button type="button" class="btn btn--secondary" onClick={exportarJSON} title="Exportar dados brutos em JSON">
            JSON
          </button>
          <button type="button" class="btn btn--primary" onClick={imprimirPDF} title="Gerar relatório impresso / PDF formal seguro">
            <Icon name="download" /> Imprimir / PDF Seguro
          </button>
        </div>
      </div>

      {/* Seletor Moderno de Período com Dois Calendários e Presets Rápidos */}
      <section class="date-filter-card no-print" style="margin-bottom:var(--sp-4);">
        <div class="date-filter-row">
          <div class="date-filter-inputs">
            {/* Calendário Data Inicial */}
            <div class="date-field">
              <label class="date-field__label" for="rel-data-inicio">
                <Icon name="calendar" /> De:
              </label>
              <input
                id="rel-data-inicio"
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

            {/* Calendário Data Final */}
            <div class="date-field">
              <label class="date-field__label" for="rel-data-fim">
                <Icon name="calendar" /> Até:
              </label>
              <input
                id="rel-data-fim"
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

          {/* Presets Rápidos de Seleção */}
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
              class={`date-preset-chip ${presetAtivo === "ultimos_12_meses" ? "is-active" : ""}`}
              onClick={() => aplicarPreset("ultimos_12_meses")}
            >
              Últimos 12 Meses
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

      {/* ================= INFORME FORMAL / CORPO DO RELATÓRIO ================= */}
      <div class="stack" style="gap:var(--sp-4);">
        {/* Cabeçalho do Informe Formal (visível no print e na tela) */}
        <section class="card" style="padding:var(--sp-4);">
          <div class="informe-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
            <div style="display:flex;gap:14px;align-items:center;">
              {emp.logo ? (
                <img src={emp.logo} alt="" style="max-height:56px;max-width:120px;object-fit:contain;border-radius:4px;" />
              ) : (
                <div class="list__icon bg-in" style="width:48px;height:48px;">
                  <Icon name="building" />
                </div>
              )}
              <div>
                <h2 style="font-size:var(--fs-lg);font-weight:800;margin:0;">{emp.nome}</h2>
                <div class="muted" style="font-size:var(--fs-xs);margin-top:2px;">
                  {emp.cnpj ? labelCpfCnpj(emp.cnpj) : ""}
                  {emp.endereco ? ` · ${emp.endereco}` : ""}
                </div>
              </div>
            </div>

            <div style="text-align:right;">
              <div style="font-size:var(--fs-xs);font-weight:700;text-transform:uppercase;color:var(--primary);letter-spacing:0.04em;">
                Informe Financeiro & Backup Auditável
              </div>
              <div style="font-size:var(--fs-sm);font-weight:600;margin-top:2px;">
                Período: {labelPeriodoExibicao}
              </div>
              <div class="muted" style="font-size:0.68rem;margin-top:2px;">
                Emitido em: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR")}
              </div>
              <div class="muted" style="font-size:0.65rem;margin-top:2px;font-family:monospace;">
                Protocolo: BKP-{emp.id.slice(0, 8).toUpperCase()}-{dataFim.replace(/-/g, "")}
              </div>
              <div class="muted" style="font-size:0.65rem;">
                Operador: {cloudUser.value?.nome || cloudUser.value?.email || "Administrador Local"}
              </div>
            </div>
          </div>

          {/* Faixa de Integridade e Detalhes de Auditoria */}
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-top:var(--sp-2); padding:6px 12px; background:var(--surface-sunken); border:1px solid var(--border); border-radius:var(--r-sm); font-size:var(--fs-xs);">
            <div style="display:flex; gap:12px; flex-wrap:wrap; color:var(--text-muted);">
              <span><strong>{lsNoPeriodo.length}</strong> lançamentos auditados</span>
              <span>·</span>
              <span><strong>{cs.length}</strong> contas</span>
              <span>·</span>
              <span><strong>{bancoList.length}</strong> contas bancárias</span>
              <span>·</span>
              <span><strong>{resList.length}</strong> caixinhas patrimoniais</span>
            </div>
            <span class="badge badge--in" style="font-size:0.65rem; font-weight:700;">
              Documento Seguro de Backup Anti-Perda de Dados
            </span>
          </div>

          {/* Quadro de Saldo e Conciliação */}
          <div style="margin-top:var(--sp-3); display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--sp-3);">
            <div class="stat" style="background:var(--surface-solid);display:flex;flex-direction:column;justify-content:space-between;">
              <div>
                <div class="stat__label">Saldo Inicial do Período</div>
                <div class="stat__value num">{money(saldoInicialPeriodo)}</div>
                <div class="stat__sub">Posição em {formatarDataBR(dataInicio)}</div>
              </div>
              <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:var(--fs-xs);color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;">
                <span>Banca inicial do ano:</span>
                <span class="num" style="font-weight:600;color:var(--text);">{money(bancaInicialAno)}</span>
              </div>
            </div>

            <div class="stat" style="background:var(--surface-solid);display:flex;flex-direction:column;justify-content:space-between;">
              <div>
                <div class="stat__label">Saldo Final em Conta (Operacional)</div>
                <div class="stat__value num" style="color:var(--text);font-weight:800;">
                  {money(saldoFinalReal)}
                </div>
                <div class="stat__sub">Posição real acumulada até {formatarDataBR(dataFim)}</div>
              </div>

              <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px;font-size:var(--fs-xs);">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span class="muted">Saldo Final Projetado:</span>
                  <span class="num" style="font-weight:600;color:var(--text);">{money(saldoFinalProj)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">
                  <span class="muted">Diferença em relação à projeção:</span>
                  <span class="num" style="display:inline-flex;align-items:center;gap:6px;">
                    <b class={desvioSaldoFinal >= 0 ? "tone-in" : "tone-out"}>
                      {signed(desvioSaldoFinal)}
                    </b>
                    <span
                      class={`badge badge--${desvioSaldoFinal >= 0 ? "in" : "out"}`}
                      style="font-size:0.68rem;padding:1px 6px;"
                    >
                      {desvioSaldoFinal > 0
                        ? "Saldo acima do projetado"
                        : desvioSaldoFinal < 0
                        ? "Saldo abaixo do projetado"
                        : "Conforme a meta"}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {resList.length > 0 && (
              <div
                class="stat"
                style="background:var(--surface-solid);display:flex;flex-direction:column;justify-content:space-between;border-left:4px solid var(--primary);"
              >
                <div>
                  <div class="stat__label" style="color:var(--primary);font-weight:700;">
                    <Icon name="wallet" /> Patrimônio Líquido Consolidado
                  </div>
                  <div class="stat__value num" style="color:var(--primary);font-weight:800;">
                    {money(patrimonioConsolidadoReal)}
                  </div>
                  <div class="stat__sub">Caixa Operacional + Investimentos & Reservas</div>
                </div>

                <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:4px;font-size:var(--fs-xs);">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span class="muted">Saldo Operacional:</span>
                    <span class="num" style="font-weight:600;">{money(saldoFinalReal)}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span class="muted">Alocado em Reservas:</span>
                    <span class="num" style="font-weight:600;color:var(--in);">{money(totalReservasAteFim)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Bloco de Investimentos & Reservas no Período */}
        {resList.length > 0 && (
          <section class="card">
            <div class="card__head" style="margin-bottom: var(--sp-2);">
              <h2 class="card__title" style="display:flex; align-items:center; gap:8px;">
                <Icon name="wallet" /> Movimentação de Investimentos & Reservas no Período
              </h2>
              <a href="#/investimentos" class="btn btn--ghost no-print" style="font-size:var(--fs-xs);height:32px;">
                Ver Carteira <Icon name="chevron" style="transform:rotate(-90deg);" />
              </a>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--sp-3); padding: var(--sp-2) 0;">
              <div class="stat" style="background:var(--surface-solid);">
                <div class="stat__label" style="color:var(--in);">
                  (+) Aplicado / Guardado
                </div>
                <div class="stat__value num" style="color:var(--in);">
                  {money(totAportesResReal)}
                </div>
                <div class="stat__sub">Recursos alocados nas reservas</div>
              </div>

              <div class="stat" style="background:var(--surface-solid);">
                <div class="stat__label" style="color:var(--aporte);">
                  (−) Resgatado para o Caixa
                </div>
                <div class="stat__value num" style="color:var(--aporte);">
                  {money(totResgatesResReal)}
                </div>
                <div class="stat__sub">Liquidez retornada para a operação</div>
              </div>

              <div class="stat" style="background:var(--surface-solid);">
                <div class="stat__label" style="color:var(--rendimento);">
                  (+) Rendimentos Acumulados
                </div>
                <div class="stat__value num" style="color:var(--rendimento);">
                  {money(totRendimentosResReal)}
                </div>
                <div class="stat__sub">Juros, CDI e dividendos gerados</div>
              </div>

              <div class="stat" style="background:var(--surface-solid);">
                <div class="stat__label" style="color:var(--primary);">
                  Saldo Total em Reservas
                </div>
                <div class="stat__value num" style="color:var(--primary);font-weight:800;">
                  {money(totalReservasAteFim)}
                </div>
                <div class="stat__sub">Posição acumulada em {formatarDataBR(dataFim)}</div>
              </div>
            </div>
          </section>
        )}

        {/* Bloco de Posição das Contas Bancárias */}
        {bancoList.length > 0 && (() => {
          const reservaMap = new Map<string, string>(resList.map((r) => [r.id, r.nome]));

          const tiposContasConfig: { id: TipoContaBancaria; label: string }[] = [
            { id: "corrente", label: "Conta Corrente" },
            { id: "investimento", label: "Investimento" },
            { id: "poupanca", label: "Poupança" },
          ];

          const totalPorTipoConta = (tipo: TipoContaBancaria) =>
            bancoList.filter((b) => (b.tipo || "corrente") === tipo).length;

          const bancosExibicao = bancoList.filter((b) => {
            const tipo = b.tipo || "corrente";
            if (filtroTipoBanco === "todos") return true;
            return tipo === filtroTipoBanco;
          });

          const saldoInicialExibicao = filtroTipoBanco === "todos"
            ? posicaoBancosAteFim.totalSaldoInicial
            : (posicaoBancosAteFim.totaisPorTipo[filtroTipoBanco]?.totalSaldoInicial || 0);

          const entradasExibicao = filtroTipoBanco === "todos"
            ? posicaoBancosPeriodo.totalEntradas
            : (posicaoBancosPeriodo.totaisPorTipo[filtroTipoBanco]?.totalEntradas || 0);

          const saidasExibicao = filtroTipoBanco === "todos"
            ? posicaoBancosPeriodo.totalSaidas
            : (posicaoBancosPeriodo.totaisPorTipo[filtroTipoBanco]?.totalSaidas || 0);

          const saldoAtualExibicao = filtroTipoBanco === "todos"
            ? posicaoBancosAteFim.totalSaldoAtual
            : (posicaoBancosAteFim.totaisPorTipo[filtroTipoBanco]?.totalSaldoAtual || 0);

          const renderLinhaBanco = (b: ContaBancaria) => {
            const bAteFim = posicaoBancosAteFim.bancos.find((x) => x.banco.id === b.id);
            const bPeriodo = posicaoBancosPeriodo.bancos.find((x) => x.banco.id === b.id);
            const saldoAtual = bAteFim ? bAteFim.saldoAtual : (b.saldoInicialCentavos || 0);
            const entradas = bPeriodo ? bPeriodo.totalEntradas : 0;
            const saidas = bPeriodo ? bPeriodo.totalSaidas : 0;
            const qtd = bAteFim?.qtdLancamentos || 0;
            const tipoConta = b.tipo || "corrente";
            const nomeReserva = b.reservaVinculadaId ? reservaMap.get(b.reservaVinculadaId) : null;

            return (
              <tr key={b.id}>
                <td class="col-banco" style="font-weight:600;">
                  <div style="display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;">
                    <div class="list__icon hide-mobile" style="width:24px;height:24px;background:var(--surface-soft);border:1px solid var(--border);border-radius:var(--r-sm);flex-shrink:0;">
                      <Icon name="bank" style="width:12px;height:12px;color:var(--primary);" />
                    </div>
                    <span class="banco-nome" title={b.nome} style="font-weight:600;">{b.nome}</span>
                    <span
                      class="badge"
                      style={tipoConta === "investimento"
                        ? "font-size:0.65rem; background:var(--primary-soft); color:var(--primary); border:1px solid color-mix(in srgb, var(--primary) 30%, transparent);"
                        : tipoConta === "poupanca"
                        ? "font-size:0.65rem; background:var(--in-soft); color:var(--in);"
                        : "font-size:0.65rem; background:var(--surface-soft); color:var(--text-muted); border:1px solid var(--border);"}
                    >
                      {tipoConta === "investimento" ? "Investimento" : tipoConta === "poupanca" ? "Poupança" : "Corrente"}
                    </span>
                    {nomeReserva && (
                      <span
                        class="badge"
                        style="font-size:0.65rem; background:var(--rendimento-soft); color:var(--rendimento); border:1px solid color-mix(in srgb, var(--rendimento) 25%, transparent);"
                        title={`Conta vinculada à caixinha "${nomeReserva}"`}
                      >
                        Caixinha: {nomeReserva}
                      </span>
                    )}
                  </div>
                </td>
                <td class="num muted" style="text-align:right;">
                  {money(b.saldoInicialCentavos || 0)}
                </td>
                <td class="num tone-in" style="text-align:right;font-weight:600;">
                  {money(entradas)}
                </td>
                <td class="num tone-out" style="text-align:right;font-weight:600;">
                  {money(saidas)}
                </td>
                <td class={`num ${saldoAtual >= 0 ? "tone-in" : "tone-out"}`} style="text-align:right;font-weight:800;font-size:var(--fs-sm);">
                  {money(saldoAtual)}
                </td>
                <td style="text-align:center;">
                  <span class="badge badge--neutral" style="font-size:0.7rem;">
                    {qtd} {qtd === 1 ? "mov." : "movs."}
                  </span>
                </td>
              </tr>
            );
          };

          return (
            <section class="card card--table">
              <div class="card__head" style="margin-bottom: var(--sp-2); display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:var(--sp-2);">
                <div>
                  <h2 class="card__title" style="display:flex; align-items:center; gap:8px;">
                    <Icon name="bank" /> Posição das Contas Bancárias
                  </h2>
                  <span class="muted" style="font-size: var(--fs-xs);">
                    {bancosExibicao.length} de {bancoList.length} conta{bancoList.length > 1 ? "s" : ""} · Posição acumulada em {formatarDataBR(dataFim)}
                  </span>
                </div>

                {/* Filtros de Tipo e Toggle de Agrupamento */}
                <div style="display:flex; align-items:center; gap:var(--sp-2); flex-wrap:wrap;">
                  <div class="filter-group" style="display:inline-flex; border:1px solid var(--border); border-radius:var(--r-md); padding:2px; background:var(--surface-sunken);">
                    <button
                      type="button"
                      class={`btn btn--xs ${filtroTipoBanco === "todos" ? "btn--primary" : "btn--subtle"}`}
                      onClick={() => setFiltroTipoBanco("todos")}
                      style="border:none; padding:3px 8px; font-size:var(--fs-xs);"
                    >
                      Todas ({bancoList.length})
                    </button>
                    {tiposContasConfig.map((tc) => {
                      const count = totalPorTipoConta(tc.id);
                      if (count === 0) return null;
                      return (
                        <button
                          key={tc.id}
                          type="button"
                          class={`btn btn--xs ${filtroTipoBanco === tc.id ? "btn--primary" : "btn--subtle"}`}
                          onClick={() => setFiltroTipoBanco(tc.id)}
                          style="border:none; padding:3px 8px; font-size:var(--fs-xs);"
                        >
                          {tc.label} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {filtroTipoBanco === "todos" && (
                    <button
                      type="button"
                      class={`btn btn--xs ${agruparPorTipo ? "btn--secondary" : "btn--subtle"}`}
                      onClick={() => setAgruparPorTipo(!agruparPorTipo)}
                      title="Alternar entre visualização agrupada por tipo ou lista contínua"
                      style="font-size:var(--fs-xs); padding:3px 8px;"
                    >
                      {agruparPorTipo ? "Agrupado por Tipo" : "Lista Contínua"}
                    </button>
                  )}
                </div>
              </div>

              {/* Cards de Métricas do Filtro */}
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--sp-3); padding: var(--sp-2) 0;">
                <div class="stat" style="background:var(--surface-solid);">
                  <div class="stat__label" style="color:var(--text-muted);">
                    Saldo Inicial {filtroTipoBanco !== "todos" ? `(${filtroTipoBanco})` : "Consolidado"}
                  </div>
                  <div class="stat__value num">
                    {money(saldoInicialExibicao)}
                  </div>
                  <div class="stat__sub">Abertura das contas selecionadas</div>
                </div>

                <div class="stat" style="background:var(--surface-solid);">
                  <div class="stat__label" style="color:var(--in);">
                    (+) Entradas no Período
                  </div>
                  <div class="stat__value num tone-in">
                    {money(entradasExibicao)}
                  </div>
                  <div class="stat__sub">Recebimentos e resgates</div>
                </div>

                <div class="stat" style="background:var(--surface-solid);">
                  <div class="stat__label" style="color:var(--out);">
                    (−) Saídas no Período
                  </div>
                  <div class="stat__value num tone-out">
                    {money(saidasExibicao)}
                  </div>
                  <div class="stat__sub">Pagamentos e aportes</div>
                </div>

                <div class="stat" style="background:var(--surface-solid);">
                  <div class="stat__label" style="color:var(--primary);">
                    Saldo Total {filtroTipoBanco !== "todos" ? `(${filtroTipoBanco})` : "Acumulado"}
                  </div>
                  <div class="stat__value num" style="color:var(--primary);font-weight:800;">
                    {money(saldoAtualExibicao)}
                  </div>
                  <div class="stat__sub">Posição em {formatarDataBR(dataFim)}</div>
                </div>
              </div>

              <div class="matriz-scroll-hint only-mobile" style="margin-top:var(--sp-2);">
                <Icon name="arrowLeftRight" style="width:12px;height:12px;" />
                <span>Deslize horizontalmente para ver entradas, saídas e saldos</span>
              </div>

              {/* Detalhamento Individual por Conta Bancária */}
              <div class="table-wrap table-wrap--mobile-bleed" style="margin-top: var(--sp-2);">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th class="col-banco" style="text-align:left;">Conta Bancária / Tipo</th>
                      <th style="text-align:right;">Saldo Inicial</th>
                      <th style="text-align:right;" title="Entradas no período selecionado">Entradas (+)</th>
                      <th style="text-align:right;" title="Saídas no período selecionado">Saídas (−)</th>
                      <th style="text-align:right;" title="Saldo acumulado até o final do período">Saldo Atual</th>
                      <th style="text-align:center;">Movimentações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtroTipoBanco === "todos" && agruparPorTipo ? (
                      tiposContasConfig.map((tc) => {
                        const bancosDoTipo = bancoList.filter((b) => (b.tipo || "corrente") === tc.id);
                        if (bancosDoTipo.length === 0) return null;
                        const subtotalAteFim = posicaoBancosAteFim.totaisPorTipo[tc.id];
                        const subtotalPeriodo = posicaoBancosPeriodo.totaisPorTipo[tc.id];

                        return (
                          <>
                            <tr key={`header-${tc.id}`} style="background:var(--surface-soft);">
                              <td colspan={6} style="padding:6px 12px; font-weight:700; font-size:var(--fs-xs); letter-spacing:0.03em; color:var(--text);">
                                {tc.label.toUpperCase()} ({bancosDoTipo.length})
                              </td>
                            </tr>
                            {bancosDoTipo.map(renderLinhaBanco)}
                            <tr key={`subtotal-${tc.id}`} style="background:var(--surface-sunken); font-size:var(--fs-xs); font-weight:700;">
                              <td style="padding-left:24px; color:var(--text-muted);">
                                Subtotal {tc.label}
                              </td>
                              <td class="num muted" style="text-align:right;">
                                {money(subtotalAteFim?.totalSaldoInicial || 0)}
                              </td>
                              <td class="num tone-in" style="text-align:right;">
                                {money(subtotalPeriodo?.totalEntradas || 0)}
                              </td>
                              <td class="num tone-out" style="text-align:right;">
                                {money(subtotalPeriodo?.totalSaidas || 0)}
                              </td>
                              <td class={`num ${(subtotalAteFim?.totalSaldoAtual || 0) >= 0 ? "tone-in" : "tone-out"}`} style="text-align:right; font-weight:800;">
                                {money(subtotalAteFim?.totalSaldoAtual || 0)}
                              </td>
                              <td></td>
                            </tr>
                          </>
                        );
                      })
                    ) : (
                      bancosExibicao.map(renderLinhaBanco)
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style="font-weight:700;">
                        {filtroTipoBanco === "todos" ? "Total Consolidado de Todas as Contas" : `Total Acumulado (${filtroTipoBanco})`}
                      </td>
                      <td class="num muted" style="text-align:right;">
                        {money(saldoInicialExibicao)}
                      </td>
                      <td class="num tone-in" style="text-align:right;font-weight:700;">
                        {money(entradasExibicao)}
                      </td>
                      <td class="num tone-out" style="text-align:right;font-weight:700;">
                        {money(saidasExibicao)}
                      </td>
                      <td class={`num ${saldoAtualExibicao >= 0 ? "tone-in" : "tone-out"}`} style="text-align:right;font-weight:800;font-size:var(--fs-md);">
                        {money(saldoAtualExibicao)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          );
        })()}

        {/* Resumo de Entradas vs Saídas */}
        <div class="grid grid--2">
          <section class="card">
            <div class="card__head">
              <h2 class="card__title" style="color:var(--in);">Entradas (Receber + Aportes)</h2>
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
              <h2 class="card__title" style="color:var(--out);">Saídas (Pagar + Saídas Livres)</h2>
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

        {/* Demonstrativo Detalhado por Conta */}
        <section class="card card--table">
          <div class="card__head">
            <h2 class="card__title">Demonstrativo por Conta ({linhasTabela.length} itens movimentados)</h2>
          </div>

          <div class="matriz-scroll-hint only-mobile" style="margin-bottom:var(--sp-2);">
            <Icon name="arrowLeftRight" style="width:12px;height:12px;" />
            <span>Deslize horizontalmente para ver categoria, valores e execução</span>
          </div>

          {linhasTabela.length === 0 ? (
            <p class="muted">Nenhuma conta com projeção ou lançamento no período selecionado.</p>
          ) : (
            <div class="table-wrap table-wrap--mobile-bleed">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-conta-dem" style="text-align:left;">Conta</th>
                    <th>Categoria</th>
                    <th>Natureza</th>
                    <th style="text-align:right;">Projetado</th>
                    <th style="text-align:right;">Realizado</th>
                    <th style="text-align:right;" title="Diferença entre o Realizado e o Projetado">Diferença</th>
                    <th style="text-align:right;">Execução</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasTabela.map((l) => {
                    const meta = NATURE_META[l.conta.natureza];
                    const diffSinal = SINAL[l.conta.natureza] * l.diff;
                    return (
                      <tr key={l.conta.id}>
                        <td class="col-conta-dem" style="font-weight:600;">
                          <span class="conta-dem-nome" title={l.conta.nome}>{l.conta.nome}</span>
                        </td>
                        <td class="muted">{l.categoriaNome}</td>
                        <td>
                          <span class={`badge badge--${meta.tone}`}>{meta.label}</span>
                        </td>
                        <td class="num" style="text-align:right;">{money(l.proj)}</td>
                        <td class="num" style="font-weight:700;text-align:right;">{money(l.real)}</td>
                        <td class={`num ${diffSinal >= 0 ? "tone-in" : "tone-out"}`} style="text-align:right;">
                          {signed(l.diff)}
                        </td>
                        <td class="num muted" style="text-align:right;">{l.pct.toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td class="col-conta-dem" colSpan={3}>Resultado Líquido do Período</td>
                    <td class="num">{money(resultadoLiqProj)}</td>
                    <td class="num" style="font-weight:800;color:var(--text);">{money(resultadoLiqReal)}</td>
                    <td class={`num ${resultadoLiqReal - resultadoLiqProj >= 0 ? "tone-in" : "tone-out"}`}>
                      {signed(resultadoLiqReal - resultadoLiqProj)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Seção Razão Analítico de Lançamentos (Backup Seguro Anti-Perda de Dados) */}
          {incluirRazaoAnalitico && lsNoPeriodo.length > 0 && (() => {
            const lsOrdenados = [...lsNoPeriodo].sort((a, b) => b.data.localeCompare(a.data));
            const bancoMap = new Map<string, string>(bancoList.map((b) => [b.id, b.nome]));

            return (
              <div style="margin-top:var(--sp-5);break-inside:avoid;page-break-inside:avoid;">
                <div class="card__head" style="margin-bottom:var(--sp-2);display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <h3 class="card__title" style="display:flex;align-items:center;gap:6px;font-size:var(--fs-md);">
                      <Icon name="list" /> Razão Analítico de Lançamentos ({lsOrdenados.length} lançamentos no período)
                    </h3>
                    <span class="muted" style="font-size:var(--fs-xs);">
                      Trilha detalhada e completa de transações para conferência contábil e documento auditável permanente
                    </span>
                  </div>
                  <span class="badge badge--neutral hide-mobile" style="font-size:0.68rem;">
                    Livro Razão / Extrato Integral
                  </span>
                </div>

                <div class="table-wrap table-wrap--mobile-bleed">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th style="width:90px;text-align:left;">Data</th>
                        <th style="text-align:left;">Conta</th>
                        <th style="text-align:left;">Categoria</th>
                        <th style="text-align:left;">Conta Bancária</th>
                        <th style="text-align:left;">Descrição / Histórico</th>
                        <th style="text-align:right;">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lsOrdenados.map((l) => {
                        const conta = contaMap.get(l.contaId);
                        const sinal = conta ? (SINAL[conta.natureza] || -1) : -1;
                        const nomeBanco = l.bancoId ? bancoMap.get(l.bancoId) || "—" : "—";
                        const categoriaNome = conta ? catMap.get(conta.categoriaId) || "—" : "—";

                        return (
                          <tr key={l.id}>
                            <td class="muted" style="font-size:var(--fs-xs);white-space:nowrap;">
                              {formatarDataBR(l.data)}
                            </td>
                            <td style="font-weight:600;font-size:var(--fs-xs);">
                              {conta?.nome || "Conta Removida"}
                            </td>
                            <td class="muted" style="font-size:var(--fs-xs);">
                              {categoriaNome}
                            </td>
                            <td class="muted" style="font-size:var(--fs-xs);">
                              {nomeBanco}
                            </td>
                            <td class="muted" style="font-size:var(--fs-xs);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                              {l.descricao || "—"}
                            </td>
                            <td class={`num ${sinal === 1 ? "tone-in" : "tone-out"}`} style="text-align:right;font-weight:700;font-size:var(--fs-xs);">
                              {sinal === 1 ? "+" : "−"} {money(l.valor)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5} style="font-weight:700;">
                          Total Movimentado no Período ({lsOrdenados.length} lançamentos)
                        </td>
                        <td class="num" style="text-align:right;font-weight:800;color:var(--text);">
                          {money(lsOrdenados.reduce((s, l) => s + l.valor, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Campo de Assinatura para o PDF / Impressão */}
          <div class="informe-footer print-only" style="margin-top:40px;display:flex;justify-content:space-around;">
            <div class="assinatura-linha" style="text-align:center;border-top:1px solid #333;width:240px;padding-top:6px;font-size:0.75rem;">
              Responsável Financeiro
            </div>
            <div class="assinatura-linha" style="text-align:center;border-top:1px solid #333;width:240px;padding-top:6px;font-size:0.75rem;">
              Diretoria / Administração
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

import { useState } from "preact/hooks";
import { Icon } from "../components/Icon.tsx";
import { ModalReplicacao } from "../components/ModalReplicacao.tsx";
import { db } from "../data/db.ts";
import { anos, categorias, contas, empresas } from "../data/repo.ts";
import { type Ano, type Conta, SINAL } from "../data/types.ts";
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

  // Estado do filtro com intervalo livre de datas
  const [dataInicio, setDataInicio] = useState<string>(`${anoNum}-01-01`);
  const [dataFim, setDataFim] = useState<string>(`${anoNum}-12-31`);
  const [presetAtivo, setPresetAtivo] = useState<string>("ano");
  const [modalRepAberto, setModalRepAberto] = useState<boolean>(false);

  const dados = useLive(async () => {
    if (!empId) return null;
    const [emp, todosAnos] = await Promise.all([
      empresas.get(empId),
      anos.byEmpresa(empId),
    ]);
    if (!emp || todosAnos.length === 0) return null;

    const anoIds = todosAnos.map((a) => a.id);
    const [cs, cats, ps, ls] = await Promise.all([
      contas.byEmpresa(empId),
      categorias.byEmpresa(empId),
      db.projecoes.where("anoId").anyOf(anoIds).filter((p) => !p.deletedAt).toArray(),
      db.lancamentos.where("anoId").anyOf(anoIds).filter((l) => !l.deletedAt).toArray(),
    ]);

    return { emp, todosAnos, cs, cats, ps, ls };
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

  const { emp, todosAnos, cs, cats, ps, ls } = dados;
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

  // Presets rápidos de intervalo
  const aplicarPreset = (tipo: string) => {
    setPresetAtivo(tipo);
    const hoje = new Date();

    if (tipo === "mes_atual") {
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
      totais: {
        entradasProj: totEntradasProj,
        entradasReal: totEntradasReal,
        saidasProj: totSaidasProj,
        saidasReal: totSaidasReal,
        saldoFinalProj,
        saldoFinalReal,
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
          <h1>Relatórios & Exportação</h1>
          <p>Demonstrativo Projetado × Real por período personalizado</p>
        </div>

        <div class="relatorios-header-actions" style="display:flex;gap:var(--sp-2);flex-wrap:wrap;">
          <button type="button" class="btn btn--secondary" onClick={exportarCSV} title="Exportar tabela para CSV/Excel">
            <Icon name="download" /> Exportar CSV
          </button>
          <button type="button" class="btn btn--secondary" onClick={exportarJSON} title="Exportar dados brutos em JSON">
            JSON
          </button>
          <button type="button" class="btn btn--primary" onClick={imprimirPDF} title="Gerar relatório impresso / PDF formal">
            <Icon name="download" /> Imprimir / PDF
          </button>
          <button
            type="button"
            class="btn btn--secondary"
            style="border-color:var(--primary);color:var(--text);"
            onClick={() => setModalRepAberto(true)}
            title="Replicar contas para o próximo ano com reajuste seguro"
          >
            <Icon name="sparkle" /> Projetar {anoNum + 1}
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
              Ano {anoNum}
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
                Informe de Gestão Financeira
              </div>
              <div style="font-size:var(--fs-sm);font-weight:600;margin-top:2px;">
                Período: {labelPeriodoExibicao}
              </div>
              <div class="muted" style="font-size:0.68rem;margin-top:2px;">
                Emitido em: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>

          {/* Quadro de Saldo e Conciliação */}
          <div class="grid grid--2" style="margin-top:var(--sp-3);">
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
                <div class="stat__label">Saldo Final em Conta (Realizado)</div>
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
          </div>
        </section>

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
        <section class="card">
          <div class="card__head">
            <h2 class="card__title">Demonstrativo por Conta ({linhasTabela.length} itens movimentados)</h2>
          </div>

          {linhasTabela.length === 0 ? (
            <p class="muted">Nenhuma conta com projeção ou lançamento no período selecionado.</p>
          ) : (
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Conta</th>
                    <th>Categoria</th>
                    <th>Natureza</th>
                    <th>Projetado</th>
                    <th>Realizado</th>
                    <th title="Diferença entre o Realizado e o Projetado">Diferença</th>
                    <th>Execução</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasTabela.map((l) => {
                    const meta = NATURE_META[l.conta.natureza];
                    const diffSinal = SINAL[l.conta.natureza] * l.diff;
                    return (
                      <tr key={l.conta.id}>
                        <td style="font-weight:600;">{l.conta.nome}</td>
                        <td class="muted">{l.categoriaNome}</td>
                        <td>
                          <span class={`badge badge--${meta.tone}`}>{meta.label}</span>
                        </td>
                        <td class="num">{money(l.proj)}</td>
                        <td class="num" style="font-weight:700;">{money(l.real)}</td>
                        <td class={`num ${diffSinal >= 0 ? "tone-in" : "tone-out"}`}>
                          {signed(l.diff)}
                        </td>
                        <td class="num muted">{l.pct.toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Resultado Líquido do Período</td>
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

      {/* Modal de Replicação */}
      <ModalReplicacao
        empresaId={emp.id}
        anoAtual={anoNum}
        saldoFinalRealAtual={saldoFinalReal}
        isOpen={modalRepAberto}
        onClose={() => setModalRepAberto(false)}
      />
    </>
  );
}

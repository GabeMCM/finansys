import { useState } from "preact/hooks";
import { Icon } from "../components/Icon.tsx";
import { ModalReplicacao } from "../components/ModalReplicacao.tsx";
import { calcular } from "../data/calc.ts";
import { anos, categorias, contas, empresas, lancamentos, projecoes } from "../data/repo.ts";
import { type Natureza, NATUREZAS, SINAL } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { money, MONTHS, signed } from "../lib/format.ts";
import { NATURE_META } from "../lib/natureza.ts";
import { anoAtivo, empresaAtiva } from "../state.ts";

export function Relatorios() {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  const [periodo, setPeriodo] = useState<number | "ano">("ano");
  const [modalRepAberto, setModalRepAberto] = useState<boolean>(false);

  const dados = useLive(async () => {
    if (!empId) return null;
    const [emp, ano] = await Promise.all([
      empresas.get(empId),
      anos.find(empId, anoNum),
    ]);
    if (!emp || !ano) return null;

    const [cs, cats, ps, ls] = await Promise.all([
      contas.byEmpresa(empId),
      categorias.byEmpresa(empId),
      projecoes.byAno(ano.id),
      lancamentos.byAno(ano.id),
    ]);

    return { emp, ano, cs, cats, ps, ls };
  }, [empId, anoNum], null);

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
        <h2>Ano {anoNum} não configurado</h2>
        <p>Abra o ano fiscal em Ajustes para visualizar relatórios.</p>
      </section>
    );
  }

  const { emp, ano, cs, cats, ps, ls } = dados;

  // Realiza cálculos globais
  const mesLimiteCalculo = periodo === "ano" ? 11 : periodo;
  const res = calcular(ano.bancaInicial, cs, ps, ls, mesLimiteCalculo);

  const catMap = new Map(cats.map((c) => [c.id, c.nome]));

  // Calcula valores projetados e reais por conta no período selecionado
  const linhasTabela = cs.map((c) => {
    let projCentavos = 0;
    let realCentavos = 0;

    if (periodo === "ano") {
      projCentavos = ps.filter((p) => p.contaId === c.id).reduce((s, p) => s + p.valor, 0);
      realCentavos = ls.filter((l) => l.contaId === c.id).reduce((s, l) => s + l.valor, 0);
    } else {
      projCentavos = ps.filter((p) => p.contaId === c.id && p.mes === periodo).reduce((s, p) => s + p.valor, 0);
      realCentavos = ls.filter((l) => l.contaId === c.id && l.mes === periodo).reduce((s, l) => s + l.valor, 0);
    }

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
  }).filter((linha) => linha.proj > 0 || linha.real > 0);

  // Totais do período
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

  const saldoFinalReal = periodo === "ano" ? res.anual.saldoFinalReal : res.saldoReal[periodo];
  const saldoFinalProj = periodo === "ano" ? res.anual.saldoFinalProj : res.saldoProj[periodo];
  const desvioSaldoFinal = saldoFinalReal - saldoFinalProj;

  // Exportar para CSV
  const exportarCSV = () => {
    const separador = ";";
    let csv = `\uFEFF`; // BOM UTF-8 para Excel
    csv += `Finansys - Relatório Financeiro: ${emp.nome} - Ano ${anoNum}\n`;
    csv += `Período: ${periodo === "ano" ? "Anual Completo" : MONTHS[periodo] + "/" + anoNum}\n\n`;
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
    csv += `Banca Inicial;;;${(ano.bancaInicial / 100).toFixed(2).replace(".", ",")}\n`;
    csv += `Total Entradas;;;${(totEntradasProj / 100).toFixed(2).replace(".", ",")};${(totEntradasReal / 100).toFixed(2).replace(".", ",")}\n`;
    csv += `Total Saidas;;;${(totSaidasProj / 100).toFixed(2).replace(".", ",")};${(totSaidasReal / 100).toFixed(2).replace(".", ",")}\n`;
    csv += `Resultado Liquido;;;${(resultadoLiqProj / 100).toFixed(2).replace(".", ",")};${(resultadoLiqReal / 100).toFixed(2).replace(".", ",")}\n`;
    csv += `Saldo Final em Conta;;;${(saldoFinalProj / 100).toFixed(2).replace(".", ",")};${(saldoFinalReal / 100).toFixed(2).replace(".", ",")}\n`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${emp.nome.replace(/\s+/g, "_")}-${anoNum}-${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exportar para JSON
  const exportarJSON = () => {
    const obj = {
      empresa: emp,
      ano: anoNum,
      periodo: periodo === "ano" ? "anual" : MONTHS[periodo],
      bancaInicial: ano.bancaInicial,
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
    a.download = `dados-${emp.nome.replace(/\s+/g, "_")}-${anoNum}.json`;
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
          <p>Demonstrativo Projetado × Real de {anoNum}</p>
        </div>

        <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap;">
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

      {/* Seletor de Período no topo */}
      <div class="hscroll no-print" style="margin-bottom:var(--sp-4);">
        <button
          type="button"
          class={`chip ${periodo === "ano" ? "is-active" : ""}`}
          onClick={() => setPeriodo("ano")}
        >
          Ano Completo ({anoNum})
        </button>
        {MONTHS.map((m, idx) => (
          <button
            type="button"
            key={m}
            class={`chip ${periodo === idx ? "is-active" : ""}`}
            onClick={() => setPeriodo(idx)}
          >
            {m}
          </button>
        ))}
      </div>

      {/* ================= INFORME FORMAL / CORPO DO RELATÓRIO ================= */}
      <div class="stack" style="gap:var(--sp-4);">
        {/* Cabeçalho do Informe Formal (visível no print e no topo da tela) */}
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
                  {emp.cnpj ? (emp.cnpj.replace(/\D/g, "").length <= 11 ? `CPF: ${emp.cnpj}` : `CNPJ: ${emp.cnpj}`) : ""}
                  {emp.endereco ? ` · ${emp.endereco}` : ""}
                </div>
              </div>
            </div>

            <div style="text-align:right;">
              <div style="font-size:var(--fs-xs);font-weight:700;text-transform:uppercase;color:var(--primary);letter-spacing:0.04em;">
                Informe de Gestão Financeira
              </div>
              <div style="font-size:var(--fs-sm);font-weight:600;margin-top:2px;">
                Período: {periodo === "ano" ? `Exercício Anual de ${anoNum}` : `${MONTHS[periodo]} de ${anoNum}`}
              </div>
              <div class="muted" style="font-size:0.68rem;margin-top:2px;">
                Emitido em: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>

          {/* Quadro de Saldo e Conciliação */}
          <div class="grid grid--2" style="margin-top:var(--sp-3);">
            <div class="stat" style="background:var(--surface-solid);">
              <div class="stat__label">Banca Inicial no Ano</div>
              <div class="stat__value num">{money(ano.bancaInicial)}</div>
              <div class="stat__sub">Saldo inicial informado</div>
            </div>

            <div class="stat" style="background:var(--surface-solid);">
              <div class="stat__label">Saldo Final em Conta (Real)</div>
              <div class="stat__value num" style="color:var(--text);font-weight:800;">
                {money(saldoFinalReal)}
              </div>
              <div class="stat__sub num">
                Projetado: {money(saldoFinalProj)} · Desvio:{" "}
                <b class={desvioSaldoFinal >= 0 ? "tone-in" : "tone-out"}>
                  {signed(desvioSaldoFinal)}
                </b>
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
                    <th>Desvio</th>
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
        saldoFinalRealAtual={res.anual.saldoFinalReal}
        isOpen={modalRepAberto}
        onClose={() => setModalRepAberto(false)}
      />
    </>
  );
}

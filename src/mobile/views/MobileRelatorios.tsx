import { useState, useEffect } from "react";
import { Icon } from "../../components/Icon.tsx";
import { calcularPosicaoBancos } from "../../data/calc.ts";
import { db } from "../../data/db.ts";
import { anos, categorias, contas, contasBancarias, empresas, reservas } from "../../data/repo.ts";
import type { TipoContaBancaria } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { money, moneyPrivacidade, signedPrivacidade } from "../../lib/format.ts";
import { anoAtivo, empresaAtiva } from "../../state.ts";
import { useSignal } from "../../lib/signal.ts";

function formatarDataBR(isoDate: string): string {
  if (!isoDate) return "";
  const [yyyy, mm, dd] = isoDate.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

export function MobileRelatorios() {
  const empId = useSignal(empresaAtiva);
  const anoNum = useSignal(anoAtivo);

  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const anoHoje = hoje.getFullYear();

  const [abaAtiva, setAbaAtiva] = useState<"bancos" | "dre">("bancos");
  const [presetAtivo, setPresetAtivo] = useState<string>(anoNum === anoHoje ? "ano_ate_hoje" : "ano");
  const [dataInicio, setDataInicio] = useState<string>(`${anoNum}-01-01`);
  const [dataFim, setDataFim] = useState<string>(anoNum === anoHoje ? hojeStr : `${anoNum}-12-31`);

  // Sincroniza com ano ativo
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

  const aplicarPreset = (tipo: string) => {
    setPresetAtivo(tipo);
    const d = new Date();
    if (tipo === "ano_ate_hoje") {
      setDataInicio(`${anoNum}-01-01`);
      setDataFim(anoNum === anoHoje ? hojeStr : `${anoNum}-12-31`);
    } else if (tipo === "ano") {
      setDataInicio(`${anoNum}-01-01`);
      setDataFim(`${anoNum}-12-31`);
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

  if (!dados) {
    return (
      <div class="card empty" style="border-radius:18px;margin-bottom:70px;">
        <Icon name="chart" />
        <h2 style="font-size:1rem;font-weight:800;">Carregando dados financeiros...</h2>
      </div>
    );
  }

  const { emp, todosAnos, cs, cats, ps, ls, resList, movList, bancoList } = dados;

  // Filtros de data
  const lsNoPeriodo = ls.filter((l) => l.data >= dataInicio && l.data <= dataFim);
  const lsAteFim = ls.filter((l) => l.data <= dataFim);
  const movsPeriodoRes = movList.filter((m) => m.data >= dataInicio && m.data <= dataFim);
  const movsAteFim = movList.filter((m) => m.data <= dataFim);

  // Posição bancária
  const posicaoBancosAteFim = calcularPosicaoBancos(bancoList, lsAteFim, cs, movsAteFim);
  const posicaoBancosPeriodo = calcularPosicaoBancos(bancoList, lsNoPeriodo, cs, movsPeriodoRes);

  // Contas & Categorias Map
  const contaMap = new Map(cs.map((c) => [c.id, c]));
  const catMap = new Map(cats.map((c) => [c.id, c]));

  // DRE - Cálculos por Categoria
  let totalReceitasReal = 0;
  let totalReceitasProj = 0;
  let totalDespesasReal = 0;
  let totalDespesasProj = 0;
  let totalAportesReal = 0;

  // Mapeia totais por categoria
  interface LinhaCatDRE {
    id: string;
    nome: string;
    natureza: string;
    cor?: string;
    real: number;
    proj: number;
  }

  const mapCatDRE = new Map<string, LinhaCatDRE>();
  for (const c of cats) {
    mapCatDRE.set(c.id, {
      id: c.id,
      nome: c.nome,
      natureza: c.natureza,
      cor: c.cor,
      real: 0,
      proj: 0,
    });
  }

  // Acumula realizados no período
  for (const l of lsNoPeriodo) {
    const c = contaMap.get(l.contaId);
    if (!c) continue;
    const catEntry = mapCatDRE.get(c.categoriaId);
    if (catEntry) {
      catEntry.real += l.valor;
    }
    if (c.natureza === "receber") totalReceitasReal += l.valor;
    else if (c.natureza === "aporte") totalAportesReal += l.valor;
    else totalDespesasReal += l.valor;
  }

  // Acumula projeções no período (meses correspondentes)
  const mesesIntervalo = new Set<number>();
  const [yIni, mIni] = dataInicio.split("-").map(Number);
  const [yFim, mFim] = dataFim.split("-").map(Number);

  for (const p of ps) {
    const anoObj = todosAnos.find((a) => a.id === p.anoId);
    if (!anoObj) continue;
    // Checa se o mês e ano da projeção estão na faixa
    const pDate = `${anoObj.ano}-${String(p.mes + 1).padStart(2, "0")}-01`;
    if (pDate >= `${yIni}-${String(mIni).padStart(2, "0")}-01` && pDate <= `${yFim}-${String(mFim).padStart(2, "0")}-28`) {
      const c = contaMap.get(p.contaId);
      if (!c) continue;
      const catEntry = mapCatDRE.get(c.categoriaId);
      if (catEntry) {
        catEntry.proj += p.valor;
      }
      if (c.natureza === "receber") totalReceitasProj += p.valor;
      else if (c.natureza !== "aporte") totalDespesasProj += p.valor;
    }
  }

  const resultadoOperacionalReal = totalReceitasReal - totalDespesasReal;
  const resultadoOperacionalProj = totalReceitasProj - totalDespesasProj;
  const margemReal = totalReceitasReal > 0 ? (resultadoOperacionalReal / totalReceitasReal) * 100 : 0;

  const catsReceitas = Array.from(mapCatDRE.values()).filter((c) => c.natureza === "receber" && (c.real > 0 || c.proj > 0));
  const catsDespesas = Array.from(mapCatDRE.values()).filter((c) => c.natureza !== "receber" && c.natureza !== "aporte" && (c.real > 0 || c.proj > 0));

  // Ícone por tipo de banco
  const getIconeBanco = (tipo?: TipoContaBancaria) => {
    if (tipo === "investimento") return "chart";
    if (tipo === "poupanca") return "wallet";
    return "bank";
  };

  return (
    <div style="display:flex;flex-direction:column;gap:12px;padding-bottom:70px;">
      {/* 1. Barra de Presets Rápidos de Data */}
      <div class="hscroll" style="gap:4px;padding-bottom:2px;">
        <button
          type="button"
          class={`chip ${presetAtivo === "ano_ate_hoje" ? "is-active" : ""}`}
          onClick={() => aplicarPreset("ano_ate_hoje")}
        >
          Ano até Hoje
        </button>
        <button
          type="button"
          class={`chip ${presetAtivo === "ano" ? "is-active" : ""}`}
          onClick={() => aplicarPreset("ano")}
        >
          Ano Todo ({anoNum})
        </button>
        <button
          type="button"
          class={`chip ${presetAtivo === "mes_atual" ? "is-active" : ""}`}
          onClick={() => aplicarPreset("mes_atual")}
        >
          Mês Atual
        </button>
        <button
          type="button"
          class={`chip ${presetAtivo === "mes_anterior" ? "is-active" : ""}`}
          onClick={() => aplicarPreset("mes_anterior")}
        >
          Mês Anterior
        </button>
      </div>

      {/* Indicador do Intervalo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          fontSize: "0.72rem",
          color: "var(--text-muted)",
        }}
      >
        <div style="display:flex;align-items:center;gap:6px;">
          <Icon name="calendar" style="width:14px;height:14px;color:var(--primary);" />
          <span>Período: <strong>{formatarDataBR(dataInicio)}</strong> a <strong>{formatarDataBR(dataFim)}</strong></span>
        </div>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          style="padding:2px 6px;height:24px;font-size:0.68rem;gap:4px;"
          onClick={() => window.print()}
          title="Imprimir relatório"
        >
          <Icon name="download" style="width:12px;height:12px;" />
          Imprimir
        </button>
      </div>

      {/* 2. Segmented Switcher: Posição Bancária vs DRE & Resultados */}
      <div class="mobile-segmented" style="margin-bottom:2px;">
        <button
          type="button"
          class={`mobile-segmented__btn ${abaAtiva === "bancos" ? "is-active" : ""}`}
          onClick={() => setAbaAtiva("bancos")}
        >
          <Icon name="bank" style="width:15px;height:15px;" />
          Posição Bancária ({bancoList.length})
        </button>

        <button
          type="button"
          class={`mobile-segmented__btn ${abaAtiva === "dre" ? "is-active" : ""}`}
          onClick={() => setAbaAtiva("dre")}
        >
          <Icon name="chart" style="width:15px;height:15px;" />
          DRE & Resultados
        </button>
      </div>

      {/* 3. CONTEÚDO: ABA POSIÇÃO BANCÁRIA */}
      {abaAtiva === "bancos" && (
        <>
          {/* Card Hero: Saldo Consolidado de Todos os Bancos */}
          <section class="bank-hero-card" aria-label="Saldo em Bancos">
            <div class="bank-hero-card__header">
              <div class="bank-hero-card__title">
                <Icon name="bank" />
                <span>Total em Instituições</span>
              </div>
              <span
                class="badge"
                style={{
                  background: posicaoBancosAteFim.totalSaldoAtual >= 0 ? "var(--in-soft)" : "var(--out-soft)",
                  color: posicaoBancosAteFim.totalSaldoAtual >= 0 ? "var(--in)" : "var(--out)",
                  fontSize: "0.70rem",
                  fontWeight: "700",
                }}
              >
                {bancoList.length} contas
              </span>
            </div>

            <div class="bank-hero-card__value">
              {moneyPrivacidade(posicaoBancosAteFim.totalSaldoAtual)}
            </div>

            <div class="bank-hero-card__meta-row">
              <div class="bank-hero-card__meta-item">
                <span class="bank-hero-card__meta-label">Entradas no Período</span>
                <span class="bank-hero-card__meta-val" style="color:var(--in);">
                  +{moneyPrivacidade(posicaoBancosPeriodo.totalEntradas)}
                </span>
              </div>
              <div class="bank-hero-card__meta-item" style="text-align:right;">
                <span class="bank-hero-card__meta-label">Saídas no Período</span>
                <span class="bank-hero-card__meta-val" style="color:var(--out);">
                  -{moneyPrivacidade(posicaoBancosPeriodo.totalSaidas)}
                </span>
              </div>
            </div>
          </section>

          {/* Listagem das Contas Bancárias Individuais */}
          {bancoList.length === 0 ? (
            <div class="card empty" style="border-radius:14px;padding:24px;">
              <Icon name="bank" />
              <h3 style="font-size:0.92rem;font-weight:700;margin:0;">Nenhum banco cadastrado</h3>
              <p style="font-size:0.75rem;color:var(--text-muted);margin:4px 0 12px;">
                Adicione suas contas bancárias na aba Ajustes para acompanhar saldos e conciliações.
              </p>
              <a href="#/ajustes" class="btn btn--primary btn--sm" style="text-decoration:none;">
                Ir para Ajustes
              </a>
            </div>
          ) : (
            <div style="display:flex;flex-direction:column;gap:8px;">
              {posicaoBancosAteFim.bancos.map((b) => {
                const movPeriodo = posicaoBancosPeriodo.bancos.find((bp) => bp.banco.id === b.banco.id);
                return (
                  <div
                    key={b.banco.id}
                    class="card"
                    style={{
                      borderRadius: "14px",
                      padding: "12px 14px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                      <div style="display:flex;align-items:center;gap:10px;">
                        <div
                          class="mobile-tx-card__icon"
                          style="background:var(--primary-soft);color:var(--primary);width:32px;height:32px;"
                        >
                          <Icon name={getIconeBanco(b.banco.tipo)} style="width:16px;height:16px;" />
                        </div>
                        <div>
                          <div style="font-weight:700;font-size:0.85rem;color:var(--text);">
                            {b.banco.nome}
                          </div>
                          <div style="font-size:0.68rem;color:var(--text-muted);text-transform:capitalize;">
                            {b.banco.tipo || "Conta Corrente"}
                          </div>
                        </div>
                      </div>

                      <div style="text-align:right;">
                        <div
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: "800",
                            color: b.saldoAtual >= 0 ? "var(--text)" : "var(--out)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {moneyPrivacidade(b.saldoAtual)}
                        </div>
                      </div>
                    </div>

                    {/* Resumo de Movimentações no Período */}
                    {movPeriodo && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingTop: "6px",
                          borderTop: "1px dashed var(--border-soft)",
                          fontSize: "0.70rem",
                        }}
                      >
                        <span style="color:var(--in);">
                          +{moneyPrivacidade(movPeriodo.totalEntradas)}
                        </span>
                        <span style="color:var(--out);">
                          -{moneyPrivacidade(movPeriodo.totalSaidas)}
                        </span>
                        <span style="color:var(--text-muted);">
                          {movPeriodo.qtdLancamentos} mov.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 4. CONTEÚDO: ABA DRE & RESULTADOS */}
      {abaAtiva === "dre" && (
        <>
          {/* Card Hero do DRE */}
          <section class="bank-hero-card" aria-label="Resultado Operacional">
            <div class="bank-hero-card__header">
              <div class="bank-hero-card__title">
                <Icon name="chart" />
                <span>Resultado Líquido do Período</span>
              </div>
              <span
                class="badge"
                style={{
                  background: resultadoOperacionalReal >= 0 ? "var(--in-soft)" : "var(--out-soft)",
                  color: resultadoOperacionalReal >= 0 ? "var(--in)" : "var(--out)",
                  fontSize: "0.70rem",
                  fontWeight: "700",
                }}
              >
                Margem {margemReal.toFixed(1)}%
              </span>
            </div>

            <div
              class="bank-hero-card__value"
              style={{
                color: resultadoOperacionalReal >= 0 ? "var(--in)" : "var(--out)",
              }}
            >
              {signedPrivacidade(resultadoOperacionalReal)}
            </div>

            <div class="bank-hero-card__meta-row">
              <div class="bank-hero-card__meta-item">
                <span class="bank-hero-card__meta-label">Receitas Líquidas</span>
                <span class="bank-hero-card__meta-val" style="color:var(--in);">
                  +{moneyPrivacidade(totalReceitasReal)}
                </span>
              </div>
              <div class="bank-hero-card__meta-item" style="text-align:right;">
                <span class="bank-hero-card__meta-label">Despesas Operacionais</span>
                <span class="bank-hero-card__meta-val" style="color:var(--out);">
                  -{moneyPrivacidade(totalDespesasReal)}
                </span>
              </div>
            </div>

            {totalAportesReal > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: "6px",
                  borderTop: "1px dashed var(--border-soft)",
                  fontSize: "0.72rem",
                }}
              >
                <span style="color:var(--text-muted);">Aportes em Reservas / Caixinhas:</span>
                <strong style="color:var(--primary);font-variant-numeric:tabular-nums;">
                  +{moneyPrivacidade(totalAportesReal)}
                </strong>
              </div>
            )}
          </section>

          {/* Comparativo Projetado vs Realizado */}
          <div
            class="card"
            style="border-radius:14px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);"
          >
            <div style="font-size:0.75rem;font-weight:700;color:var(--text);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">
              Projetado × Realizado
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.74rem;">
              <div style="background:var(--surface-soft);padding:8px 10px;border-radius:10px;">
                <div style="color:var(--text-muted);font-size:0.68rem;">Receitas Proj.</div>
                <div style="font-weight:800;color:var(--text);margin-top:2px;">{moneyPrivacidade(totalReceitasProj)}</div>
              </div>
              <div style="background:var(--surface-soft);padding:8px 10px;border-radius:10px;">
                <div style="color:var(--text-muted);font-size:0.68rem;">Despesas Proj.</div>
                <div style="font-weight:800;color:var(--text);margin-top:2px;">{moneyPrivacidade(totalDespesasProj)}</div>
              </div>
            </div>
          </div>

          {/* Detalhamento por Categorias de Receitas */}
          {catsReceitas.length > 0 && (
            <div style="display:flex;flex-direction:column;gap:6px;">
              <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;padding-left:4px;">
                Receitas por Categoria
              </div>
              {catsReceitas.map((cat) => {
                const pct = cat.proj > 0 ? (cat.real / cat.proj) * 100 : 100;
                return (
                  <div
                    key={cat.id}
                    class="card"
                    style="border-radius:12px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);"
                  >
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                      <span style="font-size:0.80rem;font-weight:700;color:var(--text);">{cat.nome}</span>
                      <span style="font-size:0.82rem;font-weight:800;color:var(--in);font-variant-numeric:tabular-nums;">
                        +{moneyPrivacidade(cat.real)}
                      </span>
                    </div>
                    {cat.proj > 0 && (
                      <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.68rem;color:var(--text-muted);">
                        <span>Meta Proj: {moneyPrivacidade(cat.proj)}</span>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Detalhamento por Categorias de Despesas */}
          {catsDespesas.length > 0 && (
            <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">
              <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;padding-left:4px;">
                Despesas por Categoria
              </div>
              {catsDespesas.map((cat) => {
                const pct = cat.proj > 0 ? (cat.real / cat.proj) * 100 : 100;
                return (
                  <div
                    key={cat.id}
                    class="card"
                    style="border-radius:12px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);"
                  >
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                      <span style="font-size:0.80rem;font-weight:700;color:var(--text);">{cat.nome}</span>
                      <span style="font-size:0.82rem;font-weight:800;color:var(--out);font-variant-numeric:tabular-nums;">
                        -{moneyPrivacidade(cat.real)}
                      </span>
                    </div>
                    {cat.proj > 0 && (
                      <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.68rem;color:var(--text-muted);">
                        <span>Teto Proj: {moneyPrivacidade(cat.proj)}</span>
                        <span style={{ color: pct > 100 ? "var(--out)" : "inherit" }}>{pct.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

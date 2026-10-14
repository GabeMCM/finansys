import { useState } from "preact/hooks";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/Modal.tsx";
import { ModalConfirm, confirmarAcao } from "../components/ModalConfirm.tsx";
import { toast } from "../components/Toast.tsx";
import { anos, categorias, contas, projecoes } from "../data/repo.ts";
import { type Natureza, NATUREZAS } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { money, MONTHS } from "../lib/format.ts";
import { NATURE_META } from "../lib/natureza.ts";
import { anoAtivo, empresaAtiva } from "../state.ts";

export function Projecoes() {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  const [nat, setNat] = useState<Natureza>("pagar");
  const [mesAtivo, setMesAtivo] = useState<number>(new Date().getMonth());
  const [modoGrade, setModoGrade] = useState<boolean>(false);
  const [modalObs, setModalObs] = useState<{ contaId: string; mes: number; obs: string; nome: string } | null>(null);

  const dados = useLive(async () => {
    if (!empId) return null;
    const ano = await anos.find(empId, anoNum);
    if (!ano) return null;
    const [cs, cats, ps] = await Promise.all([
      contas.byEmpresa(empId, nat),
      categorias.byEmpresa(empId, nat),
      projecoes.byAno(ano.id),
    ]);
    return { ano, cs, cats, ps };
  }, [empId, anoNum, nat], null);

  if (!empId) {
    return (
      <section class="card empty">
        <Icon name="building" />
        <h2>Selecione uma empresa</h2>
        <p>Acesse os Ajustes para selecionar ou criar uma empresa.</p>
      </section>
    );
  }

  if (!dados) {
    return (
      <section class="card empty">
        <Icon name="calendar" />
        <h2>Ano {anoNum} não configurado</h2>
        <p>Abra o ano fiscal em Ajustes para começar a lançar projeções.</p>
        <a href="#/ajustes" class="btn btn--primary" style="margin-top:16px;">
          Ir para Ajustes
        </a>
      </section>
    );
  }

  const { ano, cs, cats, ps } = dados;

  // Mapa de projeções: contaId + "_" + mes -> Projecao
  const pMap = new Map<string, { id?: string; valor: number; obs?: string }>();
  for (const p of ps) {
    pMap.set(`${p.contaId}_${p.mes}`, { id: p.id, valor: p.valor, obs: p.obs });
  }

  const getProj = (contaId: string, mes: number) => {
    return pMap.get(`${contaId}_${mes}`) || { valor: 0 };
  };

  const atualizarValor = async (contaId: string, mes: number, valorReais: number) => {
    const centavos = Math.round(Number(valorReais || 0) * 100);
    const atual = getProj(contaId, mes);
    await projecoes.set(ano.id, contaId, mes, centavos, atual.obs);
  };

  const replicarParaAno = async (contaId: string, mesOrigem: number) => {
    const origem = getProj(contaId, mesOrigem);
    const ok = await confirmarAcao({
      titulo: "Replicar Projeção Mensal",
      mensagem: `Deseja replicar o valor de ${money(origem.valor)} para todos os 12 meses desta conta?`,
      rotuloConfirmar: "Replicar para 12 meses",
      tipo: "primary",
    });
    if (ok) {
      for (let m = 0; m < 12; m++) {
        await projecoes.set(ano.id, contaId, m, origem.valor, origem.obs);
      }
      toast.success(`Valor de ${money(origem.valor)} replicado para os 12 meses.`);
    }
  };

  const salvarObs = async () => {
    if (!modalObs) return;
    const atual = getProj(modalObs.contaId, modalObs.mes);
    await projecoes.set(ano.id, modalObs.contaId, modalObs.mes, atual.valor, modalObs.obs.trim() || undefined);
    setModalObs(null);
  };

  // Totais mensais
  const totalMes = (m: number) => {
    return cs.reduce((sum, c) => sum + (getProj(c.id, m).valor || 0), 0);
  };

  const totalContaAno = (contaId: string) => {
    let s = 0;
    for (let m = 0; m < 12; m++) s += getProj(contaId, m).valor || 0;
    return s;
  };

  const totalGeralAno = () => {
    let s = 0;
    for (let m = 0; m < 12; m++) s += totalMes(m);
    return s;
  };

  return (
    <>
      <div class="page-head">
        <div>
          <h1>Projeções {anoNum}</h1>
          <p>Previsões financeiras mês a mês para {NATURE_META[nat].label.toLowerCase()}</p>
        </div>
        <button
          type="button"
          class={`btn ${modoGrade ? "btn--primary" : "btn--secondary"}`}
          onClick={() => setModoGrade(!modoGrade)}
          title="Alternar entre visualização de mês único e grade anual completa"
        >
          <Icon name="grid" /> {modoGrade ? "Visão Mensal" : "Grade 12 Meses"}
        </button>
      </div>

      {/* Tabs das naturezas */}
      <div class="tabs" style="margin-bottom: var(--sp-4);">
        {NATUREZAS.map((n) => {
          const meta = NATURE_META[n];
          return (
            <button
              type="button"
              key={n}
              class={`tab ${nat === n ? "is-active" : ""}`}
              onClick={() => setNat(n)}
            >
              <Icon name={meta.icon} /> {meta.label}
            </button>
          );
        })}
      </div>

      {cs.length === 0 ? (
        <section class="card empty">
          <Icon name="grid" />
          <h2>Nenhuma conta cadastrada</h2>
          <p>Cadastre contas e categorias para {NATURE_META[nat].label} em Ajustes.</p>
          <a href="#/ajustes" class="btn btn--primary" style="margin-top:16px;">
            Ir para Ajustes
          </a>
        </section>
      ) : modoGrade ? (
        /* ================= VISÃO GRADE ANUAL (TABELA COM SCROLL) ================= */
        <div class="stack">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Conta / Categoria</th>
                  {MONTHS.map((m) => (
                    <th key={m}>{m}</th>
                  ))}
                  <th style="background:var(--surface-solid);">Total Anual</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((cat) => {
                  const contasDaCat = cs.filter((c) => c.categoriaId === cat.id);
                  if (contasDaCat.length === 0) return null;
                  return (
                    <>
                      <tr key={`cat-${cat.id}`} style="background:var(--surface);">
                        <td colSpan={14} style="font-weight:700;color:var(--text);text-align:left;font-size:0.75rem;padding:6px 10px;">
                          {cat.nome}
                        </td>
                      </tr>
                      {contasDaCat.map((c) => {
                        const totAno = totalContaAno(c.id);
                        return (
                          <tr key={c.id}>
                            <td style="padding-left:20px;">
                              <div style="font-weight:500;">{c.nome}</div>
                            </td>
                            {MONTHS.map((_, m) => {
                              const p = getProj(c.id, m);
                              return (
                                <td key={m}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    class="input-cell"
                                    value={p.valor ? (p.valor / 100).toFixed(2) : ""}
                                    placeholder="0,00"
                                    onBlur={(e) => {
                                      const val = parseFloat(e.currentTarget.value) || 0;
                                      if (val !== p.valor / 100) atualizarValor(c.id, m, val);
                                    }}
                                  />
                                </td>
                              );
                            })}
                            <td style="font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;">
                              {money(totAno)}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total Projetado</td>
                  {MONTHS.map((_, m) => (
                    <td key={m}>{money(totalMes(m))}</td>
                  ))}
                  <td style="color:var(--primary);">{money(totalGeralAno())}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        /* ================= VISÃO MOBILE / MÊS A MÊS ================= */
        <div class="stack">
          {/* Seletor de mês horizontal com snap */}
          <div class="hscroll" style="margin-bottom:var(--sp-3);">
            {MONTHS.map((m, idx) => (
              <button
                type="button"
                key={m}
                class={`chip ${mesAtivo === idx ? "is-active" : ""}`}
                onClick={() => setMesAtivo(idx)}
              >
                {m}
              </button>
            ))}
          </div>

          <section class="card">
            <div class="card__head">
              <div>
                <h2 class="card__title">{MONTHS[mesAtivo]} de {anoNum}</h2>
                <p class="muted" style="font-size:var(--fs-xs);">
                  Total projetado no mês: <b class="num" style="color:var(--text);">{money(totalMes(mesAtivo))}</b>
                </p>
              </div>
            </div>

            <div class="stack" style="gap:var(--sp-4);">
              {cats.map((cat) => {
                const contasDaCat = cs.filter((c) => c.categoriaId === cat.id);
                if (contasDaCat.length === 0) return null;
                return (
                  <div key={cat.id} class="stack" style="gap:var(--sp-2);">
                    <div style="font-size:var(--fs-xs);font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">
                      {cat.nome}
                    </div>

                    <div class="stack" style="gap:var(--sp-2);">
                      {contasDaCat.map((c) => {
                        const p = getProj(c.id, mesAtivo);
                        const isLivre = nat === "aporte" || nat === "saida";
                        return (
                          <div
                            key={c.id}
                            style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface);"
                          >
                            <div style="flex:1;min-width:0;">
                              <div style="font-weight:600;font-size:var(--fs-sm);">{c.nome}</div>
                              {p.obs && (
                                <div class="muted" style="font-size:var(--fs-xs);margin-top:2px;display:flex;align-items:center;gap:4px;">
                                  <span>Obs: {p.obs}</span>
                                </div>
                              )}
                            </div>

                            <div style="display:flex;align-items:center;gap:6px;">
                              <div style="display:flex;align-items:center;background:var(--surface-solid);border:1px solid var(--border-strong);border-radius:var(--r-md);padding:0 8px;">
                                <span class="muted" style="font-size:var(--fs-xs);">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  style="width:90px;min-height:36px;border:0;background:transparent;text-align:right;font-weight:600;font-size:var(--fs-sm);outline:none;color:var(--text);"
                                  value={p.valor ? (p.valor / 100).toFixed(2) : ""}
                                  placeholder="0,00"
                                  onBlur={(e) => {
                                    const val = parseFloat(e.currentTarget.value) || 0;
                                    if (val !== p.valor / 100) atualizarValor(c.id, mesAtivo, val);
                                  }}
                                />
                              </div>

                              <button
                                type="button"
                                class="btn btn--ghost btn--icon"
                                style="min-height:36px;width:36px;"
                                onClick={() => replicarParaAno(c.id, mesAtivo)}
                                title="Copiar este valor para todos os 12 meses"
                              >
                                <Icon name="copy" />
                              </button>

                              {isLivre && (
                                <button
                                  type="button"
                                  class="btn btn--ghost btn--icon"
                                  style={`min-height:36px;width:36px;${p.obs ? "color:var(--primary);" : ""}`}
                                  onClick={() => setModalObs({ contaId: c.id, mes: mesAtivo, obs: p.obs || "", nome: c.nome })}
                                  title="Adicionar ou editar observação"
                                >
                                  <Icon name="pencil" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* Modal Observação para Projeções Livres */}
      <Modal
        title={`Observação: ${modalObs?.nome || ""}`}
        isOpen={modalObs !== null}
        onClose={() => setModalObs(null)}
        footer={
          <>
            <button type="button" class="btn btn--ghost" onClick={() => setModalObs(null)}>
              Cancelar
            </button>
            <button type="button" class="btn btn--primary" onClick={salvarObs}>
              Salvar Observação
            </button>
          </>
        }
      >
        <div class="form-group">
          <label class="form-label" for="proj-obs">Detalhes / Justificativa da Projeção</label>
          <textarea
            id="proj-obs"
            class="textarea"
            rows={3}
            placeholder="Ex: Reforma emergencial, distribuição extraordinária de dividendos..."
            value={modalObs?.obs || ""}
            onInput={(e) => modalObs && setModalObs({ ...modalObs, obs: e.currentTarget.value })}
          />
        </div>
      </Modal>
    </>
  );
}

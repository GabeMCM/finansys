import { useState } from "preact/hooks";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { anos, categorias, contas, lancamentos, projecoes } from "../../data/repo.ts";
import type { Categoria, Conta, Natureza } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { moneyPrivacidade, MONTHS } from "../../lib/format.ts";
import { anoAtivo, empresaAtiva } from "../../state.ts";

export function MobileMetas() {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  const [mesAtivo, setMesAtivo] = useState<number>(new Date().getMonth());
  const [natureza, setNatureza] = useState<Natureza>("saida");
  const [modalEditarMeta, setModalEditarMeta] = useState<{
    cat: Categoria;
    metaAtualCentavos: number;
    novoValorStr: string;
  } | null>(null);

  const dados = useLive(async () => {
    if (!empId) return null;
    const ano = await anos.find(empId, anoNum);
    if (!ano) return null;
    const [cs, cats, ps, ls] = await Promise.all([
      contas.byEmpresa(empId),
      categorias.byEmpresa(empId),
      projecoes.byAno(ano.id),
      lancamentos.byAno(ano.id),
    ]);
    return { ano, cs, cats, ps, ls };
  }, [empId, anoNum], null);

  const cs = dados?.cs || [];
  const cats = dados?.cats || [];
  const ps = dados?.ps || [];
  const ls = dados?.ls || [];
  const ano = dados?.ano;

  // Filtra categorias pela natureza selecionada
  const catsFiltradas = cats.filter((c) => c.natureza === natureza);

  // Calcula valores projetados e realizados do mês
  const getMetaCatMes = (catId: string, m: number) => {
    const contasDaCat = cs.filter((c) => c.categoriaId === catId);
    return contasDaCat.reduce((sum, c) => {
      const p = ps.find((x) => x.contaId === c.id && x.mes === m);
      return sum + (p?.valor || 0);
    }, 0);
  };

  const getRealCatMes = (catId: string, m: number) => {
    const contasDaCat = cs.filter((c) => c.categoriaId === catId);
    return contasDaCat.reduce((sum, c) => {
      const lancs = ls.filter((l) => l.contaId === c.id && l.mes === m);
      return sum + lancs.reduce((acc, l) => acc + l.valor, 0);
    }, 0);
  };

  // Totais do mês
  const totalProjMes = catsFiltradas.reduce((s, cat) => s + getMetaCatMes(cat.id, mesAtivo), 0);
  const totalRealMes = catsFiltradas.reduce((s, cat) => s + getRealCatMes(cat.id, mesAtivo), 0);
  const pctConsumoTotal = totalProjMes > 0 ? Math.round((totalRealMes / totalProjMes) * 100) : 0;

  const salvarNovaMetaCat = async () => {
    if (!modalEditarMeta || !ano) return;
    const { cat, novoValorStr } = modalEditarMeta;
    const limpo = novoValorStr.replace(/\D/g, "");
    const centavos = limpo ? parseInt(limpo, 10) : 0;

    const contasDaCat = cs.filter((c) => c.categoriaId === cat.id);
    if (contasDaCat.length === 0) {
      toast.warn("Esta categoria não tem contas cadastradas.");
      return;
    }

    // Se tiver 1 conta, joga todo o valor nela. Se tiver mais de uma, atualiza a primeira ou distribui
    const contaPrincipal = contasDaCat[0];
    await projecoes.set(ano.id, contaPrincipal.id, mesAtivo, centavos);
    toast.success(`Teto de ${cat.nome} atualizado para ${moneyPrivacidade(centavos)} em ${MONTHS[mesAtivo]}!`);
    setModalEditarMeta(null);
  };

  return (
    <div style="display:flex;flex-direction:column;gap:14px;padding-bottom:70px;">
      {/* 1. Navegador de Mês Superior */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "18px",
          padding: "10px 14px",
        }}
      >
        <button
          type="button"
          class="btn btn--ghost btn--icon"
          disabled={mesAtivo === 0}
          onClick={() => setMesAtivo((prev) => Math.max(0, prev - 1))}
        >
          <Icon name="arrowLeft" />
        </button>

        <div style="text-align:center;">
          <h2 style="font-size:1rem;font-weight:800;margin:0;color:var(--text);">
            {MONTHS[mesAtivo]} de {anoNum}
          </h2>
          <span style="font-size:0.75rem;color:var(--text-muted);">
            {natureza === "saida" ? "Orçamento de Gastos" : "Metas de Receitas"}
          </span>
        </div>

        <button
          type="button"
          class="btn btn--ghost btn--icon"
          disabled={mesAtivo === 11}
          onClick={() => setMesAtivo((prev) => Math.min(11, prev + 1))}
        >
          <Icon name="chevron" style="transform:rotate(-90deg);" />
        </button>
      </div>

      {/* 2. Alternador de Despesa / Receita */}
      <div class="mobile-segmented">
        <button
          type="button"
          class={`mobile-segmented__btn ${natureza === "saida" ? "is-active-out" : ""}`}
          onClick={() => setNatureza("saida")}
        >
          <Icon name="arrowUp" style="width:16px;height:16px;" /> Tetos de Despesas
        </button>
        <button
          type="button"
          class={`mobile-segmented__btn ${natureza === "receber" ? "is-active-in" : ""}`}
          onClick={() => setNatureza("receber")}
        >
          <Icon name="arrowDown" style="width:16px;height:16px;" /> Metas de Receitas
        </button>
      </div>

      {/* 3. Hero Card do Orçamento do Mês */}
      <div class="card" style="border-radius:20px;padding:18px;display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;">
            {natureza === "saida" ? "Gasto no Mês" : "Recebido no Mês"}
          </span>
          <span
            class="badge"
            style={{
              background: pctConsumoTotal > 100 ? "var(--out-soft)" : "var(--primary-soft)",
              color: pctConsumoTotal > 100 ? "var(--out)" : "var(--primary)",
              fontWeight: "700",
            }}
          >
            {pctConsumoTotal}% do planejado
          </span>
        </div>

        <div style="font-size:2rem;font-weight:900;color:var(--text);letter-spacing:-0.02em;">
          {moneyPrivacidade(totalRealMes)}
        </div>

        <div style="display:flex;justify-content:space-between;font-size:0.80rem;color:var(--text-muted);">
          <span>Meta: <strong>{moneyPrivacidade(totalProjMes)}</strong></span>
          <span>
            {natureza === "saida"
              ? totalProjMes - totalRealMes >= 0
                ? `Resta gastar: ${moneyPrivacidade(totalProjMes - totalRealMes)}`
                : `Excedeu: ${moneyPrivacidade(totalRealMes - totalProjMes)}`
              : `Faltam: ${moneyPrivacidade(Math.max(0, totalProjMes - totalRealMes))}`}
          </span>
        </div>

        {/* Barra de Progresso do Teto Geral */}
        <div style="height:8px;border-radius:4px;background:var(--surface-soft);overflow:hidden;">
          <div
            style={{
              height: "100%",
              borderRadius: "4px",
              background: pctConsumoTotal > 100 ? "var(--out)" : pctConsumoTotal >= 80 ? "var(--warn)" : "var(--in)",
              width: `${Math.min(100, pctConsumoTotal)}%`,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {/* 4. Lista de Categorias com Barra de Teto */}
      <div>
        <h3 style="font-size:0.85rem;font-weight:800;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;margin:0 0 10px 4px;">
          Orçamento por Categoria
        </h3>

        {catsFiltradas.length === 0 ? (
          <div class="card" style="text-align:center;padding:24px;border-radius:18px;color:var(--text-muted);font-size:0.85rem;">
            Nenhuma categoria cadastrada nesta natureza.
          </div>
        ) : (
          catsFiltradas.map((cat) => {
            const meta = getMetaCatMes(cat.id, mesAtivo);
            const real = getRealCatMes(cat.id, mesAtivo);
            const pct = meta > 0 ? Math.round((real / meta) * 100) : 0;
            const isEstourado = meta > 0 && real > meta;

            return (
              <div
                key={cat.id}
                class="mobile-meta-item"
                onClick={() =>
                  setModalEditarMeta({
                    cat,
                    metaAtualCentavos: meta,
                    novoValorStr: meta ? (meta / 100).toFixed(2) : "",
                  })
                }
                role="button"
                tabIndex={0}
              >
                <div class="mobile-meta-item__header">
                  <div class="mobile-meta-item__title">
                    <i
                      class="dot"
                      style={{
                        background: isEstourado ? "var(--out)" : pct >= 80 ? "var(--warn)" : "var(--primary)",
                      }}
                    />
                    <span>{cat.nome}</span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: "700",
                      color: isEstourado ? "var(--out)" : "var(--text)",
                    }}
                  >
                    {moneyPrivacidade(real)}
                  </span>
                </div>

                <div class="mobile-meta-item__bar">
                  <div
                    class="mobile-meta-item__fill"
                    style={{
                      width: `${meta > 0 ? Math.min(100, pct) : 0}%`,
                      background: isEstourado ? "var(--out)" : pct >= 80 ? "var(--warn)" : "var(--in)",
                    }}
                  />
                </div>

                <div class="mobile-meta-item__numbers">
                  <span>Teto: {moneyPrivacidade(meta)}</span>
                  <span>{meta > 0 ? `${pct}% consumido` : "Sem teto definido"}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Sheet de Ajuste Rápido de Teto */}
      {modalEditarMeta && (
        <div class="modal-backdrop" onClick={() => setModalEditarMeta(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Ajustar Teto de {modalEditarMeta.cat.nome}</h3>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                onClick={() => setModalEditarMeta(null)}
              >
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:16px;">
              <p style="font-size:0.84rem;color:var(--text-muted);margin:0;">
                Defina o limite planejado de gastos para <strong>{modalEditarMeta.cat.nome}</strong> no mês de{" "}
                <strong>{MONTHS[mesAtivo]}</strong>:
              </p>

              <div class="mobile-amount-box">
                <span class="mobile-amount-box__label">Novo Teto Orçamentário</span>
                <div class="mobile-amount-box__input-row">
                  <span class="mobile-amount-box__currency">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    class="mobile-amount-box__input"
                    placeholder="0,00"
                    value={modalEditarMeta.novoValorStr}
                    onInput={(e) =>
                      setModalEditarMeta({
                        ...modalEditarMeta,
                        novoValorStr: (e.currentTarget as HTMLInputElement).value,
                      })
                    }
                    autoFocus
                  />
                </div>
              </div>
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:48px;border-radius:14px;font-weight:800;"
                onClick={salvarNovaMetaCat}
              >
                Salvar Teto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

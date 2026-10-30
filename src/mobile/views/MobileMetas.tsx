import { useState } from "react";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { confirmarAcao } from "../../components/ModalConfirm.tsx";
import { anos, categorias, contas, lancamentos, projecoes } from "../../data/repo.ts";
import type { Categoria, Conta, Natureza } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { money, moneyPrivacidade, MONTHS } from "../../lib/format.ts";
import { anoAtivo, empresaAtiva } from "../../state.ts";
import { useSignal } from "../../lib/signal.ts";

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function MobileMetas() {
  const empId = useSignal(empresaAtiva);
  const anoNum = useSignal(anoAtivo);

  const [mesAtivo, setMesAtivo] = useState<number>(new Date().getMonth());
  const [natureza, setNatureza] = useState<Natureza>("pagar");
  const [busca, setBusca] = useState<string>("");

  // Estado do Modal de Nova Projeção
  const [modalNovaProjecao, setModalNovaProjecao] = useState<boolean>(false);
  const [novaProjNat, setNovaProjNat] = useState<Natureza>("pagar");
  const [novaProjContaId, setNovaProjContaId] = useState<string>("");
  const [novaProjDistribuicao, setNovaProjDistribuicao] = useState<"todos_meses" | "mes_ativo" | "parcelado" | "mes_especifico">("todos_meses");
  const [novaProjValorStr, setNovaProjValorStr] = useState<string>("");
  const [novaProjParcelas, setNovaProjParcelas] = useState<number>(3);
  const [novaProjMesEsp, setNovaProjMesEsp] = useState<number>(mesAtivo);
  const [novaProjObs, setNovaProjObs] = useState<string>("");

  // Estado do Modal de Edição Rápida da Conta
  const [contaEdicao, setContaEdicao] = useState<{
    conta: Conta;
    categoriaNome: string;
    valorAtualCentavos: number;
    novoValorStr: string;
    obs: string;
  } | null>(null);

  // Estado do Modal de Replicação Rápida
  const [modalReplicacao, setModalReplicacao] = useState<boolean>(false);
  const [mesOrigemRep, setMesOrigemRep] = useState<number>(mesAtivo);
  const [percReajuste, setPercReajuste] = useState<number>(0);

  // Categorias recolhidas
  const [catsRecolhidas, setCatsRecolhidas] = useState<Set<string>>(new Set());

  const toggleCatRecolhida = (catId: string) => {
    setCatsRecolhidas((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

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

  // Filtra categorias e contas pela natureza ativa (pagar = despesa, receber = receita, aporte = caixinhas)
  const catsFiltradas = cats.filter((c) => c.natureza === natureza);
  const catMap = new Map(cats.map((c) => [c.id, c]));

  // Contas da natureza ativa
  const contasDaNatureza = cs.filter((c) => c.natureza === natureza);

  // Helpers de valores projetados e realizados
  const getProjContaMes = (contaId: string, m: number) => {
    const p = ps.find((x) => x.contaId === contaId && x.mes === m);
    return { valor: p?.valor || 0, obs: p?.obs || "" };
  };

  const getRealContaMes = (contaId: string, m: number) => {
    const lancs = ls.filter((l) => l.contaId === contaId && l.mes === m);
    return lancs.reduce((acc, l) => acc + l.valor, 0);
  };

  const getMetaCatMes = (catId: string, m: number) => {
    const contasDaCat = cs.filter((c) => c.categoriaId === catId);
    return contasDaCat.reduce((sum, c) => sum + getProjContaMes(c.id, m).valor, 0);
  };

  const getRealCatMes = (catId: string, m: number) => {
    const contasDaCat = cs.filter((c) => c.categoriaId === catId);
    return contasDaCat.reduce((sum, c) => sum + getRealContaMes(c.id, m), 0);
  };

  // Totais orçamentários do mês
  const totalProjMes = catsFiltradas.reduce((s, cat) => s + getMetaCatMes(cat.id, mesAtivo), 0);
  const totalRealMes = catsFiltradas.reduce((s, cat) => s + getRealCatMes(cat.id, mesAtivo), 0);
  const pctConsumoTotal = totalProjMes > 0 ? Math.round((totalRealMes / totalProjMes) * 100) : 0;

  // Ação: Lançar Nova Projeção
  const salvarNovaProjecao = async () => {
    if (!ano || !empId) return;
    if (!novaProjContaId) {
      toast.warn("Selecione a conta para projetar.");
      return;
    }
    const limpo = novaProjValorStr.replace(/\D/g, "");
    const centavos = limpo ? parseInt(limpo, 10) : 0;
    if (centavos <= 0) {
      toast.warn("Informe um valor maior que zero.");
      return;
    }

    if (novaProjDistribuicao === "todos_meses") {
      // Aplica o valor em todos os 12 meses
      for (let m = 0; m < 12; m++) {
        await projecoes.set(ano.id, novaProjContaId, m, centavos, novaProjObs || undefined);
      }
      toast.success(`Projeção de ${money(centavos)}/mês aplicada para todos os 12 meses!`);
    } else if (novaProjDistribuicao === "mes_ativo") {
      // Aplica apenas no mês ativo
      await projecoes.set(ano.id, novaProjContaId, mesAtivo, centavos, novaProjObs || undefined);
      toast.success(`Projeção de ${money(centavos)} salva para ${MONTHS[mesAtivo]}!`);
    } else if (novaProjDistribuicao === "mes_especifico") {
      // Aplica no mês específico escolhido
      await projecoes.set(ano.id, novaProjContaId, novaProjMesEsp, centavos, novaProjObs || undefined);
      toast.success(`Projeção de ${money(centavos)} salva para ${MONTHS[novaProjMesEsp]}!`);
    } else if (novaProjDistribuicao === "parcelado") {
      // Parcela a partir do mês ativo por N meses
      const qtd = Math.max(1, Math.min(12, novaProjParcelas));
      for (let i = 0; i < qtd; i++) {
        const m = mesAtivo + i;
        if (m < 12) {
          const obsParc = `Parcela ${i + 1}/${qtd}${novaProjObs ? ` - ${novaProjObs}` : ""}`;
          await projecoes.set(ano.id, novaProjContaId, m, centavos, obsParc);
        }
      }
      toast.success(`Projeção parcelada em ${qtd}x de ${money(centavos)} a partir de ${MONTHS[mesAtivo]}!`);
    }

    setModalNovaProjecao(false);
    setNovaProjValorStr("");
    setNovaProjObs("");
  };

  // Ação: Salvar Edição da Conta
  const salvarEdicaoConta = async (aplicarAnoTodo: boolean) => {
    if (!ano || !contaEdicao) return;
    const limpo = contaEdicao.novoValorStr.replace(/\D/g, "");
    const centavos = limpo ? parseInt(limpo, 10) : 0;

    if (aplicarAnoTodo) {
      for (let m = 0; m < 12; m++) {
        await projecoes.set(ano.id, contaEdicao.conta.id, m, centavos, contaEdicao.obs || undefined);
      }
      toast.success(`Projeção de ${money(centavos)} aplicada aos 12 meses de ${contaEdicao.conta.nome}!`);
    } else {
      await projecoes.set(ano.id, contaEdicao.conta.id, mesAtivo, centavos, contaEdicao.obs || undefined);
      toast.success(`Projeção de ${contaEdicao.conta.nome} atualizada em ${MONTHS[mesAtivo]}!`);
    }
    setContaEdicao(null);
  };

  // Ação: Zerar Conta
  const zerarConta = async (conta: Conta) => {
    if (!ano) return;
    const ok = await confirmarAcao({
      titulo: "Zerar Projeções",
      mensagem: `Deseja zerar as projeções de "${conta.nome}" em todos os 12 meses de ${anoNum}?`,
      rotuloConfirmar: "Zerar Conta",
      tipo: "danger",
    });
    if (ok) {
      for (let m = 0; m < 12; m++) {
        await projecoes.set(ano.id, conta.id, m, 0);
      }
      toast.success(`Projeções de ${conta.nome} zeradas.`);
      setContaEdicao(null);
    }
  };

  // Ação: Replicar Projeções de um Mês para Outros
  const executarReplicacaoMes = async () => {
    if (!ano) return;
    const fator = 1 + percReajuste / 100;
    let totalAlterados = 0;

    for (const c of cs) {
      const orig = getProjContaMes(c.id, mesOrigemRep);
      if (orig.valor > 0) {
        const novoValor = Math.round(orig.valor * fator);
        // Aplica para todos os meses posteriores ao mês de origem
        for (let m = mesOrigemRep + 1; m < 12; m++) {
          await projecoes.set(ano.id, c.id, m, novoValor, orig.obs);
          totalAlterados++;
        }
      }
    }
    toast.success(`Replicado com sucesso! ${totalAlterados} projeções atualizadas.`);
    setModalReplicacao(false);
  };

  const abrirNovaProjecaoComNatureza = (nat: Natureza) => {
    setNovaProjNat(nat);
    const primeira = cs.find((c) => c.natureza === nat);
    setNovaProjContaId(primeira ? primeira.id : "");
    setNovaProjValorStr("");
    setNovaProjObs("");
    setModalNovaProjecao(true);
  };

  return (
    <div style="display:flex;flex-direction:column;gap:12px;padding-bottom:70px;">
      {/* 1. Barra de Ações Rápidas do Topo: Novo Lançamento de Meta & Replicar */}
      <div style="display:flex;align-items:center;gap:8px;">
        <button
          type="button"
          class="btn btn--primary"
          style="flex:1;min-height:42px;border-radius:14px;font-size:0.82rem;font-weight:800;gap:6px;"
          onClick={() => abrirNovaProjecaoComNatureza(natureza)}
        >
          <Icon name="plus" /> Lançar Nova Projeção
        </button>

        <button
          type="button"
          class="btn btn--secondary"
          style="min-height:42px;border-radius:14px;font-size:0.80rem;padding:0 12px;gap:6px;"
          onClick={() => setModalReplicacao(true)}
          title="Replicar orçamento"
        >
          <Icon name="refresh" style="width:14px;height:14px;" />
          Replicar
        </button>
      </div>

      {/* 2. Navegador de Mês */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "8px 12px",
        }}
      >
        <button
          type="button"
          class="btn btn--ghost btn--icon btn--sm"
          disabled={mesAtivo === 0}
          onClick={() => setMesAtivo((prev) => Math.max(0, prev - 1))}
        >
          <Icon name="arrowLeft" style="width:16px;height:16px;" />
        </button>

        <div style="text-align:center;">
          <h2 style="font-size:0.95rem;font-weight:800;margin:0;color:var(--text);">
            {MONTHS[mesAtivo]} de {anoNum}
          </h2>
          <span style="font-size:0.70rem;color:var(--text-muted);">
            {natureza === "pagar" ? "Planejamento de Despesas" : natureza === "receber" ? "Metas de Receitas" : "Aportes em Reservas"}
          </span>
        </div>

        <button
          type="button"
          class="btn btn--ghost btn--icon btn--sm"
          disabled={mesAtivo === 11}
          onClick={() => setMesAtivo((prev) => Math.min(11, prev + 1))}
        >
          <Icon name="chevron" style="transform:rotate(-90deg);width:16px;height:16px;" />
        </button>
      </div>

      {/* Chips de Meses Compactos */}
      <div class="hscroll" style="padding-bottom:2px;gap:3px;">
        {MESES_ABREV.map((m, idx) => (
          <button
            key={m}
            type="button"
            class={`chip ${mesAtivo === idx ? "is-active" : ""}`}
            onClick={() => setMesAtivo(idx)}
          >
            {m}
          </button>
        ))}
      </div>

      {/* 3. Alternador de Natureza (Despesas / Receitas / Aportes) */}
      <div class="mobile-segmented" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:0;">
        <button
          type="button"
          class={`mobile-segmented__btn ${natureza === "pagar" ? "is-active-out" : ""}`}
          onClick={() => setNatureza("pagar")}
        >
          <Icon name="arrowUp" style="width:14px;height:14px;" /> Despesas
        </button>
        <button
          type="button"
          class={`mobile-segmented__btn ${natureza === "receber" ? "is-active-in" : ""}`}
          onClick={() => setNatureza("receber")}
        >
          <Icon name="arrowDown" style="width:14px;height:14px;" /> Receitas
        </button>
        <button
          type="button"
          class={`mobile-segmented__btn ${natureza === "aporte" ? "is-active" : ""}`}
          onClick={() => setNatureza("aporte")}
        >
          <Icon name="wallet" style="width:14px;height:14px;" /> Aportes
        </button>
      </div>

      {/* 4. Hero Card do Orçamento do Mês */}
      <section class="bank-hero-card" aria-label="Orçamento do Mês">
        <div class="bank-hero-card__header">
          <div class="bank-hero-card__title">
            <Icon name="grid" />
            <span>{natureza === "pagar" ? "Teto Orçamentário" : natureza === "receber" ? "Meta de Receitas" : "Meta de Aportes"}</span>
          </div>
          <span
            class="badge"
            style={{
              background: pctConsumoTotal > 100 ? "var(--out-soft)" : "var(--primary-soft)",
              color: pctConsumoTotal > 100 ? "var(--out)" : "var(--primary)",
              fontWeight: "700",
              fontSize: "0.70rem",
            }}
          >
            {pctConsumoTotal}% do previsto
          </span>
        </div>

        <div class="bank-hero-card__value">
          {moneyPrivacidade(totalRealMes)}
        </div>

        <div class="bank-hero-card__meta-row">
          <div class="bank-hero-card__meta-item">
            <span class="bank-hero-card__meta-label">Projetado (Meta)</span>
            <span class="bank-hero-card__meta-val" style="color:var(--text);">
              {moneyPrivacidade(totalProjMes)}
            </span>
          </div>
          <div class="bank-hero-card__meta-item" style="text-align:right;">
            <span class="bank-hero-card__meta-label">
              {natureza === "pagar" ? "Saldo Restante" : "Falta Receber"}
            </span>
            <span
              class="bank-hero-card__meta-val"
              style={{
                color: totalProjMes - totalRealMes >= 0 ? "var(--in)" : "var(--out)",
              }}
            >
              {moneyPrivacidade(Math.abs(totalProjMes - totalRealMes))}
            </span>
          </div>
        </div>

        {/* Barra de Progresso Geral */}
        <div style="height:6px;border-radius:3px;background:var(--surface-soft);overflow:hidden;margin-top:2px;">
          <div
            style={{
              height: "100%",
              borderRadius: "3px",
              background: pctConsumoTotal > 100 ? "var(--out)" : pctConsumoTotal >= 80 ? "var(--warn)" : "var(--in)",
              width: `${Math.min(100, pctConsumoTotal)}%`,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </section>

      {/* 5. Campo de Busca Rápida de Contas */}
      <div style="position:relative;">
        <input
          type="search"
          class="input"
          placeholder="Buscar conta ou categoria..."
          value={busca}
          onInput={(e) => setBusca((e.currentTarget as HTMLInputElement).value)}
          style="border-radius:14px;padding-left:36px;min-height:40px;background:var(--surface);font-size:0.80rem;"
        />
        <Icon
          name="search"
          style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:14px;height:14px;color:var(--text-muted);pointer-events:none;"
        />
      </div>

      {/* 6. Listagem de Contas por Categoria */}
      <div style="display:flex;flex-direction:column;gap:10px;">
        {catsFiltradas.length === 0 ? (
          <div class="card empty" style="border-radius:16px;padding:24px;">
            <Icon name="grid" />
            <h3 style="font-size:0.92rem;font-weight:700;margin:0;">Nenhuma categoria nesta natureza</h3>
            <p style="font-size:0.75rem;color:var(--text-muted);margin:4px 0 12px;">
              Crie categorias e contas na aba Ajustes para gerenciar seu orçamento.
            </p>
            <a href="#/ajustes" class="btn btn--primary btn--sm" style="text-decoration:none;">
              Ir para Ajustes
            </a>
          </div>
        ) : (
          catsFiltradas.map((cat) => {
            const contasDaCat = cs.filter((c) => c.categoriaId === cat.id);
            const contasFiltradasBusca = contasDaCat.filter((c) => {
              if (!busca.trim()) return true;
              const q = busca.toLowerCase();
              return c.nome.toLowerCase().includes(q) || cat.nome.toLowerCase().includes(q);
            });

            if (busca.trim() && contasFiltradasBusca.length === 0) return null;

            const totalCatProj = getMetaCatMes(cat.id, mesAtivo);
            const totalCatReal = getRealCatMes(cat.id, mesAtivo);
            const pctCat = totalCatProj > 0 ? Math.round((totalCatReal / totalCatProj) * 100) : 0;
            const isRecolhida = catsRecolhidas.has(cat.id);

            return (
              <div
                key={cat.id}
                class="card"
                style="border-radius:16px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);"
              >
                {/* Cabeçalho da Categoria com Acordeom */}
                <div
                  style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;"
                  onClick={() => toggleCatRecolhida(cat.id)}
                >
                  <div style="display:flex;align-items:center;gap:8px;">
                    <Icon
                      name="chevron"
                      style={`width:12px;height:12px;color:var(--text-muted);transition:transform var(--t-fast);${isRecolhida ? "transform:rotate(-90deg);" : ""}`}
                    />
                    <strong style="color:var(--text);font-size:0.88rem;">{cat.nome}</strong>
                    <span style="font-size:0.70rem;color:var(--text-muted);">
                      ({contasDaCat.length})
                    </span>
                  </div>

                  <div style="text-align:right;">
                    <div style="font-size:0.82rem;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;">
                      {moneyPrivacidade(totalCatReal)}
                    </div>
                    <div style="font-size:0.68rem;color:var(--text-muted);">
                      Meta: {moneyPrivacidade(totalCatProj)}
                    </div>
                  </div>
                </div>

                {/* Barra de Progresso da Categoria */}
                <div style="height:4px;border-radius:2px;background:var(--surface-soft);overflow:hidden;margin:8px 0;">
                  <div
                    style={{
                      height: "100%",
                      borderRadius: "2px",
                      background: pctCat > 100 ? "var(--out)" : pctCat >= 80 ? "var(--warn)" : "var(--primary)",
                      width: `${Math.min(100, pctCat)}%`,
                    }}
                  />
                </div>

                {/* Lista de Contas da Categoria (se não estiver recolhida) */}
                {!isRecolhida && (
                  <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
                    {contasFiltradasBusca.length === 0 ? (
                      <div style="font-size:0.72rem;color:var(--text-muted);padding:4px 0;">
                        Nenhuma conta cadastrada nesta categoria.
                      </div>
                    ) : (
                      contasFiltradasBusca.map((c) => {
                        const proj = getProjContaMes(c.id, mesAtivo);
                        const real = getRealContaMes(c.id, mesAtivo);
                        const pctConta = proj.valor > 0 ? Math.round((real / proj.valor) * 100) : 0;
                        const excedeu = proj.valor > 0 && real > proj.valor;

                        return (
                          <div
                            key={c.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "8px 10px",
                              background: "var(--surface-soft)",
                              borderRadius: "10px",
                              cursor: "pointer",
                              transition: "background var(--t-fast)",
                            }}
                            onClick={() =>
                              setContaEdicao({
                                conta: c,
                                categoriaNome: cat.nome,
                                valorAtualCentavos: proj.valor,
                                novoValorStr: proj.valor ? (proj.valor / 100).toFixed(2).replace(".", ",") : "",
                                obs: proj.obs,
                              })
                            }
                          >
                            <div style="flex:1;min-width:0;padding-right:8px;">
                              <div style="font-size:0.80rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                {c.nome}
                              </div>
                              <div style="font-size:0.68rem;color:var(--text-muted);display:flex;gap:6px;">
                                <span>Real: <strong style={{ color: excedeu ? "var(--out)" : "inherit" }}>{moneyPrivacidade(real)}</strong></span>
                                {proj.obs && <span>• <i>{proj.obs}</i></span>}
                              </div>
                            </div>

                            <div style="text-align:right;flex-shrink:0;">
                              <div style="font-size:0.82rem;font-weight:800;color:var(--primary);font-variant-numeric:tabular-nums;">
                                {money(proj.valor)}
                              </div>
                              <span
                                style={{
                                  fontSize: "0.64rem",
                                  fontWeight: "700",
                                  color: excedeu ? "var(--out)" : pctConta >= 80 ? "var(--warn)" : "var(--text-muted)",
                                }}
                              >
                                {proj.valor > 0 ? `${pctConta}%` : "Sem meta"}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* =========================================================================
          BOTTOM SHEET: LANÇAR NOVA PROJEÇÃO
          ========================================================================= */}
      {modalNovaProjecao && (
        <div class="modal-backdrop" onClick={() => setModalNovaProjecao(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Lançar Nova Projeção</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalNovaProjecao(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              {/* Natureza */}
              <label class="form-label">Natureza</label>
              <div class="mobile-segmented" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:0;">
                <button
                  type="button"
                  class={`mobile-segmented__btn ${novaProjNat === "pagar" ? "is-active-out" : ""}`}
                  onClick={() => {
                    setNovaProjNat("pagar");
                    const p = cs.find((c) => c.natureza === "pagar");
                    setNovaProjContaId(p ? p.id : "");
                  }}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  class={`mobile-segmented__btn ${novaProjNat === "receber" ? "is-active-in" : ""}`}
                  onClick={() => {
                    setNovaProjNat("receber");
                    const p = cs.find((c) => c.natureza === "receber");
                    setNovaProjContaId(p ? p.id : "");
                  }}
                >
                  Receita
                </button>
                <button
                  type="button"
                  class={`mobile-segmented__btn ${novaProjNat === "aporte" ? "is-active" : ""}`}
                  onClick={() => {
                    setNovaProjNat("aporte");
                    const p = cs.find((c) => c.natureza === "aporte");
                    setNovaProjContaId(p ? p.id : "");
                  }}
                >
                  Aporte
                </button>
              </div>

              {/* Seletor de Conta */}
              <label class="form-label">Conta a Projetar</label>
              <select
                class="select"
                value={novaProjContaId}
                onChange={(e) => setNovaProjContaId((e.currentTarget as HTMLSelectElement).value)}
                style="border-radius:14px;min-height:42px;"
              >
                {cs
                  .filter((c) => c.natureza === novaProjNat)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({catMap.get(c.categoriaId)?.nome || "Geral"})
                    </option>
                  ))}
              </select>

              {/* Modo de Distribuição */}
              <label class="form-label">Distribuição do Valor</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <button
                  type="button"
                  class={`card card--interactive ${novaProjDistribuicao === "todos_meses" ? "is-active" : ""}`}
                  style={{
                    padding: "10px",
                    borderRadius: "12px",
                    textAlign: "center",
                    border: novaProjDistribuicao === "todos_meses" ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: novaProjDistribuicao === "todos_meses" ? "var(--primary-soft)" : "var(--surface)",
                  }}
                  onClick={() => setNovaProjDistribuicao("todos_meses")}
                >
                  <strong style="font-size:0.78rem;color:var(--text);display:block;">Todos os Meses</strong>
                  <span style="font-size:0.65rem;color:var(--text-muted);">Repetir o ano todo</span>
                </button>

                <button
                  type="button"
                  class={`card card--interactive ${novaProjDistribuicao === "mes_ativo" ? "is-active" : ""}`}
                  style={{
                    padding: "10px",
                    borderRadius: "12px",
                    textAlign: "center",
                    border: novaProjDistribuicao === "mes_ativo" ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: novaProjDistribuicao === "mes_ativo" ? "var(--primary-soft)" : "var(--surface)",
                  }}
                  onClick={() => setNovaProjDistribuicao("mes_ativo")}
                >
                  <strong style="font-size:0.78rem;color:var(--text);display:block;">Apenas {MESES_ABREV[mesAtivo]}</strong>
                  <span style="font-size:0.65rem;color:var(--text-muted);">Neste mês ativo</span>
                </button>

                <button
                  type="button"
                  class={`card card--interactive ${novaProjDistribuicao === "parcelado" ? "is-active" : ""}`}
                  style={{
                    padding: "10px",
                    borderRadius: "12px",
                    textAlign: "center",
                    border: novaProjDistribuicao === "parcelado" ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: novaProjDistribuicao === "parcelado" ? "var(--primary-soft)" : "var(--surface)",
                  }}
                  onClick={() => setNovaProjDistribuicao("parcelado")}
                >
                  <strong style="font-size:0.78rem;color:var(--text);display:block;">Parcelado</strong>
                  <span style="font-size:0.65rem;color:var(--text-muted);">Em N parcelas</span>
                </button>

                <button
                  type="button"
                  class={`card card--interactive ${novaProjDistribuicao === "mes_especifico" ? "is-active" : ""}`}
                  style={{
                    padding: "10px",
                    borderRadius: "12px",
                    textAlign: "center",
                    border: novaProjDistribuicao === "mes_especifico" ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: novaProjDistribuicao === "mes_especifico" ? "var(--primary-soft)" : "var(--surface)",
                  }}
                  onClick={() => setNovaProjDistribuicao("mes_especifico")}
                >
                  <strong style="font-size:0.78rem;color:var(--text);display:block;">Mês Específico</strong>
                  <span style="font-size:0.65rem;color:var(--text-muted);">Escolher o mês</span>
                </button>
              </div>

              {/* Configurações adicionais de parcelamento ou mês específico */}
              {novaProjDistribuicao === "parcelado" && (
                <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface-soft);padding:10px 14px;border-radius:12px;">
                  <span style="font-size:0.80rem;font-weight:700;">Quantidade de Meses:</span>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <button
                      type="button"
                      class="btn btn--secondary btn--sm"
                      onClick={() => setNovaProjParcelas((p) => Math.max(2, p - 1))}
                    >
                      -
                    </button>
                    <strong style="font-size:0.95rem;width:24px;text-align:center;">{novaProjParcelas}x</strong>
                    <button
                      type="button"
                      class="btn btn--secondary btn--sm"
                      onClick={() => setNovaProjParcelas((p) => Math.min(12, p + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {novaProjDistribuicao === "mes_especifico" && (
                <div>
                  <label class="form-label">Escolha o Mês</label>
                  <select
                    class="select"
                    value={novaProjMesEsp}
                    onChange={(e) => setNovaProjMesEsp(Number((e.currentTarget as HTMLSelectElement).value))}
                    style="border-radius:14px;min-height:42px;"
                  >
                    {MONTHS.map((m, idx) => (
                      <option key={m} value={idx}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Caixa de Entrada de Valor */}
              <div class="mobile-amount-box" style="margin-bottom:0;">
                <span class="mobile-amount-box__label">Valor Previsto</span>
                <div class="mobile-amount-box__input-row">
                  <span class="mobile-amount-box__currency">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    class="mobile-amount-box__input"
                    placeholder="0,00"
                    value={novaProjValorStr}
                    onInput={(e) => setNovaProjValorStr((e.currentTarget as HTMLInputElement).value)}
                    autoFocus
                  />
                </div>
              </div>

              {/* Observação */}
              <label class="form-label">Observação (Opcional)</label>
              <input
                type="text"
                class="input"
                placeholder="Ex: Contrato reajustado, meta semestral"
                value={novaProjObs}
                onInput={(e) => setNovaProjObs((e.currentTarget as HTMLInputElement).value)}
                style="border-radius:14px;min-height:40px;font-size:0.80rem;"
              />
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:46px;border-radius:14px;font-weight:800;"
                onClick={salvarNovaProjecao}
              >
                Salvar Projeção
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          BOTTOM SHEET: EDIÇÃO RÁPIDA DA CONTA
          ========================================================================= */}
      {contaEdicao && (
        <div class="modal-backdrop" onClick={() => setContaEdicao(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">{contaEdicao.conta.nome}</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setContaEdicao(null)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <div style="font-size:0.75rem;color:var(--text-muted);">
                Categoria: <strong>{contaEdicao.categoriaNome}</strong> • Mês de <strong>{MONTHS[mesAtivo]}</strong>
              </div>

              <div class="mobile-amount-box" style="margin-bottom:0;">
                <span class="mobile-amount-box__label">Valor Planejado para {MESES_ABREV[mesAtivo]}</span>
                <div class="mobile-amount-box__input-row">
                  <span class="mobile-amount-box__currency">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    class="mobile-amount-box__input"
                    placeholder="0,00"
                    value={contaEdicao.novoValorStr}
                    onInput={(e) =>
                      setContaEdicao({
                        ...contaEdicao,
                        novoValorStr: (e.currentTarget as HTMLInputElement).value,
                      })
                    }
                    autoFocus
                  />
                </div>
              </div>

              <label class="form-label">Observação do Mês</label>
              <input
                type="text"
                class="input"
                placeholder="Ex: Pagamento anual em dobro"
                value={contaEdicao.obs}
                onInput={(e) => setContaEdicao({ ...contaEdicao, obs: (e.currentTarget as HTMLInputElement).value })}
                style="border-radius:14px;min-height:40px;font-size:0.80rem;"
              />

              <div style="display:flex;gap:8px;margin-top:6px;">
                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  style="flex:1;min-height:40px;font-size:0.75rem;"
                  onClick={() => salvarEdicaoConta(true)}
                  title="Aplica este mesmo valor em todos os 12 meses"
                >
                  <Icon name="refresh" style="width:12px;height:12px;" />
                  Repetir p/ Ano Todo
                </button>

                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  style="color:var(--out);min-height:40px;font-size:0.75rem;"
                  onClick={() => zerarConta(contaEdicao.conta)}
                  title="Zerar todos os meses desta conta"
                >
                  <Icon name="trash" style="width:12px;height:12px;" />
                  Zerar Conta
                </button>
              </div>
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:46px;border-radius:14px;font-weight:800;"
                onClick={() => salvarEdicaoConta(false)}
              >
                Salvar para {MONTHS[mesAtivo]}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          BOTTOM SHEET: REPLICAR PROJEÇÕES
          ========================================================================= */}
      {modalReplicacao && (
        <div class="modal-backdrop" onClick={() => setModalReplicacao(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Replicar Orçamento</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalReplicacao(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <p style="font-size:0.80rem;color:var(--text-muted);margin:0;">
                Copie os valores planejados de um mês para os meses seguintes com ajuste opcional:
              </p>

              <label class="form-label">Mês de Origem (Base)</label>
              <select
                class="select"
                value={mesOrigemRep}
                onChange={(e) => setMesOrigemRep(Number((e.currentTarget as HTMLSelectElement).value))}
                style="border-radius:14px;min-height:42px;"
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx}>
                    {m}
                  </option>
                ))}
              </select>

              <label class="form-label">Reajuste Percentual (%)</label>
              <input
                type="number"
                class="input"
                placeholder="0"
                value={percReajuste}
                onInput={(e) => setPercReajuste(Number((e.currentTarget as HTMLInputElement).value))}
                style="border-radius:14px;min-height:42px;font-size:1.1rem;font-weight:700;"
              />
              <span style="font-size:0.68rem;color:var(--text-muted);">
                Ex: 5 para inflação de 5%, ou 0 para manter os mesmos valores.
              </span>
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:46px;border-radius:14px;font-weight:800;"
                onClick={executarReplicacaoMes}
              >
                Replicar para os Próximos Meses
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

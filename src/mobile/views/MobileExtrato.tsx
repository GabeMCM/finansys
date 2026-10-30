import { useState } from "react";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { anos, categorias, contas, contasBancarias, lancamentos } from "../../data/repo.ts";
import type { Conta, Lancamento, Natureza } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { MONTHS, signedPrivacidade } from "../../lib/format.ts";
import { NATURE_META } from "../../lib/natureza.ts";
import { anoAtivo, empresaAtiva } from "../../state.ts";
import { useSignal } from "../../lib/signal.ts";

function formatarDataCabecalho(isoDate: string): string {
  if (!isoDate) return "";
  const [yyyy, mm, dd] = isoDate.split("-");
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);

  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";

  return `${Number(dd)} de ${MONTHS[Number(mm) - 1]}`;
}

export function MobileExtrato({ onOpenNovo }: { onOpenNovo: () => void }) {
  const empId = useSignal(empresaAtiva);
  const anoNum = useSignal(anoAtivo);

  const [busca, setBusca] = useState<string>("");
  const [filtroNat, setFiltroNat] = useState<"todas" | Natureza>("todas");
  const [mesAtivo, setMesAtivo] = useState<number | "todos">(new Date().getMonth());
  const [txSelecionada, setTxSelecionada] = useState<Lancamento | null>(null);

  // Estados de Edição
  const [txEmEdicao, setTxEmEdicao] = useState<boolean>(false);
  const [editValorStr, setEditValorStr] = useState<string>("");
  const [editDescricao, setEditDescricao] = useState<string>("");
  const [editData, setEditData] = useState<string>("");
  const [editContaId, setEditContaId] = useState<string>("");
  const [editBancoId, setEditBancoId] = useState<string>("");
  const [editObs, setEditObs] = useState<string>("");

  const iniciarEdicao = (l: Lancamento) => {
    setEditValorStr((l.valor / 100).toFixed(2).replace(".", ","));
    setEditDescricao(l.descricao || "");
    setEditData(l.data);
    setEditContaId(l.contaId);
    setEditBancoId(l.bancoId || "");
    setEditObs(l.obs || "");
    setTxEmEdicao(true);
  };

  const salvarEdicao = async () => {
    if (!txSelecionada) return;
    const limpo = editValorStr.replace(/\D/g, "");
    const centavos = limpo ? parseInt(limpo, 10) : 0;
    if (centavos <= 0) {
      toast.warn("Informe um valor maior que zero.");
      return;
    }
    const mes = parseInt(editData.split("-")[1], 10) - 1;

    await lancamentos.update(txSelecionada.id, {
      valor: centavos,
      descricao: editDescricao.trim() || undefined,
      data: editData,
      mes,
      contaId: editContaId,
      bancoId: editBancoId || undefined,
      obs: editObs.trim() || undefined,
    });

    toast.success("Lançamento atualizado com sucesso!");
    setTxEmEdicao(false);
    setTxSelecionada(null);
  };

  const dados = useLive(async () => {
    if (!empId) return null;
    const ano = await anos.find(empId, anoNum);
    if (!ano) return null;
    const [cs, ls, cats, bancos] = await Promise.all([
      contas.byEmpresa(empId),
      lancamentos.byAno(ano.id),
      categorias.byEmpresa(empId),
      contasBancarias.byEmpresa(empId),
    ]);
    return { ano, cs, ls, cats, bancos };
  }, [empId, anoNum], null);

  const cs = dados?.cs || [];
  const ls = dados?.ls || [];
  const cats = dados?.cats || [];
  const bancos = dados?.bancos || [];

  const contaMap = new Map<string, Conta>(cs.map((c) => [c.id, c]));
  const catMap = new Map<string, string>(cats.map((c) => [c.id, c.nome]));
  const bancoMap = new Map<string, string>(bancos.map((b) => [b.id, b.nome]));

  // Filtra lançamentos
  const filtrados = ls.filter((l) => {
    const c = contaMap.get(l.contaId);
    if (!c) return false;

    if (mesAtivo !== "todos" && l.mes !== mesAtivo) return false;
    if (filtroNat !== "todas" && c.natureza !== filtroNat) return false;

    if (busca.trim()) {
      const q = busca.toLowerCase();
      const nomeConta = c.nome.toLowerCase();
      const desc = (l.descricao || "").toLowerCase();
      const cat = (catMap.get(c.categoriaId) || "").toLowerCase();
      const val = (l.valor / 100).toFixed(2);
      if (!nomeConta.includes(q) && !desc.includes(q) && !cat.includes(q) && !val.includes(q)) {
        return false;
      }
    }

    return true;
  });

  // Agrupa por data em ordem decrescente
  const gruposPorData = new Map<string, Lancamento[]>();
  for (const l of filtrados) {
    const arr = gruposPorData.get(l.data) || [];
    arr.push(l);
    gruposPorData.set(l.data, arr);
  }

  const datasOrdenadas = Array.from(gruposPorData.keys()).sort((a, b) => b.localeCompare(a));

  const excluirTx = async (l: Lancamento) => {
    if (confirm("Deseja realmente excluir esta transação?")) {
      await lancamentos.remove(l.id);
      setTxSelecionada(null);
    }
  };

  return (
    <div style="display:flex;flex-direction:column;gap:12px;padding-bottom:70px;">
      {/* 1. Barra de Busca Nativa */}
      <div style="position:relative;">
        <input
          type="search"
          class="input"
          placeholder="Buscar transações, categorias ou valores..."
          value={busca}
          onInput={(e) => setBusca((e.currentTarget as HTMLInputElement).value)}
          style="border-radius:16px;padding-left:38px;min-height:44px;background:var(--surface);"
        />
        <Icon
          name="list"
          style="position:absolute;left:14px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--text-muted);pointer-events:none;"
        />
      </div>

      {/* 2. Chips Horizontais de Meses Compactos */}
      <div class="hscroll" style="padding-bottom:2px;gap:3px;">
        <button
          type="button"
          class={`chip ${mesAtivo === "todos" ? "is-active" : ""}`}
          onClick={() => setMesAtivo("todos")}
        >
          Ano Todo
        </button>
        {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((m, idx) => (
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

      {/* 3. Filtros Rápidos de Natureza */}
      <div class="hscroll" style="padding-bottom:4px;">
        <button
          type="button"
          class={`mobile-choice-chip ${filtroNat === "todas" ? "is-selected" : ""}`}
          onClick={() => setFiltroNat("todas")}
        >
          Todas
        </button>
        <button
          type="button"
          class={`mobile-choice-chip ${filtroNat === "saida" ? "is-selected" : ""}`}
          onClick={() => setFiltroNat("saida")}
        >
          <i class="dot" style="background:var(--out);" />
          Despesas
        </button>
        <button
          type="button"
          class={`mobile-choice-chip ${filtroNat === "receber" ? "is-selected" : ""}`}
          onClick={() => setFiltroNat("receber")}
        >
          <i class="dot" style="background:var(--in);" />
          Receitas
        </button>
        <button
          type="button"
          class={`mobile-choice-chip ${filtroNat === "aporte" ? "is-selected" : ""}`}
          onClick={() => setFiltroNat("aporte")}
        >
          <i class="dot" style="background:var(--primary);" />
          Aportes
        </button>
      </div>

      {/* 4. Lista do Extrato Agrupado por Data */}
      {datasOrdenadas.length === 0 ? (
        <div class="card" style="text-align:center;padding:36px 16px;border-radius:20px;color:var(--text-muted);">
          <Icon name="list" style="width:32px;height:32px;margin:0 auto 8px;display:block;" />
          <h3 style="font-size:0.95rem;margin:0 0 4px;color:var(--text);">Nenhuma transação</h3>
          <p style="font-size:0.80rem;margin:0;">Nenhum lançamento corresponde aos filtros selecionados.</p>
        </div>
      ) : (
        datasOrdenadas.map((dataStr) => {
          const itensDoDia = gruposPorData.get(dataStr) || [];
          return (
            <div key={dataStr} class="mobile-tx-group">
              <div class="mobile-tx-group__header">
                <span>{formatarDataCabecalho(dataStr)}</span>
              </div>

              {itensDoDia.map((l) => {
                const c = contaMap.get(l.contaId);
                if (!c) return null;
                const meta = NATURE_META[c.natureza];
                const isEntrada = c.natureza === "receber" || c.natureza === "aporte";
                const bancoNome = l.bancoId ? bancoMap.get(l.bancoId) : null;

                return (
                  <div
                    key={l.id}
                    class="mobile-tx-card"
                    onClick={() => setTxSelecionada(l)}
                    role="button"
                    tabIndex={0}
                  >
                    <div
                      class="mobile-tx-card__icon"
                      style={{
                        background: isEntrada ? "var(--in-soft)" : "var(--out-soft)",
                        color: isEntrada ? "var(--in)" : "var(--out)",
                      }}
                    >
                      <Icon name={isEntrada ? "arrowDown" : "arrowUp"} />
                    </div>

                    <div class="mobile-tx-card__main">
                      <div class="mobile-tx-card__title">
                        {l.descricao || c.nome}
                      </div>
                      <div class="mobile-tx-card__sub">
                        <span>{catMap.get(c.categoriaId) || "Geral"}</span>
                        {bancoNome && (
                          <>
                            <span>•</span>
                            <span>{bancoNome}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div class="mobile-tx-card__val">
                      <div
                        class="mobile-tx-card__amount"
                        style={{ color: isEntrada ? "var(--in)" : "var(--text)" }}
                      >
                        {signedPrivacidade(isEntrada ? l.valor : -l.valor)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}

      {/* Botão Flutuante (FAB) de Nova Transação */}
      <button
        type="button"
        class="fab"
        onClick={onOpenNovo}
        aria-label="Nova Transação"
        title="Nova Transação"
      >
        <Icon name="plus" />
      </button>

      {/* Bottom Sheet de Detalhes da Transação */}
      {txSelecionada && (() => {
        const c = contaMap.get(txSelecionada.contaId);
        const isEntrada = c?.natureza === "receber" || c?.natureza === "aporte";
        const bancoNome = txSelecionada.bancoId ? bancoMap.get(txSelecionada.bancoId) : null;

        if (txEmEdicao) {
          return (
            <div class="modal-backdrop" onClick={() => setTxEmEdicao(false)}>
              <div class="modal" onClick={(e) => e.stopPropagation()}>
                <div class="modal__head">
                  <h3 class="modal__title">Editar Transação</h3>
                  <button type="button" class="btn btn--ghost btn--icon" onClick={() => setTxEmEdicao(false)}>
                    <Icon name="x" />
                  </button>
                </div>

                <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
                  {/* Caixa de Valor */}
                  <div class="mobile-amount-box" style="margin-bottom:0;">
                    <span class="mobile-amount-box__label">Valor</span>
                    <div class="mobile-amount-box__input-row">
                      <span class="mobile-amount-box__currency">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        class="mobile-amount-box__input"
                        value={editValorStr.replace(",", ".")}
                        onInput={(e) => setEditValorStr((e.currentTarget as HTMLInputElement).value)}
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Descrição */}
                  <label class="form-label">Descrição</label>
                  <input
                    type="text"
                    class="input"
                    value={editDescricao}
                    onInput={(e) => setEditDescricao((e.currentTarget as HTMLInputElement).value)}
                    style="border-radius:14px;min-height:42px;"
                  />

                  {/* Conta Financeira */}
                  <label class="form-label">Conta</label>
                  <select
                    class="select"
                    value={editContaId}
                    onChange={(e) => setEditContaId((e.currentTarget as HTMLSelectElement).value)}
                    style="border-radius:14px;min-height:42px;"
                  >
                    {cs.map((conta) => (
                      <option key={conta.id} value={conta.id}>
                        {conta.nome} ({catMap.get(conta.categoriaId) || "Geral"})
                      </option>
                    ))}
                  </select>

                  {/* Data */}
                  <label class="form-label">Data</label>
                  <input
                    type="date"
                    class="input"
                    value={editData}
                    onChange={(e) => setEditData((e.currentTarget as HTMLInputElement).value)}
                    style="border-radius:14px;min-height:42px;"
                  />

                  {/* Banco / Carteira */}
                  <label class="form-label">Banco / Instituição</label>
                  <select
                    class="select"
                    value={editBancoId}
                    onChange={(e) => setEditBancoId((e.currentTarget as HTMLSelectElement).value)}
                    style="border-radius:14px;min-height:42px;"
                  >
                    <option value="">Nenhum banco associado</option>
                    {bancos.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nome}
                      </option>
                    ))}
                  </select>

                  {/* Observação */}
                  <label class="form-label">Observação (Opcional)</label>
                  <input
                    type="text"
                    class="input"
                    value={editObs}
                    onInput={(e) => setEditObs((e.currentTarget as HTMLInputElement).value)}
                    style="border-radius:14px;min-height:40px;font-size:0.80rem;"
                  />
                </div>

                <div class="modal__foot" style="display:flex;gap:8px;">
                  <button
                    type="button"
                    class="btn btn--secondary"
                    style="flex:1;min-height:46px;border-radius:14px;"
                    onClick={() => setTxEmEdicao(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    class="btn btn--primary"
                    style="flex:1;min-height:46px;border-radius:14px;font-weight:800;"
                    onClick={salvarEdicao}
                  >
                    Salvar Alterações
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div class="modal-backdrop" onClick={() => setTxSelecionada(null)}>
            <div class="modal" onClick={(e) => e.stopPropagation()}>
              <div class="modal__head">
                <h3 class="modal__title">Comprovante de Lançamento</h3>
                <button
                  type="button"
                  class="btn btn--ghost btn--icon"
                  onClick={() => setTxSelecionada(null)}
                >
                  <Icon name="x" />
                </button>
              </div>

              <div class="modal__body" style="display:flex;flex-direction:column;gap:14px;">
                <div style="text-align:center;padding:12px 0;">
                  <div
                    style={{
                      fontSize: "2.2rem",
                      fontWeight: "900",
                      color: isEntrada ? "var(--in)" : "var(--out)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {signedPrivacidade(isEntrada ? txSelecionada.valor : -txSelecionada.valor)}
                  </div>
                  <div style="font-size:1rem;font-weight:700;color:var(--text);margin-top:6px;">
                    {txSelecionada.descricao || c?.nome}
                  </div>
                  {txSelecionada.descricao && c?.nome && (
                    <div style="font-size:0.78rem;color:var(--text-muted);">{c.nome}</div>
                  )}
                </div>

                <div class="card" style="display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:16px;">
                  <div style="display:flex;justify-content:space-between;font-size:0.84rem;">
                    <span style="color:var(--text-muted);">Data:</span>
                    <strong>{txSelecionada.data.split("-").reverse().join("/")}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:0.84rem;">
                    <span style="color:var(--text-muted);">Categoria:</span>
                    <strong>{c ? catMap.get(c.categoriaId) || "Geral" : "Geral"}</strong>
                  </div>
                  {bancoNome && (
                    <div style="display:flex;justify-content:space-between;font-size:0.84rem;">
                      <span style="color:var(--text-muted);">Banco / Conta:</span>
                      <strong>{bancoNome}</strong>
                    </div>
                  )}
                  {txSelecionada.obs && (
                    <div style="padding-top:8px;border-top:1px solid var(--border-soft);font-size:0.80rem;color:var(--text-muted);">
                      <b>Obs:</b> {txSelecionada.obs}
                    </div>
                  )}
                </div>
              </div>

              <div class="modal__foot" style="display:flex;gap:10px;">
                <button
                  type="button"
                  class="btn btn--secondary"
                  style="min-height:46px;border-radius:14px;color:var(--out);padding:0 16px;"
                  onClick={() => excluirTx(txSelecionada)}
                  title="Excluir Lançamento"
                >
                  <Icon name="trash" />
                </button>
                <button
                  type="button"
                  class="btn btn--primary"
                  style="flex:1;min-height:46px;border-radius:14px;font-weight:800;"
                  onClick={() => iniciarEdicao(txSelecionada)}
                >
                  <Icon name="pencil" /> Editar Lançamento
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

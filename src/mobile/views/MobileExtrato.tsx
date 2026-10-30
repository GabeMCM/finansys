import { useState } from "react";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { CardPendencias } from "../../components/lancamento/CardPendencias.tsx";
import { calcularPendencias, type ProjecaoPendente } from "../../data/calc.ts";
import { anos, categorias, contas, contasBancarias, lancamentos, projecoes, reservaMovimentos, reservas } from "../../data/repo.ts";
import { FORMAS_PAGAMENTO_PADRAO, type Conta, type Lancamento, type Natureza, type Reserva } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { money, MONTHS, signedPrivacidade } from "../../lib/format.ts";
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
  const [modalQuitarPendencia, setModalQuitarPendencia] = useState<ProjecaoPendente | null>(null);
  const [quitarBancoId, setQuitarBancoId] = useState<string>("");

  // Estados de Edição
  const [txEmEdicao, setTxEmEdicao] = useState<boolean>(false);
  const [editValorStr, setEditValorStr] = useState<string>("");
  const [editDescricao, setEditDescricao] = useState<string>("");
  const [editData, setEditData] = useState<string>("");
  const [editContaId, setEditContaId] = useState<string>("");
  const [editBancoId, setEditBancoId] = useState<string>("");
  const [editFormaPagamento, setEditFormaPagamento] = useState<string>("PIX");
  const [editReservaId, setEditReservaId] = useState<string>("");
  const [editObs, setEditObs] = useState<string>("");

  const iniciarEdicao = (l: Lancamento) => {
    setEditValorStr((l.valor / 100).toFixed(2).replace(".", ","));
    setEditDescricao(l.descricao || "");
    setEditData(l.data);
    setEditContaId(l.contaId);
    setEditBancoId(l.bancoId || "");
    setEditFormaPagamento(l.formaPagamento || "PIX");
    setEditReservaId(l.reservaId || "");
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

    const cConta = contaMap.get(editContaId);
    const nat = cConta?.natureza || txSelecionada.tipoReserva || "saida";
    const tipoRes = editReservaId
      ? (nat === "saida" || nat === "pagar" ? "aporte" : "resgate")
      : undefined;

    await lancamentos.update(txSelecionada.id, {
      valor: centavos,
      descricao: editDescricao.trim() || undefined,
      data: editData,
      mes,
      contaId: editContaId,
      bancoId: editBancoId || undefined,
      formaPagamento: editFormaPagamento || undefined,
      reservaId: editReservaId || undefined,
      tipoReserva: tipoRes,
      obs: editObs.trim() || undefined,
    });

    // Sincroniza com reservaMovimentos
    const movVinculado = await reservaMovimentos.byLancamento(txSelecionada.id);
    if (editReservaId && tipoRes && empId && ano) {
      if (movVinculado) {
        await reservaMovimentos.update(movVinculado.id, {
          reservaId: editReservaId,
          tipo: tipoRes,
          valor: centavos,
          data: editData,
          mes,
          contaId: editContaId,
          bancoId: editBancoId || undefined,
          obs: editDescricao || editObs || undefined,
        });
      } else {
        await reservaMovimentos.create({
          empresaId: empId,
          anoId: ano.id,
          reservaId: editReservaId,
          tipo: tipoRes,
          valor: centavos,
          data: editData,
          mes,
          contaId: editContaId,
          bancoId: editBancoId || undefined,
          lancamentoId: txSelecionada.id,
          obs: editDescricao || editObs || undefined,
        });
      }
    } else if (movVinculado) {
      await reservaMovimentos.remove(movVinculado.id);
    }

    toast.success("Lançamento atualizado com sucesso!");
    setTxEmEdicao(false);
    setTxSelecionada(null);
  };

  const dados = useLive(async () => {
    if (!empId) return null;
    const ano = await anos.find(empId, anoNum);
    if (!ano) return null;
    const [cs, ls, cats, bancos, ps, resList] = await Promise.all([
      contas.byEmpresa(empId),
      lancamentos.byAno(ano.id),
      categorias.byEmpresa(empId),
      contasBancarias.byEmpresa(empId),
      projecoes.byAno(ano.id),
      reservas.byEmpresa(empId),
    ]);
    return { ano, cs, ls, cats, bancos, ps, resList };
  }, [empId, anoNum], null);

  const cs = dados?.cs || [];
  const ls = dados?.ls || [];
  const cats = dados?.cats || [];
  const bancos = dados?.bancos || [];
  const ps = dados?.ps || [];
  const resList = dados?.resList || [];
  const ano = dados?.ano;

  const contaMap = new Map<string, Conta>(cs.map((c) => [c.id, c]));
  const catMap = new Map<string, string>(cats.map((c) => [c.id, c.nome]));
  const bancoMap = new Map<string, string>(bancos.map((b) => [b.id, b.nome]));
  const resMap = new Map<string, string>(resList.map((r) => [r.id, r.nome]));

  // Calcula pendências financeiras (vencidas e a vencer)
  const pendencias = calcularPendencias(ps, ls, anoNum, mesAtivo);

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

      {/* 3.5. Card de Pendências Financeiras (Contas Vencidas e a Vencer) */}
      {pendencias.length > 0 && (
        <CardPendencias
          pendencias={pendencias}
          contas={cs}
          categorias={cats}
          mesFiltro={mesAtivo}
          onLancar={(p) => {
            setQuitarBancoId(bancos[0]?.id || "");
            setModalQuitarPendencia(p);
          }}
          onIgnorar={(_p) => {
            toast.info("Para ignorar projeções, acesse o painel completo de lançamentos.");
          }}
        />
      )}

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

                  {/* Forma de Pagamento */}
                  <label class="form-label">Forma de Pagamento</label>
                  <select
                    class="select"
                    value={editFormaPagamento}
                    onChange={(e) => setEditFormaPagamento((e.currentTarget as HTMLSelectElement).value)}
                    style="border-radius:14px;min-height:42px;"
                  >
                    {FORMAS_PAGAMENTO_PADRAO.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>

                  {/* Vínculo com Reserva / Caixinha */}
                  {resList.length > 0 && (
                    <>
                      <label class="form-label">Vínculo com Caixinha / Reserva</label>
                      <select
                        class="select"
                        value={editReservaId}
                        onChange={(e) => setEditReservaId((e.currentTarget as HTMLSelectElement).value)}
                        style="border-radius:14px;min-height:42px;"
                      >
                        <option value="">Nenhuma caixinha vinculada</option>
                        {resList.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nome}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

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
                  {txSelecionada.formaPagamento && (
                    <div style="display:flex;justify-content:space-between;font-size:0.84rem;">
                      <span style="color:var(--text-muted);">Forma de Pagamento:</span>
                      <strong>{txSelecionada.formaPagamento}</strong>
                    </div>
                  )}
                  {txSelecionada.reservaId && (
                    <div style="display:flex;justify-content:space-between;font-size:0.84rem;">
                      <span style="color:var(--text-muted);">Caixinha / Reserva:</span>
                      <strong style="color:var(--primary);">{resMap.get(txSelecionada.reservaId) || "Caixinha"}</strong>
                    </div>
                  )}
                  {txSelecionada.parcela && txSelecionada.totalParcelas && (
                    <div style="display:flex;justify-content:space-between;font-size:0.84rem;">
                      <span style="color:var(--text-muted);">Parcela:</span>
                      <strong>{txSelecionada.parcela} de {txSelecionada.totalParcelas}</strong>
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

      {/* Bottom Sheet de Quitação Rápida de Pendência */}
      {modalQuitarPendencia && (() => {
        const c = contaMap.get(modalQuitarPendencia.contaId);
        const catNome = c ? catMap.get(c.categoriaId) || "Geral" : "Geral";
        return (
          <div class="modal-backdrop" onClick={() => setModalQuitarPendencia(null)}>
            <div class="modal" onClick={(e) => e.stopPropagation()}>
              <div class="modal__head">
                <h3 class="modal__title">Quitar Conta Pendente</h3>
                <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalQuitarPendencia(null)}>
                  <Icon name="x" />
                </button>
              </div>

              <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
                <div style="text-align:center;padding:10px 0;">
                  <div style="font-size:2rem;font-weight:900;color:var(--out);">
                    {money(modalQuitarPendencia.valorPendente)}
                  </div>
                  <div style="font-size:1rem;font-weight:800;color:var(--text);margin-top:4px;">
                    {c?.nome || "Conta Pendente"}
                  </div>
                  <div style="font-size:0.75rem;color:var(--text-muted);">{catNome} • {MONTHS[modalQuitarPendencia.mes]}</div>
                </div>

                <div class="card" style="display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:14px;">
                  <div style="display:flex;justify-content:space-between;font-size:0.80rem;">
                    <span style="color:var(--text-muted);">Data do Pagamento:</span>
                    <strong>{modalQuitarPendencia.dataSugerida.split("-").reverse().join("/")}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:0.80rem;">
                    <span style="color:var(--text-muted);">Status:</span>
                    <strong style={{ color: modalQuitarPendencia.status === "vencida" ? "var(--out)" : "var(--warn)" }}>
                      {modalQuitarPendencia.status === "vencida" ? "Vencida" : "A Vencer"}
                    </strong>
                  </div>
                </div>

                {bancos.length > 0 && (
                  <div>
                    <label class="form-label" style="font-size:0.75rem;font-weight:700;color:var(--text-muted);display:block;margin-bottom:6px;">
                      Conta Bancária de Saída
                    </label>
                    <select
                      class="select"
                      value={quitarBancoId}
                      onChange={(e) => setQuitarBancoId((e.currentTarget as HTMLSelectElement).value)}
                      style="border-radius:12px;min-height:42px;"
                    >
                      {bancos.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div class="modal__foot">
                <button
                  type="button"
                  class="btn btn--primary"
                  style="width:100%;min-height:46px;border-radius:14px;font-weight:800;"
                  onClick={async () => {
                    if (!ano || !c) return;
                    await lancamentos.create({
                      anoId: ano.id,
                      contaId: c.id,
                      mes: modalQuitarPendencia.mes,
                      data: modalQuitarPendencia.dataSugerida,
                      valor: modalQuitarPendencia.valorPendente,
                      descricao: c.nome,
                      bancoId: quitarBancoId || undefined,
                      obs: "Quitado via app mobile",
                    });
                    toast.success(`Conta "${c.nome}" quitada com sucesso!`);
                    setModalQuitarPendencia(null);
                  }}
                >
                  <Icon name="check" /> Confirmar Pagamento
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

import { useState } from "react";
import { Icon } from "../../components/Icon.tsx";
import { confirmarAcao } from "../../components/ModalConfirm.tsx";
import { toast } from "../../components/Toast.tsx";
import { CardPendencias } from "../../components/lancamento/CardPendencias.tsx";
import { ModalIgnorarProjecao } from "../../components/lancamento/ModalIgnorarProjecao.tsx";
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
  const [filtroBanco, setFiltroBanco] = useState<string>("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");
  const [mesAtivo, setMesAtivo] = useState<number | "todos">(new Date().getMonth());
  const [modoVisao, setModoVisao] = useState<"extrato" | "tabela">("extrato");
  const [txSelecionada, setTxSelecionada] = useState<Lancamento | null>(null);
  const [modalQuitarPendencia, setModalQuitarPendencia] = useState<ProjecaoPendente | null>(null);
  const [modalIgnorarItem, setModalIgnorarItem] = useState<ProjecaoPendente | null>(null);
  const [quitarBancoId, setQuitarBancoId] = useState<string>("");

  // Estados de Edição
  const [txEmEdicao, setTxEmEdicao] = useState<boolean>(false);
  const [editValorStr, setEditValorStr] = useState<string>("");
  const [editDescricao, setEditDescricao] = useState<string>("");
  const [editData, setEditData] = useState<string>("");
  const [editContaId, setEditContaId] = useState<string>("");
  const [editBancoId, setEditBancoId] = useState<string>("");
  const [editBancoDestinoId, setEditBancoDestinoId] = useState<string>("");
  const [editFormaPagamento, setEditFormaPagamento] = useState<string>("PIX");
  const [editReservaId, setEditReservaId] = useState<string>("");
  const [editObs, setEditObs] = useState<string>("");

  const iniciarEdicao = (l: Lancamento) => {
    setEditValorStr((l.valor / 100).toFixed(2).replace(".", ","));
    setEditDescricao(l.descricao || "");
    setEditData(l.data);
    setEditContaId(l.contaId);
    setEditBancoId(l.bancoId || "");
    setEditBancoDestinoId(l.bancoDestinoId || "");
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
      bancoDestinoId: editBancoDestinoId || undefined,
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
    if (filtroBanco !== "todos" && l.bancoId !== filtroBanco && l.bancoDestinoId !== filtroBanco) return false;
    if (filtroCategoria !== "todas" && c.categoriaId !== filtroCategoria) return false;

    if (busca.trim()) {
      const q = busca.toLowerCase();
      const nomeConta = c.nome.toLowerCase();
      const desc = (l.descricao || "").toLowerCase();
      const cat = (catMap.get(c.categoriaId) || "").toLowerCase();
      const bNome = (bancoMap.get(l.bancoId || "") || "").toLowerCase();
      const val = (l.valor / 100).toFixed(2);
      if (!nomeConta.includes(q) && !desc.includes(q) && !cat.includes(q) && !val.includes(q) && !bNome.includes(q)) {
        return false;
      }
    }

    return true;
  });

  const exportarCSV = () => {
    if (filtrados.length === 0) {
      toast.warn("Nenhum lançamento para exportar no filtro atual.");
      return;
    }
    const headers = ["Data", "Natureza", "Categoria", "Conta", "Banco", "Descrição", "Valor", "Obs"];
    const rows = filtrados.map((l) => {
      const c = contaMap.get(l.contaId);
      const cat = c ? catMap.get(c.categoriaId) || "" : "";
      const b = bancoMap.get(l.bancoId || "") || "";
      const nat = c ? NATURE_META[c.natureza]?.label || c.natureza : "";
      const val = (l.valor / 100).toFixed(2).replace(".", ",");
      return [
        l.data.split("-").reverse().join("/"),
        `"${nat}"`,
        `"${cat}"`,
        `"${c?.nome || ""}"`,
        `"${b}"`,
        `"${(l.descricao || "").replace(/"/g, '""')}"`,
        `"${val}"`,
        `"${(l.obs || "").replace(/"/g, '""')}"`,
      ].join(";");
    });
    const csvContent = "\uFEFF" + [headers.join(";"), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato-finansys-${anoNum}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Extrato exportado em CSV!");
  };

  // Agrupa por data em ordem decrescente
  const gruposPorData = new Map<string, Lancamento[]>();
  for (const l of filtrados) {
    const arr = gruposPorData.get(l.data) || [];
    arr.push(l);
    gruposPorData.set(l.data, arr);
  }

  const datasOrdenadas = Array.from(gruposPorData.keys()).sort((a, b) => b.localeCompare(a));

  const excluirTx = async (l: Lancamento) => {
    const ok = await confirmarAcao({
      titulo: "Excluir Realização",
      mensagem: `Deseja realmente excluir esta realização no valor de ${money(l.valor)}?`,
      rotuloConfirmar: "Excluir",
      tipo: "danger",
    });
    if (ok) {
      await lancamentos.remove(l.id);
      setTxSelecionada(null);
      toast.success("Realização excluída!");
    }
  };

  return (
    <div style="display:flex;flex-direction:column;gap:12px;padding-bottom:70px;">
      {/* 0. Top Bar de Controles: Visão e Ações Rápidas */}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div class="mobile-segmented" style="flex:1;max-width:220px;margin-bottom:0;">
          <button
            type="button"
            class={`mobile-segmented__btn ${modoVisao === "extrato" ? "is-active" : ""}`}
            onClick={() => setModoVisao("extrato")}
          >
            <Icon name="list" style="width:14px;height:14px;" /> Extrato
          </button>
          <button
            type="button"
            class={`mobile-segmented__btn ${modoVisao === "tabela" ? "is-active" : ""}`}
            onClick={() => setModoVisao("tabela")}
          >
            <Icon name="grid" style="width:14px;height:14px;" /> Tabela
          </button>
        </div>

        <div style="display:flex;gap:6px;">
          <button
            type="button"
            class="btn btn--secondary btn--sm"
            onClick={exportarCSV}
            title="Exportar CSV do Extrato"
            style="border-radius:12px;gap:4px;font-size:0.75rem;padding:0 10px;min-height:36px;"
          >
            <Icon name="download" style="width:14px;height:14px;" /> CSV
          </button>
          <button
            type="button"
            class="btn btn--primary btn--sm"
            onClick={onOpenNovo}
            style="border-radius:12px;gap:4px;font-weight:700;font-size:0.75rem;padding:0 12px;min-height:36px;"
          >
            <Icon name="plus" style="width:14px;height:14px;" /> Novo
          </button>
        </div>
      </div>

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

      {/* 3. Filtros Rápidos de Natureza Oficial */}
      <div class="hscroll" style="padding-bottom:2px;">
        <button
          type="button"
          class={`chip ${filtroNat === "todas" ? "is-active" : ""}`}
          onClick={() => setFiltroNat("todas")}
        >
          Todas as Naturezas
        </button>
        <button
          type="button"
          class={`chip ${filtroNat === "receber" ? "is-active" : ""}`}
          onClick={() => setFiltroNat("receber")}
        >
          <Icon name="arrowDown" style="width:12px;height:12px;color:var(--in);" /> Receitas
        </button>
        <button
          type="button"
          class={`chip ${filtroNat === "pagar" ? "is-active" : ""}`}
          onClick={() => setFiltroNat("pagar")}
        >
          <Icon name="arrowUp" style="width:12px;height:12px;color:var(--out);" /> Despesas
        </button>
        <button
          type="button"
          class={`chip ${filtroNat === "aporte" ? "is-active" : ""}`}
          onClick={() => setFiltroNat("aporte")}
        >
          <Icon name="wallet" style="width:12px;height:12px;color:var(--primary);" /> Aportes Livres
        </button>
        <button
          type="button"
          class={`chip ${filtroNat === "saida" ? "is-active" : ""}`}
          onClick={() => setFiltroNat("saida")}
        >
          <Icon name="sparkle" style="width:12px;height:12px;color:var(--accent);" /> Saídas Livres
        </button>
      </div>

      {/* 4. Filtro por Banco (se houver bancos cadastrados) */}
      {bancos.length > 0 && (
        <div class="hscroll" style="gap:4px;padding-bottom:2px;">
          <button
            type="button"
            class={`chip ${filtroBanco === "todos" ? "is-active" : ""}`}
            onClick={() => setFiltroBanco("todos")}
          >
            Todos os Bancos
          </button>
          {bancos.map((b) => (
            <button
              key={b.id}
              type="button"
              class={`chip ${filtroBanco === b.id ? "is-active" : ""}`}
              onClick={() => setFiltroBanco(filtroBanco === b.id ? "todos" : b.id)}
            >
              <Icon name="bank" style="width:12px;height:12px;" /> {b.nome}
            </button>
          ))}
        </div>
      )}

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

      {/* 4. Lista do Extrato (Modo Tabela ou Modo Agrupado por Data) */}
      {modoVisao === "tabela" ? (
        filtrados.length === 0 ? (
          <div class="card" style="text-align:center;padding:36px 16px;border-radius:20px;color:var(--text-muted);">
            <Icon name="list" style="width:32px;height:32px;margin:0 auto 8px;display:block;" />
            <h3 style="font-size:0.95rem;margin:0 0 4px;color:var(--text);">Nenhuma transação</h3>
            <p style="font-size:0.80rem;margin:0;">Nenhum lançamento corresponde aos filtros selecionados.</p>
          </div>
        ) : (
          <div class="card" style="padding:0;overflow:hidden;border-radius:16px;">
            <div style="overflow-x:auto;">
              <table class="table" style="font-size:0.75rem;margin:0;width:100%;">
                <thead>
                  <tr style="background:var(--surface-sunken);">
                    <th style="padding:8px 10px;">Data</th>
                    <th style="padding:8px 10px;">Descrição / Conta</th>
                    <th style="padding:8px 10px;">Banco</th>
                    <th style="padding:8px 10px;text-align:right;">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((l) => {
                    const c = contaMap.get(l.contaId);
                    const isEntrada = c?.natureza === "receber" || c?.natureza === "aporte";
                    const bNome = l.bancoId ? bancoMap.get(l.bancoId) : "-";
                    return (
                      <tr
                        key={l.id}
                        onClick={() => setTxSelecionada(l)}
                        style="cursor:pointer;"
                      >
                        <td style="padding:8px 10px;white-space:nowrap;color:var(--text-muted);">
                          {l.data.split("-").slice(1).reverse().join("/")}
                        </td>
                        <td style="padding:8px 10px;">
                          <div style="font-weight:700;color:var(--text);">{l.descricao || c?.nome || "Lançamento"}</div>
                          <div style="font-size:0.70rem;color:var(--text-muted);">{c?.nome} • {c ? catMap.get(c.categoriaId) : ""}</div>
                        </td>
                        <td style="padding:8px 10px;white-space:nowrap;color:var(--text-muted);">
                          {bNome}
                        </td>
                        <td
                          style={{
                            padding: "8px 10px",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                            fontWeight: 800,
                            color: isEntrada ? "var(--in)" : "var(--text)",
                          }}
                        >
                          {signedPrivacidade(isEntrada ? l.valor : -l.valor)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : datasOrdenadas.length === 0 ? (
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
                const bancoOrigemNome = l.bancoId ? bancoMap.get(l.bancoId) : null;
                const bancoDestinoNome = l.bancoDestinoId ? bancoMap.get(l.bancoDestinoId) : null;

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
                        {bancoOrigemNome && bancoDestinoNome ? (
                          <>
                            <span>•</span>
                            <span>{bancoOrigemNome} → {bancoDestinoNome}</span>
                          </>
                        ) : bancoOrigemNome ? (
                          <>
                            <span>•</span>
                            <span>{bancoOrigemNome}</span>
                          </>
                        ) : bancoDestinoNome ? (
                          <>
                            <span>•</span>
                            <span>{bancoDestinoNome}</span>
                          </>
                        ) : null}
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
        const bancoDestinoNome = txSelecionada.bancoDestinoId ? bancoMap.get(txSelecionada.bancoDestinoId) : null;

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

                  {/* Banco de Origem (De onde saiu) */}
                  <label class="form-label">Banco de Origem (De onde saiu)</label>
                  <select
                    class="select"
                    value={editBancoId}
                    onChange={(e) => setEditBancoId((e.currentTarget as HTMLSelectElement).value)}
                    style="border-radius:14px;min-height:42px;"
                  >
                    <option value="">Nenhum banco de origem</option>
                    {bancos.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nome} ({b.tipo || "corrente"})
                      </option>
                    ))}
                  </select>

                  {/* Banco de Destino (Para onde vai) */}
                  <label class="form-label">Banco de Destino (Para onde vai / Se houver)</label>
                  <select
                    class="select"
                    value={editBancoDestinoId}
                    onChange={(e) => setEditBancoDestinoId((e.currentTarget as HTMLSelectElement).value)}
                    style="border-radius:14px;min-height:42px;"
                  >
                    <option value="">Sem banco de destino (lançamento simples)</option>
                    {bancos.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nome} ({b.tipo || "corrente"})
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
                      <span style="color:var(--text-muted);">
                        {bancoDestinoNome ? "Banco de Origem (Saiu de):" : (isEntrada ? "Banco de Entrada:" : "Banco de Saída:")}
                      </span>
                      <strong>{bancoNome}</strong>
                    </div>
                  )}
                  {bancoDestinoNome && (
                    <div style="display:flex;justify-content:space-between;font-size:0.84rem;">
                      <span style="color:var(--text-muted);">Banco de Destino (Vai para):</span>
                      <strong style="color:var(--primary);">{bancoDestinoNome}</strong>
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

              <div class="modal__foot" style="display:flex;gap:8px;">
                <button
                  type="button"
                  class="btn btn--secondary"
                  style="min-height:46px;border-radius:14px;color:var(--out);padding:0 14px;"
                  onClick={() => excluirTx(txSelecionada)}
                  title="Excluir Lançamento"
                >
                  <Icon name="trash" />
                </button>
                <button
                  type="button"
                  class="btn btn--secondary"
                  style="min-height:46px;border-radius:14px;padding:0 14px;display:flex;align-items:center;gap:4px;font-size:0.80rem;font-weight:700;"
                  onClick={async () => {
                    if (!ano) return;
                    const hoje = new Date();
                    const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
                    const mesHoje = hoje.getMonth();
                    await lancamentos.create({
                      anoId: ano.id,
                      contaId: txSelecionada.contaId,
                      mes: mesHoje,
                      data: dataHoje,
                      valor: txSelecionada.valor,
                      descricao: txSelecionada.descricao ? `${txSelecionada.descricao} (Cópia)` : "Lançamento (Cópia)",
                      bancoId: txSelecionada.bancoId,
                      bancoDestinoId: txSelecionada.bancoDestinoId,
                      formaPagamento: txSelecionada.formaPagamento,
                      reservaId: txSelecionada.reservaId,
                      tipoReserva: txSelecionada.tipoReserva,
                      obs: txSelecionada.obs,
                    });
                    toast.success("Lançamento duplicado para hoje!");
                    setTxSelecionada(null);
                  }}
                  title="Duplicar para a data de hoje"
                >
                  <Icon name="copy" /> Duplicar
                </button>
                <button
                  type="button"
                  class="btn btn--primary"
                  style="flex:1;min-height:46px;border-radius:14px;font-weight:800;"
                  onClick={() => iniciarEdicao(txSelecionada)}
                >
                  <Icon name="pencil" /> Editar
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

              <div class="modal__foot" style="display:flex;flex-direction:column;gap:8px;">
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

                <button
                  type="button"
                  class="btn btn--ghost"
                  style="width:100%;min-height:38px;border-radius:12px;font-size:0.80rem;color:var(--text-muted);"
                  onClick={() => {
                    const pendItem = modalQuitarPendencia;
                    setModalQuitarPendencia(null);
                    setModalIgnorarItem(pendItem);
                  }}
                >
                  Não vou pagar esta projeção (Ignorar / Postergar)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal para Ignorar ou Postergar Projeção */}
      {modalIgnorarItem && (() => {
        const c = contaMap.get(modalIgnorarItem.contaId);
        const mesIdx = modalIgnorarItem.mes;
        const proxMesNome = mesIdx < 11 ? MONTHS[mesIdx + 1] : undefined;
        return (
          <ModalIgnorarProjecao
            isOpen={true}
            onClose={() => setModalIgnorarItem(null)}
            contaNome={c?.nome || "Conta"}
            mesNome={MONTHS[mesIdx]}
            valorCentavos={modalIgnorarItem.valorPendente}
            mesProximoNome={proxMesNome}
            onConfirmar={async (modo) => {
              if (!ano) return;
              if (modo === "somar_proximo" && mesIdx < 11) {
                const proxProj = ps.find((p) => p.contaId === modalIgnorarItem.contaId && p.mes === mesIdx + 1);
                if (proxProj) {
                  await projecoes.update(proxProj.id, {
                    valor: proxProj.valor + modalIgnorarItem.valorPendente,
                  });
                } else {
                  await projecoes.create({
                    anoId: ano.id,
                    contaId: modalIgnorarItem.contaId,
                    mes: mesIdx + 1,
                    valor: modalIgnorarItem.valorPendente,
                  });
                }
              }
              const atualProj = ps.find((p) => p.contaId === modalIgnorarItem.contaId && p.mes === mesIdx);
              if (atualProj) {
                const realizadosNesteMes = ls
                  .filter((l) => l.contaId === modalIgnorarItem.contaId && l.mes === mesIdx)
                  .reduce((s, l) => s + l.valor, 0);
                await projecoes.update(atualProj.id, { valor: realizadosNesteMes });
              }
              toast.success("Decisão registrada sobre a projeção!");
              setModalIgnorarItem(null);
            }}
          />
        );
      })()}
    </div>
  );
}

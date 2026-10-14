import { useEffect, useState } from "preact/hooks";
import { CustomSelect } from "../components/CustomSelect.tsx";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/Modal.tsx";
import { ModalConfirm, confirmarAcao } from "../components/ModalConfirm.tsx";
import { toast } from "../components/Toast.tsx";
import { anos, categorias, contas, lancamentos } from "../data/repo.ts";
import { type Conta, type Lancamento, type Natureza, NATUREZAS, SINAL } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { money, MONTHS, signed } from "../lib/format.ts";
import { NATURE_META } from "../lib/natureza.ts";
import { anoAtivo, empresaAtiva } from "../state.ts";

export function Lancamentos({ openNewOnMount = false }: { openNewOnMount?: boolean }) {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  const [mesFiltro, setMesFiltro] = useState<number | "todos">(new Date().getMonth());
  const [natFiltro, setNatFiltro] = useState<Natureza | "todas">("todas");
  const [busca, setBusca] = useState<string>("");

  // Modal de lançamento
  const [modalLanc, setModalLanc] = useState<Partial<Lancamento> & { natureza?: Natureza } | null>(null);

  // Estados para criação rápida direta pelo select
  const [catSelecionadaModal, setCatSelecionadaModal] = useState<string>("");
  const [modalCriarCat, setModalCriarCat] = useState<{ nome: string } | null>(null);
  const [modalCriarConta, setModalCriarConta] = useState<{ nome: string; categoriaId: string } | null>(null);

  const dados = useLive(async () => {
    if (!empId) return null;
    const ano = await anos.find(empId, anoNum);
    if (!ano) return null;
    const [cs, ls, cats] = await Promise.all([
      contas.byEmpresa(empId),
      lancamentos.byAno(ano.id),
      categorias.byEmpresa(empId),
    ]);
    return { ano, cs, ls, cats };
  }, [empId, anoNum], null);

  useEffect(() => {
    if (openNewOnMount && dados && dados.cs.length > 0) {
      abrirNovo();
    }
  }, [openNewOnMount, Boolean(dados)]);

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
        <p>Abra o ano fiscal em Ajustes para registrar lançamentos.</p>
        <a href="#/ajustes" class="btn btn--primary" style="margin-top:16px;">
          Ir para Ajustes
        </a>
      </section>
    );
  }

  const { ano, cs, ls, cats } = dados;
  const contaMap = new Map<string, Conta>(cs.map((c) => [c.id, c]));
  const catMap = new Map<string, string>(cats.map((c) => [c.id, c.nome]));

  const abrirNovo = (naturezaPadrao?: Natureza) => {
    const hoje = new Date();
    const dataStr = `${anoNum}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    const nat = naturezaPadrao || (natFiltro !== "todas" ? natFiltro : "pagar");
    const catsDaNat = cats.filter((c) => c.natureza === nat);
    const primeiraCatId = catsDaNat[0]?.id || "";
    const contasDaCat = cs.filter((c) => c.natureza === nat && c.categoriaId === primeiraCatId && c.ativa);

    setCatSelecionadaModal(primeiraCatId);
    setModalLanc({
      anoId: ano.id,
      contaId: contasDaCat[0]?.id || cs.find((c) => c.natureza === nat && c.ativa)?.id || "",
      data: dataStr,
      mes: mesFiltro !== "todos" ? mesFiltro : hoje.getMonth(),
      valor: 0,
      descricao: "",
      obs: "",
      natureza: nat,
    });
  };

  const salvarLancamento = async (e: Event) => {
    e.preventDefault();
    if (!modalLanc || !modalLanc.contaId || !modalLanc.data) return;
    const centavos = Math.round(Number(modalLanc.valor || 0) * 100);
    if (centavos <= 0) {
      toast.warn("O valor do lançamento deve ser maior que zero.");
      return;
    }

    // Calcula o mês correto a partir da data informada
    const [, mesStr] = modalLanc.data.split("-");
    const mesCalculado = parseInt(mesStr, 10) - 1;

    if (modalLanc.id) {
      await lancamentos.update(modalLanc.id, {
        contaId: modalLanc.contaId,
        data: modalLanc.data,
        mes: mesCalculado,
        valor: centavos,
        descricao: modalLanc.descricao?.trim() || "",
        obs: modalLanc.obs?.trim() || undefined,
      });
      toast.success("Lançamento atualizado com sucesso!");
    } else {
      await lancamentos.create({
        anoId: ano.id,
        contaId: modalLanc.contaId,
        data: modalLanc.data,
        mes: mesCalculado,
        valor: centavos,
        descricao: modalLanc.descricao?.trim() || "",
        obs: modalLanc.obs?.trim() || undefined,
      });
      toast.success("Lançamento registrado com sucesso!");
    }
    setModalLanc(null);
  };

  // Filtragem dos lançamentos
  const filtrados = ls.filter((l) => {
    const c = contaMap.get(l.contaId);
    if (!c) return false;
    if (mesFiltro !== "todos" && l.mes !== mesFiltro) return false;
    if (natFiltro !== "todas" && c.natureza !== natFiltro) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      const matchDesc = l.descricao?.toLowerCase().includes(q);
      const matchNome = c.nome.toLowerCase();
      const matchObs = l.obs?.toLowerCase().includes(q);
      if (!matchDesc && !matchNome.includes(q) && !matchObs) return false;
    }
    return true;
  }).sort((a, b) => b.data.localeCompare(a.data) || b.createdAt - a.createdAt);

  // Totais do filtro
  const totaisPorNat = { pagar: 0, receber: 0, aporte: 0, saida: 0 };
  let resultadoRealLiquido = 0;

  for (const l of filtrados) {
    const c = contaMap.get(l.contaId);
    if (!c) continue;
    totaisPorNat[c.natureza] += l.valor;
    resultadoRealLiquido += SINAL[c.natureza] * l.valor;
  }

  // Categorias e Contas da natureza selecionada no modal
  const natAtualModal = modalLanc?.natureza || (modalLanc?.contaId ? contaMap.get(modalLanc.contaId)?.natureza : "pagar") || "pagar";
  const catsParaModal = cats.filter((c) => c.natureza === natAtualModal);
  const contaAtualObj = cs.find((c) => c.id === modalLanc?.contaId);
  const catAtualModal = catSelecionadaModal || contaAtualObj?.categoriaId || catsParaModal[0]?.id || "";
  const contasParaModal = cs.filter((c) => c.natureza === natAtualModal && c.categoriaId === catAtualModal && c.ativa);

  return (
    <>
      <div class="page-head">
        <div>
          <h1>Lançamentos Reais</h1>
          <p>Valores efetivamente realizados no ano de {anoNum}</p>
        </div>
        <button type="button" class="btn btn--primary" onClick={() => abrirNovo()}>
          <Icon name="plus" /> Novo Lançamento
        </button>
      </div>

      {/* Seletor de meses compacto (mobile-friendly) */}
      <div class="hscroll" style="margin-bottom:var(--sp-3);">
        <button
          type="button"
          class={`chip ${mesFiltro === "todos" ? "is-active" : ""}`}
          onClick={() => setMesFiltro("todos")}
        >
          Ano Todo
        </button>
        {MONTHS.map((m, idx) => (
          <button
            type="button"
            key={m}
            class={`chip ${mesFiltro === idx ? "is-active" : ""}`}
            onClick={() => setMesFiltro(idx)}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Tabs de Filtro de Natureza */}
      <div class="tabs" style="margin-bottom: var(--sp-4);">
        <button
          type="button"
          class={`tab ${natFiltro === "todas" ? "is-active" : ""}`}
          onClick={() => setNatFiltro("todas")}
        >
          Todas as Naturezas
        </button>
        {NATUREZAS.map((n) => {
          const meta = NATURE_META[n];
          return (
            <button
              type="button"
              key={n}
              class={`tab ${natFiltro === n ? "is-active" : ""}`}
              onClick={() => setNatFiltro(n)}
            >
              <Icon name={meta.icon} /> {meta.label}
            </button>
          );
        })}
      </div>

      {/* Resumo do período filtrado */}
      <div class="grid grid--stats" style="margin-bottom:var(--sp-4);">
        {NATUREZAS.map((n) => {
          const meta = NATURE_META[n];
          return (
            <div class="stat" key={n}>
              <div class="stat__label">
                <i class="dot" style={`background:var(--${meta.tone})`} />
                {meta.label}
              </div>
              <div class="stat__value num">{money(totaisPorNat[n])}</div>
            </div>
          );
        })}
      </div>

      {/* Campo de busca e lista */}
      <section class="card">
        <div class="card__head">
          <div style="flex:1;max-width:320px;">
            <input
              type="search"
              class="input"
              placeholder="Buscar lançamento ou conta..."
              value={busca}
              onInput={(e) => setBusca(e.currentTarget.value)}
              style="min-height:36px;font-size:var(--fs-xs);"
            />
          </div>
          <div class="muted" style="font-size:var(--fs-xs);">
            {filtrados.length} lançamento{filtrados.length === 1 ? "" : "s"} · Resultado:{" "}
            <b class={`num ${resultadoRealLiquido >= 0 ? "tone-in" : "tone-out"}`}>
              {signed(resultadoRealLiquido)}
            </b>
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div class="empty" style="padding:var(--sp-6) var(--sp-4);">
            <Icon name="list" />
            <h2>Nenhum lançamento encontrado</h2>
            <p>Clique em "Novo Lançamento" para registrar uma despesa, receita ou aporte.</p>
          </div>
        ) : (
          <div class="list">
            {filtrados.map((l) => {
              const c = contaMap.get(l.contaId);
              if (!c) return null;
              const meta = NATURE_META[c.natureza];
              const [, mm, dd] = l.data.split("-");
              const sinal = SINAL[c.natureza];
              return (
                <div class="list__item" key={l.id}>
                  <div class={`list__icon bg-${meta.tone}`}>
                    <Icon name={meta.icon} />
                  </div>
                  <div class="list__body">
                    <div class="list__title" style="display:flex;align-items:center;gap:6px;">
                      {l.descricao || c.nome}
                      {l.descricao && <span class="muted" style="font-size:var(--fs-xs);font-weight:normal;">({c.nome})</span>}
                    </div>
                    <div class="list__sub">
                      {dd}/{mm}/{l.data.split("-")[0]} · {meta.label} · <b style="color:var(--text);">{catMap.get(c.categoriaId) || "Geral"}</b>
                      {l.obs && <span style="color:var(--text);font-style:italic;"> · Obs: {l.obs}</span>}
                    </div>
                  </div>

                  <div style="display:flex;align-items:center;gap:12px;">
                    <div class={`list__value num tone-${meta.tone}`}>
                      {signed(sinal * l.valor)}
                    </div>
                    <div style="display:flex;gap:4px;">
                      <button
                        type="button"
                        class="btn btn--ghost btn--icon"
                        style="min-height:28px;width:28px;"
                        onClick={() => {
                          setCatSelecionadaModal(c.categoriaId);
                          setModalLanc({
                            ...l,
                            valor: l.valor / 100,
                            natureza: c.natureza,
                          });
                        }}
                        title="Editar lançamento"
                      >
                        <Icon name="pencil" />
                      </button>
                      <button
                        type="button"
                        class="btn btn--ghost btn--icon"
                        style="min-height:28px;width:28px;color:var(--out);"
                        onClick={async () => {
                          const ok = await confirmarAcao({
                            titulo: "Excluir Lançamento",
                            mensagem: "Deseja excluir este lançamento real? Esta ação é irreversível.",
                            rotuloConfirmar: "Excluir Lançamento",
                            tipo: "danger",
                          });
                          if (ok) {
                            await lancamentos.remove(l.id);
                            toast.success("Lançamento excluído com sucesso.");
                          }
                        }}
                        title="Excluir lançamento"
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal / Subtela de Criação e Edição de Lançamento */}
      <Modal
        title={modalLanc?.id ? "Editar Lançamento" : "Novo Lançamento Real"}
        isOpen={modalLanc !== null}
        onClose={() => setModalLanc(null)}
        subtela={true}
        footer={
          <>
            <button type="button" class="btn btn--ghost" onClick={() => setModalLanc(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-lancamento" class="btn btn--primary">
              Salvar Lançamento
            </button>
          </>
        }
      >
        <form id="form-lancamento" onSubmit={salvarLancamento}>
          {/* Seletor de Natureza no modal se for novo lançamento */}
          {!modalLanc?.id && (
            <div class="tabs" style="margin-bottom:var(--sp-3);">
              {NATUREZAS.map((n) => {
                const meta = NATURE_META[n];
                return (
                  <button
                    type="button"
                    key={n}
                    class={`tab ${natAtualModal === n ? "is-active" : ""}`}
                    onClick={() => {
                      const catsDaNovaNat = cats.filter((cat) => cat.natureza === n);
                      const primCat = catsDaNovaNat[0]?.id || "";
                      const contasDaNovaNat = cs.filter((c) => c.categoriaId === primCat && c.ativa);
                      setCatSelecionadaModal(primCat);
                      setModalLanc({
                        ...modalLanc,
                        natureza: n,
                        contaId: contasDaNovaNat[0]?.id || "",
                      });
                    }}
                  >
                    <Icon name={meta.icon} /> {meta.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Seletores de Categoria e Conta com Acesso Direto de Criação */}
          <div class="form-row form-row--2">
            <div class="form-group">
              <label class="form-label" for="lanc-cat">Categoria *</label>
              <CustomSelect
                id="lanc-cat"
                value={catAtualModal}
                placeholder={catsParaModal.length === 0 ? "Nenhuma categoria" : "Selecione Categoria"}
                options={catsParaModal.map((c) => ({ value: c.id, label: c.nome }))}
                onChange={(novaCatId) => {
                  setCatSelecionadaModal(novaCatId);
                  const contasDestaCat = cs.filter((c) => c.categoriaId === novaCatId && c.ativa);
                  setModalLanc({
                    ...modalLanc,
                    contaId: contasDestaCat[0]?.id || "",
                  });
                }}
                action={{
                  label: "Nova Categoria...",
                  icon: "plus",
                  onClick: () => setModalCriarCat({ nome: "" }),
                }}
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="lanc-conta">Conta *</label>
              <CustomSelect
                id="lanc-conta"
                value={modalLanc?.contaId || ""}
                placeholder={contasParaModal.length === 0 ? "Nenhuma conta cadastrada" : "Selecione Conta"}
                options={contasParaModal.map((c) => ({ value: c.id, label: c.nome }))}
                onChange={(contaId) => setModalLanc({ ...modalLanc, contaId })}
                action={{
                  label: "Nova Conta...",
                  icon: "plus",
                  onClick: () =>
                    setModalCriarConta({
                      nome: "",
                      categoriaId: catAtualModal || catsParaModal[0]?.id || "",
                    }),
                }}
              />
            </div>
          </div>

          <div class="form-row form-row--2">
            <div class="form-group">
              <label class="form-label" for="lanc-data">Data de Pagamento/Recebimento *</label>
              <input
                id="lanc-data"
                type="date"
                class="input"
                required
                value={modalLanc?.data || ""}
                onInput={(e) => setModalLanc({ ...modalLanc, data: e.currentTarget.value })}
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="lanc-valor">Valor Real (R$) *</label>
              <input
                id="lanc-valor"
                type="number"
                step="0.01"
                min="0.01"
                class="input"
                required
                placeholder="0,00"
                value={modalLanc?.valor || ""}
                onInput={(e) => setModalLanc({ ...modalLanc, valor: Number(e.currentTarget.value) })}
              />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="lanc-desc">Descrição / Fornecedor / Favorecido</label>
            <input
              id="lanc-desc"
              class="input"
              placeholder="Ex: Nota fiscal 1234, Transferência PIX..."
              value={modalLanc?.descricao || ""}
              onInput={(e) => setModalLanc({ ...modalLanc, descricao: e.currentTarget.value })}
            />
          </div>

          {(natAtualModal === "aporte" || natAtualModal === "saida") && (
            <div class="form-group">
              <label class="form-label" for="lanc-obs">Observação Adicional (Obs)</label>
              <textarea
                id="lanc-obs"
                class="textarea"
                rows={2}
                placeholder="Ex: Motivo da saída livre, aporte de capital emergencial..."
                value={modalLanc?.obs || ""}
                onInput={(e) => setModalLanc({ ...modalLanc, obs: e.currentTarget.value })}
              />
            </div>
          )}
        </form>
      </Modal>

      {/* Modal Rápido: Criar Nova Categoria Direto do Select */}
      {modalCriarCat && (
        <Modal
          title={`Nova Categoria (${NATURE_META[natAtualModal].label})`}
          isOpen={true}
          zIndex={110}
          onClose={() => setModalCriarCat(null)}
          footer={
            <>
              <button type="button" class="btn btn--ghost" onClick={() => setModalCriarCat(null)}>
                Cancelar
              </button>
              <button type="submit" form="form-criar-cat" class="btn btn--primary">
                Salvar Categoria
              </button>
            </>
          }
        >
          <form
            id="form-criar-cat"
            onSubmit={async (e) => {
              e.preventDefault();
              const nome = modalCriarCat.nome?.trim();
              if (!nome) return;
              const criada = await categorias.create({
                empresaId: empId,
                natureza: natAtualModal,
                nome,
              });
              setCatSelecionadaModal(criada.id);
              setModalLanc((prev) => (prev ? { ...prev, contaId: "" } : null));
              setModalCriarCat(null);
              toast.success(`Categoria "${criada.nome}" criada com sucesso!`);
            }}
          >
            <div class="form-group">
              <label class="form-label" for="nova-cat-nome">Nome da Categoria *</label>
              <input
                id="nova-cat-nome"
                class="input"
                required
                autoFocus
                placeholder="Ex: Assinaturas de Software, Operacional, Marketing..."
                value={modalCriarCat.nome}
                onInput={(e) => setModalCriarCat({ ...modalCriarCat, nome: e.currentTarget.value })}
              />
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Rápido: Criar Nova Conta Direto do Select */}
      {modalCriarConta && (
        <Modal
          title={`Nova Conta (${NATURE_META[natAtualModal].label})`}
          isOpen={true}
          zIndex={110}
          onClose={() => setModalCriarConta(null)}
          footer={
            <>
              <button type="button" class="btn btn--ghost" onClick={() => setModalCriarConta(null)}>
                Cancelar
              </button>
              <button type="submit" form="form-criar-conta" class="btn btn--primary">
                Salvar Conta
              </button>
            </>
          }
        >
          <form
            id="form-criar-conta"
            onSubmit={async (e) => {
              e.preventDefault();
              const nome = modalCriarConta.nome?.trim();
              const catId = modalCriarConta.categoriaId || catAtualModal;
              if (!nome) return;
              if (!catId) {
                toast.warn("Crie ou selecione uma categoria antes de cadastrar uma conta.");
                return;
              }
              const criada = await contas.create({
                empresaId: empId,
                categoriaId: catId,
                natureza: natAtualModal,
                nome,
                ativa: true,
              });
              setCatSelecionadaModal(catId);
              setModalLanc((prev) => (prev ? { ...prev, contaId: criada.id } : null));
              setModalCriarConta(null);
              toast.success(`Conta "${criada.nome}" criada e selecionada!`);
            }}
          >
            <div class="form-group" style="margin-bottom:var(--sp-3);">
              <label class="form-label" for="nova-conta-cat">Categoria Pertencente *</label>
              <CustomSelect
                id="nova-conta-cat"
                value={modalCriarConta.categoriaId || catAtualModal}
                options={catsParaModal.map((c) => ({ value: c.id, label: c.nome }))}
                onChange={(categoriaId) => setModalCriarConta({ ...modalCriarConta, categoriaId })}
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="nova-conta-nome">Nome da Conta *</label>
              <input
                id="nova-conta-nome"
                class="input"
                required
                autoFocus
                placeholder="Ex: ChatGPT Plus, Aluguel Escritório, Energia..."
                value={modalCriarConta.nome}
                onInput={(e) => setModalCriarConta({ ...modalCriarConta, nome: e.currentTarget.value })}
              />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

import { useEffect, useState } from "preact/hooks";
import { CustomSelect } from "../components/CustomSelect.tsx";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/Modal.tsx";
import { ModalConfirm, confirmarAcao } from "../components/ModalConfirm.tsx";
import { toast } from "../components/Toast.tsx";
import { calcularBaseLancamentos, calcularValorVinculado } from "../data/calc.ts";
import { anos, categorias, contas, lancamentos, projecoes } from "../data/repo.ts";
import { type Conta, type Lancamento, type Natureza, NATUREZAS, type RegraVinculo, SINAL } from "../data/types.ts";
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

  // Estados de repetição e parcelamento
  const [tipoRepeticao, setTipoRepeticao] = useState<"unico" | "parcelado" | "recorrente">("unico");
  const [numRepeticoes, setNumRepeticoes] = useState<number>(2);
  const [dividirValor, setDividirValor] = useState<boolean>(true);

  // Estados para criação rápida direta pelo select
  const [catSelecionadaModal, setCatSelecionadaModal] = useState<string>("");
  const [modalCriarCat, setModalCriarCat] = useState<{ nome: string } | null>(null);
  const [modalCriarConta, setModalCriarConta] = useState<{ nome: string; categoriaId: string } | null>(null);

  // Estados para ferramenta de cálculo por vínculo / entrada no modal
  const [calcVinculoAberto, setCalcVinculoAberto] = useState(false);
  const [calcVinculoTipo, setCalcVinculoTipo] = useState<"conta" | "categoria">("conta");
  const [calcVinculoOrigemId, setCalcVinculoOrigemId] = useState<string>("");
  const [calcVinculoPercentual, setCalcVinculoPercentual] = useState<number | string>(30);
  const [calcVinculoModo, setCalcVinculoModo] = useState<"percentual" | "fixo">("percentual");
  const [calcVinculoValorFixo, setCalcVinculoValorFixo] = useState<number | string>("");

  const dados = useLive(async () => {
    if (!empId) return null;
    const ano = await anos.find(empId, anoNum);
    if (!ano) return null;
    const [cs, ls, cats, ps] = await Promise.all([
      contas.byEmpresa(empId),
      lancamentos.byAno(ano.id),
      categorias.byEmpresa(empId),
      projecoes.byAno(ano.id),
    ]);
    return { ano, cs, ls, cats, ps };
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

  const { ano, cs, ls, cats, ps } = dados;
  const contaMap = new Map<string, Conta>(cs.map((c) => [c.id, c]));
  const catMap = new Map<string, string>(cats.map((c) => [c.id, c.nome]));

  const abrirNovo = (naturezaPadrao?: Natureza) => {
    const hoje = new Date();
    const dataStr = `${anoNum}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    const nat = naturezaPadrao || (natFiltro !== "todas" ? natFiltro : "pagar");
    const catsDaNat = cats.filter((c) => c.natureza === nat);
    const primeiraCatId = catsDaNat[0]?.id || "";
    const contasDaCat = cs.filter((c) => c.natureza === nat && c.categoriaId === primeiraCatId && c.ativa);

    setTipoRepeticao("unico");
    setNumRepeticoes(2);
    setDividirValor(true);
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
    } else if (tipoRepeticao === "unico") {
      const createdLanc = await lancamentos.create({
        anoId: ano.id,
        contaId: modalLanc.contaId,
        data: modalLanc.data,
        mes: mesCalculado,
        valor: centavos,
        descricao: modalLanc.descricao?.trim() || "",
        obs: modalLanc.obs?.trim() || undefined,
      });
      toast.success("Lançamento registrado com sucesso!");
      setModalLanc(null);

      // Verificação proativa de regras de vínculo que apontam para esta conta ou sua categoria
      const cOrigem = contaMap.get(modalLanc.contaId);
      const vinculadas = cs.filter(
        (target) =>
          target.ativa !== false &&
          target.id !== modalLanc.contaId &&
          target.vinculo &&
          ((target.vinculo.tipo === "conta" && target.vinculo.origemId === modalLanc.contaId) ||
           (target.vinculo.tipo === "categoria" && target.vinculo.origemId === cOrigem?.categoriaId))
      );

      for (const target of vinculadas) {
        if (!target.vinculo) continue;
        const valorVinculado = calcularValorVinculado(centavos, target.vinculo);
        if (valorVinculado <= 0) continue;

        const regraTexto = target.vinculo.percentual !== undefined
          ? `${target.vinculo.percentual}%`
          : money(target.vinculo.valorFixo || 0);

        const ok = await confirmarAcao({
          titulo: "Gerar Lançamento Vinculado?",
          mensagem: `O lançamento em "${cOrigem?.nome || "conta base"}" possui vínculo automático com "${target.nome}" (${regraTexto}). Deseja gerar agora o lançamento correspondente de ${money(valorVinculado)}?`,
          rotuloConfirmar: `Lançar ${money(valorVinculado)}`,
          rotuloCancelar: "Agora não",
          tipo: "info",
        });

        if (ok) {
          await lancamentos.create({
            anoId: ano.id,
            contaId: target.id,
            data: modalLanc.data,
            mes: mesCalculado,
            valor: valorVinculado,
            descricao: `Vínculo: ${target.nome} ref. ${modalLanc.descricao?.trim() || cOrigem?.nome || ""}`,
            obs: `Gerado a partir do lançamento em ${cOrigem?.nome} (${regraTexto})`,
            vinculoLancamentoOrigemId: createdLanc.id,
            vinculoDescricao: `Vinculado a ${cOrigem?.nome}`,
          });
          toast.success(`Lançamento vinculado de ${money(valorVinculado)} gerado em "${target.nome}"!`);
        }
      }
      return;
    } else {
      // Repetição parcelada ou recorrente
      const totalRepeticoes = Math.max(2, Math.min(60, Number(numRepeticoes) || 2));
      const recorrenciaId = crypto.randomUUID();
      const [anoStr, mStr, diaStr] = modalLanc.data.split("-");
      const anoBase = parseInt(anoStr, 10);
      const mesBase = parseInt(mStr, 10) - 1;
      const diaBase = parseInt(diaStr, 10);

      const valorPorItem = (tipoRepeticao === "parcelado" && dividirValor)
        ? Math.floor(centavos / totalRepeticoes)
        : centavos;
      const resto = (tipoRepeticao === "parcelado" && dividirValor)
        ? centavos - (valorPorItem * totalRepeticoes)
        : 0;

      for (let i = 1; i <= totalRepeticoes; i++) {
        const valorParcela = (i === 1) ? (valorPorItem + resto) : valorPorItem;
        const mesTotal = mesBase + (i - 1);
        const targetYear = anoBase + Math.floor(mesTotal / 12);
        const targetMonth = mesTotal % 12;
        const maxDias = new Date(targetYear, targetMonth + 1, 0).getDate();
        const targetDay = Math.min(diaBase, maxDias);
        const dataFormatada = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;

        let anoAlvoId = ano.id;
        if (targetYear !== ano.ano) {
          let anoTarget = await anos.find(empId, targetYear);
          if (!anoTarget) {
            anoTarget = await anos.create({ empresaId: empId, ano: targetYear, bancaInicial: 0 });
          }
          anoAlvoId = anoTarget.id;
        }

        await lancamentos.create({
          anoId: anoAlvoId,
          contaId: modalLanc.contaId,
          data: dataFormatada,
          mes: targetMonth,
          valor: valorParcela,
          descricao: modalLanc.descricao?.trim() || "",
          obs: modalLanc.obs?.trim() || undefined,
          recorrenciaId,
          parcela: i,
          totalParcelas: totalRepeticoes,
        });
      }

      if (tipoRepeticao === "parcelado") {
        toast.success(`${totalRepeticoes} parcelas registradas com sucesso!`);
      } else {
        toast.success(`${totalRepeticoes} lançamentos recorrentes gerados!`);
      }
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

  // Verificação em tempo real do teto orçamentário da categoria no mês selecionado
  const mesDataModal = modalLanc?.data
    ? parseInt(modalLanc.data.split("-")[1], 10) - 1
    : (mesFiltro !== "todos" ? mesFiltro : new Date().getMonth());
  const contasDaCatModal = cs.filter((c) => c.categoriaId === catAtualModal);
  const contaIdsDaCatModal = new Set(contasDaCatModal.map((c) => c.id));
  const projCatModalMes = (ps || [])
    .filter((p) => contaIdsDaCatModal.has(p.contaId) && p.mes === mesDataModal)
    .reduce((acc, p) => acc + p.valor, 0);
  const realCatModalMes = ls
    .filter((l) => contaIdsDaCatModal.has(l.contaId) && l.mes === mesDataModal && l.id !== modalLanc?.id)
    .reduce((acc, l) => acc + l.valor, 0);

  const centavosInputModal = Math.round(Number(modalLanc?.valor || 0) * 100);
  const valorEfetivoMesLanc = (!modalLanc?.id && tipoRepeticao === "parcelado" && dividirValor && numRepeticoes > 1)
    ? Math.round(centavosInputModal / numRepeticoes)
    : centavosInputModal;
  const totalComLancModal = realCatModalMes + valorEfetivoMesLanc;
  const pctTetoModal = projCatModalMes > 0 ? Math.round((totalComLancModal / projCatModalMes) * 100) : 0;
  const excessoTetoModal = totalComLancModal - projCatModalMes;
  const isNaturezaDespesaModal = natAtualModal === "pagar" || natAtualModal === "saida";

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
                    <div class="list__title" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      {l.descricao || c.nome}
                      {l.descricao && <span class="muted" style="font-size:var(--fs-xs);font-weight:normal;">({c.nome})</span>}
                      {l.vinculoDescricao && (
                        <span
                          class="badge"
                          style="font-size:0.7rem;padding:1px 6px;background:var(--primary-soft);color:var(--primary);display:inline-flex;align-items:center;gap:3px;"
                          title={l.vinculoDescricao}
                        >
                          <Icon name="link" style="width:11px;height:11px;" /> {l.vinculoDescricao}
                        </span>
                      )}
                      {l.parcela && l.totalParcelas ? (
                        <span
                          class="badge badge--neutral"
                          style="font-size:0.7rem;padding:1px 6px;"
                          title={`Parcela ${l.parcela} de ${l.totalParcelas}`}
                        >
                          <Icon name="calendar" style="width:12px;height:12px;" /> {l.parcela}/{l.totalParcelas}
                        </span>
                      ) : null}
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
                          if (l.recorrenciaId) {
                            const serie = await lancamentos.byRecorrencia(l.recorrenciaId);
                            if (serie.length > 1) {
                              const excluirTodas = await confirmarAcao({
                                titulo: "Excluir Série Recorrente / Parcelada",
                                mensagem: `Este lançamento faz parte de uma série com ${serie.length} parcelas registradas (${l.parcela || 1}/${l.totalParcelas || serie.length}). Deseja excluir TODAS as ${serie.length} parcelas da série? (Clique em Cancelar para excluir apenas esta parcela).`,
                                rotuloConfirmar: `Excluir Todas (${serie.length})`,
                                rotuloCancelar: "Excluir Apenas Esta",
                                tipo: "danger",
                              });
                              if (excluirTodas) {
                                for (const item of serie) {
                                  await lancamentos.remove(item.id);
                                }
                                toast.success(`${serie.length} parcelas da série excluídas com sucesso.`);
                                return;
                              }
                            }
                          }
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

          {/* Alerta de Teto Orçamentário em Tempo Real */}
          {isNaturezaDespesaModal && catAtualModal && projCatModalMes > 0 && (
            <div
              style={`padding:10px 14px;border-radius:var(--r-md);margin-bottom:var(--sp-3);font-size:var(--fs-xs);display:flex;align-items:flex-start;gap:10px;${
                totalComLancModal > projCatModalMes
                  ? "background:var(--out-soft);color:var(--out);border:1px solid color-mix(in srgb, var(--out) 30%, transparent);"
                  : pctTetoModal >= 80
                  ? "background:color-mix(in srgb, var(--warn) 12%, transparent);color:var(--warn);border:1px solid color-mix(in srgb, var(--warn) 30%, transparent);"
                  : "background:var(--surface-soft);color:var(--text-muted);border:1px solid var(--border);"
              }`}
            >
              <Icon
                name={totalComLancModal > projCatModalMes ? "alertTriangle" : pctTetoModal >= 80 ? "alertTriangle" : "info"}
                style="flex:none;margin-top:2px;"
              />
              <div>
                <b>
                  {totalComLancModal > projCatModalMes
                    ? `⚠️ Atenção: Teto orçamentário de ${MONTHS[mesDataModal]} excedido!`
                    : pctTetoModal >= 80
                    ? `⚡ Alerta de Teto: Limite de ${MONTHS[mesDataModal]} próximo!`
                    : `Teto Orçamentário de ${MONTHS[mesDataModal]}:`}
                </b>
                <div style="margin-top:2px;">
                  Projetado: <b>{money(projCatModalMes)}</b> · Realizado com este lançamento:{" "}
                  <b>{money(totalComLancModal)}</b> ({pctTetoModal}% do teto)
                  {totalComLancModal > projCatModalMes && (
                    <span style="display:block;margin-top:2px;font-weight:600;">
                      Ultrapassará em +{money(excessoTetoModal)}!
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sugestão de Vínculo da Conta Selecionada */}
          {contaAtualObj?.vinculo && (() => {
            const v = contaAtualObj.vinculo;
            const baseMes = calcularBaseLancamentos(v, mesDataModal, ls, cs);
            const valSug = calcularValorVinculado(baseMes, v);
            const nomeOrigem = v.tipo === "conta" ? contaMap.get(v.origemId)?.nome : cats.find((c) => c.id === v.origemId)?.nome;
            const regraLabel = v.percentual !== undefined ? `${v.percentual}%` : money(v.valorFixo || 0);

            return (
              <div
                style="background:var(--primary-soft);border:1px solid color-mix(in srgb, var(--primary) 20%, transparent);border-radius:var(--r-md);padding:10px 14px;margin-bottom:var(--sp-3);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;"
              >
                <div>
                  <div style="font-weight:600;font-size:var(--fs-xs);color:var(--primary);display:flex;align-items:center;gap:5px;">
                    <Icon name="link" style="width:13px;height:13px;" />
                    Vínculo Configurado: {regraLabel} de {nomeOrigem || "Origem"}
                  </div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                    Total realizado na origem em {MONTHS[mesDataModal]}: <b>{money(baseMes)}</b>
                    {valSug > 0 ? ` · Sugestão calculada: ${money(valSug)}` : " (sem lançamentos na origem neste mês)"}
                  </div>
                </div>
                {valSug > 0 && (
                  <button
                    type="button"
                    class="btn btn--secondary"
                    style="min-height:28px;padding:2px 10px;font-size:var(--fs-xs);"
                    onClick={() => setModalLanc({ ...modalLanc, valor: valSug / 100 })}
                  >
                    Aplicar {money(valSug)}
                  </button>
                )}
              </div>
            );
          })()}

          {/* Ferramenta Inline de Cálculo por Vínculo / Entrada (Opcional para qualquer lançamento) */}
          <div style="margin-bottom:var(--sp-3);">
            <div style="display:flex;justify-content:flex-end;">
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                style="font-size:var(--fs-xs);padding:2px 8px;gap:4px;"
                onClick={() => {
                  if (!calcVinculoOrigemId) {
                    const primReceber = cs.find((c) => c.natureza === "receber")?.id || cs[0]?.id || "";
                    setCalcVinculoOrigemId(primReceber);
                  }
                  setCalcVinculoAberto(!calcVinculoAberto);
                }}
              >
                <Icon name="link" style="width:12px;height:12px;" />
                {calcVinculoAberto ? "Ocultar Calculadora de Vínculo" : "🔗 Calcular a partir de vínculo / entrada"}
              </button>
            </div>

            {calcVinculoAberto && (() => {
              const regraInline: RegraVinculo = {
                tipo: calcVinculoTipo,
                origemId: calcVinculoOrigemId,
                percentual: calcVinculoModo === "percentual" ? Number(calcVinculoPercentual || 0) : undefined,
                valorFixo: calcVinculoModo === "fixo" ? Math.round(Number(calcVinculoValorFixo || 0) * 100) : undefined,
              };
              const baseCalculada = calcularBaseLancamentos(regraInline, mesDataModal, ls, cs);
              const valorFinalCalculado = calcularValorVinculado(baseCalculada, regraInline);

              return (
                <div
                  class="card"
                  style="background:var(--surface-soft);border:1px dashed var(--border);padding:10px 12px;border-radius:var(--r-md);margin-top:6px;"
                >
                  <div style="font-weight:600;font-size:var(--fs-xs);color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                    <Icon name="link" style="color:var(--primary);width:14px;height:14px;" />
                    <span>Calculadora de Vínculo Dinâmico para {MONTHS[mesDataModal]}</span>
                  </div>

                  <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                    <div>
                      <label class="form-label" style="font-size:var(--fs-xs);margin-bottom:2px;">Basear em:</label>
                      <div class="tabs tabs--sm" style="margin:0;">
                        <button
                          type="button"
                          class={`tab ${calcVinculoTipo === "conta" ? "is-active" : ""}`}
                          style="font-size:var(--fs-xs);padding:2px 8px;min-height:24px;"
                          onClick={() => {
                            const def = cs.find((c) => c.natureza === "receber")?.id || cs[0]?.id || "";
                            setCalcVinculoTipo("conta");
                            setCalcVinculoOrigemId(def);
                          }}
                        >
                          Conta
                        </button>
                        <button
                          type="button"
                          class={`tab ${calcVinculoTipo === "categoria" ? "is-active" : ""}`}
                          style="font-size:var(--fs-xs);padding:2px 8px;min-height:24px;"
                          onClick={() => {
                            const def = cats.find((c) => c.natureza === "receber")?.id || cats[0]?.id || "";
                            setCalcVinculoTipo("categoria");
                            setCalcVinculoOrigemId(def);
                          }}
                        >
                          Categoria
                        </button>
                      </div>
                    </div>

                    <div>
                      <label class="form-label" style="font-size:var(--fs-xs);margin-bottom:2px;">Regra:</label>
                      <div class="tabs tabs--sm" style="margin:0;">
                        <button
                          type="button"
                          class={`tab ${calcVinculoModo === "percentual" ? "is-active" : ""}`}
                          style="font-size:var(--fs-xs);padding:2px 8px;min-height:24px;"
                          onClick={() => setCalcVinculoModo("percentual")}
                        >
                          % Percentual
                        </button>
                        <button
                          type="button"
                          class={`tab ${calcVinculoModo === "fixo" ? "is-active" : ""}`}
                          style="font-size:var(--fs-xs);padding:2px 8px;min-height:24px;"
                          onClick={() => setCalcVinculoModo("fixo")}
                        >
                          Valor Fixo
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="form-group" style="margin-bottom:8px;">
                    <label class="form-label" style="font-size:var(--fs-xs);margin-bottom:2px;">
                      Origem ({calcVinculoTipo === "conta" ? "Conta" : "Categoria"})
                    </label>
                    {calcVinculoTipo === "conta" ? (
                      <CustomSelect
                        value={calcVinculoOrigemId}
                        placeholder="Selecione a conta base..."
                        options={cs
                          .filter((c) => c.id !== modalLanc?.contaId)
                          .map((c) => ({
                            value: c.id,
                            label: `${c.nome} (${NATURE_META[c.natureza]?.label || c.natureza})`,
                          }))}
                        onChange={(origemId) => setCalcVinculoOrigemId(origemId)}
                      />
                    ) : (
                      <CustomSelect
                        value={calcVinculoOrigemId}
                        placeholder="Selecione a categoria base..."
                        options={cats.map((cat) => ({
                          value: cat.id,
                          label: `${cat.nome} (${NATURE_META[cat.natureza]?.label || cat.natureza})`,
                        }))}
                        onChange={(origemId) => setCalcVinculoOrigemId(origemId)}
                      />
                    )}
                  </div>

                  {calcVinculoModo === "percentual" ? (
                    <div class="form-group" style="margin-bottom:8px;">
                      <label class="form-label" style="font-size:var(--fs-xs);margin-bottom:2px;">
                        Percentual aplicado (%)
                      </label>
                      <div style="display:flex;align-items:center;gap:6px;">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="1000"
                          class="input"
                          style="min-height:30px;font-size:var(--fs-xs);"
                          placeholder="Ex: 30"
                          value={calcVinculoPercentual}
                          onInput={(e) => setCalcVinculoPercentual(e.currentTarget.value)}
                        />
                        <span style="font-weight:600;font-size:var(--fs-sm);">%</span>
                      </div>
                    </div>
                  ) : (
                    <div class="form-group" style="margin-bottom:8px;">
                      <label class="form-label" style="font-size:var(--fs-xs);margin-bottom:2px;">
                        Valor Fixo (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        class="input"
                        style="min-height:30px;font-size:var(--fs-xs);"
                        placeholder="0,00"
                        value={calcVinculoValorFixo}
                        onInput={(e) => setCalcVinculoValorFixo(e.currentTarget.value)}
                      />
                    </div>
                  )}

                  <div
                    style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;background:var(--surface);border-radius:var(--r-sm);border:1px solid var(--border);"
                  >
                    <div style="font-size:var(--fs-xs);color:var(--text-muted);">
                      Base em {MONTHS[mesDataModal]}: <b>{money(baseCalculada)}</b> → Resultado:{" "}
                      <b style="color:var(--primary);">{money(valorFinalCalculado)}</b>
                    </div>
                    <button
                      type="button"
                      class="btn btn--primary btn--sm"
                      style="font-size:var(--fs-xs);min-height:26px;padding:2px 10px;"
                      disabled={valorFinalCalculado <= 0}
                      onClick={() => {
                        setModalLanc({ ...modalLanc, valor: valorFinalCalculado / 100 });
                        setCalcVinculoAberto(false);
                      }}
                    >
                      Aplicar ao Lançamento
                    </button>
                  </div>
                </div>
              );
            })()}
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

          {/* Seletor de Repetição / Parcelamento para novos lançamentos */}
          {!modalLanc?.id && (
            <div style="background:var(--surface-soft);padding:var(--sp-3);border-radius:var(--r-md);border:1px solid var(--border);margin-bottom:var(--sp-3);">
              <label class="form-label" style="margin-bottom:var(--sp-2);display:flex;align-items:center;gap:6px;">
                <Icon name="calendar" /> Repetição / Parcelamento
              </label>
              <div class="tabs" style="margin-bottom:var(--sp-2);">
                <button
                  type="button"
                  class={`tab ${tipoRepeticao === "unico" ? "is-active" : ""}`}
                  onClick={() => setTipoRepeticao("unico")}
                >
                  Único
                </button>
                <button
                  type="button"
                  class={`tab ${tipoRepeticao === "parcelado" ? "is-active" : ""}`}
                  onClick={() => setTipoRepeticao("parcelado")}
                >
                  Parcelado
                </button>
                <button
                  type="button"
                  class={`tab ${tipoRepeticao === "recorrente" ? "is-active" : ""}`}
                  onClick={() => setTipoRepeticao("recorrente")}
                >
                  Fixo Mensal (Recorrente)
                </button>
              </div>

              {tipoRepeticao === "parcelado" && (
                <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
                  <div class="form-row form-row--2" style="align-items:flex-end;">
                    <div class="form-group" style="margin-bottom:0;">
                      <label class="form-label" for="lanc-num-parc">Nº de Parcelas</label>
                      <input
                        id="lanc-num-parc"
                        type="number"
                        min="2"
                        max="60"
                        class="input"
                        value={numRepeticoes}
                        onInput={(e) => setNumRepeticoes(Math.max(2, Math.min(60, parseInt(e.currentTarget.value, 10) || 2)))}
                      />
                    </div>
                    <div class="form-group" style="margin-bottom:0;display:flex;flex-direction:column;justify-content:center;gap:6px;">
                      <label class="form-label">Modo de Valor</label>
                      <div style="display:flex;gap:12px;align-items:center;font-size:var(--fs-xs);flex-wrap:wrap;">
                        <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
                          <input
                            type="radio"
                            name="dividir-valor"
                            checked={dividirValor}
                            onChange={() => setDividirValor(true)}
                          />
                          Dividir total
                        </label>
                        <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
                          <input
                            type="radio"
                            name="dividir-valor"
                            checked={!dividirValor}
                            onChange={() => setDividirValor(false)}
                          />
                          Valor por parcela
                        </label>
                      </div>
                    </div>
                  </div>
                  <div class="muted" style="font-size:var(--fs-xs);">
                    💡 {dividirValor
                      ? `Serão geradas ${numRepeticoes} parcelas de ~${money(Math.round(centavosInputModal / numRepeticoes))} cada (Total: ${money(centavosInputModal)}).`
                      : `Serão geradas ${numRepeticoes} parcelas de ${money(centavosInputModal)} cada (Total: ${money(centavosInputModal * numRepeticoes)}).`}
                  </div>
                </div>
              )}

              {tipoRepeticao === "recorrente" && (
                <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;">
                  <div class="form-row form-row--2" style="align-items:flex-end;">
                    <div class="form-group" style="margin-bottom:0;">
                      <label class="form-label" for="lanc-num-rec">Repetir por quantos meses?</label>
                      <input
                        id="lanc-num-rec"
                        type="number"
                        min="2"
                        max="60"
                        class="input"
                        value={numRepeticoes}
                        onInput={(e) => setNumRepeticoes(Math.max(2, Math.min(60, parseInt(e.currentTarget.value, 10) || 2)))}
                      />
                    </div>
                    <div class="form-group" style="margin-bottom:0;display:flex;flex-direction:column;justify-content:center;">
                      <span class="muted" style="font-size:var(--fs-xs);">
                        Cada mês terá um lançamento fixo de <b>{money(centavosInputModal)}</b>.
                      </span>
                    </div>
                  </div>
                  <div class="muted" style="font-size:var(--fs-xs);">
                    💡 Ideal para assinaturas, aluguéis e custos fixos mensais com vencimento regular.
                  </div>
                </div>
              )}
            </div>
          )}

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

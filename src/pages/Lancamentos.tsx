import { useEffect, useState } from "preact/hooks";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/Modal.tsx";
import { ModalConfirm, confirmarAcao } from "../components/ModalConfirm.tsx";
import { toast } from "../components/Toast.tsx";
import { ContaPicker } from "../components/lancamento/ContaPicker.tsx";
import { FormSection, FormBlock, Disclosure } from "../components/lancamento/FormSection.tsx";
import { MoneyInput } from "../components/lancamento/MoneyInput.tsx";
import { NaturezaSegmented } from "../components/lancamento/NaturezaSegmented.tsx";
import { RepeticaoSelector, type TipoRepeticaoReal } from "../components/lancamento/RepeticaoSelector.tsx";
import { ResumoPainel } from "../components/lancamento/ResumoPainel.tsx";
import { ValorCalculadoEditor } from "../components/lancamento/ValorCalculadoEditor.tsx";
import { calcularBaseLancamentos, calcularValorVinculado } from "../data/calc.ts";
import { anos, categorias, contas, lancamentos, projecoes } from "../data/repo.ts";
import { type Conta, type Lancamento, type Natureza, NATUREZAS, type RegraVinculo, SINAL } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { money, MONTHS, signed } from "../lib/format.ts";
import { calcularFormulaLancamentos, extrairVariaveis } from "../lib/formula.ts";
import { NATURE_META } from "../lib/natureza.ts";
import { anoAtivo, empresaAtiva } from "../state.ts";

export function Lancamentos({ openNewOnMount = false }: { openNewOnMount?: boolean }) {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  const [mesFiltro, setMesFiltro] = useState<number | "todos">(new Date().getMonth());
  const [natFiltro, setNatFiltro] = useState<Natureza | "todas">("todas");
  const [busca, setBusca] = useState<string>("");

  // Modal de lançamento
  const [modalLanc, setModalLanc] = useState<
    (Partial<Lancamento> & { natureza?: Natureza; valorCentavos?: number }) | null
  >(null);

  // Estados de repetição e parcelamento
  const [tipoRepeticao, setTipoRepeticao] = useState<TipoRepeticaoReal>("unico");
  const [numRepeticoes, setNumRepeticoes] = useState<number>(2);
  const [dividirValor, setDividirValor] = useState<boolean>(true);

  // Categoria selecionada e modo de origem do valor
  const [catSelecionadaModal, setCatSelecionadaModal] = useState<string>("");
  const [origemValorReal, setOrigemValorReal] = useState<"manual" | "calculado">("manual");
  const [regraInlineReal, setRegraInlineReal] = useState<RegraVinculo>({
    modo: "simples",
    tipo: "conta",
    percentual: 30,
  });

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

  const getValorProjetadoContaMes = (contaId: string, dataStr: string): number => {
    if (!contaId || !dataStr) return 0;
    const mes = parseInt(dataStr.split("-")[1], 10) - 1;
    const proj = (ps || []).find((p) => p.contaId === contaId && p.mes === mes);
    return proj ? proj.valor : 0;
  };

  const abrirNovo = (naturezaPadrao?: Natureza) => {
    const hoje = new Date();
    const dataStr = `${anoNum}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    const nat = naturezaPadrao || (natFiltro !== "todas" ? natFiltro : "pagar");
    const catsDaNat = cats.filter((c) => c.natureza === nat);
    const primeiraCatId = catsDaNat[0]?.id || "";
    const contasDaCat = cs.filter((c) => c.natureza === nat && c.categoriaId === primeiraCatId && c.ativa);
    const contaIdInicial = contasDaCat[0]?.id || cs.find((c) => c.natureza === nat && c.ativa)?.id || "";
    const mesInicial = mesFiltro !== "todos" ? mesFiltro : hoje.getMonth();
    const projInicial = getValorProjetadoContaMes(contaIdInicial, dataStr);

    setTipoRepeticao("unico");
    setNumRepeticoes(2);
    setDividirValor(true);
    setOrigemValorReal("manual");
    setCatSelecionadaModal(primeiraCatId);
    setModalLanc({
      anoId: ano.id,
      contaId: contaIdInicial,
      data: dataStr,
      mes: mesInicial,
      valorCentavos: projInicial,
      descricao: "",
      obs: "",
      natureza: nat,
    });
  };

  const mudarDataModal = (novaDataStr: string) => {
    if (!modalLanc) return;
    const mesAntigo = parseInt(modalLanc.data.split("-")[1], 10) - 1;
    const mesNovo = parseInt(novaDataStr.split("-")[1], 10) - 1;

    let novoValor = modalLanc.valorCentavos;
    if (!modalLanc.id && mesAntigo !== mesNovo) {
      const projAntiga = (ps || []).find((p) => p.contaId === modalLanc.contaId && p.mes === mesAntigo)?.valor || 0;
      const projNova = (ps || []).find((p) => p.contaId === modalLanc.contaId && p.mes === mesNovo)?.valor || 0;
      if (modalLanc.valorCentavos === 0 || modalLanc.valorCentavos === projAntiga) {
        novoValor = projNova;
      }
    }

    setModalLanc({
      ...modalLanc,
      data: novaDataStr,
      mes: mesNovo,
      valorCentavos: novoValor,
    });
  };

  const aplicarDataHoje = () => {
    const d = new Date();
    const str = `${anoNum}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    mudarDataModal(str);
  };
  const aplicarDataOntem = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const str = `${anoNum}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    mudarDataModal(str);
  };
  const aplicarDataPrimeiroDoMes = () => {
    const mesAtual = modalLanc?.data ? parseInt(modalLanc.data.split("-")[1], 10) : new Date().getMonth() + 1;
    const str = `${anoNum}-${String(mesAtual).padStart(2, "0")}-01`;
    mudarDataModal(str);
  };

  const salvarLancamentoInternal = async (criarOutro = false) => {
    if (!modalLanc || !modalLanc.contaId || !modalLanc.data) {
      toast.warn("Selecione uma conta e informe a data.");
      return;
    }
    const centavos = Math.round(Number(modalLanc.valorCentavos || 0));
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
      setModalLanc(null);
      return;
    }

    if (tipoRepeticao === "unico") {
      const createdLanc = await lancamentos.create({
        anoId: ano.id,
        contaId: modalLanc.contaId,
        data: modalLanc.data,
        mes: mesCalculado,
        valor: centavos,
        descricao: modalLanc.descricao?.trim() || "",
        obs: modalLanc.obs?.trim() || undefined,
      });

      // Verificação proativa de regras de vínculo ou fórmulas que apontam para esta conta ou sua categoria
      const cOrigem = contaMap.get(modalLanc.contaId);
      const catOrigem = cats.find((ct) => ct.id === cOrigem?.categoriaId);
      const nomeOrigemLower = cOrigem?.nome?.toLowerCase() || "";
      const nomeCatLower = catOrigem?.nome?.toLowerCase() || "";

      const vinculadas = cs.filter((target) => {
        if (target.ativa === false || target.id === modalLanc.contaId || !target.vinculo) return false;
        if (target.vinculo.modo === "formula" && target.vinculo.formula) {
          const vars = extrairVariaveis(target.vinculo.formula).map((v) => v.toLowerCase());
          return vars.some(
            (v) =>
              v === nomeOrigemLower ||
              v === `cat:${nomeCatLower}` ||
              v === `cat:${catOrigem?.id}` ||
              v === cOrigem?.id
          );
        }
        return (
          (target.vinculo.tipo === "conta" && target.vinculo.origemId === modalLanc.contaId) ||
          (target.vinculo.tipo === "categoria" && target.vinculo.origemId === cOrigem?.categoriaId)
        );
      });

      // Inclui o lançamento recém-criado para avaliação precisa da fórmula
      const lsComNovo = [...ls, createdLanc];

      for (const target of vinculadas) {
        if (!target.vinculo) continue;
        let valorVinculado = 0;
        let regraTexto = "";

        if (target.vinculo.modo === "formula" && target.vinculo.formula) {
          const resFormula = calcularFormulaLancamentos(
            target.vinculo.formula,
            mesCalculado,
            lsComNovo,
            cs,
            cats
          );
          if (!resFormula.ok || resFormula.valorCentavos <= 0) continue;
          valorVinculado = resFormula.valorCentavos;
          regraTexto = `fx ${target.vinculo.formula}`;
        } else {
          valorVinculado = calcularValorVinculado(centavos, target.vinculo);
          if (valorVinculado <= 0) continue;
          regraTexto = target.vinculo.percentual !== undefined
            ? `${target.vinculo.percentual}%`
            : money(target.vinculo.valorFixo || 0);
        }

        const ok = await confirmarAcao({
          titulo: target.vinculo.modo === "formula" ? "Gerar Lançamento por Fórmula?" : "Gerar Lançamento Vinculado?",
          mensagem: `O lançamento em "${cOrigem?.nome || "conta base"}" compõe o cálculo de "${target.nome}" (${regraTexto}). Deseja gerar agora o lançamento correspondente de ${money(valorVinculado)}?`,
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
            vinculoDescricao: target.vinculo.modo === "formula" ? `Fórmula: ${target.vinculo.formula}` : `Vinculado a ${cOrigem?.nome}`,
          });
          toast.success(`Lançamento vinculado de ${money(valorVinculado)} gerado em "${target.nome}"!`);
        }
      }

      if (criarOutro) {
        toast.success("Lançamento salvo! Pronto para o próximo.");
        setModalLanc({
          anoId: ano.id,
          contaId: modalLanc.contaId,
          data: modalLanc.data,
          mes: modalLanc.mes,
          valorCentavos: 0,
          descricao: "",
          obs: "",
          natureza: natAtualModal,
        });
        setTipoRepeticao("unico");
      } else {
        toast.success("Lançamento registrado com sucesso!");
        setModalLanc(null);
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

      if (criarOutro) {
        toast.success("Pronto para o próximo lançamento.");
        setModalLanc({
          anoId: ano.id,
          contaId: modalLanc.contaId,
          data: modalLanc.data,
          mes: modalLanc.mes,
          valorCentavos: 0,
          descricao: "",
          obs: "",
          natureza: natAtualModal,
        });
        setTipoRepeticao("unico");
      } else {
        setModalLanc(null);
      }
    }
  };

  const salvarLancamento = async (e: Event) => {
    e.preventDefault();
    await salvarLancamentoInternal(false);
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

  const projContaModalMes = modalLanc?.contaId
    ? getValorProjetadoContaMes(modalLanc.contaId, modalLanc.data || "")
    : 0;

  const centavosInputModal = Math.round(Number(modalLanc?.valorCentavos || 0));
  const valorEfetivoMesLanc = (!modalLanc?.id && tipoRepeticao === "parcelado" && dividirValor && numRepeticoes > 1)
    ? Math.round(centavosInputModal / numRepeticoes)
    : centavosInputModal;
  const totalComLancModal = realCatModalMes + valorEfetivoMesLanc;
  const pctTetoModal = projCatModalMes > 0 ? Math.round((totalComLancModal / projCatModalMes) * 100) : 0;
  const excessoTetoModal = totalComLancModal - projCatModalMes;
  const isNaturezaDespesaModal = natAtualModal === "pagar" || natAtualModal === "saida";

  const sugestaoVinculo = contaAtualObj?.vinculo ? (() => {
    const v = contaAtualObj.vinculo;
    if (v.modo === "formula" && v.formula) {
      const res = calcularFormulaLancamentos(v.formula, mesDataModal, ls, cs, cats);
      return {
        valorCentavos: res.valorCentavos,
        detalhe: res.ok ? `fx ${v.formula}` : res.erro || "",
      };
    }
    const baseMes = calcularBaseLancamentos(v, mesDataModal, ls, cs);
    const valSug = calcularValorVinculado(baseMes, v);
    const regraLabel = v.percentual !== undefined ? `${v.percentual}%` : money(v.valorFixo || 0);
    return {
      valorCentavos: valSug,
      detalhe: `${regraLabel} de ${money(baseMes)}`,
    };
  })() : null;

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
                          {l.vinculoDescricao.toLowerCase().includes("fórmula") || l.vinculoDescricao.toLowerCase().includes("formula") ? (
                            <span style="font-weight:700;font-style:italic;font-family:serif;">fx</span>
                          ) : (
                            <Icon name="link" style="width:11px;height:11px;" />
                          )}
                          <span>{l.vinculoDescricao}</span>
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
                          setOrigemValorReal("manual");
                          setModalLanc({
                            ...l,
                            valorCentavos: l.valor,
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
        size="lg"
        onSubmitShortcut={() => {
          salvarLancamentoInternal(false);
        }}
        aside={
          modalLanc ? (
            <ResumoPainel
              modo="real"
              natureza={natAtualModal}
              contaNome={contaAtualObj?.nome}
              categoriaNome={cats.find((c) => c.id === catAtualModal)?.nome}
              valorCentavos={centavosInputModal}
              data={modalLanc.data || ""}
              tipoRepeticao={tipoRepeticao}
              numRepeticoes={numRepeticoes}
              dividirValor={dividirValor}
              tetoOrcamentario={{
                mes: mesDataModal,
                projetado: projCatModalMes,
                realizadoSemEste: realCatModalMes,
              }}
              descricao={modalLanc.descricao}
              obs={modalLanc.obs}
            />
          ) : undefined
        }
        footer={
          <div style="display:flex;align-items:center;justify-content:space-between;width:100%;flex-wrap:wrap;gap:8px;">
            <span class="muted only-desktop" style="font-size:11px;">
              Pressione <kbd style="padding:1px 5px;background:var(--surface);border:1px solid var(--border);border-radius:3px;font-family:inherit;">Ctrl</kbd> + <kbd style="padding:1px 5px;background:var(--surface);border:1px solid var(--border);border-radius:3px;font-family:inherit;">Enter</kbd> para salvar
            </span>
            <div style="display:flex;align-items:center;gap:8px;margin-left:auto;">
              <button type="button" class="btn btn--ghost" onClick={() => setModalLanc(null)}>
                Cancelar
              </button>
              {!modalLanc?.id && (
                <button
                  type="button"
                  class="btn btn--secondary"
                  onClick={() => salvarLancamentoInternal(true)}
                >
                  Salvar e Criar Outro
                </button>
              )}
              <button type="submit" form="form-lancamento" class="btn btn--primary">
                {modalLanc?.id ? "Salvar Alterações" : "Salvar Lançamento"}
              </button>
            </div>
          </div>
        }
      >
        <form id="form-lancamento" onSubmit={(e) => { e.preventDefault(); salvarLancamentoInternal(false); }}>
          {/* Seletor de Natureza */}
          <div style="margin-bottom:var(--sp-3);">
            <NaturezaSegmented
              value={natAtualModal}
              readonly={Boolean(modalLanc?.id)}
              onChange={(novaNat) => {
                const catsDaNovaNat = cats.filter((cat) => cat.natureza === novaNat);
                const primCat = catsDaNovaNat[0]?.id || "";
                const contasDaNovaNat = cs.filter((c) => c.categoriaId === primCat && c.ativa);
                const novaContaId = contasDaNovaNat[0]?.id || "";
                const projVal = getValorProjetadoContaMes(novaContaId, modalLanc?.data || "");
                setCatSelecionadaModal(primCat);
                setModalLanc((prev) => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    natureza: novaNat,
                    contaId: novaContaId,
                    valorCentavos: !prev.id ? projVal : prev.valorCentavos,
                  };
                });
              }}
            />
          </div>

          <FormBlock>
            {/* Seção 1: O Quê? (Conta) */}
            <FormSection num={1} title="O quê? (Conta)">
            <ContaPicker
              id="lanc-conta"
              natureza={natAtualModal}
              categorias={cats}
              contas={cs}
              selectedContaId={modalLanc?.contaId || ""}
              onChange={(contaId, catId) => {
                setCatSelecionadaModal(catId);
                const projVal = getValorProjetadoContaMes(contaId, modalLanc?.data || "");
                setModalLanc((prev) => {
                  if (!prev) return null;
                  return {
                    ...prev,
                    contaId,
                    valorCentavos: !prev.id ? projVal : prev.valorCentavos,
                  };
                });
              }}
              onCriarCategoria={async (nome) => {
                const criada = await categorias.create({
                  empresaId: empId,
                  natureza: natAtualModal,
                  nome,
                });
                setCatSelecionadaModal(criada.id);
                toast.success(`Categoria "${criada.nome}" criada!`);
                return criada.id;
              }}
              onCriarConta={async (nome, categoriaId) => {
                const criada = await contas.create({
                  empresaId: empId,
                  categoriaId,
                  natureza: natAtualModal,
                  nome,
                  ativa: true,
                });
                setCatSelecionadaModal(categoriaId);
                toast.success(`Conta "${criada.nome}" criada!`);
                return criada.id;
              }}
            />
          </FormSection>

          {/* Seção 2: Quanto e Quando? */}
          <FormSection num={2} title="Quanto e Quando?">
            {/* Alternância Manual / Calculado */}
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <label class="form-label" style="margin:0;font-size:var(--fs-xs);">
                Valor do Lançamento *
              </label>
              <div class="tabs tabs--sm" style="margin:0;">
                <button
                  type="button"
                  class={`tab ${origemValorReal === "manual" ? "is-active" : ""}`}
                  style="font-size:var(--fs-xs);padding:2px 8px;"
                  onClick={() => setOrigemValorReal("manual")}
                >
                  Manual
                </button>
                <button
                  type="button"
                  class={`tab ${origemValorReal === "calculado" ? "is-active" : ""}`}
                  style="font-size:var(--fs-xs);padding:2px 8px;"
                  onClick={() => setOrigemValorReal("calculado")}
                >
                  Calculado (fx / 🔗)
                </button>
              </div>
            </div>

            {origemValorReal === "manual" ? (
              <div>
                <MoneyInput
                  id="lanc-valor"
                  variant="hero"
                  autoFocus
                  required
                  valueCentavos={modalLanc?.valorCentavos || 0}
                  onChangeCentavos={(cents) => setModalLanc({ ...modalLanc, valorCentavos: cents })}
                />

                {/* Indicação visual de valor projetado */}
                {projContaModalMes > 0 && !modalLanc?.id && (
                  <div
                    style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;padding:5px 10px;font-size:var(--fs-xs);color:var(--text-muted);background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);"
                  >
                    <div style="display:flex;align-items:center;gap:6px;">
                      <Icon name="check" style="width:13px;height:13px;color:var(--primary);" />
                      <span>
                        Valor projetado em {MONTHS[mesDataModal]}: <strong style="color:var(--text);">{money(projContaModalMes)}</strong>
                      </span>
                    </div>
                    {modalLanc?.valorCentavos !== projContaModalMes && (
                      <button
                        type="button"
                        class="btn btn--secondary btn--sm"
                        style="padding:1px 8px;min-height:22px;height:22px;font-size:11px;"
                        onClick={() => setModalLanc({ ...modalLanc, valorCentavos: projContaModalMes })}
                      >
                        Restaurar projetado
                      </button>
                    )}
                  </div>
                )}

                {/* Sugestão de Vínculo/Fórmula se a conta tiver regra cadastrada */}
                {sugestaoVinculo && sugestaoVinculo.valorCentavos > 0 && (
                  <div
                    style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;padding:6px 10px;background:var(--primary-soft);border-radius:var(--r-sm);border:1px solid color-mix(in srgb, var(--primary) 25%, transparent);font-size:var(--fs-xs);"
                  >
                    <div style="display:flex;align-items:center;gap:6px;color:var(--primary);font-weight:600;">
                      <Icon name="link" style="width:13px;height:13px;" />
                      <span>Sugestão da regra: {money(sugestaoVinculo.valorCentavos)}</span>
                      <span class="muted" style="font-size:11px;">({sugestaoVinculo.detalhe})</span>
                    </div>
                    <button
                      type="button"
                      class="btn btn--secondary btn--sm"
                      style="padding:2px 8px;min-height:24px;font-size:11px;"
                      onClick={() => setModalLanc({ ...modalLanc, valorCentavos: sugestaoVinculo.valorCentavos })}
                    >
                      Aplicar
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <ValorCalculadoEditor
                contas={cs}
                categorias={cats}
                currentContaId={modalLanc?.contaId}
                regra={regraInlineReal}
                onChangeRegra={setRegraInlineReal}
                mesAtivo={mesDataModal}
                avaliarMes={(m) => {
                  if (regraInlineReal.modo === "formula" && regraInlineReal.formula) {
                    const res = calcularFormulaLancamentos(regraInlineReal.formula, m, ls, cs, cats);
                    return { ok: res.ok, valorCentavos: res.valorCentavos, erro: res.erro };
                  }
                  const baseMes = calcularBaseLancamentos(regraInlineReal, m, ls, cs);
                  const val = calcularValorVinculado(baseMes, regraInlineReal);
                  return { ok: true, valorCentavos: val, base: baseMes };
                }}
                onAplicar={(cents) => {
                  setModalLanc({ ...modalLanc, valorCentavos: cents });
                  setOrigemValorReal("manual");
                  toast.info(`Valor de ${money(cents)} aplicado ao lançamento.`);
                }}
              />
            )}

            {/* Data e Atalhos Rápidos */}
            <div class="form-group" style="margin-bottom:0;margin-top:4px;">
              <label class="form-label" for="lanc-data" style="font-size:var(--fs-xs);margin-bottom:2px;">
                Data de Vencimento / Realização *
              </label>
              <input
                id="lanc-data"
                type="date"
                class="input"
                required
                value={modalLanc?.data || ""}
                onInput={(e) => mudarDataModal((e.currentTarget as HTMLInputElement).value)}
              />
              <div class="date-chips">
                <button type="button" class="date-chip" onClick={aplicarDataHoje}>Hoje</button>
                <button type="button" class="date-chip" onClick={aplicarDataOntem}>Ontem</button>
                <button type="button" class="date-chip" onClick={aplicarDataPrimeiroDoMes}>1º do Mês</button>
              </div>
            </div>
          </FormSection>

          {/* Seção 3: Repetição (somente na criação de novo lançamento) */}
          {!modalLanc?.id && (
            <FormSection num={3} title="Repetição">
              <RepeticaoSelector
                modo="real"
                tipo={tipoRepeticao}
                onChangeTipo={setTipoRepeticao}
                numRepeticoes={numRepeticoes}
                onChangeNumRepeticoes={setNumRepeticoes}
                dividirValor={dividirValor}
                onChangeDividirValor={setDividirValor}
              />
            </FormSection>
          )}

          {/* Seção 4: Detalhes Adicionais (Recolhível) */}
          <Disclosure
            title="Detalhes Adicionais"
            defaultOpen={Boolean(modalLanc?.descricao || modalLanc?.obs)}
          >
            <div class="form-group">
              <label class="form-label" for="lanc-desc">Descrição / Fornecedor / Favorecido</label>
              <input
                id="lanc-desc"
                class="input"
                placeholder="Ex: Nota fiscal 1234, Transferência PIX..."
                value={modalLanc?.descricao || ""}
                onInput={(e) => setModalLanc({ ...modalLanc, descricao: (e.currentTarget as HTMLInputElement).value })}
              />
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="lanc-obs">Observação Adicional (Obs)</label>
              <textarea
                id="lanc-obs"
                class="textarea"
                rows={2}
                placeholder="Ex: Detalhes do pagamento, justificativa, comprovante..."
                value={modalLanc?.obs || ""}
                onInput={(e) => setModalLanc({ ...modalLanc, obs: (e.currentTarget as HTMLTextAreaElement).value })}
              />
            </div>
          </Disclosure>
        </FormBlock>
      </form>
    </Modal>
    </>
  );
}

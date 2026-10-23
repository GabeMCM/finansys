import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CustomSelect } from "../components/CustomSelect.tsx";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/Modal.tsx";
import { ModalConfirm, confirmarAcao } from "../components/ModalConfirm.tsx";
import { toast } from "../components/Toast.tsx";
import { CardPendencias } from "../components/lancamento/CardPendencias.tsx";
import { ModalIgnorarProjecao } from "../components/lancamento/ModalIgnorarProjecao.tsx";
import { ContaPicker } from "../components/lancamento/ContaPicker.tsx";
import { FormSection, FormBlock, Disclosure } from "../components/lancamento/FormSection.tsx";
import { MoneyInput } from "../components/lancamento/MoneyInput.tsx";
import { NaturezaSegmented } from "../components/lancamento/NaturezaSegmented.tsx";
import { RepeticaoSelector, type TipoRepeticaoReal } from "../components/lancamento/RepeticaoSelector.tsx";
import { ResumoPainel } from "../components/lancamento/ResumoPainel.tsx";
import { ValorCalculadoEditor } from "../components/lancamento/ValorCalculadoEditor.tsx";
import { calcularBaseLancamentos, calcularPendencias, calcularValorVinculado, type ProjecaoPendente } from "../data/calc.ts";
import { anos, categorias, contas, contasBancarias, lancamentos, projecoes, reservaMovimentos, reservas } from "../data/repo.ts";
import { type Conta, type ContaBancaria, type Lancamento, type Natureza, NATUREZAS, type RegraVinculo, type Reserva, SINAL, FORMAS_PAGAMENTO_PADRAO } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { money, MONTHS, signed } from "../lib/format.ts";
import { calcularFormulaLancamentos, extrairVariaveis } from "../lib/formula.ts";
import { NATURE_META } from "../lib/natureza.ts";
import { anoAtivo, empresaAtiva } from "../state.ts";

export type ModoVisaoRealizacoes = "extrato" | "tabela" | "matriz";

export function Lancamentos({ openNewOnMount = false }: { openNewOnMount?: boolean }) {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  const [mesFiltro, setMesFiltro] = useState<number | "todos">(new Date().getMonth());
  const [natFiltro, setNatFiltro] = useState<Natureza | "todas">("todas");
  const [busca, setBusca] = useState<string>("");

  // Modo de visualização: Extrato diário agrupado, Tabela tabular ou Matriz 12 meses
  const [modoVisao, setModoVisao] = useState<ModoVisaoRealizacoes>(() => {
    return (localStorage.getItem("finansys_lancamentos_visao") as ModoVisaoRealizacoes) || "extrato";
  });
  const [natMatriz, setNatMatriz] = useState<Natureza>("pagar");
  const [catsColapsadasMatriz, setCatsColapsadasMatriz] = useState<Set<string>>(new Set());

  // Modal para ignorar projeção não realizada
  const [modalIgnorarItem, setModalIgnorarItem] = useState<ProjecaoPendente | null>(null);

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
    const [cs, ls, cats, ps, resList, bancoList] = await Promise.all([
      contas.byEmpresa(empId),
      lancamentos.byAno(ano.id),
      categorias.byEmpresa(empId),
      projecoes.byAno(ano.id),
      reservas.byEmpresa(empId),
      contasBancarias.byEmpresa(empId),
    ]);
    return { ano, cs, ls, cats, ps, resList, bancoList };
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

  const { ano, cs, ls, cats, ps, resList, bancoList } = dados;
  const contaMap = new Map<string, Conta>(cs.map((c) => [c.id, c]));
  const catMap = new Map<string, string>(cats.map((c) => [c.id, c.nome]));
  const reservaMap = new Map<string, string>(resList.map((r) => [r.id, r.nome]));
  const bancoMap = new Map<string, string>(bancoList.map((b) => [b.id, b.nome]));

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
    if (!modalLanc || !modalLanc.data) return;
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

    const cConta = contaMap.get(modalLanc.contaId);
    const nat = cConta?.natureza || modalLanc.natureza;
    const tipoRes = modalLanc.reservaId
      ? (nat === "saida" || nat === "pagar" ? "aporte" : "resgate")
      : undefined;

    if (modalLanc.id) {
      await lancamentos.update(modalLanc.id, {
        contaId: modalLanc.contaId,
        data: modalLanc.data,
        mes: mesCalculado,
        valor: centavos,
        descricao: modalLanc.descricao?.trim() || "",
        obs: modalLanc.obs?.trim() || undefined,
        bancoId: modalLanc.bancoId || undefined,
        formaPagamento: modalLanc.formaPagamento || undefined,
        reservaId: modalLanc.reservaId || undefined,
        tipoReserva: tipoRes,
      });

      // Sincroniza movimento na carteira de reservas
      const movVinculado = await reservaMovimentos.byLancamento(modalLanc.id);
      if (modalLanc.reservaId && tipoRes) {
        if (movVinculado) {
          await reservaMovimentos.update(movVinculado.id, {
            reservaId: modalLanc.reservaId,
            tipo: tipoRes,
            valor: centavos,
            data: modalLanc.data,
            mes: mesCalculado,
            contaId: modalLanc.contaId,
            bancoId: modalLanc.bancoId || undefined,
            obs: modalLanc.descricao || modalLanc.obs,
          });
        } else {
          await reservaMovimentos.create({
            empresaId: empId,
            anoId: ano.id,
            reservaId: modalLanc.reservaId,
            tipo: tipoRes,
            valor: centavos,
            data: modalLanc.data,
            mes: mesCalculado,
            contaId: modalLanc.contaId,
            bancoId: modalLanc.bancoId || undefined,
            obs: modalLanc.descricao || modalLanc.obs,
            lancamentoId: modalLanc.id,
          });
        }
      } else if (movVinculado) {
        await reservaMovimentos.remove(movVinculado.id);
      }

      toast.success("Realização atualizada com sucesso!");
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
        bancoId: modalLanc.bancoId || undefined,
        formaPagamento: modalLanc.formaPagamento || undefined,
        reservaId: modalLanc.reservaId || undefined,
        tipoReserva: tipoRes,
      });

      if (modalLanc.reservaId && tipoRes) {
        await reservaMovimentos.create({
          empresaId: empId,
          anoId: ano.id,
          reservaId: modalLanc.reservaId,
          tipo: tipoRes,
          valor: centavos,
          data: modalLanc.data,
          mes: mesCalculado,
          contaId: modalLanc.contaId,
          bancoId: modalLanc.bancoId || undefined,
          obs: modalLanc.descricao || modalLanc.obs,
          lancamentoId: createdLanc.id,
        });
      }

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
        toast.success("Realização salva! Pronto para a próxima.");
        setModalLanc({
          anoId: ano.id,
          contaId: modalLanc.contaId,
          data: modalLanc.data,
          mes: modalLanc.mes,
          valorCentavos: 0,
          descricao: "",
          obs: "",
          bancoId: modalLanc.bancoId || undefined,
          formaPagamento: modalLanc.formaPagamento || undefined,
          natureza: natAtualModal,
        });
        setTipoRepeticao("unico");
      } else {
        toast.success("Realização registrada com sucesso!");
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

        const createdRep = await lancamentos.create({
          anoId: anoAlvoId,
          contaId: modalLanc.contaId,
          data: dataFormatada,
          mes: targetMonth,
          valor: valorParcela,
          descricao: modalLanc.descricao?.trim() || "",
          obs: modalLanc.obs?.trim() || undefined,
          bancoId: modalLanc.bancoId || undefined,
          formaPagamento: modalLanc.formaPagamento || undefined,
          recorrenciaId,
          parcela: i,
          totalParcelas: totalRepeticoes,
          reservaId: modalLanc.reservaId || undefined,
          tipoReserva: tipoRes,
        });

        if (modalLanc.reservaId && tipoRes) {
          await reservaMovimentos.create({
            empresaId: empId,
            anoId: anoAlvoId,
            reservaId: modalLanc.reservaId,
            tipo: tipoRes,
            valor: valorParcela,
            data: dataFormatada,
            mes: targetMonth,
            contaId: modalLanc.contaId,
            bancoId: modalLanc.bancoId || undefined,
            obs: modalLanc.descricao || modalLanc.obs,
            lancamentoId: createdRep.id,
          });
        }
      }

      if (tipoRepeticao === "parcelado") {
        toast.success(`${totalRepeticoes} parcelas registradas com sucesso!`);
      } else {
        toast.success(`${totalRepeticoes} realizações recorrentes geradas!`);
      }

      if (criarOutro) {
        toast.success("Pronto para a próxima realização.");
        setModalLanc({
          anoId: ano.id,
          contaId: modalLanc.contaId,
          data: modalLanc.data,
          mes: modalLanc.mes,
          valorCentavos: 0,
          descricao: "",
          obs: "",
          bancoId: modalLanc.bancoId || undefined,
          formaPagamento: modalLanc.formaPagamento || undefined,
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

  const bancoSelecionadoModal = bancoList.find((b) => b.id === modalLanc?.bancoId);
  const opcoesFormasPagamento = (bancoSelecionadoModal?.formasPagamento && bancoSelecionadoModal.formasPagamento.length > 0)
    ? bancoSelecionadoModal.formasPagamento
    : FORMAS_PAGAMENTO_PADRAO;

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

  // Pendências de projeções para o período filtrado
  const pendenciasPeriodo = calcularPendencias(ps, ls, anoNum, mesFiltro, new Date());
  // Pendências do ano para os marcadores dos meses
  const pendenciasAno = calcularPendencias(ps, ls, anoNum, "todos", new Date());
  const statusMeses = new Map<number, "vencida" | "a_vencer">();
  for (const p of pendenciasAno) {
    const atual = statusMeses.get(p.mes);
    if (p.status === "vencida") {
      statusMeses.set(p.mes, "vencida");
    } else if (!atual) {
      statusMeses.set(p.mes, "a_vencer");
    }
  }

  // Totais projetados para o período
  const projFiltradas = ps.filter((p) => mesFiltro === "todos" || p.mes === mesFiltro);
  const projPorNat = { pagar: 0, receber: 0, aporte: 0, saida: 0 };
  for (const p of projFiltradas) {
    const c = contaMap.get(p.contaId);
    if (c) projPorNat[c.natureza] += p.valor;
  }
  const totEntradasReal = totaisPorNat.receber + totaisPorNat.aporte;
  const totEntradasProj = projPorNat.receber + projPorNat.aporte;
  const totSaidasReal = totaisPorNat.pagar + totaisPorNat.saida;
  const totSaidasProj = projPorNat.pagar + projPorNat.saida;
  const resultadoProjLiquido = totEntradasProj - totSaidasProj;

  // Conciliação de contas projetadas
  const contasComProjecao = new Set(projFiltradas.filter((p) => p.valor > 0).map((p) => p.contaId));
  const totalContasProjetadas = contasComProjecao.size;
  const contasComLancamento = new Set(filtrados.map((l) => l.contaId));
  let contasConciliadasCount = 0;
  for (const cId of contasComProjecao) {
    if (contasComLancamento.has(cId)) contasConciliadasCount++;
  }
  const pctConciliacao = totalContasProjetadas > 0
    ? Math.round((contasConciliadasCount / totalContasProjetadas) * 100)
    : 100;

  // Ações de pendências
  const lancarDePendencia = (pend: ProjecaoPendente) => {
    const c = contaMap.get(pend.contaId);
    const nat = c?.natureza || "pagar";
    setCatSelecionadaModal(c?.categoriaId || "");
    setOrigemValorReal("manual");
    setModalLanc({
      anoId: ano.id,
      contaId: pend.contaId,
      data: pend.dataSugerida,
      mes: pend.mes,
      valorCentavos: pend.valorPendente,
      descricao: "",
      obs: "",
      natureza: nat,
    });
  };

  const abrirIgnorarProjecao = (pend: ProjecaoPendente) => {
    setModalIgnorarItem(pend);
  };

  const confirmarIgnorarProjecao = async (modo: "somar_proximo" | "apenas_ignorar") => {
    if (!modalIgnorarItem || !ano) return;
    const { contaId, mes, valorPendente } = modalIgnorarItem;
    if (modo === "somar_proximo" && mes < 11) {
      const mesProx = mes + 1;
      const projProx = ps.find((p) => p.contaId === contaId && p.mes === mesProx);
      const valAtualProx = projProx?.valor || 0;
      await projecoes.set(ano.id, contaId, mesProx, valAtualProx + valorPendente);
      await projecoes.set(ano.id, contaId, mes, 0);
      toast.success(`R$ ${money(valorPendente)} transferidos para a projeção de ${MONTHS[mesProx]}!`);
    } else {
      await projecoes.set(ano.id, contaId, mes, 0);
      toast.success(`Projeção de ${MONTHS[mes]} ignorada.`);
    }
    setModalIgnorarItem(null);
  };

  const trocarModoVisao = (novoModo: ModoVisaoRealizacoes) => {
    setModoVisao(novoModo);
    localStorage.setItem("finansys_lancamentos_visao", novoModo);
  };

  const toggleCatMatriz = (catId: string) => {
    setCatsColapsadasMatriz((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const atualizarValorRealMatriz = async (c: Conta, m: number, valorReais: number) => {
    if (!ano) return;
    const cents = Math.round(Number(valorReais || 0) * 100);
    const lancsNoMes = ls.filter((l) => l.contaId === c.id && l.mes === m);
    const totalAtual = lancsNoMes.reduce((acc, l) => acc + l.valor, 0);
    if (cents === totalAtual) return;

    if (lancsNoMes.length === 1) {
      if (cents === 0) {
        await lancamentos.remove(lancsNoMes[0].id);
        toast.info(`Realização de ${c.nome} removida em ${MONTHS[m]}.`);
      } else {
        await lancamentos.update(lancsNoMes[0].id, { valor: cents });
        toast.success(`Realização de ${c.nome} atualizada para ${money(cents)} em ${MONTHS[m]}.`);
      }
    } else if (lancsNoMes.length === 0) {
      if (cents > 0) {
        const diaHoje = new Date().getDate();
        const mesHoje = new Date().getMonth();
        const anoAtualHoje = new Date().getFullYear();
        let diaStr = "01";
        if (m === mesHoje && anoNum === anoAtualHoje) {
          diaStr = String(diaHoje).padStart(2, "0");
        }
        const dataStr = `${anoNum}-${String(m + 1).padStart(2, "0")}-${diaStr}`;
        await lancamentos.create({
          anoId: ano.id,
          contaId: c.id,
          mes: m,
          data: dataStr,
          valor: cents,
          descricao: c.nome,
        });
        toast.success(`Realização de ${money(cents)} registrada para ${c.nome} em ${MONTHS[m]}!`);
      }
    } else {
      toast.warn(`Esta conta possui ${lancsNoMes.length} realizações em ${MONTHS[m]}. Abra no Extrato para editar individualmente.`);
    }
  };

  const realizarProjecaoMatriz = async (c: Conta, m: number, projCents: number) => {
    if (!ano || projCents <= 0) return;
    const proj = ps.find((p) => p.contaId === c.id && p.mes === m);
    let dataStr = proj?.data;
    if (!dataStr) {
      const diaHoje = new Date().getDate();
      const mesHoje = new Date().getMonth();
      const anoAtualHoje = new Date().getFullYear();
      let diaStr = "01";
      if (m === mesHoje && anoNum === anoAtualHoje) {
        diaStr = String(diaHoje).padStart(2, "0");
      }
      dataStr = `${anoNum}-${String(m + 1).padStart(2, "0")}-${diaStr}`;
    }

    await lancamentos.create({
      anoId: ano.id,
      contaId: c.id,
      mes: m,
      data: dataStr,
      valor: projCents,
      descricao: c.nome,
    });
    toast.success(`Projeção de ${money(projCents)} realizada para ${c.nome} em ${MONTHS[m]}!`);
  };

  const formatarDataExtrato = (dataStr: string): string => {
    if (!dataStr) return "";
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const ontemStr = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, "0")}-${String(ontem.getDate()).padStart(2, "0")}`;

    const [a, m, d] = dataStr.split("-");
    const dataObj = new Date(parseInt(a, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    const diaSemana = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][dataObj.getDay()];
    const mesExtenso = MONTHS[parseInt(m, 10) - 1];

    if (dataStr === hojeStr) {
      return `Hoje · ${d} de ${mesExtenso} de ${a}`;
    }
    if (dataStr === ontemStr) {
      return `Ontem · ${d} de ${mesExtenso} de ${a}`;
    }
    return `${d} de ${mesExtenso} de ${a} · ${diaSemana}`;
  };

  const gruposPorData = new Map<string, Lancamento[]>();
  for (const l of filtrados) {
    const d = l.data;
    if (!gruposPorData.has(d)) gruposPorData.set(d, []);
    gruposPorData.get(d)!.push(l);
  }
  const datasOrdenadas = Array.from(gruposPorData.keys()).sort((a, b) => b.localeCompare(a));

  const excluirLancamento = async (l: Lancamento) => {
    if (l.recorrenciaId) {
      const serie = await lancamentos.byRecorrencia(l.recorrenciaId);
      if (serie.length > 1) {
        const excluirTodas = await confirmarAcao({
          titulo: "Excluir Série Recorrente / Parcelada",
          mensagem: `Esta realização faz parte de uma série com ${serie.length} parcelas registradas (${l.parcela || 1}/${l.totalParcelas || serie.length}). Deseja excluir TODAS as ${serie.length} parcelas da série? (Clique em Cancelar para excluir apenas esta parcela).`,
          rotuloConfirmar: `Excluir Todas (${serie.length})`,
          rotuloCancelar: "Excluir Apenas Esta",
          tipo: "danger",
        });
        if (excluirTodas) {
          for (const item of serie) {
            const mov = await reservaMovimentos.byLancamento(item.id);
            if (mov) await reservaMovimentos.remove(mov.id);
            await lancamentos.remove(item.id);
          }
          toast.success(`${serie.length} parcelas da série excluídas com sucesso.`);
          return;
        }
      }
    }
    const ok = await confirmarAcao({
      titulo: "Excluir Realização",
      mensagem: "Deseja excluir esta realização financeira? Esta ação é irreversível.",
      rotuloConfirmar: "Excluir Realização",
      tipo: "danger",
    });
    if (ok) {
      const mov = await reservaMovimentos.byLancamento(l.id);
      if (mov) await reservaMovimentos.remove(mov.id);
      await lancamentos.remove(l.id);
      toast.success("Realização excluída com sucesso.");
    }
  };

  // Dados calculados para a visualização em Matriz 12 Meses
  const csMatriz = cs.filter((c) => c.natureza === natMatriz && c.ativa);
  const catsMatriz = cats.filter((cat) => cat.natureza === natMatriz);
  const termoMatriz = busca.trim().toLowerCase();
  const catsFiltradasMatriz = catsMatriz.filter((cat) => {
    if (!termoMatriz) return true;
    if (cat.nome.toLowerCase().includes(termoMatriz)) return true;
    const contasDaCat = csMatriz.filter((c) => c.categoriaId === cat.id);
    return contasDaCat.some((c) => c.nome.toLowerCase().includes(termoMatriz));
  });

  return (
    <>
      <div class="page-head" style="flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="display:flex;align-items:center;gap:8px;">Realizações {anoNum}</h1>
          <p>Valores efetivamente realizados e conciliação com o planejamento financeiro</p>
        </div>

        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          {/* Seletor de visualização Matriz 12 Meses / Extrato / Tabela - Padrão consistente com Projeções */}
          <div class="tabs tabs--sm" style="margin-bottom:0;">
            <button
              type="button"
              class={`tab ${modoVisao === "matriz" ? "is-active" : ""}`}
              style="padding:6px 12px;font-size:var(--fs-xs);min-height:30px;"
              onClick={() => trocarModoVisao("matriz")}
              title="Visualização em Matriz 12 Meses (Lançar direto da Projeção)"
            >
              <Icon name="grid" style="width:14px;height:14px;" />
              <span>Matriz 12 Meses</span>
            </button>
            <button
              type="button"
              class={`tab ${modoVisao === "extrato" ? "is-active" : ""}`}
              style="padding:6px 12px;font-size:var(--fs-xs);min-height:30px;"
              onClick={() => trocarModoVisao("extrato")}
              title="Visualização em Extrato Diário"
            >
              <Icon name="list" style="width:14px;height:14px;" />
              <span>Extrato</span>
            </button>
            <button
              type="button"
              class={`tab ${modoVisao === "tabela" ? "is-active" : ""}`}
              style="padding:6px 12px;font-size:var(--fs-xs);min-height:30px;"
              onClick={() => trocarModoVisao("tabela")}
              title="Visualização em Tabela Tabular"
            >
              <Icon name="matrix" style="width:14px;height:14px;" />
              <span>Tabela</span>
            </button>
          </div>

          <button type="button" class="btn btn--primary" onClick={() => abrirNovo()}>
            <Icon name="plus" /> Nova Realização
          </button>
        </div>
      </div>

      {/* Seletor de meses compacto com marcadores de pendências */}
      <div class="hscroll" style="margin-bottom:var(--sp-3);">
        <button
          type="button"
          class={`chip ${mesFiltro === "todos" ? "is-active" : ""}`}
          onClick={() => setMesFiltro("todos")}
          style="display:inline-flex;align-items:center;gap:6px;"
        >
          <span>Ano Todo</span>
          {pendenciasAno.length > 0 && (
            <span
              style={`width:6px;height:6px;border-radius:50%;background:${
                pendenciasAno.some((p) => p.status === "vencida") ? "var(--out)" : "#f59e0b"
              };flex-shrink:0;`}
              title={`${pendenciasAno.length} conta(s) pendente(s)`}
            />
          )}
        </button>
        {MONTHS.map((m, idx) => {
          const statusMes = statusMeses.get(idx);
          return (
            <button
              type="button"
              key={m}
              class={`chip ${mesFiltro === idx ? "is-active" : ""}`}
              onClick={() => setMesFiltro(idx)}
              style="display:inline-flex;align-items:center;gap:6px;"
            >
              <span>{m}</span>
              {statusMes && (
                <span
                  style={`width:6px;height:6px;border-radius:50%;background:${
                    statusMes === "vencida" ? "var(--out)" : "#f59e0b"
                  };flex-shrink:0;`}
                  title={statusMes === "vencida" ? "Possui contas vencidas" : "Possui contas a vencer"}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Cockpit Resumo do Período */}
      <div class="cockpit-grid">
        <div class="cockpit-card">
          <div class="cockpit-card__label">
            <i class="dot" style="background:var(--in);" />
            <span>Entradas Realizadas</span>
          </div>
          <div class="cockpit-card__val num tone-in">
            {money(totEntradasReal)}
          </div>
          <div class="cockpit-card__sub num">
            Meta: {money(totEntradasProj)} ({totEntradasProj > 0 ? Math.round((totEntradasReal / totEntradasProj) * 100) : 0}%)
          </div>
        </div>

        <div class="cockpit-card">
          <div class="cockpit-card__label">
            <i class="dot" style="background:var(--out);" />
            <span>Saídas Realizadas</span>
          </div>
          <div class="cockpit-card__val num tone-out">
            {money(totSaidasReal)}
          </div>
          <div class="cockpit-card__sub num">
            Teto: {money(totSaidasProj)} ({totSaidasProj > 0 ? Math.round((totSaidasReal / totSaidasProj) * 100) : 0}%)
          </div>
        </div>

        <div class="cockpit-card">
          <div class="cockpit-card__label">
            <Icon name="check" style="width:13px;height:13px;color:var(--primary);" />
            <span>Resultado Líquido</span>
          </div>
          <div class={`cockpit-card__val num ${resultadoRealLiquido >= 0 ? "tone-in" : "tone-out"}`}>
            {signed(resultadoRealLiquido)}
          </div>
          <div class="cockpit-card__sub num">
            Projetado: {signed(resultadoProjLiquido)}
          </div>
        </div>

        <div class="cockpit-card">
          <div class="cockpit-card__label">
            <Icon name="calendar" style="width:13px;height:13px;color:var(--text-muted);" />
            <span>Conciliação de Contas</span>
          </div>
          <div class="cockpit-card__val num" style="color:var(--text);">
            {contasConciliadasCount} / {totalContasProjetadas}
          </div>
          <div class="cockpit-card__sub">
            {pctConciliacao}% das previsões realizadas
          </div>
        </div>
      </div>

      {/* Central de Pendências e Contas Vencidas / Não Lançadas */}
      <CardPendencias
        pendencias={pendenciasPeriodo}
        contas={cs}
        categorias={cats}
        mesFiltro={mesFiltro}
        onLancar={lancarDePendencia}
        onIgnorar={abrirIgnorarProjecao}
      />

      {/* Barra de Ferramentas e Extrato / Tabela */}
      <section class="card">
        <div class="card__head lancamentos-toolbar">
          <div class="lancamentos-toolbar__search">
            <input
              type="search"
              class="input"
              placeholder="Buscar lançamento, conta ou observação..."
              value={busca}
              onInput={(e) => setBusca((e.currentTarget as HTMLInputElement).value)}
              style="min-height:36px;font-size:var(--fs-xs);"
            />
          </div>

          <div class="lancamentos-toolbar__filters">
            {/* Seletor de Natureza com badges de contagem */}
            <div class="tabs tabs--sm lancamentos-toolbar__nat-tabs" style="margin:0;">
              <button
                type="button"
                class={`tab ${natFiltro === "todas" ? "is-active" : ""}`}
                style="padding:4px 8px;font-size:var(--fs-xs);"
                onClick={() => setNatFiltro("todas")}
              >
                Todas ({filtrados.length})
              </button>
              {NATUREZAS.map((n) => {
                const meta = NATURE_META[n];
                const countNat = ls.filter((l) => {
                  const c = contaMap.get(l.contaId);
                  if (!c || c.natureza !== n) return false;
                  if (mesFiltro !== "todos" && l.mes !== mesFiltro) return false;
                  return true;
                }).length;
                return (
                  <button
                    type="button"
                    key={n}
                    class={`tab ${natFiltro === n ? "is-active" : ""}`}
                    style="padding:4px 8px;font-size:var(--fs-xs);"
                    onClick={() => setNatFiltro(n)}
                  >
                    <i class="dot" style={`background:var(--${meta.tone});`} />
                    <span>{meta.label}</span>
                    <span class="muted" style="font-size:10px;">({countNat})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {modoVisao === "matriz" ? (
          /* Modo Matriz 12 Meses (Lançar direto da Projeção) */
          <div class="stack" style="padding:var(--sp-3);">
            {/* Sub-toolbar da Matriz: Seletor de Natureza e Controles */}
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:var(--sp-2);">
              <div class="tabs tabs--sm" style="margin:0;">
                {NATUREZAS.map((n) => {
                  const meta = NATURE_META[n];
                  const csDaNat = cs.filter((c) => c.natureza === n && c.ativa);
                  return (
                    <button
                      type="button"
                      key={n}
                      class={`tab ${natMatriz === n ? "is-active" : ""}`}
                      style="padding:4px 10px;font-size:var(--fs-xs);"
                      onClick={() => setNatMatriz(n)}
                    >
                      <i class="dot" style={`background:var(--${meta.tone});`} />
                      <span>{meta.label}</span>
                      <span class="muted" style="font-size:10px;">({csDaNat.length})</span>
                    </button>
                  );
                })}
              </div>

              <div style="display:flex;align-items:center;gap:8px;">
                {catsMatriz.length > 0 && (
                  <button
                    type="button"
                    class="btn btn--ghost btn--sm"
                    style="font-size:var(--fs-xs);height:28px;"
                    onClick={() => {
                      if (catsColapsadasMatriz.size === catsMatriz.length) {
                        setCatsColapsadasMatriz(new Set());
                      } else {
                        setCatsColapsadasMatriz(new Set(catsMatriz.map((c) => c.id)));
                      }
                    }}
                  >
                    {catsColapsadasMatriz.size === catsMatriz.length ? "Expandir Todas" : "Recolher Todas"}
                  </button>
                )}
              </div>
            </div>

            {csMatriz.length === 0 && catsMatriz.length === 0 ? (
              <div class="empty" style="padding:var(--sp-6) var(--sp-4);">
                <Icon name="grid" />
                <h2>Nenhuma conta em {NATURE_META[natMatriz].label}</h2>
                <p>Cadastre contas e projeções para realizar diretamente na grade.</p>
              </div>
            ) : (
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th style="min-width:220px;text-align:left;">Conta / Categoria</th>
                      {MONTHS.map((m, idx) => {
                        const isMesAtual = idx === new Date().getMonth();
                        return (
                          <th
                            key={m}
                            class={isMesAtual ? "is-current-month" : ""}
                            style="text-align:center;min-width:85px;"
                            title={isMesAtual ? "Mês Atual" : undefined}
                          >
                            {m.toUpperCase()}
                            {isMesAtual && <span style="display:block;font-size:0.55rem;opacity:0.8;">ATUAL</span>}
                          </th>
                        );
                      })}
                      <th style="background:var(--surface-solid);min-width:110px;text-align:right;font-weight:700;">
                        Total Realizado
                      </th>
                      <th style="background:var(--surface-solid);min-width:70px;text-align:center;">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catsFiltradasMatriz.map((cat) => {
                      const contasDaCat = csMatriz.filter((c) => {
                        if (c.categoriaId !== cat.id) return false;
                        if (!termoMatriz) return true;
                        return c.nome.toLowerCase().includes(termoMatriz) || cat.nome.toLowerCase().includes(termoMatriz);
                      });
                      const isColapsada = catsColapsadasMatriz.has(cat.id);
                      const subRealCatAno = contasDaCat.reduce((sum, c) => sum + ls.filter((l) => l.contaId === c.id).reduce((s, l) => s + l.valor, 0), 0);

                      return (
                        <Fragment key={`cat-group-${cat.id}`}>
                          {/* Linha Cabeçalho da Categoria com Subtotais dos 12 Meses */}
                          <tr key={`cat-${cat.id}`} class="category-row">
                            <td>
                              <div
                                style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;"
                                onClick={() => toggleCatMatriz(cat.id)}
                              >
                                <Icon
                                  name="chevron"
                                  style={`width:13px;height:13px;flex-shrink:0;transition:transform 0.2s ease;${
                                    isColapsada ? "transform:rotate(-90deg);" : ""
                                  }`}
                                />
                                <i class="dot" style={`background:var(--${NATURE_META[natMatriz].tone});flex-shrink:0;`} />
                                <span style="font-weight:700;">{cat.nome}</span>
                                <span class="muted" style="font-size:var(--fs-xs);font-weight:normal;">
                                  ({contasDaCat.length})
                                </span>
                              </div>
                            </td>

                            {MONTHS.map((_, m) => {
                              const isMesAtual = m === new Date().getMonth();
                              const subRealMes = contasDaCat.reduce(
                                (acc, c) => acc + ls.filter((l) => l.contaId === c.id && l.mes === m).reduce((s, l) => s + l.valor, 0),
                                0,
                              );
                              const subProjMes = contasDaCat.reduce(
                                (acc, c) => acc + (ps || []).filter((p) => p.contaId === c.id && p.mes === m).reduce((s, p) => s + p.valor, 0),
                                0,
                              );

                              return (
                                <td
                                  key={m}
                                  class={isMesAtual ? "is-current-month" : ""}
                                  style="font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;font-size:var(--fs-xs);text-align:right;"
                                >
                                  {subRealMes > 0 ? (
                                    money(subRealMes)
                                  ) : subProjMes > 0 ? (
                                    <span class="muted" style="font-weight:normal;" title={`Meta: ${money(subProjMes)}`}>
                                      ({money(subProjMes)})
                                    </span>
                                  ) : (
                                    <span class="muted" style="font-weight:normal;">—</span>
                                  )}
                                </td>
                              );
                            })}

                            <td style="font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;background:var(--surface-soft);text-align:right;">
                              {money(subRealCatAno)}
                            </td>
                            <td style="background:var(--surface-soft);text-align:center;">—</td>
                          </tr>

                          {/* Linhas das Contas pertencentes à Categoria */}
                          {!isColapsada &&
                            contasDaCat.map((c) => {
                              const totalContaReal = ls.filter((l) => l.contaId === c.id).reduce((s, l) => s + l.valor, 0);

                              return (
                                <tr key={c.id}>
                                  <td style="padding-left:26px;text-align:left;">
                                    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                                      <span style="font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                        {c.nome}
                                      </span>
                                    </div>
                                  </td>

                                  {MONTHS.map((_, m) => {
                                    const isMesAtual = m === new Date().getMonth();
                                    const lancsContaMes = ls.filter((l) => l.contaId === c.id && l.mes === m);
                                    const realContaMes = lancsContaMes.reduce((acc, l) => acc + l.valor, 0);
                                    const projContaMes = (ps || []).find((p) => p.contaId === c.id && p.mes === m)?.valor || 0;

                                    return (
                                      <td
                                        key={m}
                                        class={isMesAtual ? "is-current-month" : ""}
                                        style="position:relative;padding:3px 4px;text-align:center;"
                                      >
                                        {lancsContaMes.length > 1 ? (
                                          <div style="display:flex;align-items:center;justify-content:center;gap:3px;">
                                            <span class="num has-val" style="font-size:var(--fs-xs);font-weight:700;">
                                              {money(realContaMes)}
                                            </span>
                                            <span
                                              class="badge badge--neutral"
                                              style="font-size:9px;padding:1px 3px;cursor:pointer;"
                                              title={`${lancsContaMes.length} realizações neste mês. Clique para filtrar no Extrato.`}
                                              onClick={() => {
                                                setMesFiltro(m);
                                                setBusca(c.nome);
                                                trocarModoVisao("extrato");
                                              }}
                                            >
                                              {lancsContaMes.length}x
                                            </span>
                                          </div>
                                        ) : (
                                          <div style="position:relative;display:inline-flex;align-items:center;">
                                            <input
                                              type="number"
                                              step="0.01"
                                              inputMode="decimal"
                                              class={`input-cell ${realContaMes > 0 ? "has-val" : ""}`}
                                              value={realContaMes ? (realContaMes / 100).toFixed(2) : ""}
                                              placeholder={projContaMes > 0 ? (projContaMes / 100).toFixed(2) : "0,00"}
                                              title={
                                                realContaMes > 0
                                                  ? `Realizado: ${money(realContaMes)}${projContaMes > 0 ? ` (Meta: ${money(projContaMes)})` : ""}`
                                                  : projContaMes > 0
                                                  ? `Meta projetada: ${money(projContaMes)}. Digite o valor ou clique no botão para realizar.`
                                                  : "0,00"
                                              }
                                              onFocus={(e) => (e.currentTarget as HTMLInputElement).select()}
                                              onBlur={(e) => {
                                                const val = parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
                                                if (val !== realContaMes / 100) {
                                                  atualizarValorRealMatriz(c, m, val);
                                                }
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  (e.currentTarget as HTMLInputElement).blur();
                                                }
                                              }}
                                            />
                                            {realContaMes === 0 && projContaMes > 0 && (
                                              <button
                                                type="button"
                                                class="btn btn--ghost btn--icon"
                                                style="position:absolute;right:2px;top:50%;transform:translateY(-50%);width:18px;height:18px;padding:0;color:var(--primary);opacity:0.85;"
                                                onClick={() => realizarProjecaoMatriz(c, m, projContaMes)}
                                                title={`Realizar conforme meta de ${money(projContaMes)}`}
                                              >
                                                <Icon name="check" style="width:11px;height:11px;" />
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}

                                  <td style="font-weight:700;font-variant-numeric:tabular-nums;text-align:right;background:var(--surface-soft);">
                                    <span class={totalContaReal > 0 ? `tone-${NATURE_META[natMatriz].tone}` : ""}>
                                      {money(totalContaReal)}
                                    </span>
                                  </td>
                                  <td style="text-align:center;background:var(--surface-soft);">
                                    <button
                                      type="button"
                                      class="btn btn--ghost btn--icon"
                                      style="width:24px;height:24px;min-height:24px;"
                                      onClick={() => {
                                        setCatSelecionadaModal(c.categoriaId);
                                        abrirNovo();
                                        setModalLanc((prev) => prev ? { ...prev, contaId: c.id, natureza: c.natureza } : null);
                                      }}
                                      title={`Nova realização em ${c.nome}`}
                                    >
                                      <Icon name="plus" style="width:12px;height:12px;" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : filtrados.length === 0 ? (
          <div class="empty" style="padding:var(--sp-6) var(--sp-4);">
            <Icon name="list" />
            <h2>Nenhuma realização encontrada</h2>
            <p>
              {pendenciasPeriodo.length > 0
                ? "Existem contas projetadas aguardando realização no card de pendências acima."
                : "Clique em 'Nova Realização' para registrar uma receita, despesa ou aporte."}
            </p>
          </div>
        ) : modoVisao === "extrato" ? (
          /* Modo Extrato Agrupado por Data */
          <div style="padding:0 var(--sp-2) var(--sp-2) var(--sp-2);">
            {datasOrdenadas.map((dataStr) => {
              const itensDoDia = gruposPorData.get(dataStr) || [];
              const saldoDoDia = itensDoDia.reduce((acc, l) => {
                const c = contaMap.get(l.contaId);
                return acc + (c ? SINAL[c.natureza] * l.valor : 0);
              }, 0);

              return (
                <div key={dataStr} class="extrato-grupo">
                  <div class="extrato-grupo__header">
                    <span>{formatarDataExtrato(dataStr)}</span>
                    <span class={`num ${saldoDoDia >= 0 ? "tone-in" : "tone-out"}`}>
                      {signed(saldoDoDia)}
                    </span>
                  </div>

                  {itensDoDia.map((l) => {
                    const c = contaMap.get(l.contaId);
                    if (!c) return null;
                    const meta = NATURE_META[c.natureza];
                    const sinal = SINAL[c.natureza];

                    return (
                      <div class="extrato-item" key={l.id}>
                        <div class="extrato-item__icon">
                          <div class={`list__icon bg-${meta.tone}`} style="flex-shrink:0;">
                            <Icon name={meta.icon} />
                          </div>
                        </div>

                        <div class="extrato-item__info">
                          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                            <strong style="font-size:var(--fs-sm);color:var(--text);">
                              {l.descricao || c.nome}
                            </strong>
                            {l.descricao && (
                              <span class="muted" style="font-size:var(--fs-xs);">
                                ({c.nome})
                              </span>
                            )}
                            <span class={`badge badge--${meta.tone}`} style="font-size:0.65rem;padding:0 5px;">
                              {meta.label}
                            </span>
                            {l.vinculoDescricao && (
                              <span
                                class="badge"
                                style="font-size:0.68rem;padding:0 5px;background:var(--primary-soft);color:var(--primary);display:inline-flex;align-items:center;gap:3px;"
                                title={l.vinculoDescricao}
                              >
                                {l.vinculoDescricao.toLowerCase().includes("fórmula") || l.vinculoDescricao.toLowerCase().includes("formula") ? (
                                  <span style="font-weight:700;font-style:italic;font-family:serif;">fx</span>
                                ) : (
                                  <Icon name="link" style="width:10px;height:10px;" />
                                )}
                                <span>{l.vinculoDescricao}</span>
                              </span>
                            )}
                            {l.parcela && l.totalParcelas ? (
                              <span
                                class="badge badge--neutral"
                                style="font-size:0.68rem;padding:0 5px;"
                                title={`Parcela ${l.parcela} de ${l.totalParcelas}`}
                              >
                                <Icon name="calendar" style="width:11px;height:11px;" /> {l.parcela}/{l.totalParcelas}
                              </span>
                            ) : null}
                            {l.reservaId && reservaMap.get(l.reservaId) && (
                              <span
                                class="badge badge--neutral"
                                style="font-size:0.68rem;padding:0 6px;color:var(--primary);border-color:color-mix(in srgb, var(--primary) 30%, transparent);"
                                title={`Vinculado à Reserva: ${reservaMap.get(l.reservaId)}`}
                              >
                                <Icon name="wallet" style="width:11px;height:11px;" /> {reservaMap.get(l.reservaId)}
                              </span>
                            )}
                            {l.bancoId && bancoMap.get(l.bancoId) && (
                              <span
                                class="badge badge--neutral"
                                style="font-size:0.68rem;padding:0 6px;display:inline-flex;align-items:center;gap:3px;"
                                title={`Conta Bancária: ${bancoMap.get(l.bancoId)}`}
                              >
                                <Icon name="bank" style="width:11px;height:11px;color:var(--text-muted);" />
                                <span>{bancoMap.get(l.bancoId)}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div class="extrato-item__val">
                          <div class={`num tone-${meta.tone}`} style="font-weight:800;font-size:var(--fs-md);white-space:nowrap;">
                            {signed(sinal * l.valor)}
                          </div>
                        </div>

                        <div class="extrato-item__meta">
                          <div style="font-size:var(--fs-xs);color:var(--text-muted);margin-top:2px;">
                            <span>Categoria: <b>{catMap.get(c.categoriaId) || "Geral"}</b></span>
                            {l.obs && (
                              <span style="font-style:italic;color:var(--text);margin-left:6px;">
                                · Obs: {l.obs}
                              </span>
                            )}
                          </div>
                        </div>

                        <div class="extrato-item__actions">
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
                            onClick={() => excluirLancamento(l)}
                            title="Excluir lançamento"
                          >
                            <Icon name="trash" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          /* Modo Tabela Tabular */
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="min-width:90px;text-align:left;">Data</th>
                  <th style="min-width:180px;text-align:left;">Conta / Categoria</th>
                  <th style="text-align:center;">Natureza</th>
                  <th style="text-align:left;min-width:200px;">Descrição / Observação</th>
                  <th style="text-align:right;">Valor</th>
                  <th style="text-align:center;min-width:80px;">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l) => {
                  const c = contaMap.get(l.contaId);
                  if (!c) return null;
                  const meta = NATURE_META[c.natureza];
                  const [a, m, d] = l.data.split("-");
                  const sinal = SINAL[c.natureza];

                  return (
                    <tr key={l.id}>
                      <td style="text-align:left;font-variant-numeric:tabular-nums;font-weight:600;">
                        {d}/{m}/{a}
                      </td>
                      <td style="text-align:left;">
                        <strong>{c.nome}</strong>
                        <span class="muted" style="display:block;font-size:0.7rem;">
                          {catMap.get(c.categoriaId) || "Geral"}
                        </span>
                      </td>
                      <td style="text-align:center;">
                        <span class={`badge badge--${meta.tone}`}>{meta.label}</span>
                      </td>
                      <td style="text-align:left;">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                          <span>{l.descricao || "—"}</span>
                          {l.vinculoDescricao && (
                            <span class="badge" style="font-size:0.65rem;padding:0 4px;background:var(--primary-soft);color:var(--primary);">
                              {l.vinculoDescricao}
                            </span>
                          )}
                          {l.parcela && l.totalParcelas ? (
                            <span class="badge badge--neutral" style="font-size:0.65rem;padding:0 4px;">
                              {l.parcela}/{l.totalParcelas}
                            </span>
                          ) : null}
                          {l.reservaId && reservaMap.get(l.reservaId) && (
                            <span
                              class="badge badge--neutral"
                              style="font-size:0.65rem;padding:0 5px;color:var(--primary);border-color:color-mix(in srgb, var(--primary) 30%, transparent);"
                              title={`Vinculado à Reserva: ${reservaMap.get(l.reservaId)}`}
                            >
                              <Icon name="wallet" style="width:10px;height:10px;" /> {reservaMap.get(l.reservaId)}
                            </span>
                          )}
                          {l.bancoId && bancoMap.get(l.bancoId) && (
                            <span
                              class="badge badge--neutral"
                              style="font-size:0.65rem;padding:0 5px;display:inline-flex;align-items:center;gap:3px;"
                              title={`Conta Bancária: ${bancoMap.get(l.bancoId)}`}
                            >
                              <Icon name="bank" style="width:10px;height:10px;color:var(--text-muted);" />
                              <span>{bancoMap.get(l.bancoId)}</span>
                            </span>
                          )}
                        </div>
                        {l.obs && (
                          <div class="muted" style="font-size:0.7rem;font-style:italic;">
                            Obs: {l.obs}
                          </div>
                        )}
                      </td>
                      <td class={`num tone-${meta.tone}`} style="font-weight:700;text-align:right;">
                        {signed(sinal * l.valor)}
                      </td>
                      <td style="text-align:center;">
                        <div style="display:inline-flex;gap:4px;">
                          <button
                            type="button"
                            class="btn btn--ghost btn--icon"
                            style="min-height:26px;width:26px;"
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
                            <Icon name="pencil" style="width:13px;height:13px;" />
                          </button>
                          <button
                            type="button"
                            class="btn btn--ghost btn--icon"
                            style="min-height:26px;width:26px;color:var(--out);"
                            onClick={() => excluirLancamento(l)}
                            title="Excluir lançamento"
                          >
                            <Icon name="trash" style="width:13px;height:13px;" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal para Ignorar Projeção com Opção de Somar ao Próximo Mês */}
      {modalIgnorarItem && (
        <ModalIgnorarProjecao
          isOpen={modalIgnorarItem !== null}
          onClose={() => setModalIgnorarItem(null)}
          contaNome={contaMap.get(modalIgnorarItem.contaId)?.nome || "Conta"}
          mesNome={MONTHS[modalIgnorarItem.mes]}
          valorCentavos={modalIgnorarItem.valorPendente}
          mesProximoNome={modalIgnorarItem.mes < 11 ? MONTHS[modalIgnorarItem.mes + 1] : undefined}
          onConfirmar={confirmarIgnorarProjecao}
        />
      )}

      {/* Modal / Subtela de Criação e Edição de Realização */}
      <Modal
        title={modalLanc?.id ? "Editar Realização" : "Nova Realização"}
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
              bancoNome={modalLanc.bancoId ? bancoMap.get(modalLanc.bancoId) : undefined}
              formaPagamento={modalLanc.formaPagamento}
              descricao={modalLanc.descricao}
              obs={modalLanc.obs}
            />
          ) : undefined
        }
        footer={
          <div class="modal-footer-actions">
            <span class="muted only-desktop" style="font-size:11px;">
              Pressione <kbd style="padding:1px 5px;background:var(--surface);border:1px solid var(--border);border-radius:3px;font-family:inherit;">Ctrl</kbd> + <kbd style="padding:1px 5px;background:var(--surface);border:1px solid var(--border);border-radius:3px;font-family:inherit;">Enter</kbd> para salvar
            </span>
            <div class="modal-footer-actions__right">
              <div class="modal-footer-actions__secondary-row">
                <button type="button" class="btn btn--ghost" onClick={() => setModalLanc(null)}>
                  Cancelar
                </button>
                {!modalLanc?.id && (
                  <button
                    type="button"
                    class="btn btn--secondary"
                    onClick={() => salvarLancamentoInternal(true)}
                  >
                    Salvar e Outra
                  </button>
                )}
              </div>
              <button type="submit" form="form-lancamento" class="btn btn--primary" style="font-weight:700;">
                {modalLanc?.id ? "Salvar Alterações" : "Salvar Realização"}
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

                {/* Sugestão de Vínculo/Fórmula somente se a base real for maior que zero e diferente do valor atual */}
                {sugestaoVinculo && sugestaoVinculo.valorCentavos > 0 && sugestaoVinculo.valorCentavos !== modalLanc?.valorCentavos && (
                  <div
                    style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;padding:6px 10px;background:var(--primary-soft);border-radius:var(--r-sm);border:1px solid color-mix(in srgb, var(--primary) 25%, transparent);font-size:var(--fs-xs);"
                  >
                    <div style="display:flex;align-items:center;gap:6px;color:var(--primary);font-weight:600;">
                      <Icon name="link" style="width:13px;height:13px;" />
                      <span>Recalcular pelo Real: {money(sugestaoVinculo.valorCentavos)}</span>
                      <span class="muted" style="font-size:11px;">({sugestaoVinculo.detalhe} já lançados no mês)</span>
                    </div>
                    <button
                      type="button"
                      class="btn btn--secondary btn--sm"
                      style="padding:2px 8px;min-height:24px;font-size:11px;"
                      onClick={() => setModalLanc({ ...modalLanc, valorCentavos: sugestaoVinculo.valorCentavos })}
                    >
                      Aplicar Real
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

            {/* Conta Bancária & Forma de Pagamento */}
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:var(--sp-2);margin-top:var(--sp-2);">
              {bancoList.length > 0 && (
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label" for="lanc-banco" style="font-size:var(--fs-xs);margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                    <Icon name="bank" style="width:13px;height:13px;color:var(--primary);" />
                    <span>
                      {natAtualModal === "receber" || natAtualModal === "aporte"
                        ? "Conta Bancária de Destino"
                        : "Conta Bancária de Origem"}
                    </span>
                  </label>
                  <CustomSelect
                    id="lanc-banco"
                    value={modalLanc?.bancoId || ""}
                    placeholder="Nenhuma conta bancária vinculada"
                    options={[
                      { value: "", label: "Nenhuma conta vinculada" },
                      ...bancoList.map((b) => ({ value: b.id, label: b.nome })),
                    ]}
                    onChange={(val) => {
                      setModalLanc({
                        ...modalLanc,
                        bancoId: val || undefined,
                      });
                    }}
                  />
                </div>
              )}

              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" for="lanc-forma-pagamento" style="font-size:var(--fs-xs);margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                  <Icon name="creditCard" style="width:13px;height:13px;color:var(--primary);" />
                  <span>Forma de Pagamento (Opcional)</span>
                </label>
                <CustomSelect
                  id="lanc-forma-pagamento"
                  value={modalLanc?.formaPagamento || ""}
                  placeholder="Selecione a forma..."
                  options={[
                    { value: "", label: "Não informada" },
                    ...opcoesFormasPagamento.map((f) => ({ value: f, label: f })),
                  ]}
                  onChange={(val) => {
                    setModalLanc({
                      ...modalLanc,
                      formaPagamento: val || undefined,
                    });
                  }}
                />
              </div>
            </div>
          </FormSection>

          {/* Seção 3: Repetição (somente na criação de nova realização) */}
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
            defaultOpen={Boolean(modalLanc?.descricao || modalLanc?.obs || modalLanc?.reservaId)}
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

            {/* Vínculo com Reserva / Caixinha */}
            {resList.length > 0 && (
              <div
                class="form-group"
                style="background: var(--surface-soft); padding: var(--sp-3); border-radius: var(--r-md); border: 1px solid var(--border);"
              >
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px;">
                  <span style="font-size: var(--fs-xs); font-weight: 700; color: var(--text); display:flex; align-items:center; gap:6px;">
                    <Icon name="wallet" style="width:14px; height:14px; color:var(--primary);" />
                    {natAtualModal === "saida" || natAtualModal === "pagar"
                      ? "Destinar para Reserva / Caixinha?"
                      : "Origem: Resgate de Reserva / Caixinha?"}
                  </span>
                  {modalLanc?.reservaId && (
                    <button
                      type="button"
                      class="btn btn--ghost btn--sm"
                      style="font-size: 11px; padding: 1px 6px; height: 22px; color: var(--out);"
                      onClick={() => setModalLanc({ ...modalLanc, reservaId: undefined, tipoReserva: undefined })}
                    >
                      Remover vínculo
                    </button>
                  )}
                </div>

                <CustomSelect
                  id="lanc-reserva"
                  value={modalLanc?.reservaId || ""}
                  placeholder="Nenhuma reserva (apenas movimentação operacional normal)"
                  options={[
                    { value: "", label: "Nenhuma reserva (apenas movimentação operacional normal)" },
                    ...resList.map((r) => ({ value: r.id, label: r.nome })),
                  ]}
                  onChange={(val) => {
                    const tipoRes = natAtualModal === "saida" || natAtualModal === "pagar" ? "aporte" : "resgate";
                    setModalLanc({
                      ...modalLanc,
                      reservaId: val || undefined,
                      tipoReserva: val ? tipoRes : undefined,
                    });
                  }}
                />
                <span style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px; display: block;">
                  {modalLanc?.reservaId
                    ? natAtualModal === "saida" || natAtualModal === "pagar"
                      ? "✓ O valor sairá do caixa diário e será registrado como Aplicação na reserva escolhida."
                      : "✓ O valor entrará no caixa diário e será registrado como Resgate da reserva para recompor o saldo."
                    : "ℹ️ Opcional: selecione caso esta movimentação envolva uma de suas caixinhas patrimoniais."}
                </span>
              </div>
            )}

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

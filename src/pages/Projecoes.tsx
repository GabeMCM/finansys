import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CustomSelect } from "../components/CustomSelect.tsx";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/Modal.tsx";
import { confirmarAcao } from "../components/ModalConfirm.tsx";
import { toast } from "../components/Toast.tsx";
import { ContaPicker } from "../components/lancamento/ContaPicker.tsx";
import { FormSection, FormBlock, Disclosure } from "../components/lancamento/FormSection.tsx";
import { MoneyInput } from "../components/lancamento/MoneyInput.tsx";
import { NaturezaSegmented } from "../components/lancamento/NaturezaSegmented.tsx";
import { RepeticaoSelector, type ModoDistribuicaoProjecao } from "../components/lancamento/RepeticaoSelector.tsx";
import { ResumoPainel } from "../components/lancamento/ResumoPainel.tsx";
import { ValorCalculadoEditor } from "../components/lancamento/ValorCalculadoEditor.tsx";
import { calcularBaseProjecoes, calcularValorVinculado } from "../data/calc.ts";
import { anos, categorias, contas, projecoes } from "../data/repo.ts";
import { type Categoria, type Conta, type Natureza, NATUREZAS, type RegraVinculo } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { money, MONTHS } from "../lib/format.ts";
import { avaliarFormula, calcularFormulaProjecoes, extrairVariaveis } from "../lib/formula.ts";
import { NATURE_META } from "../lib/natureza.ts";
import { anoAtivo, empresaAtiva } from "../state.ts";

interface ModalNovaProjecaoState {
  natureza: Natureza;
  categoriaId: string;
  contaId: string;
  origemValor: "manual" | "calculado";
  distribuicao: ModoDistribuicaoProjecao;
  valorFixoCentavos: number;
  parcelaMesInicio: number;
  parcelaQtd: number;
  parcelaValorCentavos: number;
  parcelaDividirValor: boolean;
  mesEspecifico: number;
  valorEspecificoCentavos: number;
  valoresMensais: string[];
  diaVencimento?: number;
  dataEspecifica?: string;
  obs: string;
  regraCalculo: RegraVinculo;
  salvarVinculoNaConta: boolean;
}

export function Projecoes() {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  const [nat, setNat] = useState<Natureza>("pagar");
  const [mesAtivo, setMesAtivo] = useState<number>(new Date().getMonth());
  const [busca, setBusca] = useState<string>("");
  const [modoVisao, setModoVisao] = useState<"grade" | "mensal">(() => {
    return typeof window !== "undefined" && window.innerWidth >= 768 ? "grade" : "mensal";
  });

  // Categorias colapsadas na visualização de grade
  const [categoriasColapsadas, setCategoriasColapsadas] = useState<Set<string>>(new Set());

  // Modais
  const [modalObs, setModalObs] = useState<{ contaId: string; mes: number; obs: string; nome: string; data?: string } | null>(null);
  const [modalEditarConta, setModalEditarConta] = useState<{ id: string; nome: string; categoriaId: string } | null>(null);
  const [modalNovaProjecao, setModalNovaProjecao] = useState<ModalNovaProjecaoState | null>(null);

  const dados = useLive(async () => {
    if (!empId) return null;
    const ano = await anos.find(empId, anoNum);
    if (!ano) return null;
    const [todasContas, todasCats, ps] = await Promise.all([
      contas.byEmpresa(empId),
      categorias.byEmpresa(empId),
      projecoes.byAno(ano.id),
    ]);
    return { ano, todasContas, todasCats, ps };
  }, [empId, anoNum], null);

  // Ajusta automaticamente a visão recomendada no redimensionamento da janela se o usuário não mudou manualmente
  useEffect(() => {
    const handleResize = () => {
      // Manter flexível
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  const { ano, todasContas, todasCats, ps } = dados;

  // Filtra por natureza ativa
  const cs = todasContas.filter((c) => c.natureza === nat && c.ativa);
  const cats = todasCats.filter((c) => c.natureza === nat);

  // Mapa de projeções: contaId + "_" + mes -> Projecao
  const pMap = new Map<string, { id?: string; valor: number; obs?: string; parcela?: number; totalParcelas?: number; data?: string }>();
  for (const p of ps) {
    pMap.set(`${p.contaId}_${p.mes}`, {
      id: p.id,
      valor: p.valor,
      obs: p.obs,
      parcela: p.parcela,
      totalParcelas: p.totalParcelas,
      data: p.data,
    });
  }

  const getProj = (contaId: string, mes: number) => {
    return pMap.get(`${contaId}_${mes}`) || { valor: 0, obs: "", parcela: undefined, totalParcelas: undefined, data: undefined };
  };

  const recalcularDependentes = async (meses: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) => {
    const vinculadas = todasContas.filter(
      (c) => c.vinculo && (c.vinculo.origemId || (c.vinculo.modo === "formula" && c.vinculo.formula))
    );
    if (vinculadas.length === 0) return;

    // Busca as projeções mais recentes direto do banco
    const todasPs = await projecoes.byAno(ano.id);

    for (const c of vinculadas) {
      if (!c.vinculo) continue;
      if (c.vinculo.modo === "formula" && c.vinculo.formula) {
        for (const m of meses) {
          const res = calcularFormulaProjecoes(c.vinculo.formula, m, todasPs, todasContas, todasCats);
          const atual = getProj(c.id, m);
          if (atual.valor !== res.valorCentavos) {
            await projecoes.set(ano.id, c.id, m, res.valorCentavos, atual.obs);
          }
        }
      } else if (c.vinculo.origemId) {
        for (const m of meses) {
          const baseCentavos = calcularBaseProjecoes(c.vinculo, m, todasPs, todasContas);
          const valorCalculado = calcularValorVinculado(baseCentavos, c.vinculo);
          const atual = getProj(c.id, m);
          if (atual.valor !== valorCalculado) {
            await projecoes.set(ano.id, c.id, m, valorCalculado, atual.obs, c.vinculo.origemId);
          }
        }
      }
    }
  };

  const recalcularContaIndividual = async (c: Conta) => {
    if (!c.vinculo) return;
    const todasPs = await projecoes.byAno(ano.id);
    if (c.vinculo.modo === "formula" && c.vinculo.formula) {
      for (let m = 0; m < 12; m++) {
        const res = calcularFormulaProjecoes(c.vinculo.formula, m, todasPs, todasContas, todasCats);
        const atual = getProj(c.id, m);
        await projecoes.set(ano.id, c.id, m, res.valorCentavos, atual.obs);
      }
      toast.success(`Fórmula de "${c.nome}" recalculada nos 12 meses!`);
    } else if (c.vinculo.origemId) {
      for (let m = 0; m < 12; m++) {
        const baseCentavos = calcularBaseProjecoes(c.vinculo, m, todasPs, todasContas);
        const valorCalculado = calcularValorVinculado(baseCentavos, c.vinculo);
        const atual = getProj(c.id, m);
        await projecoes.set(ano.id, c.id, m, valorCalculado, atual.obs, c.vinculo.origemId);
      }
      toast.success(`Vínculo de "${c.nome}" recalculado nos 12 meses!`);
    }
  };

  const atualizarValor = async (contaId: string, mes: number, valorReais: number) => {
    const centavos = Math.round(Number(valorReais || 0) * 100);
    const atual = getProj(contaId, mes);
    await projecoes.set(ano.id, contaId, mes, centavos, atual.obs);
    await recalcularDependentes([mes]);
  };

  const replicarParaAno = async (contaId: string, mesOrigem: number) => {
    const origem = getProj(contaId, mesOrigem);
    const conta = cs.find((c) => c.id === contaId);
    const ok = await confirmarAcao({
      titulo: "Replicar Projeção Mensal",
      mensagem: `Deseja replicar o valor de ${money(origem.valor)} (${conta?.nome || "esta conta"}) para todos os 12 meses de ${anoNum}?`,
      rotuloConfirmar: "Replicar para 12 meses",
      tipo: "primary",
    });
    if (ok) {
      for (let m = 0; m < 12; m++) {
        await projecoes.set(ano.id, contaId, m, origem.valor, origem.obs);
      }
      await recalcularDependentes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      toast.success(`Valor de ${money(origem.valor)} replicado para os 12 meses.`);
    }
  };

  const zerarContaAno = async (contaId: string) => {
    const conta = cs.find((c) => c.id === contaId);
    const ok = await confirmarAcao({
      titulo: "Zerar Projeções da Conta",
      mensagem: `Deseja zerar os valores de todos os meses para "${conta?.nome || "esta conta"}" em ${anoNum}?`,
      rotuloConfirmar: "Zerar Todos os Meses",
      tipo: "warning",
    });
    if (ok) {
      for (let m = 0; m < 12; m++) {
        const atual = getProj(contaId, m);
        await projecoes.set(ano.id, contaId, m, 0, atual.obs);
      }
      await recalcularDependentes();
      toast.success(`Projeções de "${conta?.nome}" zeradas.`);
    }
  };

  // Auto-sincronização de contas vinculadas/fórmulas se estiverem divergentes
  useEffect(() => {
    if (!dados || !ano) return;
    const vinculadas = todasContas.filter(
      (c) => c.vinculo && (c.vinculo.origemId || (c.vinculo.modo === "formula" && c.vinculo.formula))
    );
    if (vinculadas.length === 0) return;

    let precisaSync = false;
    for (const c of vinculadas) {
      if (c.vinculo?.modo === "formula" && c.vinculo.formula) {
        for (let m = 0; m < 12; m++) {
          const res = calcularFormulaProjecoes(c.vinculo.formula, m, ps, todasContas, todasCats);
          if (res.ok && getProj(c.id, m).valor !== res.valorCentavos) {
            precisaSync = true;
            break;
          }
        }
      } else if (c.vinculo?.origemId) {
        for (let m = 0; m < 12; m++) {
          const baseCentavos = calcularBaseProjecoes(c.vinculo, m, ps, todasContas);
          const valorCalculado = calcularValorVinculado(baseCentavos, c.vinculo);
          if (getProj(c.id, m).valor !== valorCalculado) {
            precisaSync = true;
            break;
          }
        }
      }
      if (precisaSync) break;
    }

    if (precisaSync) {
      recalcularDependentes();
    }
  }, [ano?.id, todasContas.length]);

  const salvarObs = async () => {
    if (!modalObs) return;
    const atual = getProj(modalObs.contaId, modalObs.mes);
    await projecoes.set(
      ano.id,
      modalObs.contaId,
      modalObs.mes,
      atual.valor,
      modalObs.obs.trim() || undefined,
      undefined,
      {
        parcela: atual.parcela,
        totalParcelas: atual.totalParcelas,
        data: modalObs.data ? modalObs.data.trim() : undefined,
      }
    );
    toast.success("Detalhes da projeção salvos!");
    setModalObs(null);
  };

  const salvarEditarConta = async (e: Event) => {
    e.preventDefault();
    if (!modalEditarConta || !modalEditarConta.nome.trim()) return;
    await contas.update(modalEditarConta.id, {
      nome: modalEditarConta.nome.trim(),
      categoriaId: modalEditarConta.categoriaId,
    });
    toast.success("Conta atualizada com sucesso!");
    setModalEditarConta(null);
  };

  const excluirConta = async (conta: Conta) => {
    const ok = await confirmarAcao({
      titulo: "Excluir Conta",
      mensagem: `Tem certeza que deseja excluir a conta "${conta.nome}" e todas as suas projeções? Esta ação não afetará os lançamentos já realizados.`,
      rotuloConfirmar: "Excluir Conta",
      tipo: "danger",
    });
    if (ok) {
      await contas.remove(conta.id);
      toast.success(`Conta "${conta.nome}" excluída.`);
    }
  };

  // Abrir modal de inclusão de nova projeção
  const abrirNovaProjecao = (
    categoriaIdPadrao?: string,
    naturezaPadrao?: Natureza,
    contaIdPadrao?: string,
    modoValorPadrao?: "fixo" | "parcelado" | "especifico" | "mensal" | "vinculado"
  ) => {
    const natEscolhida = naturezaPadrao || nat;
    const catsDestaNat = todasCats.filter((c) => c.natureza === natEscolhida);
    const catId = categoriaIdPadrao || catsDestaNat[0]?.id || "";
    const contasDestaCat = todasContas.filter((c) => c.natureza === natEscolhida && c.categoriaId === catId && c.ativa);
    const defaultOrigemId = todasContas.find((c) => c.natureza === "receber" && c.ativa)?.id || todasContas[0]?.id || "";

    const isVinculado = modoValorPadrao === "vinculado";
    const dist: ModoDistribuicaoProjecao = (modoValorPadrao && modoValorPadrao !== "vinculado")
      ? modoValorPadrao
      : "fixo";

    setModalNovaProjecao({
      natureza: natEscolhida,
      categoriaId: catId,
      contaId: contaIdPadrao || contasDestaCat[0]?.id || todasContas.find((c) => c.natureza === natEscolhida && c.ativa)?.id || "",
      origemValor: isVinculado ? "calculado" : "manual",
      distribuicao: dist,
      valorFixoCentavos: 0,
      parcelaMesInicio: mesAtivo,
      parcelaQtd: 12,
      parcelaValorCentavos: 0,
      parcelaDividirValor: true,
      mesEspecifico: mesAtivo,
      valorEspecificoCentavos: 0,
      valoresMensais: Array(12).fill(""),
      obs: "",
      regraCalculo: {
        modo: "simples",
        tipo: "conta",
        origemId: defaultOrigemId,
        percentual: 30,
      },
      salvarVinculoNaConta: true,
    });
  };

  const salvarNovaProjecao = async (e?: Event) => {
    if (e) e.preventDefault();
    if (!modalNovaProjecao) return;

    const targetContaId = modalNovaProjecao.contaId;
    if (!targetContaId) {
      toast.warn("Selecione ou crie uma conta para projetar.");
      return;
    }

    // Grava as projeções de acordo com o modo escolhido
    const obsTexto = modalNovaProjecao.obs.trim() || undefined;

    if (modalNovaProjecao.origemValor === "calculado") {
      const regra = modalNovaProjecao.regraCalculo;
      const todasPs = await projecoes.byAno(ano.id);

      if (regra.modo === "formula" && regra.formula) {
        const formulaTexto = regra.formula.trim();
        for (let m = 0; m < 12; m++) {
          const res = calcularFormulaProjecoes(formulaTexto, m, todasPs, todasContas, todasCats);
          await projecoes.set(ano.id, targetContaId, m, res.valorCentavos, obsTexto);
        }

        if (modalNovaProjecao.salvarVinculoNaConta) {
          await contas.update(targetContaId, {
            vinculo: {
              modo: "formula",
              formula: formulaTexto,
            },
          });
        }
      } else {
        for (let m = 0; m < 12; m++) {
          const baseCentavos = calcularBaseProjecoes(regra, m, todasPs, todasContas);
          const valorCalculado = calcularValorVinculado(baseCentavos, regra);
          await projecoes.set(ano.id, targetContaId, m, valorCalculado, obsTexto, regra.origemId);
        }

        if (modalNovaProjecao.salvarVinculoNaConta) {
          await contas.update(targetContaId, { vinculo: regra });
        }
      }
      toast.success("Projeção vinculada salva com sucesso!");
    } else {
      const dist = modalNovaProjecao.distribuicao;
      if (dist === "fixo") {
        const centavos = modalNovaProjecao.valorFixoCentavos;
        const diaVenc = modalNovaProjecao.diaVencimento;
        for (let m = 0; m < 12; m++) {
          let dataStr: string | undefined;
          if (diaVenc && diaVenc >= 1 && diaVenc <= 31) {
            const maxDias = new Date(anoNum, m + 1, 0).getDate();
            const diaReal = Math.min(diaVenc, maxDias);
            dataStr = `${anoNum}-${String(m + 1).padStart(2, "0")}-${String(diaReal).padStart(2, "0")}`;
          }
          await projecoes.set(ano.id, targetContaId, m, centavos, obsTexto, undefined, { data: dataStr });
        }
        toast.success("Projeção fixa mensal salva com sucesso!");
      } else if (dist === "parcelado") {
        const totalParcelas = Math.max(2, Math.min(60, Number(modalNovaProjecao.parcelaQtd) || 2));
        const mesInicio = Math.max(0, Math.min(11, Number(modalNovaProjecao.parcelaMesInicio) || 0));
        const centavosEntrada = modalNovaProjecao.parcelaValorCentavos;

        if (centavosEntrada <= 0) {
          toast.warn("Informe um valor válido para o parcelamento.");
          return;
        }

        const dividir = modalNovaProjecao.parcelaDividirValor;
        const valorPorParcela = dividir ? Math.floor(centavosEntrada / totalParcelas) : centavosEntrada;
        const resto = dividir ? centavosEntrada - (valorPorParcela * totalParcelas) : 0;
        const diaVenc = modalNovaProjecao.diaVencimento;

        for (let i = 1; i <= totalParcelas; i++) {
          const valorParcela = i === 1 ? valorPorParcela + resto : valorPorParcela;
          const mesTotal = mesInicio + (i - 1);
          const targetYear = anoNum + Math.floor(mesTotal / 12);
          const targetMonth = mesTotal % 12;

          let anoAlvoId = ano.id;
          if (targetYear !== anoNum) {
            let anoTarget = await anos.find(empId, targetYear);
            if (!anoTarget) {
              anoTarget = await anos.create({ empresaId: empId, ano: targetYear, bancaInicial: 0 });
            }
            anoAlvoId = anoTarget.id;
          }

          const obsParcela = obsTexto
            ? `Parcela ${i}/${totalParcelas} - ${obsTexto}`
            : `Parcela ${i}/${totalParcelas}`;

          let dataStr: string | undefined;
          if (diaVenc && diaVenc >= 1 && diaVenc <= 31) {
            const maxDias = new Date(targetYear, targetMonth + 1, 0).getDate();
            const diaReal = Math.min(diaVenc, maxDias);
            dataStr = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(diaReal).padStart(2, "0")}`;
          }

          await projecoes.set(
            anoAlvoId,
            targetContaId,
            targetMonth,
            valorParcela,
            obsParcela,
            undefined,
            { parcela: i, totalParcelas, data: dataStr }
          );
        }
        toast.success(`${totalParcelas} parcelas projetadas com sucesso!`);
      } else if (dist === "especifico") {
        const centavos = modalNovaProjecao.valorEspecificoCentavos;
        const dataEsp = modalNovaProjecao.dataEspecifica;
        for (let m = 0; m < 12; m++) {
          const val = m === modalNovaProjecao.mesEspecifico ? centavos : 0;
          await projecoes.set(
            ano.id,
            targetContaId,
            m,
            val,
            m === modalNovaProjecao.mesEspecifico ? obsTexto : undefined,
            undefined,
            m === modalNovaProjecao.mesEspecifico && dataEsp ? { data: dataEsp } : undefined
          );
        }
        toast.success(`Projeção de ${MONTHS[modalNovaProjecao.mesEspecifico]} salva com sucesso!`);
      } else if (dist === "mensal") {
        for (let m = 0; m < 12; m++) {
          const centavos = Math.round(Number(modalNovaProjecao.valoresMensais[m] || 0) * 100);
          await projecoes.set(ano.id, targetContaId, m, centavos, obsTexto);
        }
        toast.success("Grade mensal de projeções salva com sucesso!");
      }
    }

    // Se a alteração afetou outras contas vinculadas ou com fórmulas, recalcula
    await recalcularDependentes();

    if (modalNovaProjecao.natureza !== nat) {
      setNat(modalNovaProjecao.natureza);
    }
    setModalNovaProjecao(null);
  };

  // Cálculo da prévia dos 12 meses para o ResumoPainel em tempo real
  const mesesValoresResumo = modalNovaProjecao ? (() => {
    if (modalNovaProjecao.origemValor === "calculado") {
      const regra = modalNovaProjecao.regraCalculo;
      if (regra.modo === "formula" && regra.formula) {
        return MONTHS.map((_, idx) =>
          calcularFormulaProjecoes(regra.formula || "", idx, ps, todasContas, todasCats).valorCentavos
        );
      } else {
        return MONTHS.map((_, idx) => {
          const base = calcularBaseProjecoes(regra, idx, ps, todasContas);
          return calcularValorVinculado(base, regra);
        });
      }
    }
    const dist = modalNovaProjecao.distribuicao;
    if (dist === "fixo") {
      return MONTHS.map(() => modalNovaProjecao.valorFixoCentavos);
    }
    if (dist === "especifico") {
      return MONTHS.map((_, idx) => (idx === modalNovaProjecao.mesEspecifico ? modalNovaProjecao.valorEspecificoCentavos : 0));
    }
    if (dist === "mensal") {
      return MONTHS.map((_, idx) => Math.round(Number(modalNovaProjecao.valoresMensais[idx] || 0) * 100));
    }
    if (dist === "parcelado") {
      const qtd = Math.max(2, modalNovaProjecao.parcelaQtd);
      const mesIni = modalNovaProjecao.parcelaMesInicio;
      const dividir = modalNovaProjecao.parcelaDividirValor;
      const totalOuUnit = modalNovaProjecao.parcelaValorCentavos;
      const valorParcela = dividir ? Math.floor(totalOuUnit / qtd) : totalOuUnit;
      const resto = dividir ? totalOuUnit - (valorParcela * qtd) : 0;
      return MONTHS.map((_, idx) => {
        let soma = 0;
        for (let i = 1; i <= qtd; i++) {
          const mesTotal = mesIni + (i - 1);
          const targetYear = anoNum + Math.floor(mesTotal / 12);
          const targetMonth = mesTotal % 12;
          if (targetYear === anoNum && targetMonth === idx) {
            soma += i === 1 ? valorParcela + resto : valorParcela;
          }
        }
        return soma;
      });
    }
    return Array(12).fill(0);
  })() : [];

  const recalcularVinculadas = async () => {
    const vinculadas = todasContas.filter(
      (c) => c.vinculo && (c.vinculo.origemId || (c.vinculo.modo === "formula" && c.vinculo.formula))
    );
    if (vinculadas.length === 0) {
      toast.info("Nenhuma conta com vínculo automático ou fórmula cadastrada.");
      return;
    }

    const ok = await confirmarAcao({
      titulo: "Recalcular Projeções Vinculadas & Fórmulas",
      mensagem: `Deseja recalcular as 12 projeções de ${vinculadas.length} conta(s) vinculada(s) ou com fórmulas com base nos valores atuais das origens em ${anoNum}?`,
      rotuloConfirmar: "Recalcular Tudo",
      tipo: "info",
    });
    if (!ok) return;

    const todasPs = await projecoes.byAno(ano.id);
    let alteradas = 0;
    for (const c of vinculadas) {
      if (!c.vinculo) continue;
      if (c.vinculo.modo === "formula" && c.vinculo.formula) {
        for (let m = 0; m < 12; m++) {
          const res = calcularFormulaProjecoes(c.vinculo.formula, m, todasPs, todasContas, todasCats);
          const atual = getProj(c.id, m);
          await projecoes.set(ano.id, c.id, m, res.valorCentavos, atual.obs);
        }
        alteradas++;
      } else if (c.vinculo.origemId) {
        for (let m = 0; m < 12; m++) {
          const baseCentavos = calcularBaseProjecoes(c.vinculo, m, todasPs, todasContas);
          const valorCalculado = calcularValorVinculado(baseCentavos, c.vinculo);
          const atual = getProj(c.id, m);
          await projecoes.set(ano.id, c.id, m, valorCalculado, atual.obs, c.vinculo.origemId);
        }
        alteradas++;
      }
    }
    toast.success(`${alteradas} conta(s) vinculada(s) recalculada(s) com sucesso!`);
  };

  const toggleCategoria = (catId: string) => {
    setCategoriasColapsadas((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // Cálculos de totais
  const totalMes = (m: number) => {
    return cs.reduce((sum, c) => sum + (getProj(c.id, m).valor || 0), 0);
  };

  const totalContaAno = (contaId: string) => {
    let s = 0;
    for (let m = 0; m < 12; m++) s += getProj(contaId, m).valor || 0;
    return s;
  };

  const totalCatMes = (catId: string, m: number) => {
    const contasDaCat = cs.filter((c) => c.categoriaId === catId);
    return contasDaCat.reduce((sum, c) => sum + (getProj(c.id, m).valor || 0), 0);
  };

  const totalCatAno = (catId: string) => {
    const contasDaCat = cs.filter((c) => c.categoriaId === catId);
    return contasDaCat.reduce((sum, c) => sum + totalContaAno(c.id), 0);
  };

  const totalGeralAno = () => {
    let s = 0;
    for (let m = 0; m < 12; m++) s += totalMes(m);
    return s;
  };

  // Estatísticas de topo
  const mediaMensal = Math.round(totalGeralAno() / 12);
  let mesPicoIdx = 0;
  let valorPico = 0;
  for (let m = 0; m < 12; m++) {
    const tm = totalMes(m);
    if (tm > valorPico) {
      valorPico = tm;
      mesPicoIdx = m;
    }
  }

  // Filtragem com busca
  const termo = busca.trim().toLowerCase();
  const catsFiltradas = cats.filter((cat) => {
    if (!termo) return true;
    if (cat.nome.toLowerCase().includes(termo)) return true;
    const contasDaCat = cs.filter((c) => c.categoriaId === cat.id);
    return contasDaCat.some((c) => c.nome.toLowerCase().includes(termo));
  });

  return (
    <>
      {/* Cabeçalho da Página */}
      <div class="page-head" style="flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="display:flex;align-items:center;gap:8px;">
            Projeções {anoNum}
          </h1>
          <p>Planejamento e metas financeiras mês a mês para {NATURE_META[nat].label.toLowerCase()}</p>
        </div>

        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          {/* Seletor de visualização Matriz / Mensal */}
          <div class="tabs tabs--sm" style="margin-bottom:0;">
            <button
              type="button"
              class={`tab ${modoVisao === "grade" ? "is-active" : ""}`}
              style="padding:6px 12px;font-size:var(--fs-xs);min-height:30px;"
              onClick={() => setModoVisao("grade")}
              title="Visualizar a grade completa de 12 meses (Ideal para Desktop)"
            >
              <Icon name="grid" style="width:14px;height:14px;" /> Matriz 12 Meses
            </button>
            <button
              type="button"
              class={`tab ${modoVisao === "mensal" ? "is-active" : ""}`}
              style="padding:6px 12px;font-size:var(--fs-xs);min-height:30px;"
              onClick={() => setModoVisao("mensal")}
              title="Visualizar o detalhamento mês a mês (Ideal para Mobile)"
            >
              <Icon name="calendar" style="width:14px;height:14px;" /> Visão Mensal
            </button>
          </div>

          {/* Botão de Recalcular Projeções Vinculadas & Fórmulas */}
          {todasContas.some((c) => c.vinculo && (c.vinculo.origemId || (c.vinculo.modo === "formula" && c.vinculo.formula))) && (
            <button
              type="button"
              class="btn btn--secondary"
              onClick={recalcularVinculadas}
              title="Recalcular todas as fórmulas e vínculos com base nos valores das origens"
              style="display:inline-flex;align-items:center;gap:6px;"
            >
              <Icon name="refresh" /> Recalcular Fórmulas & Vínculos
            </button>
          )}

          {/* Botão de Incluir Projeção / Nova Conta diretamente */}
          <button
            type="button"
            class="btn btn--primary"
            onClick={() => abrirNovaProjecao()}
            style="display:inline-flex;align-items:center;gap:6px;"
          >
            <Icon name="plus" /> Nova Projeção
          </button>
        </div>
      </div>

      {/* Tabs das Naturezas */}
      <div class="tabs" style="margin-bottom:var(--sp-4);">
        {NATUREZAS.map((n) => {
          const meta = NATURE_META[n];
          const countContas = todasContas.filter((c) => c.natureza === n && c.ativa).length;
          return (
            <button
              type="button"
              key={n}
              class={`tab ${nat === n ? "is-active" : ""}`}
              onClick={() => setNat(n)}
            >
              <Icon name={meta.icon} /> {meta.label}
              <span
                class="badge badge--neutral"
                style="font-size:0.68rem;padding:0 5px;margin-left:4px;"
              >
                {countContas}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards de Resumo da Natureza Ativa */}
      <div class="grid grid--stats" style="margin-bottom:var(--sp-4);">
        <div class="stat">
          <div class="stat__label">
            <i class="dot" style={`background:var(--${NATURE_META[nat].tone})`} />
            Total Anual Projetado
          </div>
          <div class={`stat__value num tone-${NATURE_META[nat].tone}`}>{money(totalGeralAno())}</div>
          <div class="stat__sub">Previsto para todo o ano de {anoNum}</div>
        </div>

        <div class="stat">
          <div class="stat__label">
            <Icon name="chart" style="width:14px;height:14px;color:var(--text-muted);" />
            Média Mensal
          </div>
          <div class="stat__value num">{money(mediaMensal)}</div>
          <div class="stat__sub">Valor médio por mês</div>
        </div>

        <div class="stat">
          <div class="stat__label">
            <Icon name="calendar" style="width:14px;height:14px;color:var(--text-muted);" />
            Mês de Pico
          </div>
          <div class="stat__value num" style="font-size:1.15rem;">
            {valorPico > 0 ? `${MONTHS[mesPicoIdx]}` : "—"}
          </div>
          <div class="stat__sub">
            {valorPico > 0 ? `Maior volume previsto: ${money(valorPico)}` : "Sem valores projetados"}
          </div>
        </div>

        <div class="stat">
          <div class="stat__label">
            <Icon name="list" style="width:14px;height:14px;color:var(--text-muted);" />
            Estrutura de Contas
          </div>
          <div class="stat__value num" style="font-size:1.15rem;">
            {cs.length} conta{cs.length === 1 ? "" : "s"}
          </div>
          <div class="stat__sub">Distribuídas em {cats.length} categorias</div>
        </div>
      </div>

      {/* Barra de Busca e Ações Rápidas */}
      <div
        style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:var(--sp-3);flex-wrap:wrap;"
      >
        <div style="flex:1;min-width:240px;max-width:400px;position:relative;">
          <input
            type="search"
            class="input"
            placeholder={`Buscar em ${NATURE_META[nat].label}...`}
            value={busca}
            onInput={(e) => setBusca(e.currentTarget.value)}
            style="min-height:36px;font-size:var(--fs-xs);padding-left:32px;"
          />
          <Icon
            name="list"
            style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:14px;height:14px;color:var(--text-muted);pointer-events:none;"
          />
        </div>

        <div style="display:flex;align-items:center;gap:8px;">
          {modoVisao === "grade" && cats.length > 0 && (
            <button
              type="button"
              class="btn btn--ghost"
              style="font-size:var(--fs-xs);min-height:32px;"
              onClick={() => {
                if (categoriasColapsadas.size === cats.length) {
                  setCategoriasColapsadas(new Set());
                } else {
                  setCategoriasColapsadas(new Set(cats.map((c) => c.id)));
                }
              }}
            >
              {categoriasColapsadas.size === cats.length ? "Expandir Todas" : "Recolher Todas"}
            </button>
          )}

          <button
            type="button"
            class="btn btn--secondary"
            style="font-size:var(--fs-xs);min-height:32px;"
            onClick={() => abrirNovaProjecao(undefined, nat)}
          >
            <Icon name="plus" /> Adicionar Conta / Projeção
          </button>
        </div>
      </div>

      {/* Estado Vazio caso não haja contas ou categorias */}
      {cs.length === 0 && cats.length === 0 ? (
        <section class="card empty" style="padding:var(--sp-8) var(--sp-4);">
          <Icon name="grid" />
          <h2>Nenhuma conta ou projeção cadastrada em {NATURE_META[nat].label}</h2>
          <p>
            Você pode começar agora incluindo a sua primeira projeção diretamente aqui, sem precisar ir em configurações!
          </p>
          <button
            type="button"
            class="btn btn--primary"
            style="margin-top:16px;"
            onClick={() => abrirNovaProjecao(undefined, nat)}
          >
            <Icon name="plus" /> Criar Primeira Projeção
          </button>
        </section>
      ) : modoVisao === "grade" ? (
        /* ================= VISÃO MATRIZ ANUAL 12 MESES (DESKTOP-FIRST) ================= */
        <div class="stack">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="min-width:230px;">Conta / Categoria</th>
                  {MONTHS.map((m, idx) => {
                    const isMesAtual = idx === new Date().getMonth();
                    return (
                      <th
                        key={m}
                        class={isMesAtual ? "is-current-month" : ""}
                        title={isMesAtual ? "Mês Atual" : undefined}
                      >
                        {m.toUpperCase()}
                        {isMesAtual && <span style="display:block;font-size:0.55rem;opacity:0.8;">ATUAL</span>}
                      </th>
                    );
                  })}
                  <th style="background:var(--surface-solid);min-width:110px;font-weight:700;">Total Anual</th>
                  <th style="background:var(--surface-solid);min-width:80px;text-align:center;">Ações</th>
                </tr>
              </thead>
              <tbody>
                {catsFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={15} style="text-align:center;padding:var(--sp-6);color:var(--text-muted);">
                      Nenhuma conta ou categoria corresponde à busca "{busca}".
                    </td>
                  </tr>
                ) : (
                  catsFiltradas.map((cat) => {
                    const contasDaCat = cs.filter((c) => {
                      if (c.categoriaId !== cat.id) return false;
                      if (!termo) return true;
                      return c.nome.toLowerCase().includes(termo) || cat.nome.toLowerCase().includes(termo);
                    });
                    const isColapsada = categoriasColapsadas.has(cat.id);
                    const totCatAno = totalCatAno(cat.id);

                    return (
                      <Fragment key={`cat-group-${cat.id}`}>
                        {/* Linha Cabeçalho da Categoria com Subtotais dos 12 Meses */}
                        <tr key={`cat-${cat.id}`} class="category-row">
                          <td>
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;">
                              <div
                                style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;min-width:0;"
                                onClick={() => toggleCategoria(cat.id)}
                              >
                                <Icon
                                  name="chevron"
                                  style={`width:14px;height:14px;flex-shrink:0;transition:transform 0.2s ease;${
                                    isColapsada ? "transform:rotate(-90deg);" : ""
                                  }`}
                                />
                                <i class="dot" style={`background:var(--${NATURE_META[nat].tone});flex-shrink:0;`} />
                                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{cat.nome}</span>
                                <span class="muted" style="font-size:var(--fs-xs);font-weight:normal;flex-shrink:0;">
                                  ({contasDaCat.length})
                                </span>
                              </div>

                              <button
                                type="button"
                                class="btn btn--ghost btn--icon"
                                style="min-height:22px;width:22px;flex-shrink:0;"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirNovaProjecao(cat.id, nat);
                                }}
                                title={`Adicionar nova conta em "${cat.nome}"`}
                              >
                                <Icon name="plus" style="width:12px;height:12px;" />
                              </button>
                            </div>
                          </td>

                          {/* Subtotais mensais da categoria */}
                          {MONTHS.map((_, m) => {
                            const subMes = totalCatMes(cat.id, m);
                            const isMesAtual = m === new Date().getMonth();
                            return (
                              <td
                                key={m}
                                class={isMesAtual ? "is-current-month" : ""}
                                style="font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;font-size:var(--fs-xs);"
                              >
                                {subMes > 0 ? money(subMes) : <span class="muted" style="font-weight:normal;">—</span>}
                              </td>
                            );
                          })}

                          {/* Subtotal Anual da Categoria */}
                          <td style="font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;background:var(--surface-soft);">
                            {money(totCatAno)}
                          </td>
                          <td style="background:var(--surface-soft);text-align:center;">—</td>
                        </tr>

                        {/* Linhas das Contas pertencentes à Categoria */}
                        {!isColapsada &&
                          contasDaCat.map((c) => {
                            const totAno = totalContaAno(c.id);
                            return (
                              <tr key={c.id}>
                                <td style="padding-left:28px;">
                                  <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                                    <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                                      <span style="font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{c.nome}</span>
                                      {c.vinculo && (
                                        <span
                                          class="badge"
                                          style="font-size:10px;padding:1px 5px;background:var(--primary-soft);color:var(--primary);display:inline-flex;align-items:center;gap:3px;cursor:pointer;"
                                          onClick={() => recalcularContaIndividual(c)}
                                          title={
                                            c.vinculo.modo === "formula"
                                              ? `Fórmula: ${c.vinculo.formula || ""} (Clique para recalcular)`
                                              : `Vinculado a ${c.vinculo.tipo === "conta" ? "conta" : "categoria"}: ${c.vinculo.percentual !== undefined ? `${c.vinculo.percentual}%` : money(c.vinculo.valorFixo || 0)} (Clique para recalcular)`
                                          }
                                        >
                                          {c.vinculo.modo === "formula" ? (
                                            <>
                                              <span style="font-weight:700;font-style:italic;font-family:serif;">fx</span>
                                              <span>fórmula</span>
                                            </>
                                          ) : (
                                            <>
                                              <Icon name="link" style="width:10px;height:10px;" />
                                              <span>{c.vinculo.percentual !== undefined ? `${c.vinculo.percentual}%` : "Fixo"}</span>
                                            </>
                                          )}
                                        </span>
                                      )}
                                    </div>
                                    {getProj(c.id, mesAtivo).obs && (
                                      <span
                                        title={`Observação: ${getProj(c.id, mesAtivo).obs}`}
                                        style="cursor:help;color:var(--primary);"
                                      >
                                        <Icon name="info" style="width:12px;height:12px;" />
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {MONTHS.map((_, m) => {
                                  const p = getProj(c.id, m);
                                  const isMesAtual = m === new Date().getMonth();
                                  return (
                                    <td key={m} class={isMesAtual ? "is-current-month" : ""} style="position:relative;">
                                      <div style="position:relative;display:inline-block;">
                                        <input
                                          type="number"
                                          step="0.01"
                                          inputMode="decimal"
                                          class={`input-cell ${p.valor > 0 ? "has-val" : ""}`}
                                          value={p.valor ? (p.valor / 100).toFixed(2) : ""}
                                          placeholder="0,00"
                                          title={`${p.data ? `Vencimento: ${p.data.split("-").reverse().join("/")} · ` : ""}${p.obs || (p.parcela && p.totalParcelas ? `Parcela ${p.parcela} de ${p.totalParcelas}` : "")}`}
                                          onFocus={(e) => e.currentTarget.select()}
                                          onDblClick={() => setModalObs({ contaId: c.id, mes: m, obs: p.obs || "", data: p.data, nome: c.nome })}
                                          onBlur={(e) => {
                                            const val = parseFloat(e.currentTarget.value) || 0;
                                            if (val !== p.valor / 100) atualizarValor(c.id, m, val);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              e.currentTarget.blur();
                                            }
                                          }}
                                        />
                                        {p.data && (
                                          <span
                                            style="position:absolute;bottom:-3px;left:2px;font-size:8px;line-height:1;padding:1px 2px;border-radius:2px;background:var(--surface-soft);color:var(--text-faint);border:1px solid var(--border);pointer-events:none;font-weight:600;"
                                            title={`Vencimento: ${p.data.split("-").reverse().join("/")}`}
                                          >
                                            {p.data.split("-")[2]}
                                          </span>
                                        )}
                                        {p.parcela && p.totalParcelas && (
                                          <span
                                            style="position:absolute;top:-4px;right:-2px;font-size:9px;line-height:1;padding:1px 3px;border-radius:3px;background:var(--primary);color:#fff;pointer-events:none;font-weight:700;"
                                            title={`Parcela ${p.parcela} de ${p.totalParcelas}`}
                                          >
                                            {p.parcela}/{p.totalParcelas}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}

                                <td style="font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;">
                                  {money(totAno)}
                                </td>

                                <td style="text-align:center;padding:4px 6px;">
                                  <div style="display:inline-flex;align-items:center;gap:2px;">
                                    {c.vinculo && (
                                      <button
                                        type="button"
                                        class="btn btn--ghost btn--icon"
                                        style="min-height:24px;width:24px;color:var(--primary);"
                                        onClick={() => recalcularContaIndividual(c)}
                                        title={c.vinculo.modo === "formula" ? `Recalcular fórmula: ${c.vinculo.formula}` : "Recalcular projeção vinculada"}
                                      >
                                        <Icon name="refresh" style="width:12px;height:12px;" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      class="btn btn--ghost btn--icon"
                                      style="min-height:24px;width:24px;"
                                      onClick={() => abrirNovaProjecao(c.categoriaId, c.natureza, c.id, "parcelado")}
                                      title="Lançar projeção de parcelamento nesta conta"
                                    >
                                      <Icon name="calendar" style="width:12px;height:12px;" />
                                    </button>
                                    <button
                                      type="button"
                                      class="btn btn--ghost btn--icon"
                                      style="min-height:24px;width:24px;"
                                      onClick={() => replicarParaAno(c.id, new Date().getMonth())}
                                      title="Replicar valor para todos os 12 meses"
                                    >
                                      <Icon name="copy" style="width:12px;height:12px;" />
                                    </button>
                                    <button
                                      type="button"
                                      class="btn btn--ghost btn--icon"
                                      style="min-height:24px;width:24px;"
                                      onClick={() =>
                                        setModalObs({
                                          contaId: c.id,
                                          mes: new Date().getMonth(),
                                          obs: getProj(c.id, new Date().getMonth()).obs || "",
                                          nome: c.nome,
                                        })
                                      }
                                      title="Adicionar ou ver observação"
                                    >
                                      <Icon name="pencil" style="width:12px;height:12px;" />
                                    </button>
                                    <button
                                      type="button"
                                      class="btn btn--ghost btn--icon"
                                      style="min-height:24px;width:24px;color:var(--out);"
                                      onClick={() => excluirConta(c)}
                                      title="Excluir conta"
                                    >
                                      <Icon name="trash" style="width:12px;height:12px;" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>TOTAL GERAL ({NATURE_META[nat].label.toUpperCase()})</td>
                  {MONTHS.map((_, m) => {
                    const isMesAtual = m === new Date().getMonth();
                    return (
                      <td key={m} class={isMesAtual ? "is-current-month" : ""}>
                        {money(totalMes(m))}
                      </td>
                    );
                  })}
                  <td style={`color:var(--${NATURE_META[nat].tone});font-size:var(--fs-sm);`}>
                    {money(totalGeralAno())}
                  </td>
                  <td>—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        /* ================= VISÃO MÊS A MÊS (MOBILE-FRIENDLY & FOCADA) ================= */
        <div class="stack">
          {/* Navegador de Mês Superior */}
          <div
            style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:8px 12px;margin-bottom:var(--sp-2);"
          >
            <button
              type="button"
              class="btn btn--ghost btn--icon"
              style="min-height:32px;width:32px;"
              disabled={mesAtivo === 0}
              onClick={() => setMesAtivo((prev) => Math.max(0, prev - 1))}
              title="Mês anterior"
            >
              <Icon name="arrowLeft" style="width:16px;height:16px;" />
            </button>

            <div style="text-align:center;">
              <h2 style="font-size:var(--fs-md);margin:0;font-weight:700;">
                {MONTHS[mesAtivo]} de {anoNum}
              </h2>
              <span class="muted" style="font-size:var(--fs-xs);">
                Total projetado: <b class="num" style="color:var(--text);">{money(totalMes(mesAtivo))}</b>
              </span>
            </div>

            <button
              type="button"
              class="btn btn--ghost btn--icon"
              style="min-height:32px;width:32px;"
              disabled={mesAtivo === 11}
              onClick={() => setMesAtivo((prev) => Math.min(11, prev + 1))}
              title="Próximo mês"
            >
              <Icon name="chevron" style="width:16px;height:16px;transform:rotate(-90deg);" />
            </button>
          </div>

          {/* Chips horizontais de meses */}
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

          {/* Lista de Categorias e Contas do Mês Ativo */}
          <div class="stack" style="gap:var(--sp-4);">
            {catsFiltradas.length === 0 ? (
              <section class="card empty" style="padding:var(--sp-6);">
                <p class="muted">Nenhuma conta encontrada para o filtro informado.</p>
              </section>
            ) : (
              catsFiltradas.map((cat) => {
                const contasDaCat = cs.filter((c) => {
                  if (c.categoriaId !== cat.id) return false;
                  if (!termo) return true;
                  return c.nome.toLowerCase().includes(termo) || cat.nome.toLowerCase().includes(termo);
                });
                const subMes = totalCatMes(cat.id, mesAtivo);

                return (
                  <section class="card" key={cat.id} style="padding:var(--sp-3);">
                    <div
                      style="display:flex;align-items:center;justify-content:space-between;padding-bottom:var(--sp-2);border-bottom:1px solid var(--border);margin-bottom:var(--sp-2);"
                    >
                      <div style="font-weight:700;font-size:var(--fs-sm);display:flex;align-items:center;gap:6px;">
                        <i class="dot" style={`background:var(--${NATURE_META[nat].tone})`} />
                        {cat.nome}
                      </div>
                      <div style="display:flex;align-items:center;gap:8px;">
                        <span class="muted" style="font-size:var(--fs-xs);">
                          Total: <b class="num" style="color:var(--text);">{money(subMes)}</b>
                        </span>
                        <button
                          type="button"
                          class="btn btn--ghost btn--icon"
                          style="min-height:26px;width:26px;"
                          onClick={() => abrirNovaProjecao(cat.id, nat)}
                          title="Adicionar conta nesta categoria"
                        >
                          <Icon name="plus" style="width:14px;height:14px;" />
                        </button>
                      </div>
                    </div>

                    {contasDaCat.length === 0 ? (
                      <p class="muted" style="font-size:var(--fs-xs);padding:var(--sp-2) 0;">
                        Nenhuma conta nesta categoria. Clique no "+" para adicionar.
                      </p>
                    ) : (
                      <div class="stack" style="gap:var(--sp-2);">
                        {contasDaCat.map((c) => {
                          const p = getProj(c.id, mesAtivo);
                          return (
                            <div
                              key={c.id}
                              style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface);"
                            >
                              <div style="flex:1;min-width:0;">
                                <div style="font-weight:600;font-size:var(--fs-sm);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                  <span>{c.nome}</span>
                                  {p.data && (
                                    <span
                                      class="badge badge--neutral"
                                      style="font-size:10px;padding:1px 5px;display:inline-flex;align-items:center;gap:3px;"
                                      title={`Data de vencimento / cobrança: ${p.data.split("-").reverse().join("/")}`}
                                    >
                                      <Icon name="calendar" style="width:10px;height:10px;" /> Venc. {p.data.split("-")[2]}/{p.data.split("-")[1]}
                                    </span>
                                  )}
                                  {p.parcela && p.totalParcelas && (
                                    <span
                                      class="badge"
                                      style="font-size:10px;padding:1px 5px;background:var(--primary-soft);color:var(--primary);display:inline-flex;align-items:center;gap:3px;"
                                      title={`Parcela ${p.parcela} de ${p.totalParcelas}`}
                                    >
                                      <Icon name="calendar" style="width:10px;height:10px;" /> {p.parcela}/{p.totalParcelas}
                                    </span>
                                  )}
                                  {c.vinculo && (
                                    <span
                                      class="badge"
                                      style="font-size:10px;padding:1px 5px;background:var(--primary-soft);color:var(--primary);display:inline-flex;align-items:center;gap:3px;cursor:pointer;"
                                      onClick={() => recalcularContaIndividual(c)}
                                      title={
                                        c.vinculo.modo === "formula"
                                          ? `Fórmula: ${c.vinculo.formula || ""} (Clique para recalcular)`
                                          : `Vinculado a ${c.vinculo.tipo === "conta" ? "conta" : "categoria"}: ${c.vinculo.percentual !== undefined ? `${c.vinculo.percentual}%` : money(c.vinculo.valorFixo || 0)} (Clique para recalcular)`
                                      }
                                    >
                                      {c.vinculo.modo === "formula" ? (
                                        <>
                                          <span style="font-weight:700;font-style:italic;font-family:serif;">fx</span>
                                          <span>fórmula</span>
                                        </>
                                      ) : (
                                        <>
                                          <Icon name="link" style="width:10px;height:10px;" />
                                          <span>{c.vinculo.percentual !== undefined ? `${c.vinculo.percentual}%` : "Fixo"}</span>
                                        </>
                                      )}
                                    </span>
                                  )}
                                </div>
                                {p.obs && (
                                  <div class="muted" style="font-size:var(--fs-xs);margin-top:2px;">
                                    Obs: {p.obs}
                                  </div>
                                )}
                              </div>

                              <div style="display:flex;align-items:center;gap:6px;">
                                <div
                                  style="display:flex;align-items:center;background:var(--surface-solid);border:1px solid var(--border-strong);border-radius:var(--r-md);padding:0 8px;"
                                >
                                  <span class="muted" style="font-size:var(--fs-xs);">R$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    inputMode="decimal"
                                    style="width:95px;min-height:36px;border:0;background:transparent;text-align:right;font-weight:600;font-size:var(--fs-sm);outline:none;color:var(--text);"
                                    value={p.valor ? (p.valor / 100).toFixed(2) : ""}
                                    placeholder="0,00"
                                    onFocus={(e) => e.currentTarget.select()}
                                    onBlur={(e) => {
                                      const val = parseFloat(e.currentTarget.value) || 0;
                                      if (val !== p.valor / 100) atualizarValor(c.id, mesAtivo, val);
                                    }}
                                  />
                                </div>

                                {c.vinculo && (
                                  <button
                                    type="button"
                                    class="btn btn--ghost btn--icon"
                                    style="min-height:36px;width:36px;color:var(--primary);"
                                    onClick={() => recalcularContaIndividual(c)}
                                    title={c.vinculo.modo === "formula" ? `Recalcular fórmula: ${c.vinculo.formula}` : "Recalcular projeção vinculada"}
                                  >
                                    <Icon name="refresh" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  class="btn btn--ghost btn--icon"
                                  style="min-height:36px;width:36px;"
                                  onClick={() => abrirNovaProjecao(c.categoriaId, c.natureza, c.id, "parcelado")}
                                  title="Lançar projeção de parcelamento nesta conta"
                                >
                                  <Icon name="calendar" />
                                </button>

                                <button
                                  type="button"
                                  class="btn btn--ghost btn--icon"
                                  style="min-height:36px;width:36px;"
                                  onClick={() => replicarParaAno(c.id, mesAtivo)}
                                  title="Replicar este valor para todos os 12 meses"
                                >
                                  <Icon name="copy" />
                                </button>

                                <button
                                  type="button"
                                  class="btn btn--ghost btn--icon"
                                  style={`min-height:36px;width:36px;${p.obs || p.data ? "color:var(--primary);" : ""}`}
                                  onClick={() =>
                                    setModalObs({ contaId: c.id, mes: mesAtivo, obs: p.obs || "", data: p.data, nome: c.nome })
                                  }
                                  title="Detalhes e vencimento desta projeção"
                                >
                                  <Icon name="pencil" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL INCLUIR PROJEÇÃO DIRETAMENTE ================= */}
      {modalNovaProjecao && (
        <Modal
          title={`Nova Projeção Financeira (${NATURE_META[modalNovaProjecao.natureza].label})`}
          isOpen={true}
          subtela={true}
          size="lg"
          onClose={() => setModalNovaProjecao(null)}
          onSubmitShortcut={() => salvarNovaProjecao()}
          aside={
            <ResumoPainel
              modo="projecao"
              natureza={modalNovaProjecao.natureza}
              contaNome={todasContas.find((c) => c.id === modalNovaProjecao.contaId)?.nome}
              categoriaNome={todasCats.find((c) => c.id === modalNovaProjecao.categoriaId)?.nome}
              distribuicao={modalNovaProjecao.distribuicao}
              ano={anoNum}
              mesesValores={mesesValoresResumo}
              parcelaInfo={
                modalNovaProjecao.distribuicao === "parcelado"
                  ? {
                      qtd: modalNovaProjecao.parcelaQtd,
                      mesInicio: modalNovaProjecao.parcelaMesInicio,
                      dividir: modalNovaProjecao.parcelaDividirValor,
                      valorInformadoCentavos: modalNovaProjecao.parcelaValorCentavos,
                    }
                  : undefined
              }
              obs={modalNovaProjecao.obs}
            />
          }
          footer={
            <div class="modal-footer-actions">
              <span class="muted only-desktop" style="font-size:11px;">
                Pressione <kbd style="padding:1px 5px;background:var(--surface);border:1px solid var(--border);border-radius:3px;font-family:inherit;">Ctrl</kbd> + <kbd style="padding:1px 5px;background:var(--surface);border:1px solid var(--border);border-radius:3px;font-family:inherit;">Enter</kbd> para salvar
              </span>
              <div class="modal-footer-actions__right">
                <div class="modal-footer-actions__secondary-row">
                  <button type="button" class="btn btn--ghost" onClick={() => setModalNovaProjecao(null)}>
                    Cancelar
                  </button>
                </div>
                <button type="submit" form="form-nova-projecao" class="btn btn--primary" style="font-weight:700;">
                  Salvar Projeção
                </button>
              </div>
            </div>
          }
        >
          <form id="form-nova-projecao" onSubmit={salvarNovaProjecao}>
            {/* Seletor de Natureza */}
            <div style="margin-bottom:var(--sp-3);">
              <NaturezaSegmented
                value={modalNovaProjecao.natureza}
                onChange={(novaNat) => {
                  const catsDestaNat = todasCats.filter((c) => c.natureza === novaNat);
                  const primCat = catsDestaNat[0]?.id || "";
                  const contasDestaCat = todasContas.filter((c) => c.natureza === novaNat && c.categoriaId === primCat && c.ativa);
                  setModalNovaProjecao({
                    ...modalNovaProjecao,
                    natureza: novaNat,
                    categoriaId: primCat,
                    contaId: contasDestaCat[0]?.id || todasContas.find((c) => c.natureza === novaNat && c.ativa)?.id || "",
                  });
                }}
              />
            </div>

            <FormBlock>
              {/* Seção 1: O Quê? (Conta) */}
              <FormSection num={1} title="O quê? (Conta)">
              <ContaPicker
                natureza={modalNovaProjecao.natureza}
                categorias={todasCats}
                contas={todasContas}
                selectedContaId={modalNovaProjecao.contaId}
                onChange={(contaId, catId) => {
                  setModalNovaProjecao({
                    ...modalNovaProjecao,
                    contaId,
                    categoriaId: catId,
                  });
                }}
                onCriarCategoria={async (nome) => {
                  const criada = await categorias.create({
                    empresaId: empId,
                    natureza: modalNovaProjecao.natureza,
                    nome,
                  });
                  toast.success(`Categoria "${criada.nome}" criada!`);
                  return criada.id;
                }}
                onCriarConta={async (nome, categoriaId) => {
                  const criada = await contas.create({
                    empresaId: empId,
                    categoriaId,
                    natureza: modalNovaProjecao.natureza,
                    nome,
                    ativa: true,
                  });
                  toast.success(`Conta "${criada.nome}" criada!`);
                  return criada.id;
                }}
              />
            </FormSection>

            {/* Seção 2: Valor e Distribuição */}
            <FormSection num={2} title="Valor e Distribuição">
              {/* Origem do valor: Manual ou Calculado */}
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <label class="form-label" style="margin:0;font-size:var(--fs-xs);">
                  Origem do Valor *
                </label>
                <div class="tabs tabs--sm" style="margin:0;">
                  <button
                    type="button"
                    class={`tab ${modalNovaProjecao.origemValor === "manual" ? "is-active" : ""}`}
                    style="font-size:var(--fs-xs);padding:2px 8px;"
                    onClick={() => setModalNovaProjecao({ ...modalNovaProjecao, origemValor: "manual" })}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    class={`tab ${modalNovaProjecao.origemValor === "calculado" ? "is-active" : ""}`}
                    style="font-size:var(--fs-xs);padding:2px 8px;"
                    onClick={() => setModalNovaProjecao({ ...modalNovaProjecao, origemValor: "calculado" })}
                  >
                    Calculado (Vínculo / fx)
                  </button>
                </div>
              </div>

              {modalNovaProjecao.origemValor === "manual" ? (
                <div style="display:flex;flex-direction:column;gap:12px;">
                  {/* Distribuição no tempo */}
                  <div>
                    <label class="form-label" style="font-size:var(--fs-xs);margin-bottom:6px;">
                      Como deseja distribuir os valores em {anoNum}?
                    </label>
                    <RepeticaoSelector
                      modo="projecao"
                      distribuicao={modalNovaProjecao.distribuicao}
                      onChangeDistribuicao={(dist) =>
                        setModalNovaProjecao({ ...modalNovaProjecao, distribuicao: dist })
                      }
                      mesInicioParcela={modalNovaProjecao.parcelaMesInicio}
                      onChangeMesInicioParcela={(mes) =>
                        setModalNovaProjecao({ ...modalNovaProjecao, parcelaMesInicio: mes })
                      }
                      numParcelas={modalNovaProjecao.parcelaQtd}
                      onChangeNumParcelas={(qtd) =>
                        setModalNovaProjecao({ ...modalNovaProjecao, parcelaQtd: qtd })
                      }
                      dividirValor={modalNovaProjecao.parcelaDividirValor}
                      onChangeDividirValor={(dividir) =>
                        setModalNovaProjecao({ ...modalNovaProjecao, parcelaDividirValor: dividir })
                      }
                      mesEspecifico={modalNovaProjecao.mesEspecifico}
                      onChangeMesEspecifico={(mes) =>
                        setModalNovaProjecao({ ...modalNovaProjecao, mesEspecifico: mes })
                      }
                      valoresMensais={modalNovaProjecao.valoresMensais}
                      onChangeValoresMensais={(vals) =>
                        setModalNovaProjecao({ ...modalNovaProjecao, valoresMensais: vals })
                      }
                    />
                  </div>

                  {/* Campo de valor e vencimento correspondente ao modo selecionado */}
                  {modalNovaProjecao.distribuicao === "fixo" && (
                    <div>
                      <label class="form-label" style="font-size:var(--fs-xs);margin-bottom:4px;">
                        Valor Mensal Previsto (12x) *
                      </label>
                      <MoneyInput
                        variant="hero"
                        autoFocus
                        valueCentavos={modalNovaProjecao.valorFixoCentavos}
                        onChangeCentavos={(cents) =>
                          setModalNovaProjecao({ ...modalNovaProjecao, valorFixoCentavos: cents })
                        }
                      />
                      <div style="margin-top:var(--sp-2);">
                        <label class="form-label" for="nova-proj-dia-fixo" style="font-size:var(--fs-xs);margin-bottom:4px;">
                          Dia de Vencimento Mensal (Opcional)
                        </label>
                        <input
                          id="nova-proj-dia-fixo"
                          type="number"
                          min="1"
                          max="31"
                          class="input"
                          style="max-width:160px;"
                          placeholder="Ex: 10"
                          value={modalNovaProjecao.diaVencimento || ""}
                          onInput={(e) => {
                            const val = parseInt((e.currentTarget as HTMLInputElement).value, 10);
                            setModalNovaProjecao({ ...modalNovaProjecao, diaVencimento: isNaN(val) ? undefined : val });
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {modalNovaProjecao.distribuicao === "parcelado" && (
                    <div>
                      <label class="form-label" style="font-size:var(--fs-xs);margin-bottom:4px;">
                        {modalNovaProjecao.parcelaDividirValor ? "Valor Total da Compra/Venda *" : "Valor por Parcela *"}
                      </label>
                      <MoneyInput
                        variant="hero"
                        valueCentavos={modalNovaProjecao.parcelaValorCentavos}
                        onChangeCentavos={(cents) =>
                          setModalNovaProjecao({ ...modalNovaProjecao, parcelaValorCentavos: cents })
                        }
                      />
                      <div style="margin-top:var(--sp-2);">
                        <label class="form-label" for="nova-proj-dia-parc" style="font-size:var(--fs-xs);margin-bottom:4px;">
                          Dia de Vencimento das Parcelas (Opcional)
                        </label>
                        <input
                          id="nova-proj-dia-parc"
                          type="number"
                          min="1"
                          max="31"
                          class="input"
                          style="max-width:160px;"
                          placeholder="Ex: 10"
                          value={modalNovaProjecao.diaVencimento || ""}
                          onInput={(e) => {
                            const val = parseInt((e.currentTarget as HTMLInputElement).value, 10);
                            setModalNovaProjecao({ ...modalNovaProjecao, diaVencimento: isNaN(val) ? undefined : val });
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {modalNovaProjecao.distribuicao === "especifico" && (
                    <div>
                      <label class="form-label" style="font-size:var(--fs-xs);margin-bottom:4px;">
                        Valor Previsto em {MONTHS[modalNovaProjecao.mesEspecifico]} *
                      </label>
                      <MoneyInput
                        variant="hero"
                        valueCentavos={modalNovaProjecao.valorEspecificoCentavos}
                        onChangeCentavos={(cents) =>
                          setModalNovaProjecao({ ...modalNovaProjecao, valorEspecificoCentavos: cents })
                        }
                      />
                      <div style="margin-top:var(--sp-2);">
                        <label class="form-label" for="nova-proj-data-esp" style="font-size:var(--fs-xs);margin-bottom:4px;">
                          Data de Vencimento / Cobrança (Opcional)
                        </label>
                        <input
                          id="nova-proj-data-esp"
                          type="date"
                          class="input"
                          style="max-width:200px;"
                          value={modalNovaProjecao.dataEspecifica || ""}
                          onInput={(e) =>
                            setModalNovaProjecao({ ...modalNovaProjecao, dataEspecifica: (e.currentTarget as HTMLInputElement).value })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style="display:flex;flex-direction:column;gap:8px;">
                  <ValorCalculadoEditor
                    contas={todasContas}
                    categorias={todasCats}
                    currentContaId={modalNovaProjecao.contaId}
                    regra={modalNovaProjecao.regraCalculo}
                    onChangeRegra={(regra) =>
                      setModalNovaProjecao({ ...modalNovaProjecao, regraCalculo: regra })
                    }
                    mesAtivo={mesAtivo}
                    avaliarMes={(m) => {
                      const regra = modalNovaProjecao.regraCalculo;
                      if (regra.modo === "formula" && regra.formula) {
                        const res = calcularFormulaProjecoes(regra.formula, m, ps, todasContas, todasCats);
                        return { ok: res.ok, valorCentavos: res.valorCentavos, erro: res.erro };
                      }
                      const base = calcularBaseProjecoes(regra, m, ps, todasContas);
                      const val = calcularValorVinculado(base, regra);
                      return { ok: true, valorCentavos: val, base };
                    }}
                    mostrarSalvarNaConta={true}
                    salvarNaConta={modalNovaProjecao.salvarVinculoNaConta}
                    onChangeSalvarNaConta={(val) =>
                      setModalNovaProjecao({ ...modalNovaProjecao, salvarVinculoNaConta: val })
                    }
                  />
                </div>
              )}
            </FormSection>

            {/* Seção 3: Observações (Recolhível) */}
            <Disclosure
              title="Observação / Justificativa (Opcional)"
              defaultOpen={Boolean(modalNovaProjecao.obs)}
            >
              <div class="form-group" style="margin-bottom:0;">
                <textarea
                  id="nova-proj-obs"
                  class="textarea"
                  rows={2}
                  placeholder="Ex: Contrato de 12 meses com reajuste anual pelo IPCA em Junho..."
                  value={modalNovaProjecao.obs}
                  onInput={(e) =>
                    setModalNovaProjecao({ ...modalNovaProjecao, obs: (e.currentTarget as HTMLTextAreaElement).value })
                  }
                />
              </div>
            </Disclosure>
          </FormBlock>
        </form>
      </Modal>
      )}

      {/* Modal Detalhes & Vencimento da Projeção */}
      <Modal
        title={`Detalhes & Vencimento: ${modalObs?.nome || ""}`}
        isOpen={modalObs !== null}
        onClose={() => setModalObs(null)}
        footer={
          <>
            <button type="button" class="btn btn--ghost" onClick={() => setModalObs(null)}>
              Cancelar
            </button>
            <button type="button" class="btn btn--primary" onClick={salvarObs}>
              Salvar Detalhes
            </button>
          </>
        }
      >
        <div class="form-group">
          <label class="form-label" for="proj-data">
            Data de Vencimento / Cobrança ({modalObs ? MONTHS[modalObs.mes] : ""})
          </label>
          <input
            id="proj-data"
            type="date"
            class="input"
            value={modalObs?.data || ""}
            onInput={(e) => modalObs && setModalObs({ ...modalObs, data: (e.currentTarget as HTMLInputElement).value })}
          />
          <span class="muted" style="font-size:var(--fs-xs);margin-top:4px;">
            A data auxilia no controle de cobranças e no cálculo exato de pendências e lembretes de atraso.
          </span>
        </div>

        <div class="form-group" style="margin-top:var(--sp-3);">
          <label class="form-label" for="proj-obs">
            Detalhes / Justificativa da Projeção ({modalObs ? MONTHS[modalObs.mes] : ""})
          </label>
          <textarea
            id="proj-obs"
            class="textarea"
            rows={3}
            placeholder="Ex: Reforma emergencial, distribuição extraordinária de dividendos..."
            value={modalObs?.obs || ""}
            onInput={(e) => modalObs && setModalObs({ ...modalObs, obs: (e.currentTarget as HTMLTextAreaElement).value })}
          />
        </div>
      </Modal>

      {/* Modal Edição de Conta */}
      {modalEditarConta && (
        <Modal
          title="Editar Conta"
          isOpen={true}
          onClose={() => setModalEditarConta(null)}
          footer={
            <>
              <button type="button" class="btn btn--ghost" onClick={() => setModalEditarConta(null)}>
                Cancelar
              </button>
              <button type="submit" form="form-editar-conta" class="btn btn--primary">
                Salvar Alterações
              </button>
            </>
          }
        >
          <form id="form-editar-conta" onSubmit={salvarEditarConta}>
            <div class="form-group">
              <label class="form-label" for="edit-conta-nome">Nome da Conta *</label>
              <input
                id="edit-conta-nome"
                class="input"
                required
                value={modalEditarConta.nome}
                onInput={(e) =>
                  setModalEditarConta({ ...modalEditarConta, nome: e.currentTarget.value })
                }
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="edit-conta-cat">Categoria *</label>
              <CustomSelect
                id="edit-conta-cat"
                value={modalEditarConta.categoriaId}
                options={cats.map((c) => ({ value: c.id, label: c.nome }))}
                onChange={(catId) => setModalEditarConta({ ...modalEditarConta, categoriaId: catId })}
              />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { CustomSelect } from "../components/CustomSelect.tsx";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/Modal.tsx";
import { confirmarAcao } from "../components/ModalConfirm.tsx";
import { toast } from "../components/Toast.tsx";
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
  novaCategoriaNome: string;
  criandoNovaCat: boolean;
  modoConta: "nova" | "existente";
  contaId: string;
  novaContaNome: string;
  modoValor: "fixo" | "parcelado" | "especifico" | "mensal" | "vinculado";
  valorFixo: number | string;
  parcelaMesInicio: number;
  parcelaQtd: number;
  parcelaValorTotalOuUnitario: number | string;
  parcelaDividirValor: boolean;
  mesEspecifico: number;
  valorEspecifico: number | string;
  valoresMensais: (number | string)[];
  obs: string;
  vinculoModoTipo: "simples" | "formula";
  vinculoTipo: "conta" | "categoria";
  vinculoOrigemId: string;
  vinculoModo: "percentual" | "fixo";
  vinculoPercentual: number | string;
  vinculoValorFixo: number | string;
  vinculoFormula: string;
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
  const [modalObs, setModalObs] = useState<{ contaId: string; mes: number; obs: string; nome: string } | null>(null);
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
  const pMap = new Map<string, { id?: string; valor: number; obs?: string; parcela?: number; totalParcelas?: number }>();
  for (const p of ps) {
    pMap.set(`${p.contaId}_${p.mes}`, {
      id: p.id,
      valor: p.valor,
      obs: p.obs,
      parcela: p.parcela,
      totalParcelas: p.totalParcelas,
    });
  }

  const getProj = (contaId: string, mes: number) => {
    return pMap.get(`${contaId}_${mes}`) || { valor: 0, obs: "", parcela: undefined, totalParcelas: undefined };
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
    await projecoes.set(ano.id, modalObs.contaId, modalObs.mes, atual.valor, modalObs.obs.trim() || undefined);
    toast.success("Observação salva!");
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

    setModalNovaProjecao({
      natureza: natEscolhida,
      categoriaId: catId,
      novaCategoriaNome: "",
      criandoNovaCat: catsDestaNat.length === 0,
      modoConta: contaIdPadrao ? "existente" : "nova",
      contaId: contaIdPadrao || contasDestaCat[0]?.id || "",
      novaContaNome: "",
      modoValor: modoValorPadrao || "fixo",
      valorFixo: "",
      parcelaMesInicio: mesAtivo,
      parcelaQtd: 12,
      parcelaValorTotalOuUnitario: "",
      parcelaDividirValor: true,
      mesEspecifico: mesAtivo,
      valorEspecifico: "",
      valoresMensais: Array(12).fill(""),
      obs: "",
      vinculoModoTipo: "simples",
      vinculoTipo: "conta",
      vinculoOrigemId: defaultOrigemId,
      vinculoModo: "percentual",
      vinculoPercentual: 30,
      vinculoValorFixo: "",
      vinculoFormula: "",
      salvarVinculoNaConta: true,
    });
  };

  const salvarNovaProjecao = async (e: Event) => {
    e.preventDefault();
    if (!modalNovaProjecao) return;

    let targetCatId = modalNovaProjecao.categoriaId;

    // Se estiver criando uma nova categoria
    if (modalNovaProjecao.criandoNovaCat || !targetCatId) {
      const nomeCat = modalNovaProjecao.novaCategoriaNome.trim();
      if (!nomeCat) {
        toast.warn("Informe o nome da categoria.");
        return;
      }
      const novaCat = await categorias.create({
        empresaId: empId,
        natureza: modalNovaProjecao.natureza,
        nome: nomeCat,
      });
      targetCatId = novaCat.id;
    }

    let targetContaId = modalNovaProjecao.contaId;

    // Se estiver cadastrando nova conta
    if (modalNovaProjecao.modoConta === "nova" || !targetContaId) {
      const nomeConta = modalNovaProjecao.novaContaNome.trim();
      if (!nomeConta) {
        toast.warn("Informe o nome da conta a ser projetada.");
        return;
      }
      const novaC = await contas.create({
        empresaId: empId,
        categoriaId: targetCatId,
        natureza: modalNovaProjecao.natureza,
        nome: nomeConta,
        ativa: true,
      });
      targetContaId = novaC.id;
    }

    // Grava as projeções de acordo com o modo escolhido
    const obsTexto = modalNovaProjecao.obs.trim() || undefined;

    if (modalNovaProjecao.modoValor === "fixo") {
      const centavos = Math.round(Number(modalNovaProjecao.valorFixo || 0) * 100);
      for (let m = 0; m < 12; m++) {
        await projecoes.set(ano.id, targetContaId, m, centavos, obsTexto);
      }
    } else if (modalNovaProjecao.modoValor === "parcelado") {
      const totalParcelas = Math.max(2, Math.min(60, Number(modalNovaProjecao.parcelaQtd) || 2));
      const mesInicio = Math.max(0, Math.min(11, Number(modalNovaProjecao.parcelaMesInicio) || 0));
      const centavosEntrada = Math.round(Number(modalNovaProjecao.parcelaValorTotalOuUnitario || 0) * 100);

      if (centavosEntrada <= 0) {
        toast.warn("Informe um valor válido para o parcelamento.");
        return;
      }

      const dividir = modalNovaProjecao.parcelaDividirValor;
      const valorPorParcela = dividir ? Math.floor(centavosEntrada / totalParcelas) : centavosEntrada;
      const resto = dividir ? centavosEntrada - (valorPorParcela * totalParcelas) : 0;

      // Se for nova conta, inicializa os 12 meses do ano atual com 0
      if (modalNovaProjecao.modoConta === "nova") {
        for (let m = 0; m < 12; m++) {
          await projecoes.set(ano.id, targetContaId, m, 0);
        }
      }

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

        await projecoes.set(
          anoAlvoId,
          targetContaId,
          targetMonth,
          valorParcela,
          obsParcela,
          undefined,
          { parcela: i, totalParcelas }
        );
      }
    } else if (modalNovaProjecao.modoValor === "especifico") {
      const centavos = Math.round(Number(modalNovaProjecao.valorEspecifico || 0) * 100);
      for (let m = 0; m < 12; m++) {
        const val = m === modalNovaProjecao.mesEspecifico ? centavos : 0;
        await projecoes.set(ano.id, targetContaId, m, val, m === modalNovaProjecao.mesEspecifico ? obsTexto : undefined);
      }
    } else if (modalNovaProjecao.modoValor === "mensal") {
      // Modo mensal individual
      for (let m = 0; m < 12; m++) {
        const centavos = Math.round(Number(modalNovaProjecao.valoresMensais[m] || 0) * 100);
        await projecoes.set(ano.id, targetContaId, m, centavos, obsTexto);
      }
    } else if (modalNovaProjecao.modoValor === "vinculado") {
      if (modalNovaProjecao.vinculoModoTipo === "formula") {
        const formulaTexto = modalNovaProjecao.vinculoFormula.trim();
        const todasPs = await projecoes.byAno(ano.id);
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
        const regra: RegraVinculo = {
          modo: "simples",
          tipo: modalNovaProjecao.vinculoTipo,
          origemId: modalNovaProjecao.vinculoOrigemId,
          percentual: modalNovaProjecao.vinculoModo === "percentual" ? Number(modalNovaProjecao.vinculoPercentual || 0) : undefined,
          valorFixo: modalNovaProjecao.vinculoModo === "fixo" ? Math.round(Number(modalNovaProjecao.vinculoValorFixo || 0) * 100) : undefined,
        };

        const todasPs = await projecoes.byAno(ano.id);
        for (let m = 0; m < 12; m++) {
          const baseCentavos = calcularBaseProjecoes(regra, m, todasPs, todasContas);
          const valorCalculado = calcularValorVinculado(baseCentavos, regra);
          await projecoes.set(ano.id, targetContaId, m, valorCalculado, obsTexto, modalNovaProjecao.vinculoOrigemId);
        }

        if (modalNovaProjecao.salvarVinculoNaConta) {
          await contas.update(targetContaId, { vinculo: regra });
        }
      }
    }

    // Se a alteração afetou outras contas vinculadas ou com fórmulas, recalcula
    await recalcularDependentes();

    // Se a natureza da nova projeção for diferente da aba atual, comuta para ela
    if (modalNovaProjecao.natureza !== nat) {
      setNat(modalNovaProjecao.natureza);
    }

    if (modalNovaProjecao.modoValor === "parcelado") {
      toast.success(`${modalNovaProjecao.parcelaQtd} parcelas projetadas com sucesso!`);
    } else {
      toast.success("Projeção e conta registradas com sucesso!");
    }
    setModalNovaProjecao(null);
  };

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
          <div class="tabs" style="margin-bottom:0;background:var(--surface);padding:3px;border-radius:var(--r-md);border:1px solid var(--border);">
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
                                          title={p.obs || (p.parcela && p.totalParcelas ? `Parcela ${p.parcela} de ${p.totalParcelas}` : undefined)}
                                          onFocus={(e) => e.currentTarget.select()}
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
                                  style={`min-height:36px;width:36px;${p.obs ? "color:var(--primary);" : ""}`}
                                  onClick={() =>
                                    setModalObs({ contaId: c.id, mes: mesAtivo, obs: p.obs || "", nome: c.nome })
                                  }
                                  title="Observação desta projeção"
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
          onClose={() => setModalNovaProjecao(null)}
          footer={
            <>
              <button type="button" class="btn btn--ghost" onClick={() => setModalNovaProjecao(null)}>
                Cancelar
              </button>
              <button type="submit" form="form-nova-projecao" class="btn btn--primary">
                Salvar Projeção
              </button>
            </>
          }
        >
          <form id="form-nova-projecao" onSubmit={salvarNovaProjecao}>
            {/* Seletor de Natureza */}
            <div class="tabs" style="margin-bottom:var(--sp-3);">
              {NATUREZAS.map((n) => {
                const meta = NATURE_META[n];
                return (
                  <button
                    type="button"
                    key={n}
                    class={`tab ${modalNovaProjecao.natureza === n ? "is-active" : ""}`}
                    onClick={() => {
                      const catsDestaNat = todasCats.filter((c) => c.natureza === n);
                      const primCat = catsDestaNat[0]?.id || "";
                      const contasDestaCat = todasContas.filter((c) => c.natureza === n && c.categoriaId === primCat && c.ativa);
                      setModalNovaProjecao({
                        ...modalNovaProjecao,
                        natureza: n,
                        categoriaId: primCat,
                        criandoNovaCat: catsDestaNat.length === 0,
                        contaId: contasDestaCat[0]?.id || "",
                        modoConta: "nova",
                      });
                    }}
                  >
                    <Icon name={meta.icon} /> {meta.label}
                  </button>
                );
              })}
            </div>

            {/* Categoria: Escolha existente ou crie uma nova */}
            <div class="form-group">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <label class="form-label" style="margin-bottom:0;">
                  Categoria *
                </label>
                <button
                  type="button"
                  class="btn btn--ghost"
                  style="font-size:var(--fs-xs);padding:2px 6px;min-height:24px;"
                  onClick={() =>
                    setModalNovaProjecao({
                      ...modalNovaProjecao,
                      criandoNovaCat: !modalNovaProjecao.criandoNovaCat,
                      novaCategoriaNome: "",
                    })
                  }
                >
                  {modalNovaProjecao.criandoNovaCat ? "Selecionar existente" : "+ Nova Categoria"}
                </button>
              </div>

              {modalNovaProjecao.criandoNovaCat ? (
                <input
                  class="input"
                  required
                  autoFocus
                  placeholder="Ex: Assinaturas de Software, Pessoal, Marketing..."
                  value={modalNovaProjecao.novaCategoriaNome}
                  onInput={(e) =>
                    setModalNovaProjecao({ ...modalNovaProjecao, novaCategoriaNome: e.currentTarget.value })
                  }
                />
              ) : (
                <CustomSelect
                  value={modalNovaProjecao.categoriaId}
                  placeholder="Selecione uma Categoria"
                  options={todasCats
                    .filter((c) => c.natureza === modalNovaProjecao.natureza)
                    .map((c) => ({ value: c.id, label: c.nome }))}
                  onChange={(novaCatId) => {
                    const contasDestaCat = todasContas.filter(
                      (c) => c.natureza === modalNovaProjecao.natureza && c.categoriaId === novaCatId && c.ativa
                    );
                    setModalNovaProjecao({
                      ...modalNovaProjecao,
                      categoriaId: novaCatId,
                      contaId: contasDestaCat[0]?.id || "",
                    });
                  }}
                  action={{
                    label: "Nova Categoria...",
                    icon: "plus",
                    onClick: () =>
                      setModalNovaProjecao({
                        ...modalNovaProjecao,
                        criandoNovaCat: true,
                        novaCategoriaNome: "",
                      }),
                  }}
                />
              )}
            </div>

            {/* Conta / Item a projetar */}
            <div class="form-group">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <label class="form-label" style="margin-bottom:0;">
                  Nome da Conta / Item de Projeção *
                </label>
                {!modalNovaProjecao.criandoNovaCat &&
                  todasContas.filter(
                    (c) =>
                      c.natureza === modalNovaProjecao.natureza &&
                      c.categoriaId === modalNovaProjecao.categoriaId &&
                      c.ativa
                  ).length > 0 && (
                    <div style="display:flex;gap:4px;">
                      <button
                        type="button"
                        class={`btn btn--ghost ${modalNovaProjecao.modoConta === "nova" ? "is-active" : ""}`}
                        style="font-size:var(--fs-xs);padding:2px 6px;min-height:24px;"
                        onClick={() =>
                          setModalNovaProjecao({ ...modalNovaProjecao, modoConta: "nova", novaContaNome: "" })
                        }
                      >
                        Nova Conta
                      </button>
                      <button
                        type="button"
                        class={`btn btn--ghost ${modalNovaProjecao.modoConta === "existente" ? "is-active" : ""}`}
                        style="font-size:var(--fs-xs);padding:2px 6px;min-height:24px;"
                        onClick={() =>
                          setModalNovaProjecao({ ...modalNovaProjecao, modoConta: "existente" })
                        }
                      >
                        Existente
                      </button>
                    </div>
                  )}
              </div>

              {modalNovaProjecao.modoConta === "existente" ? (
                <CustomSelect
                  value={modalNovaProjecao.contaId}
                  placeholder="Selecione uma conta existente"
                  options={todasContas
                    .filter(
                      (c) =>
                        c.natureza === modalNovaProjecao.natureza &&
                        c.categoriaId === modalNovaProjecao.categoriaId &&
                        c.ativa
                    )
                    .map((c) => ({ value: c.id, label: c.nome }))}
                  onChange={(cId) => setModalNovaProjecao({ ...modalNovaProjecao, contaId: cId })}
                />
              ) : (
                <input
                  class="input"
                  required
                  placeholder="Ex: Google Ads, Aluguel Matriz, Mensalidade Fibra..."
                  value={modalNovaProjecao.novaContaNome}
                  onInput={(e) =>
                    setModalNovaProjecao({ ...modalNovaProjecao, novaContaNome: e.currentTarget.value })
                  }
                />
              )}
            </div>

            {/* Modo de Definição de Valor */}
            <div
              style="background:var(--surface-soft);padding:var(--sp-3);border-radius:var(--r-md);border:1px solid var(--border);margin-bottom:var(--sp-3);"
            >
              <label class="form-label" style="margin-bottom:var(--sp-2);">
                Como deseja definir os valores para {anoNum}?
              </label>

              <div class="tabs" style="margin-bottom:var(--sp-3);">
                <button
                  type="button"
                  class={`tab ${modalNovaProjecao.modoValor === "fixo" ? "is-active" : ""}`}
                  onClick={() => setModalNovaProjecao({ ...modalNovaProjecao, modoValor: "fixo" })}
                >
                  Fixo Mensal (12x)
                </button>
                <button
                  type="button"
                  class={`tab ${modalNovaProjecao.modoValor === "parcelado" ? "is-active" : ""}`}
                  onClick={() => setModalNovaProjecao({ ...modalNovaProjecao, modoValor: "parcelado" })}
                >
                  <Icon name="calendar" style="width:13px;height:13px;" /> Parcelado
                </button>
                <button
                  type="button"
                  class={`tab ${modalNovaProjecao.modoValor === "especifico" ? "is-active" : ""}`}
                  onClick={() => setModalNovaProjecao({ ...modalNovaProjecao, modoValor: "especifico" })}
                >
                  Mês Pontual
                </button>
                <button
                  type="button"
                  class={`tab ${modalNovaProjecao.modoValor === "mensal" ? "is-active" : ""}`}
                  onClick={() => setModalNovaProjecao({ ...modalNovaProjecao, modoValor: "mensal" })}
                >
                  Grade Mês a Mês
                </button>
                <button
                  type="button"
                  class={`tab ${modalNovaProjecao.modoValor === "vinculado" ? "is-active" : ""}`}
                  onClick={() => setModalNovaProjecao({ ...modalNovaProjecao, modoValor: "vinculado" })}
                >
                  <Icon name="link" style="width:13px;height:13px;" /> Vinculado
                </button>
              </div>

              {modalNovaProjecao.modoValor === "fixo" && (
                <div>
                  <div class="form-group" style="margin-bottom:6px;">
                    <label class="form-label">Valor Mensal Previsto (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      class="input"
                      placeholder="0,00"
                      value={modalNovaProjecao.valorFixo}
                      onInput={(e) =>
                        setModalNovaProjecao({ ...modalNovaProjecao, valorFixo: e.currentTarget.value })
                      }
                    />
                  </div>
                  <div class="muted" style="font-size:var(--fs-xs);">
                    💡 Será projetado{" "}
                    <b>{money(Math.round(Number(modalNovaProjecao.valorFixo || 0) * 100))}</b> em cada um dos 12 meses (Total anual:{" "}
                    <b>{money(Math.round(Number(modalNovaProjecao.valorFixo || 0) * 100) * 12)}</b>).
                  </div>
                </div>
              )}

              {modalNovaProjecao.modoValor === "parcelado" && (
                <div>
                  <div class="form-row form-row--2" style="margin-bottom:8px;">
                    <div class="form-group" style="margin-bottom:0;">
                      <label class="form-label">Mês Inicial da 1ª Parcela *</label>
                      <CustomSelect
                        value={modalNovaProjecao.parcelaMesInicio}
                        options={MONTHS.map((m, idx) => ({ value: idx, label: `${m} de ${anoNum}` }))}
                        onChange={(val) =>
                          setModalNovaProjecao({ ...modalNovaProjecao, parcelaMesInicio: parseInt(val, 10) })
                        }
                      />
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                      <label class="form-label">Nº de Parcelas *</label>
                      <input
                        type="number"
                        min="2"
                        max="60"
                        required
                        class="input"
                        value={modalNovaProjecao.parcelaQtd}
                        onInput={(e) =>
                          setModalNovaProjecao({
                            ...modalNovaProjecao,
                            parcelaQtd: Math.max(2, Math.min(60, parseInt(e.currentTarget.value, 10) || 2)),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div class="form-row form-row--2" style="margin-bottom:8px;align-items:flex-end;">
                    <div class="form-group" style="margin-bottom:0;">
                      <label class="form-label">
                        {modalNovaProjecao.parcelaDividirValor ? "Valor Total da Compra/Venda (R$) *" : "Valor por Parcela (R$) *"}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        class="input"
                        placeholder="0,00"
                        value={modalNovaProjecao.parcelaValorTotalOuUnitario}
                        onInput={(e) =>
                          setModalNovaProjecao({
                            ...modalNovaProjecao,
                            parcelaValorTotalOuUnitario: e.currentTarget.value,
                          })
                        }
                      />
                    </div>

                    <div class="form-group" style="margin-bottom:0;display:flex;flex-direction:column;justify-content:center;gap:6px;">
                      <label class="form-label">Distribuição do Valor</label>
                      <div style="display:flex;gap:12px;align-items:center;font-size:var(--fs-xs);flex-wrap:wrap;min-height:36px;">
                        <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
                          <input
                            type="radio"
                            name="proj-dividir-valor"
                            checked={modalNovaProjecao.parcelaDividirValor}
                            onChange={() => setModalNovaProjecao({ ...modalNovaProjecao, parcelaDividirValor: true })}
                          />
                          Dividir total
                        </label>
                        <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
                          <input
                            type="radio"
                            name="proj-dividir-valor"
                            checked={!modalNovaProjecao.parcelaDividirValor}
                            onChange={() => setModalNovaProjecao({ ...modalNovaProjecao, parcelaDividirValor: false })}
                          />
                          Valor por parcela
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Prévia dinâmica das parcelas */}
                  {(() => {
                    const centavosEntrada = Math.round(Number(modalNovaProjecao.parcelaValorTotalOuUnitario || 0) * 100);
                    const qtd = Number(modalNovaProjecao.parcelaQtd) || 2;
                    const dividir = modalNovaProjecao.parcelaDividirValor;
                    const valorParcela = dividir ? Math.round(centavosEntrada / qtd) : centavosEntrada;
                    const totalFinal = dividir ? centavosEntrada : centavosEntrada * qtd;
                    const mesInicio = Number(modalNovaProjecao.parcelaMesInicio) || 0;
                    const mesFimTotal = mesInicio + qtd - 1;
                    const anoFim = anoNum + Math.floor(mesFimTotal / 12);
                    const mesFim = mesFimTotal % 12;

                    return (
                      <div class="muted" style="font-size:var(--fs-xs);margin-top:6px;line-height:1.4;">
                        💡 Serão geradas <b>{qtd} parcelas</b> de <b>~{money(valorParcela)}</b> cada, começando em{" "}
                        <b>{MONTHS[mesInicio]}/{anoNum}</b> até <b>{MONTHS[mesFim]}/{anoFim}</b> (Total: <b>{money(totalFinal)}</b>).
                        {anoFim > anoNum && (
                          <div style="color:var(--primary);margin-top:4px;">
                            ℹ️ As parcelas que ultrapassarem dezembro serão projetadas automaticamente nos exercícios seguintes ({anoFim}).
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {modalNovaProjecao.modoValor === "especifico" && (
                <div>
                  <div class="form-row form-row--2" style="margin-bottom:6px;">
                    <div class="form-group" style="margin-bottom:0;">
                      <label class="form-label">Mês Previsto *</label>
                      <CustomSelect
                        value={modalNovaProjecao.mesEspecifico}
                        options={MONTHS.map((m, idx) => ({ value: idx, label: m }))}
                        onChange={(val) =>
                          setModalNovaProjecao({ ...modalNovaProjecao, mesEspecifico: parseInt(val, 10) })
                        }
                      />
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                      <label class="form-label">Valor Previsto (R$) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        class="input"
                        placeholder="0,00"
                        value={modalNovaProjecao.valorEspecifico}
                        onInput={(e) =>
                          setModalNovaProjecao({ ...modalNovaProjecao, valorEspecifico: e.currentTarget.value })
                        }
                      />
                    </div>
                  </div>
                  <div class="muted" style="font-size:var(--fs-xs);">
                    💡 Ideal para receitas ou despesas que ocorrem apenas em um mês específico (ex: 13º, IPVA, seguros anuais). Os outros meses ficarão R$ 0,00.
                  </div>
                </div>
              )}

              {modalNovaProjecao.modoValor === "mensal" && (
                <div>
                  <div class="muted" style="font-size:var(--fs-xs);margin-bottom:8px;">
                    Preencha o valor previsto para cada mês:
                  </div>
                  <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:8px;">
                    {MONTHS.map((m, idx) => (
                      <div key={m} style="display:flex;flex-direction:column;gap:2px;">
                        <span style="font-size:0.7rem;font-weight:600;color:var(--text-muted);">{m}</span>
                        <input
                          type="number"
                          step="0.01"
                          class="input"
                          style="min-height:30px;padding:2px 6px;font-size:var(--fs-xs);text-align:right;"
                          placeholder="0,00"
                          value={modalNovaProjecao.valoresMensais[idx]}
                          onInput={(e) => {
                            const novos = [...modalNovaProjecao.valoresMensais];
                            novos[idx] = e.currentTarget.value;
                            setModalNovaProjecao({ ...modalNovaProjecao, valoresMensais: novos });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modalNovaProjecao.modoValor === "vinculado" && (() => {
                const regraSimulada: RegraVinculo = {
                  modo: modalNovaProjecao.vinculoModoTipo,
                  tipo: modalNovaProjecao.vinculoTipo,
                  origemId: modalNovaProjecao.vinculoOrigemId,
                  percentual: modalNovaProjecao.vinculoModo === "percentual" ? Number(modalNovaProjecao.vinculoPercentual || 0) : undefined,
                  valorFixo: modalNovaProjecao.vinculoModo === "fixo" ? Math.round(Number(modalNovaProjecao.vinculoValorFixo || 0) * 100) : undefined,
                  formula: modalNovaProjecao.vinculoFormula,
                };
                let totalAnualCalculado = 0;
                const previsaoMeses = MONTHS.map((m, idx) => {
                  if (modalNovaProjecao.vinculoModoTipo === "formula") {
                    const res = calcularFormulaProjecoes(modalNovaProjecao.vinculoFormula || "", idx, ps, todasContas, todasCats);
                    totalAnualCalculado += res.valorCentavos;
                    return { mes: m, base: 0, valor: res.valorCentavos };
                  } else {
                    const baseMes = calcularBaseProjecoes(regraSimulada, idx, ps, todasContas);
                    const valorCalculado = calcularValorVinculado(baseMes, regraSimulada);
                    totalAnualCalculado += valorCalculado;
                    return { mes: m, base: baseMes, valor: valorCalculado };
                  }
                });

                return (
                  <div class="stack" style="gap:10px;">
                    {/* Sub-tabs: Vínculo Simples vs Fórmula */}
                    <div class="tabs tabs--sm" style="margin:0;">
                      <button
                        type="button"
                        class={`tab ${modalNovaProjecao.vinculoModoTipo === "simples" ? "is-active" : ""}`}
                        style="font-size:var(--fs-xs);padding:4px 10px;"
                        onClick={() => setModalNovaProjecao({ ...modalNovaProjecao, vinculoModoTipo: "simples" })}
                      >
                        <Icon name="link" style="width:12px;height:12px;" /> Vínculo Direto
                      </button>
                      <button
                        type="button"
                        class={`tab ${modalNovaProjecao.vinculoModoTipo === "formula" ? "is-active" : ""}`}
                        style="font-size:var(--fs-xs);padding:4px 10px;"
                        onClick={() => setModalNovaProjecao({ ...modalNovaProjecao, vinculoModoTipo: "formula" })}
                      >
                        <span style="font-weight:700;font-style:italic;font-family:serif;">fx</span> Fórmula com Variáveis
                      </button>
                    </div>

                    {modalNovaProjecao.vinculoModoTipo === "simples" ? (
                      <>
                        <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;">
                          <div>
                            <label class="form-label" style="font-size:var(--fs-xs);">Vincular a:</label>
                            <div class="tabs tabs--sm" style="margin:0;">
                              <button
                                type="button"
                                class={`tab ${modalNovaProjecao.vinculoTipo === "conta" ? "is-active" : ""}`}
                                style="font-size:var(--fs-xs);padding:4px 8px;"
                                onClick={() => {
                                  const def = todasContas.find((c) => c.natureza === "receber")?.id || todasContas[0]?.id || "";
                                  setModalNovaProjecao({ ...modalNovaProjecao, vinculoTipo: "conta", vinculoOrigemId: def });
                                }}
                              >
                                Conta
                              </button>
                              <button
                                type="button"
                                class={`tab ${modalNovaProjecao.vinculoTipo === "categoria" ? "is-active" : ""}`}
                                style="font-size:var(--fs-xs);padding:4px 8px;"
                                onClick={() => {
                                  const def = todasCats.find((c) => c.natureza === "receber")?.id || todasCats[0]?.id || "";
                                  setModalNovaProjecao({ ...modalNovaProjecao, vinculoTipo: "categoria", vinculoOrigemId: def });
                                }}
                              >
                                Categoria
                              </button>
                            </div>
                          </div>

                          <div>
                            <label class="form-label" style="font-size:var(--fs-xs);">Cálculo:</label>
                            <div class="tabs tabs--sm" style="margin:0;">
                              <button
                                type="button"
                                class={`tab ${modalNovaProjecao.vinculoModo === "percentual" ? "is-active" : ""}`}
                                style="font-size:var(--fs-xs);padding:4px 8px;"
                                onClick={() => setModalNovaProjecao({ ...modalNovaProjecao, vinculoModo: "percentual" })}
                              >
                                % Percentual
                              </button>
                              <button
                                type="button"
                                class={`tab ${modalNovaProjecao.vinculoModo === "fixo" ? "is-active" : ""}`}
                                style="font-size:var(--fs-xs);padding:4px 8px;"
                                onClick={() => setModalNovaProjecao({ ...modalNovaProjecao, vinculoModo: "fixo" })}
                              >
                                Valor Fixo
                              </button>
                            </div>
                          </div>
                        </div>

                        <div class="form-group" style="margin-bottom:0;">
                          <label class="form-label" style="font-size:var(--fs-xs);">
                            {modalNovaProjecao.vinculoTipo === "conta" ? "Conta de Origem *" : "Categoria de Origem *"}
                          </label>
                          {modalNovaProjecao.vinculoTipo === "conta" ? (
                            <CustomSelect
                              value={modalNovaProjecao.vinculoOrigemId}
                              placeholder="Selecione a conta base..."
                              options={todasContas.map((c) => ({
                                value: c.id,
                                label: `${c.nome} (${NATURE_META[c.natureza]?.label || c.natureza})`,
                              }))}
                              onChange={(origemId) => setModalNovaProjecao({ ...modalNovaProjecao, vinculoOrigemId: origemId })}
                            />
                          ) : (
                            <CustomSelect
                              value={modalNovaProjecao.vinculoOrigemId}
                              placeholder="Selecione a categoria base..."
                              options={todasCats.map((cat) => ({
                                value: cat.id,
                                label: `${cat.nome} (${NATURE_META[cat.natureza]?.label || cat.natureza})`,
                              }))}
                              onChange={(origemId) => setModalNovaProjecao({ ...modalNovaProjecao, vinculoOrigemId: origemId })}
                            />
                          )}
                        </div>

                        {modalNovaProjecao.vinculoModo === "percentual" ? (
                          <div class="form-group" style="margin-bottom:0;">
                            <label class="form-label" style="font-size:var(--fs-xs);">Percentual da Origem (%) *</label>
                            <div style="display:flex;align-items:center;gap:6px;">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max="1000"
                                required
                                class="input"
                                placeholder="Ex: 30 para 30%"
                                value={modalNovaProjecao.vinculoPercentual}
                                onInput={(e) => setModalNovaProjecao({ ...modalNovaProjecao, vinculoPercentual: e.currentTarget.value })}
                              />
                              <span style="font-weight:600;font-size:var(--fs-md);">%</span>
                            </div>
                          </div>
                        ) : (
                          <div class="form-group" style="margin-bottom:0;">
                            <label class="form-label" style="font-size:var(--fs-xs);">Valor Fixo Previsto (R$) *</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              class="input"
                              placeholder="0,00"
                              value={modalNovaProjecao.vinculoValorFixo}
                              onInput={(e) => setModalNovaProjecao({ ...modalNovaProjecao, vinculoValorFixo: e.currentTarget.value })}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div class="muted" style="font-size:var(--fs-xs);">
                          💡 Crie fórmulas combinando contas entre colchetes como <code>[Salário Bruto]</code> e use operadores aritméticos. Exemplo: <code>([Salário Bruto] - [INSS]) * 30%</code>
                        </div>

                        {/* Variáveis rápidas */}
                        <div>
                          <label class="form-label" style="font-size:var(--fs-xs);margin-bottom:4px;">
                            Contas Disponíveis (clique para inserir):
                          </label>
                          <div
                            style="display:flex;gap:4px;flex-wrap:wrap;max-height:80px;overflow-y:auto;padding:4px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);"
                          >
                            {todasContas.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                class="badge"
                                style="cursor:pointer;background:var(--surface-soft);border:1px solid var(--border);color:var(--text);font-size:11px;padding:3px 6px;"
                                onClick={() => {
                                  const varNome = `[${c.nome}]`;
                                  const atual = (modalNovaProjecao.vinculoFormula || "").trim();
                                  setModalNovaProjecao({
                                    ...modalNovaProjecao,
                                    vinculoFormula: atual ? `${atual} + ${varNome}` : varNome,
                                  });
                                }}
                              >
                                + [{c.nome}]
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Operadores rápidos */}
                        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
                          <span class="muted" style="font-size:11px;">Operadores:</span>
                          {["+", "-", "*", "/", "(", ")", "%"].map((op) => (
                            <button
                              key={op}
                              type="button"
                              class="btn btn--ghost"
                              style="min-height:22px;padding:1px 6px;font-size:var(--fs-xs);font-weight:700;"
                              onClick={() => {
                                const atual = modalNovaProjecao.vinculoFormula || "";
                                setModalNovaProjecao({
                                  ...modalNovaProjecao,
                                  vinculoFormula: `${atual} ${op} `,
                                });
                              }}
                            >
                              {op}
                            </button>
                          ))}
                        </div>

                        <div class="form-group" style="margin-bottom:0;">
                          <label class="form-label" style="font-size:var(--fs-xs);">Fórmula de Cálculo *</label>
                          <textarea
                            class="textarea"
                            rows={2}
                            placeholder="Ex: ([Salário Bruto] - [Previdência]) * 30%"
                            value={modalNovaProjecao.vinculoFormula}
                            onInput={(e) =>
                              setModalNovaProjecao({ ...modalNovaProjecao, vinculoFormula: e.currentTarget.value })
                            }
                          />
                        </div>

                        {modalNovaProjecao.vinculoFormula.trim() && (() => {
                          const evalTeste = calcularFormulaProjecoes(
                            modalNovaProjecao.vinculoFormula,
                            mesAtivo,
                            ps,
                            todasContas,
                            todasCats
                          );
                          return evalTeste.ok ? (
                            <div
                              class="banner banner--success"
                              style="padding:6px 10px;font-size:var(--fs-xs);margin:0;border-radius:var(--r-sm);"
                            >
                              ✓ Fórmula válida! Prévia em {MONTHS[mesAtivo]}: <b>{money(evalTeste.valorCentavos)}</b>
                            </div>
                          ) : (
                            <div
                              class="banner banner--warning"
                              style="padding:6px 10px;font-size:var(--fs-xs);margin:0;border-radius:var(--r-sm);"
                            >
                              ⚠️ {evalTeste.erro}
                            </div>
                          );
                        })()}
                      </>
                    )}

                    <div style="display:flex;align-items:center;gap:8px;padding-top:4px;">
                      <input
                        id="salvar-vinculo-conta"
                        type="checkbox"
                        checked={modalNovaProjecao.salvarVinculoNaConta}
                        onChange={(e) => setModalNovaProjecao({ ...modalNovaProjecao, salvarVinculoNaConta: e.currentTarget.checked })}
                      />
                      <label for="salvar-vinculo-conta" style="font-size:var(--fs-xs);cursor:pointer;">
                        Salvar regra na conta (para sugerir lançamentos futuros e sincronizar)
                      </label>
                    </div>

                    {/* Pré-visualização dos 12 meses calculados */}
                    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:10px;">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="font-size:var(--fs-xs);font-weight:600;color:var(--text);">
                          📊 Prévia dos 12 Meses Calculados
                        </span>
                        <span style="font-size:var(--fs-xs);font-weight:700;color:var(--primary);">
                          Total: {money(totalAnualCalculado)}
                        </span>
                      </div>
                      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(80px, 1fr));gap:6px;">
                        {previsaoMeses.map((p) => (
                          <div key={p.mes} style="background:var(--surface-soft);padding:4px 6px;border-radius:4px;text-align:center;">
                            <div style="font-size:10px;color:var(--text-muted);font-weight:600;">{p.mes}</div>
                            <div style={`font-size:11px;font-weight:700;color:${p.valor > 0 ? "var(--text)" : "var(--text-muted)"};`}>
                              {money(p.valor)}
                            </div>
                            {modalNovaProjecao.vinculoModoTipo === "simples" && (
                              <div style="font-size:9px;color:var(--text-muted);">
                                Base: {money(p.base)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Observação / Detalhes */}
            <div class="form-group">
              <label class="form-label" for="nova-proj-obs">
                Observação / Justificativa (Opcional)
              </label>
              <textarea
                id="nova-proj-obs"
                class="textarea"
                rows={2}
                placeholder="Ex: Contrato de 12 meses com reajuste anual pelo IPCA em Junho..."
                value={modalNovaProjecao.obs}
                onInput={(e) =>
                  setModalNovaProjecao({ ...modalNovaProjecao, obs: e.currentTarget.value })
                }
              />
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Observação Rápida */}
      <Modal
        title={`Observação: ${modalObs?.nome || ""}`}
        isOpen={modalObs !== null}
        onClose={() => setModalObs(null)}
        footer={
          <>
            <button type="button" class="btn btn--ghost" onClick={() => setModalObs(null)}>
              Cancelar
            </button>
            <button type="button" class="btn btn--primary" onClick={salvarObs}>
              Salvar Observação
            </button>
          </>
        }
      >
        <div class="form-group">
          <label class="form-label" for="proj-obs">
            Detalhes / Justificativa da Projeção ({modalObs ? MONTHS[modalObs.mes] : ""})
          </label>
          <textarea
            id="proj-obs"
            class="textarea"
            rows={3}
            placeholder="Ex: Reforma emergencial, distribuição extraordinária de dividendos..."
            value={modalObs?.obs || ""}
            onInput={(e) => modalObs && setModalObs({ ...modalObs, obs: e.currentTarget.value })}
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

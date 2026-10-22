import {
  type Conta,
  type Lancamento,
  type Natureza,
  NATUREZAS,
  type Projecao,
  type RegraVinculo,
  type Reserva,
  type ReservaMovimento,
  type ReservaProjecao,
  SINAL,
} from "./types.ts";

/** Matriz [natureza][mes] em centavos. */
export type PorNatureza = Record<Natureza, number[]>;

export interface Resumo {
  bancaInicial: number;
  projetado: PorNatureza;
  real: PorNatureza;
  resultadoProj: number[]; // entradas − saídas, por mês
  resultadoReal: number[];
  saldoProj: number[];     // acumulado ao fim de cada mês
  saldoReal: number[];
  desvio: number[];        // saldoReal − saldoProj
  anual: {
    proj: Record<Natureza, number>;
    real: Record<Natureza, number>;
    resultadoProj: number;
    resultadoReal: number;
    saldoFinalProj: number;
    saldoFinalReal: number;
  };
}

const zeros = () => Array<number>(12).fill(0);
const vazio = (): PorNatureza => ({ pagar: zeros(), receber: zeros(), saida: zeros(), aporte: zeros() });
const soma = (a: number[]) => a.reduce((x, y) => x + y, 0);

/**
 * Motor de cálculo puro (sem acesso ao banco) — fácil de testar.
 * `ateMes` limita o saldo real acumulado (meses futuros repetem o último saldo real).
 */
export function calcular(
  bancaInicial: number,
  contas: Conta[],
  projecoes: Projecao[],
  lancamentos: Lancamento[],
  ateMes = 11,
): Resumo {
  const nat = new Map(contas.map((c) => [c.id, c.natureza]));
  const projetado = vazio();
  const real = vazio();

  for (const p of projecoes) {
    const n = nat.get(p.contaId);
    if (n) projetado[n][p.mes] += p.valor;
  }
  for (const l of lancamentos) {
    const n = nat.get(l.contaId);
    if (n) real[n][l.mes] += l.valor;
  }

  const resultado = (m: PorNatureza) =>
    zeros().map((_, i) => NATUREZAS.reduce((acc, n) => acc + SINAL[n] * m[n][i], 0));
  const resultadoProj = resultado(projetado);
  const resultadoReal = resultado(real);

  const acumular = (r: number[], limite = 11) => {
    let s = bancaInicial;
    return r.map((v, i) => (i <= limite ? (s += v) : s));
  };
  const saldoProj = acumular(resultadoProj);
  const saldoReal = acumular(resultadoReal, ateMes);
  const desvio = saldoReal.map((v, i) => v - saldoProj[i]);

  const totais = (m: PorNatureza) =>
    Object.fromEntries(NATUREZAS.map((n) => [n, soma(m[n])])) as Record<Natureza, number>;

  return {
    bancaInicial,
    projetado,
    real,
    resultadoProj,
    resultadoReal,
    saldoProj,
    saldoReal,
    desvio,
    anual: {
      proj: totais(projetado),
      real: totais(real),
      resultadoProj: soma(resultadoProj),
      resultadoReal: soma(resultadoReal),
      saldoFinalProj: saldoProj[11],
      saldoFinalReal: saldoReal[11],
    },
  };
}

/**
 * Calcula o valor vinculado (em centavos) com base no valor base da origem
 * e na regra de vínculo (percentual ou valor fixo).
 */
export function calcularValorVinculado(
  valorBaseOrigemCentavos: number,
  regra: RegraVinculo,
): number {
  if (regra.percentual !== undefined && regra.percentual !== null && !isNaN(Number(regra.percentual))) {
    return Math.round(valorBaseOrigemCentavos * (Number(regra.percentual) / 100));
  }
  if (regra.valorFixo !== undefined && regra.valorFixo !== null && !isNaN(Number(regra.valorFixo))) {
    return Math.round(Number(regra.valorFixo));
  }
  return 0;
}

/**
 * Calcula a base total de um vínculo (conta ou categoria) para um dado mês a partir de projeções.
 */
export function calcularBaseProjecoes(
  regra: RegraVinculo,
  mes: number,
  projecoes: Projecao[],
  contas: Conta[],
): number {
  if (regra.tipo === "conta") {
    const p = projecoes.find((p) => p.contaId === regra.origemId && p.mes === mes);
    return p ? p.valor : 0;
  }
  const contasIds = new Set(contas.filter((c) => c.categoriaId === regra.origemId).map((c) => c.id));
  return projecoes
    .filter((p) => contasIds.has(p.contaId) && p.mes === mes)
    .reduce((sum, p) => sum + p.valor, 0);
}

/**
 * Calcula a base total de um vínculo para um dado mês a partir de lançamentos realizados.
 */
export function calcularBaseLancamentos(
  regra: RegraVinculo,
  mes: number,
  lancamentos: Lancamento[],
  contas: Conta[],
): number {
  if (regra.tipo === "conta") {
    return lancamentos
      .filter((l) => l.contaId === regra.origemId && l.mes === mes)
      .reduce((sum, l) => sum + l.valor, 0);
  }
  const contasIds = new Set(contas.filter((c) => c.categoriaId === regra.origemId).map((c) => c.id));
  return lancamentos
    .filter((l) => contasIds.has(l.contaId) && l.mes === mes)
    .reduce((sum, l) => sum + l.valor, 0);
}

export interface ProjecaoPendente {
  contaId: string;
  mes: number; // 0 a 11
  valorProjetado: number;
  valorRealizado: number;
  valorPendente: number;
  status: "vencida" | "a_vencer";
  diasAtraso?: number;
  diaEstimado: number;
  dataSugerida: string;
}

/**
 * Calcula quais contas projetadas ainda não foram lançadas no real,
 * identificando as que já estão vencidas/atrasadas vs. a vencer.
 */
export function calcularPendencias(
  projecoes: Projecao[],
  lancamentos: Lancamento[],
  anoNum: number,
  mesFiltro: number | "todos" = "todos",
  dataReferencia: Date = new Date(),
): ProjecaoPendente[] {
  const anoAtual = dataReferencia.getFullYear();
  const mesAtual = dataReferencia.getMonth();
  const diaAtual = dataReferencia.getDate();

  // Histórico de dias de lançamento por conta para inferir o vencimento estimado
  const diasPorConta = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.data && !diasPorConta.has(l.contaId)) {
      const d = parseInt(l.data.split("-")[2], 10);
      if (!isNaN(d) && d >= 1 && d <= 31) {
        diasPorConta.set(l.contaId, d);
      }
    }
  }

  // Agrupa lançamentos por [contaId_mes]
  const realizadosMap = new Map<string, number>();
  for (const l of lancamentos) {
    const key = `${l.contaId}_${l.mes}`;
    realizadosMap.set(key, (realizadosMap.get(key) || 0) + l.valor);
  }

  const pendencias: ProjecaoPendente[] = [];

  for (const p of projecoes) {
    if (p.valor <= 0) continue;
    if (mesFiltro !== "todos" && p.mes !== mesFiltro) continue;

    const key = `${p.contaId}_${p.mes}`;
    const realizado = realizadosMap.get(key) || 0;
    if (realizado >= p.valor) continue; // Já 100% quitada/lançada

    const valorPendente = p.valor - realizado;
    const diaEstimado = diasPorConta.get(p.contaId) || 10;
    const maxDiasNoMes = new Date(anoNum, p.mes + 1, 0).getDate();
    const diaValido = Math.min(diaEstimado, maxDiasNoMes);
    const dataSugerida = `${anoNum}-${String(p.mes + 1).padStart(2, "0")}-${String(diaValido).padStart(2, "0")}`;

    let status: "vencida" | "a_vencer" = "a_vencer";
    let diasAtraso: number | undefined;

    if (anoNum < anoAtual) {
      status = "vencida";
      diasAtraso = 30;
    } else if (anoNum > anoAtual) {
      status = "a_vencer";
    } else {
      // Mesmo ano
      if (p.mes < mesAtual) {
        status = "vencida";
        const dataFimMes = new Date(anoNum, p.mes + 1, 0);
        const diffMs = dataReferencia.getTime() - dataFimMes.getTime();
        diasAtraso = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      } else if (p.mes > mesAtual) {
        status = "a_vencer";
      } else {
        // Mês atual
        if (diaAtual > diaValido) {
          status = "vencida";
          diasAtraso = diaAtual - diaValido;
        } else {
          status = "a_vencer";
        }
      }
    }

    pendencias.push({
      contaId: p.contaId,
      mes: p.mes,
      valorProjetado: p.valor,
      valorRealizado: realizado,
      valorPendente,
      status,
      diasAtraso,
      diaEstimado: diaValido,
      dataSugerida,
    });
  }

  // Ordena: vencidas primeiro (com mais dias de atraso), depois a vencer por mês
  return pendencias.sort((a, b) => {
    if (a.status === "vencida" && b.status !== "vencida") return -1;
    if (a.status !== "vencida" && b.status === "vencida") return 1;
    if (a.status === "vencida" && b.status === "vencida") {
      return (b.diasAtraso || 0) - (a.diasAtraso || 0);
    }
    return a.mes - b.mes;
  });
}

/* ==========================================================
   Cálculo Consolidado de Investimentos & Reservas
   ========================================================== */

export interface ResumoReserva {
  reserva: Reserva;
  saldoInicial: number;
  totalAportesReal: number;
  totalResgatesReal: number;
  totalRendimentosReal: number;
  saldoAtualReal: number;

  totalAportesProj: number;
  totalResgatesProj: number;
  totalRendimentosProj: number;
  saldoFinalProj: number;

  evolucaoMensalReal: number[]; // Saldo acumulado mês a mês (0..11)
  evolucaoMensalProj: number[]; // Saldo acumulado mês a mês (0..11)
  progressoMetaPct?: number;   // Calculado caso metaCentavos > 0
}

export interface ResumoCarteira {
  totalPatrimonioReal: number;
  totalPatrimonioProj: number;
  totalAportadoAnoReal: number;
  totalAportadoAnoProj: number;
  totalResgatadoAnoReal: number;
  totalResgatadoAnoProj: number;
  totalRendimentoAnoReal: number;
  totalRendimentoAnoProj: number;
  reservas: ResumoReserva[];
}

export function calcularCarteiraReservas(
  reservas: Reserva[],
  movimentos: ReservaMovimento[],
  projecoes: ReservaProjecao[],
  mesReferencia = 11,
): ResumoCarteira {
  const mesRefClamped = Math.max(0, Math.min(11, mesReferencia));

  const resumos: ResumoReserva[] = reservas.map((reserva) => {
    const saldoInicial = reserva.saldoInicialCentavos || 0;

    // Projeções
    const projsDaReserva = projecoes.filter((p) => p.reservaId === reserva.id);
    let runningProj = saldoInicial;
    const evolucaoMensalProj: number[] = [];
    let totalAportesProj = 0;
    let totalResgatesProj = 0;
    let totalRendimentosProj = 0;

    for (let m = 0; m < 12; m++) {
      const p = projsDaReserva.find((item) => item.mes === m);
      const ap = p?.valorAporte || 0;
      const resg = p?.valorResgate || 0;
      const rend = p?.valorRendimento || 0;

      totalAportesProj += ap;
      totalResgatesProj += resg;
      totalRendimentosProj += rend;

      runningProj = runningProj + ap + rend - resg;
      evolucaoMensalProj.push(runningProj);
    }
    const saldoFinalProj = evolucaoMensalProj[11];

    // Movimentações Reais
    const movsDaReserva = movimentos.filter((m) => m.reservaId === reserva.id);
    let runningReal = saldoInicial;
    const evolucaoMensalReal: number[] = [];
    let totalAportesReal = 0;
    let totalResgatesReal = 0;
    let totalRendimentosReal = 0;

    for (let m = 0; m < 12; m++) {
      const movsMes = movsDaReserva.filter((item) => item.mes === m);
      let apMes = 0;
      let resgMes = 0;
      let rendMes = 0;

      for (const mov of movsMes) {
        if (mov.tipo === "aporte") apMes += mov.valor;
        else if (mov.tipo === "resgate") resgMes += mov.valor;
        else if (mov.tipo === "rendimento") rendMes += mov.valor;
      }

      totalAportesReal += apMes;
      totalResgatesReal += resgMes;
      totalRendimentosReal += rendMes;

      runningReal = runningReal + apMes + rendMes - resgMes;
      evolucaoMensalReal.push(runningReal);
    }

    const saldoAtualReal = evolucaoMensalReal[mesRefClamped];

    let progressoMetaPct: number | undefined;
    if (reserva.metaCentavos && reserva.metaCentavos > 0) {
      progressoMetaPct = Math.round((saldoAtualReal / reserva.metaCentavos) * 100);
    }

    return {
      reserva,
      saldoInicial,
      totalAportesReal,
      totalResgatesReal,
      totalRendimentosReal,
      saldoAtualReal,

      totalAportesProj,
      totalResgatesProj,
      totalRendimentosProj,
      saldoFinalProj,

      evolucaoMensalReal,
      evolucaoMensalProj,
      progressoMetaPct,
    };
  });

  return {
    totalPatrimonioReal: resumos.reduce((sum, r) => sum + r.saldoAtualReal, 0),
    totalPatrimonioProj: resumos.reduce((sum, r) => sum + r.saldoFinalProj, 0),
    totalAportadoAnoReal: resumos.reduce((sum, r) => sum + r.totalAportesReal, 0),
    totalAportadoAnoProj: resumos.reduce((sum, r) => sum + r.totalAportesProj, 0),
    totalResgatadoAnoReal: resumos.reduce((sum, r) => sum + r.totalResgatesReal, 0),
    totalResgatadoAnoProj: resumos.reduce((sum, r) => sum + r.totalResgatesProj, 0),
    totalRendimentoAnoReal: resumos.reduce((sum, r) => sum + r.totalRendimentosReal, 0),
    totalRendimentoAnoProj: resumos.reduce((sum, r) => sum + r.totalRendimentosProj, 0),
    reservas: resumos,
  };
}


import { type Conta, type Lancamento, type Natureza, NATUREZAS, type Projecao, type RegraVinculo, SINAL } from "./types.ts";

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

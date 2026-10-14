import { type Conta, type Lancamento, type Natureza, NATUREZAS, type Projecao, SINAL } from "./types.ts";

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

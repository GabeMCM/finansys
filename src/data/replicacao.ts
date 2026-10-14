import { anos, contas, lancamentos, projecoes } from "./repo.ts";
import type { Conta, Lancamento, Natureza, Projecao } from "./types.ts";

export type RegraFaltante = "usar_projecao" | "zerar";

export interface ItemPreviaReplicacao {
  contaId: string;
  contaNome: string;
  natureza: Natureza;
  valoresOriginais: number[]; // centavos por mês (0-11)
  valoresReajustados: number[]; // centavos por mês (0-11)
  totalOriginal: number;
  totalReajustado: number;
}

export interface PlanoReplicacao {
  empresaId: string;
  anoOrigem: number;
  anoDestino: number;
  taxaPercentual: number;
  regraFaltante: RegraFaltante;
  bancaInicialDestino: number;
  itens: ItemPreviaReplicacao[];
  totalOriginalGeral: Record<Natureza, number>;
  totalReajustadoGeral: Record<Natureza, number>;
}

/**
 * Função pura de cálculo do plano de replicação (independente de banco).
 */
export function calcularPlanoReplicacao(params: {
  empresaId: string;
  anoOrigem: number;
  anoDestino: number;
  taxaPercentual: number;
  regraFaltante: RegraFaltante;
  bancaInicialDestino: number;
  contas: Conta[];
  lancamentos: Lancamento[];
  projecoes: Projecao[];
}): PlanoReplicacao {
  const {
    empresaId,
    anoOrigem,
    anoDestino,
    taxaPercentual,
    regraFaltante,
    bancaInicialDestino,
    contas: listaContas,
    lancamentos: listaLancamentos,
    projecoes: listaProjecoes,
  } = params;

  const reaisMap = new Map<string, number>();
  for (const l of listaLancamentos) {
    const k = `${l.contaId}_${l.mes}`;
    reaisMap.set(k, (reaisMap.get(k) || 0) + l.valor);
  }

  const projMap = new Map<string, number>();
  for (const p of listaProjecoes) {
    projMap.set(`${p.contaId}_${p.mes}`, p.valor);
  }

  const fator = 1 + taxaPercentual / 100;
  const itens: ItemPreviaReplicacao[] = [];

  const totalOriginalGeral: Record<Natureza, number> = { pagar: 0, receber: 0, aporte: 0, saida: 0 };
  const totalReajustadoGeral: Record<Natureza, number> = { pagar: 0, receber: 0, aporte: 0, saida: 0 };

  for (const c of listaContas) {
    if (!c.ativa) continue;

    const valoresOriginais: number[] = [];
    const valoresReajustados: number[] = [];
    let totOrig = 0;
    let totReaj = 0;

    for (let m = 0; m < 12; m++) {
      const k = `${c.id}_${m}`;
      const temReal = reaisMap.has(k);
      const valReal = reaisMap.get(k) || 0;
      const valProj = projMap.get(k) || 0;

      let base = 0;
      if (temReal) {
        base = valReal;
      } else {
        base = regraFaltante === "usar_projecao" ? valProj : 0;
      }

      const reajustado = Math.round(base * fator);
      valoresOriginais.push(base);
      valoresReajustados.push(reajustado);
      totOrig += base;
      totReaj += reajustado;
    }

    totalOriginalGeral[c.natureza] += totOrig;
    totalReajustadoGeral[c.natureza] += totReaj;

    itens.push({
      contaId: c.id,
      contaNome: c.nome,
      natureza: c.natureza,
      valoresOriginais,
      valoresReajustados,
      totalOriginal: totOrig,
      totalReajustado: totReaj,
    });
  }

  return {
    empresaId,
    anoOrigem,
    anoDestino,
    taxaPercentual,
    regraFaltante,
    bancaInicialDestino,
    itens,
    totalOriginalGeral,
    totalReajustadoGeral,
  };
}

/**
 * Consulta os dados do IndexedDB e gera o plano com simulação.
 */
export async function simularReplicacao(params: {
  empresaId: string;
  anoOrigem: number;
  anoDestino: number;
  taxaPercentual: number;
  regraFaltante: RegraFaltante;
  bancaInicialDestino: number;
}): Promise<PlanoReplicacao> {
  const { empresaId, anoOrigem } = params;

  const anoOrigemObj = await anos.find(empresaId, anoOrigem);
  if (!anoOrigemObj) throw new Error(`Ano de origem ${anoOrigem} não encontrado.`);

  const [listaContas, listaLancamentos, listaProjecoes] = await Promise.all([
    contas.byEmpresa(empresaId),
    lancamentos.byAno(anoOrigemObj.id),
    projecoes.byAno(anoOrigemObj.id),
  ]);

  return calcularPlanoReplicacao({
    ...params,
    contas: listaContas,
    lancamentos: listaLancamentos,
    projecoes: listaProjecoes,
  });
}

/**
 * Aplica o plano aprovado pelo usuário no banco IndexedDB.
 */
export async function aplicarReplicacao(plano: PlanoReplicacao): Promise<string> {
  const { empresaId, anoDestino, bancaInicialDestino, itens } = plano;

  let anoDestObj = await anos.find(empresaId, anoDestino);
  if (anoDestObj) {
    await anos.update(anoDestObj.id, { bancaInicial: bancaInicialDestino });
  } else {
    anoDestObj = await anos.create({
      empresaId,
      ano: anoDestino,
      bancaInicial: bancaInicialDestino,
    });
  }

  for (const item of itens) {
    for (let m = 0; m < 12; m++) {
      const val = item.valoresReajustados[m];
      await projecoes.set(anoDestObj.id, item.contaId, m, val);
    }
  }

  return anoDestObj.id;
}

/**
 * Modelo de dados do Finansys.
 * - Valores monetários em CENTAVOS (inteiros).
 * - Meses 0–11.
 * - Todo registro tem id (UUID), updatedAt e deletedAt (soft delete),
 *   o que permite o merge registro a registro no backup (etapa 9).
 */

export type Natureza = "pagar" | "receber" | "saida" | "aporte";

export const NATUREZAS: Natureza[] = ["receber", "aporte", "pagar", "saida"];

/** Entradas somam ao saldo; saídas subtraem. */
export const SINAL: Record<Natureza, 1 | -1> = { receber: 1, aporte: 1, pagar: -1, saida: -1 };

/** Naturezas "livres" aceitam observação. */
export const LIVRE: Record<Natureza, boolean> = { receber: false, pagar: false, aporte: true, saida: true };

export interface Base {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface Empresa extends Base {
  nome: string;
  cnpj?: string;
  endereco?: string;
  logo?: string; // data URL
}

export interface Ano extends Base {
  empresaId: string;
  ano: number;
  bancaInicial: number;
}

export interface Categoria extends Base {
  empresaId: string;
  natureza: Natureza;
  nome: string;
}

export interface Conta extends Base {
  empresaId: string;
  categoriaId: string;
  natureza: Natureza;
  nome: string;
  ativa: boolean;
}

export interface Projecao extends Base {
  anoId: string;
  contaId: string;
  mes: number;
  valor: number;
  obs?: string;
}

export interface Lancamento extends Base {
  anoId: string;
  contaId: string;
  mes: number;
  data: string; // ISO yyyy-mm-dd
  valor: number;
  descricao?: string;
  obs?: string;
  recorrenciaId?: string;
  parcela?: number;
  totalParcelas?: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

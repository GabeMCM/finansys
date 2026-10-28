import type { EntityTable } from "dexie";
import { db } from "./db.ts";
import type {
  Ano,
  Base,
  Categoria,
  Conta,
  ContaBancaria,
  Empresa,
  Lancamento,
  Natureza,
  Projecao,
  Reserva,
  ReservaMovimento,
  ReservaProjecao,
  OperacaoInvestimento,
} from "./types.ts";

type New<T extends Base> = Omit<T, keyof Base>;

const alive = <T extends Base>(r: T) => !r.deletedAt;

/** Repositório genérico com timestamps e soft delete. */
function repo<T extends Base>(table: EntityTable<T, "id">) {
  return {
    async create(data: New<T>): Promise<T> {
      const now = Date.now();
      const rec = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null } as T;
      await table.add(rec);
      return rec;
    },
    async update(id: string, patch: Partial<New<T>>) {
      // deno-lint-ignore no-explicit-any
      await table.update(id as any, { ...patch, updatedAt: Date.now() } as any);
    },
    async remove(id: string) {
      // deno-lint-ignore no-explicit-any
      await table.update(id as any, { deletedAt: Date.now(), updatedAt: Date.now() } as any);
    },
    async delete(id: string) {
      // deno-lint-ignore no-explicit-any
      await table.update(id as any, { deletedAt: Date.now(), updatedAt: Date.now() } as any);
    },
    // deno-lint-ignore no-explicit-any
    get: (id: string) => table.get(id as any).then((r) => (r && alive(r) ? r : undefined)),
    table,
  };
}

export const empresas = {
  ...repo<Empresa>(db.empresas),
  list: () => db.empresas.orderBy("nome").filter(alive).toArray(),
};

export const anos = {
  ...repo<Ano>(db.anos),
  byEmpresa: (empresaId: string) =>
    db.anos.where({ empresaId }).filter(alive).sortBy("ano"),
  find: (empresaId: string, ano: number) =>
    db.anos.where({ empresaId, ano }).filter(alive).first(),
};

export const categorias = {
  ...repo<Categoria>(db.categorias),
  byEmpresa: (empresaId: string, natureza?: Natureza) =>
    (natureza ? db.categorias.where({ empresaId, natureza }) : db.categorias.where({ empresaId }))
      .filter(alive).sortBy("nome"),
};

export const contas = {
  ...repo<Conta>(db.contas),
  byEmpresa: (empresaId: string, natureza?: Natureza) =>
    (natureza ? db.contas.where({ empresaId, natureza }) : db.contas.where({ empresaId }))
      .filter(alive).sortBy("nome"),
};

export const projecoes = {
  ...repo<Projecao>(db.projecoes),
  byAno: (anoId: string) => db.projecoes.where({ anoId }).filter(alive).toArray(),
  async set(
    anoId: string,
    contaId: string,
    mes: number,
    valor: number,
    obs?: string,
    vinculoOrigemId?: string,
    extra?: { parcela?: number; totalParcelas?: number; data?: string; reservaId?: string; tipoReserva?: "aporte" | "resgate" }
  ) {
    const cur = await db.projecoes.where({ anoId, contaId, mes }).filter(alive).first();
    if (cur) return projecoes.update(cur.id, { valor, obs, vinculoOrigemId, ...(extra || {}) });
    return projecoes.create({ anoId, contaId, mes, valor, obs, vinculoOrigemId, ...(extra || {}) });
  },
};

export const lancamentos = {
  ...repo<Lancamento>(db.lancamentos),
  byAno: (anoId: string) => db.lancamentos.where({ anoId }).filter(alive).toArray(),
  byMes: (anoId: string, mes: number) =>
    db.lancamentos.where({ anoId, mes }).filter(alive).reverse().sortBy("data"),
  byRecorrencia: (recorrenciaId: string) =>
    db.lancamentos.filter((l) => l.recorrenciaId === recorrenciaId && alive(l)).toArray(),
};

export const contasBancarias = {
  ...repo<ContaBancaria>(db.contasBancarias),
  byEmpresa: (empresaId: string) =>
    db.contasBancarias.where({ empresaId }).filter(alive).sortBy("nome"),
};

export const reservas = {
  ...repo<Reserva>(db.reservas),
  byEmpresa: (empresaId: string) =>
    db.reservas.where({ empresaId }).filter(alive).sortBy("nome"),
};

export const reservaMovimentos = {
  ...repo<ReservaMovimento>(db.reservaMovimentos),
  byEmpresa: (empresaId: string) =>
    db.reservaMovimentos.where({ empresaId }).filter(alive).reverse().sortBy("data"),
  byAno: (anoId: string) =>
    db.reservaMovimentos.where({ anoId }).filter(alive).reverse().sortBy("data"),
  byReserva: (reservaId: string) =>
    db.reservaMovimentos.where({ reservaId }).filter(alive).reverse().sortBy("data"),
  byLancamento: (lancamentoId: string) =>
    db.reservaMovimentos.filter((m) => m.lancamentoId === lancamentoId && alive(m)).first(),
};

export const reservaProjecoes = {
  ...repo<ReservaProjecao>(db.reservaProjecoes),
  byAno: (anoId: string) =>
    db.reservaProjecoes.where({ anoId }).filter(alive).toArray(),
  byReserva: (reservaId: string) =>
    db.reservaProjecoes.where({ reservaId }).filter(alive).toArray(),
  async set(
    empresaId: string,
    anoId: string,
    reservaId: string,
    mes: number,
    valores: { valorAporte?: number; valorResgate?: number; valorRendimento?: number; obs?: string },
  ) {
    const cur = await db.reservaProjecoes.where({ anoId, reservaId, mes }).filter(alive).first();
    if (cur) {
      return reservaProjecoes.update(cur.id, valores);
    }
    return reservaProjecoes.create({
      empresaId,
      anoId,
      reservaId,
      mes,
      valorAporte: valores.valorAporte ?? 0,
      valorResgate: valores.valorResgate ?? 0,
      valorRendimento: valores.valorRendimento ?? 0,
      obs: valores.obs,
    });
  },
};

export const operacoesInvestimento = {
  ...repo<OperacaoInvestimento>(db.operacoesInvestimento),
  byEmpresa: (empresaId: string) =>
    db.operacoesInvestimento.where({ empresaId }).filter(alive).reverse().sortBy("data"),
  byTicker: (empresaId: string, ticker: string) =>
    db.operacoesInvestimento.where({ empresaId, ticker }).filter(alive).reverse().sortBy("data"),
};

export const settings = {
  get: async <T>(key: string, fallback: T): Promise<T> =>
    ((await db.settings.get(key))?.value as T) ?? fallback,
  set: (key: string, value: unknown) => db.settings.put({ key, value }),
};

import type { EntityTable } from "dexie";
import { db } from "./db.ts";
import type { Ano, Base, Categoria, Conta, Empresa, Lancamento, Natureza, Projecao } from "./types.ts";

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
    extra?: { parcela?: number; totalParcelas?: number }
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

export const settings = {
  get: async <T>(key: string, fallback: T): Promise<T> =>
    ((await db.settings.get(key))?.value as T) ?? fallback,
  set: (key: string, value: unknown) => db.settings.put({ key, value }),
};

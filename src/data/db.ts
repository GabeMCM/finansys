import { Dexie, type EntityTable } from "dexie";
import type { Ano, Categoria, Conta, Empresa, Lancamento, Projecao, Setting } from "./types.ts";

export class FinansysDB extends Dexie {
  empresas!: EntityTable<Empresa, "id">;
  anos!: EntityTable<Ano, "id">;
  categorias!: EntityTable<Categoria, "id">;
  contas!: EntityTable<Conta, "id">;
  projecoes!: EntityTable<Projecao, "id">;
  lancamentos!: EntityTable<Lancamento, "id">;
  settings!: EntityTable<Setting, "key">;

  constructor(name = "finansys") {
    super(name);
    this.version(1).stores({
      empresas: "id, nome, updatedAt",
      anos: "id, empresaId, [empresaId+ano], updatedAt",
      categorias: "id, empresaId, [empresaId+natureza], updatedAt",
      contas: "id, empresaId, categoriaId, [empresaId+natureza], updatedAt",
      projecoes: "id, anoId, contaId, [anoId+contaId+mes], updatedAt",
      lancamentos: "id, anoId, contaId, [anoId+mes], data, updatedAt",
      settings: "key",
    });
  }
}

export const db = new FinansysDB();

/** Notifica (debounced na etapa 9) que houve alteração — gancho para o backup automático. */
export const changes = new EventTarget();
for (const t of db.tables) {
  if (t.name === "settings") continue;
  t.hook("creating", () => void queueMicrotask(() => changes.dispatchEvent(new Event("change"))));
  t.hook("updating", () => void queueMicrotask(() => changes.dispatchEvent(new Event("change"))));
  t.hook("deleting", () => void queueMicrotask(() => changes.dispatchEvent(new Event("change"))));
}

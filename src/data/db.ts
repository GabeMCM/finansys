import { Dexie, type EntityTable } from "dexie";
import type {
  Ano,
  Categoria,
  Conta,
  Empresa,
  Lancamento,
  Projecao,
  Reserva,
  ReservaMovimento,
  ReservaProjecao,
  Setting,
} from "./types.ts";

export class FinansysDB extends Dexie {
  empresas!: EntityTable<Empresa, "id">;
  anos!: EntityTable<Ano, "id">;
  categorias!: EntityTable<Categoria, "id">;
  contas!: EntityTable<Conta, "id">;
  projecoes!: EntityTable<Projecao, "id">;
  lancamentos!: EntityTable<Lancamento, "id">;
  reservas!: EntityTable<Reserva, "id">;
  reservaMovimentos!: EntityTable<ReservaMovimento, "id">;
  reservaProjecoes!: EntityTable<ReservaProjecao, "id">;
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

    this.version(2).stores({
      reservas: "id, empresaId, nome, updatedAt",
      reservaMovimentos: "id, empresaId, reservaId, anoId, [empresaId+anoId], mes, data, tipo, updatedAt",
      reservaProjecoes: "id, empresaId, reservaId, anoId, [empresaId+anoId], mes, [anoId+reservaId+mes], updatedAt",
    });
  }
}

export const db = new FinansysDB();

let restoringDepth = 0;
export let isRestoring = false;

export function setRestoring(val: boolean) {
  if (val) {
    restoringDepth++;
    isRestoring = true;
  } else {
    restoringDepth = Math.max(0, restoringDepth - 1);
    if (restoringDepth === 0) {
      isRestoring = false;
    }
  }
}

/** Notifica (debounced na etapa 9) que houve alteração — gancho para o backup automático. */
export const changes = new EventTarget();
for (const t of db.tables) {
  if (t.name === "settings") continue;
  t.hook("creating", () => {
    if (isRestoring) return;
    queueMicrotask(() => {
      if (!isRestoring) changes.dispatchEvent(new Event("change"));
    });
  });
  t.hook("updating", () => {
    if (isRestoring) return;
    queueMicrotask(() => {
      if (!isRestoring) changes.dispatchEvent(new Event("change"));
    });
  });
  t.hook("deleting", () => {
    if (isRestoring) return;
    queueMicrotask(() => {
      if (!isRestoring) changes.dispatchEvent(new Event("change"));
    });
  });
}

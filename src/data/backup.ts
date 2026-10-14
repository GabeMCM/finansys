import { db } from "./db.ts";

export interface BackupPayload {
  version: number;
  exportedAt: number;
  clientId?: string;
  data: {
    empresas: unknown[];
    anos: unknown[];
    categorias: unknown[];
    contas: unknown[];
    projecoes: unknown[];
    lancamentos: unknown[];
  };
}

/**
 * Serializa todo o banco de dados em um payload JSON.
 */
export async function dumpDatabase(): Promise<BackupPayload> {
  const [empresas, anos, categorias, contas, projecoes, lancamentos] = await Promise.all([
    db.empresas.toArray(),
    db.anos.toArray(),
    db.categorias.toArray(),
    db.contas.toArray(),
    db.projecoes.toArray(),
    db.lancamentos.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: Date.now(),
    data: {
      empresas,
      anos,
      categorias,
      contas,
      projecoes,
      lancamentos,
    },
  };
}

export let isRestoring = false;

/**
 * Restaura e mescla o backup no banco local.
 * Utiliza a estratégia de Last-Write-Wins (LWW) baseada no campo `updatedAt`.
 */
export async function restoreDatabase(payload: BackupPayload, strategy: "merge" | "overwrite" = "merge"): Promise<{ totalImportados: number }> {
  isRestoring = true;
  let count = 0;

  try {
    await db.transaction("rw", [db.empresas, db.anos, db.categorias, db.contas, db.projecoes, db.lancamentos], async () => {
      const tabelas = [
        { t: db.empresas, itens: payload.data.empresas },
        { t: db.anos, itens: payload.data.anos },
        { t: db.categorias, itens: payload.data.categorias },
        { t: db.contas, itens: payload.data.contas },
        { t: db.projecoes, itens: payload.data.projecoes },
        { t: db.lancamentos, itens: payload.data.lancamentos },
      ];

      for (const { t, itens } of tabelas) {
        if (!Array.isArray(itens)) continue;

        // deno-lint-ignore no-explicit-any
        const tableAny = t as any;

        if (strategy === "overwrite") {
          await tableAny.clear();
          await tableAny.bulkPut(itens);
          count += itens.length;
        } else {
          // Merge registro a registro usando updatedAt (só grava se for estritamente mais novo)
          for (const item of itens) {
            // deno-lint-ignore no-explicit-any
            const it = item as any;
            if (!it.id) continue;
            const existente = await tableAny.get(it.id);
            // deno-lint-ignore no-explicit-any
            const ext = existente as any;

            if (!ext || (it.updatedAt || 0) > (ext.updatedAt || 0)) {
              await tableAny.put(it);
              count++;
            }
          }
        }
      }
    });
  } finally {
    // Pequeno delay para garantir que transações assíncronas do Dexie terminem antes de liberar os hooks
    setTimeout(() => {
      isRestoring = false;
    }, 100);
  }

  return { totalImportados: count };
}

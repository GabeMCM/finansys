import { db, isRestoring, setRestoring } from "./db.ts";

export { isRestoring, setRestoring };

/**
 * Limpa completamente todas as tabelas locais do IndexedDB (Dexie).
 * Desativa os hooks de mudança para evitar disparos indevidos de sincronização.
 */
export async function limparBancoLocal(): Promise<void> {
  setRestoring(true);
  try {
    await db.transaction("rw", db.tables, async () => {
      for (const t of db.tables) {
        // deno-lint-ignore no-explicit-any
        await (t as any).clear();
      }
    });
  } finally {
    setTimeout(() => {
      setRestoring(false);
    }, 120);
  }
}

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
    reservas?: unknown[];
    reservaMovimentos?: unknown[];
    reservaProjecoes?: unknown[];
  };
}

/**
 * Serializa todo o banco de dados em um payload JSON.
 */
export async function dumpDatabase(): Promise<BackupPayload> {
  const [empresas, anos, categorias, contas, projecoes, lancamentos, reservas, reservaMovimentos, reservaProjecoes] = await Promise.all([
    db.empresas.toArray(),
    db.anos.toArray(),
    db.categorias.toArray(),
    db.contas.toArray(),
    db.projecoes.toArray(),
    db.lancamentos.toArray(),
    db.reservas.toArray(),
    db.reservaMovimentos.toArray(),
    db.reservaProjecoes.toArray(),
  ]);

  return {
    version: 2,
    exportedAt: Date.now(),
    data: {
      empresas,
      anos,
      categorias,
      contas,
      projecoes,
      lancamentos,
      reservas,
      reservaMovimentos,
      reservaProjecoes,
    },
  };
}

/**
 * Restaura e mescla o backup no banco local.
 * Utiliza a estratégia de Last-Write-Wins (LWW) baseada no campo `updatedAt`.
 */
export async function restoreDatabase(payload: BackupPayload, strategy: "merge" | "overwrite" = "merge"): Promise<{ totalImportados: number }> {
  setRestoring(true);
  let count = 0;

  try {
    await db.transaction(
      "rw",
      [
        db.empresas,
        db.anos,
        db.categorias,
        db.contas,
        db.projecoes,
        db.lancamentos,
        db.reservas,
        db.reservaMovimentos,
        db.reservaProjecoes,
      ],
      async () => {
        const tabelas = [
          { t: db.empresas, itens: payload.data.empresas },
          { t: db.anos, itens: payload.data.anos },
          { t: db.categorias, itens: payload.data.categorias },
          { t: db.contas, itens: payload.data.contas },
          { t: db.projecoes, itens: payload.data.projecoes },
          { t: db.lancamentos, itens: payload.data.lancamentos },
          { t: db.reservas, itens: payload.data.reservas },
          { t: db.reservaMovimentos, itens: payload.data.reservaMovimentos },
          { t: db.reservaProjecoes, itens: payload.data.reservaProjecoes },
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
          // Leitura única em lote dos itens existentes da tabela
          const existentes = await tableAny.toArray();
          const mapaExistentes = new Map<string, number>();
          for (const e of existentes) {
            // deno-lint-ignore no-explicit-any
            const eAny = e as any;
            if (eAny.id) mapaExistentes.set(eAny.id, eAny.updatedAt || 0);
          }

          // Filtra em memória apenas registros novos ou estritamente mais recentes
          // deno-lint-ignore no-explicit-any
          const paraGravar: any[] = [];
          for (const item of itens) {
            // deno-lint-ignore no-explicit-any
            const it = item as any;
            if (!it.id) continue;
            const updatedExistente = mapaExistentes.get(it.id);
            if (updatedExistente === undefined || (it.updatedAt || 0) > updatedExistente) {
              paraGravar.push(it);
            }
          }

          // Gravação atômica em lote (bulkPut) super veloz
          if (paraGravar.length > 0) {
            await tableAny.bulkPut(paraGravar);
            count += paraGravar.length;
          }
        }
      }
    });
  } finally {
    // Pequeno delay para garantir que transações assíncronas do Dexie terminem antes de liberar os hooks
    setTimeout(() => {
      setRestoring(false);
    }, 120);
  }

  return { totalImportados: count };
}

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
    setRestoring(false);
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
    contasBancarias?: unknown[];
    projecoes: unknown[];
    lancamentos: unknown[];
    reservas?: unknown[];
    reservaMovimentos?: unknown[];
    reservaProjecoes?: unknown[];
    operacoesInvestimento?: unknown[];
  };
}

/**
 * Serializa todo o banco de dados em um payload JSON.
 */
export async function dumpDatabase(): Promise<BackupPayload> {
  const [empresas, anos, categorias, contas, contasBancarias, projecoes, lancamentos, reservas, reservaMovimentos, reservaProjecoes, operacoesInvestimento] = await Promise.all([
    db.empresas.toArray(),
    db.anos.toArray(),
    db.categorias.toArray(),
    db.contas.toArray(),
    db.contasBancarias.toArray(),
    db.projecoes.toArray(),
    db.lancamentos.toArray(),
    db.reservas.toArray(),
    db.reservaMovimentos.toArray(),
    db.reservaProjecoes.toArray(),
    db.operacoesInvestimento.toArray(),
  ]);

  return {
    version: 4,
    exportedAt: Date.now(),
    data: {
      empresas,
      anos,
      categorias,
      contas,
      contasBancarias,
      projecoes,
      lancamentos,
      reservas,
      reservaMovimentos,
      reservaProjecoes,
      operacoesInvestimento,
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
        db.contasBancarias,
        db.projecoes,
        db.lancamentos,
        db.reservas,
        db.reservaMovimentos,
        db.reservaProjecoes,
        db.operacoesInvestimento,
      ],
      async () => {
        // deno-lint-ignore no-explicit-any
        const dataObj = (payload as any)?.data || payload;
        const tabelas = [
          { t: db.empresas, itens: dataObj?.empresas },
          { t: db.anos, itens: dataObj?.anos },
          { t: db.categorias, itens: dataObj?.categorias },
          { t: db.contas, itens: dataObj?.contas },
          { t: db.contasBancarias, itens: dataObj?.contasBancarias },
          { t: db.projecoes, itens: dataObj?.projecoes },
          { t: db.lancamentos, itens: dataObj?.lancamentos },
          { t: db.reservas, itens: dataObj?.reservas },
          { t: db.reservaMovimentos, itens: dataObj?.reservaMovimentos },
          { t: db.reservaProjecoes, itens: dataObj?.reservaProjecoes },
          { t: db.operacoesInvestimento, itens: dataObj?.operacoesInvestimento },
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
    // Mantém isRestoring ativo brevemente para esgotar microtasks e hooks de banco
    setTimeout(() => {
      setRestoring(false);
    }, 400);
  }

  return { totalImportados: count };
}

import { assertEquals } from "jsr:@std/assert@1";
import { calcularPlanoReplicacao, type RegraFaltante } from "./replicacao.ts";
import type { Conta, Lancamento, Projecao } from "./types.ts";

const base = { createdAt: 0, updatedAt: 0 };
const c1: Conta = { ...base, id: "c1", empresaId: "e1", categoriaId: "cat1", natureza: "pagar", nome: "Aluguel", ativa: true };

const l1: Lancamento = { ...base, id: "l1", anoId: "a2025", contaId: "c1", mes: 0, valor: 1000_00, data: "2025-01-10" };
const l2: Lancamento = { ...base, id: "l2", anoId: "a2025", contaId: "c1", mes: 1, valor: 1200_00, data: "2025-02-10" };
const p1: Projecao = { ...base, id: "p1", anoId: "a2025", contaId: "c1", mes: 2, valor: 1000_00 };

Deno.test("cálculo puro de replicação com reajuste seguro de 10%", () => {
  const plano = calcularPlanoReplicacao({
    empresaId: "e1",
    anoOrigem: 2025,
    anoDestino: 2026,
    taxaPercentual: 10,
    regraFaltante: "usar_projecao" as RegraFaltante,
    bancaInicialDestino: 15_000_00,
    contas: [c1],
    lancamentos: [l1, l2],
    projecoes: [p1],
  });

  const item = plano.itens.find((i) => i.contaId === "c1");
  assertEquals(Boolean(item), true);
  if (!item) return;

  // Jan: real 1.000 + 10% = 1.100
  assertEquals(item.valoresReajustados[0], 1100_00);
  // Fev: real 1.200 + 10% = 1.320
  assertEquals(item.valoresReajustados[1], 1320_00);
  // Mar: projeção 1.000 + 10% = 1.100 (fallback seguro)
  assertEquals(item.valoresReajustados[2], 1100_00);
  // Abr: 0 (sem valor real e sem projeção)
  assertEquals(item.valoresReajustados[3], 0);

  assertEquals(plano.totalReajustadoGeral.pagar, (1100 + 1320 + 1100) * 100);
});

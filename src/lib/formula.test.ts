import { assertEquals } from "jsr:@std/assert@1";
import type { Categoria, Conta, Lancamento, Projecao } from "../data/types.ts";
import {
  avaliarFormula,
  calcularFormulaLancamentos,
  calcularFormulaProjecoes,
  extrairVariaveis,
} from "./formula.ts";

const base = { createdAt: 0, updatedAt: 0 };

Deno.test("extrairVariaveis extrai nomes entre colchetes sem duplicatas", () => {
  const vars = extrairVariaveis("([Salário Bruto] - [INSS]) * 30% + [Salário Bruto]");
  assertEquals(vars, ["Salário Bruto", "INSS"]);
});

Deno.test("avaliarFormula resolve operações básicas e precedência", () => {
  assertEquals(avaliarFormula("10 + 20 * 3", {}).valor, 70);
  assertEquals(avaliarFormula("(10 + 20) * 3", {}).valor, 90);
  assertEquals(avaliarFormula("100 / 4 + 5", {}).valor, 30);
  assertEquals(avaliarFormula("100,50 + 0.50", {}).valor, 101);
});

Deno.test("avaliarFormula calcula porcentagens com sufixo % e parênteses", () => {
  assertEquals(avaliarFormula("5000 * 30%", {}).valor, 1500);
  assertEquals(avaliarFormula("(5000 - 500) * 30%", {}).valor, 1350);
});

Deno.test("avaliarFormula com variáveis", () => {
  const vars = { "Salário Bruto": 5000, "INSS": 500 };
  const r = avaliarFormula("([Salário Bruto] - [INSS]) * 30%", vars);
  assertEquals(r.ok, true);
  assertEquals(r.valor, 1350);
});

Deno.test("calcularFormulaProjecoes resolve contas e categorias nos 12 meses", () => {
  const cSalario: Conta = {
    ...base,
    id: "c_sal",
    empresaId: "e",
    categoriaId: "cat_rec",
    natureza: "receber",
    nome: "Salário Bruto",
    ativa: true,
  };
  const cInss: Conta = {
    ...base,
    id: "c_inss",
    empresaId: "e",
    categoriaId: "cat_desp",
    natureza: "pagar",
    nome: "INSS",
    ativa: true,
  };
  const contas = [cSalario, cInss];
  const cats: Categoria[] = [
    { ...base, id: "cat_rec", empresaId: "e", natureza: "receber", nome: "Receitas" },
    { ...base, id: "cat_desp", empresaId: "e", natureza: "pagar", nome: "Despesas" },
  ];

  const p1: Projecao = { ...base, id: "p1", anoId: "a", contaId: "c_sal", mes: 4, valor: 6000_00 };
  const p2: Projecao = { ...base, id: "p2", anoId: "a", contaId: "c_inss", mes: 4, valor: 800_00 };

  const res = calcularFormulaProjecoes(
    "([Salário Bruto] - [INSS]) * 30%",
    4,
    [p1, p2],
    contas,
    cats,
  );

  // (6000 - 800) * 0.3 = 5200 * 0.3 = 1560 reais = 156000 centavos
  assertEquals(res.ok, true);
  assertEquals(res.valorCentavos, 1560_00);
  assertEquals(res.variaveis["Salário Bruto"], 6000);
  assertEquals(res.variaveis["INSS"], 800);
});

Deno.test("calcularFormulaLancamentos resolve variáveis de lançamentos reais", () => {
  const cVendas1: Conta = {
    ...base,
    id: "c_v1",
    empresaId: "e",
    categoriaId: "cat_vendas",
    natureza: "receber",
    nome: "Vendas Loja",
    ativa: true,
  };
  const cVendas2: Conta = {
    ...base,
    id: "c_v2",
    empresaId: "e",
    categoriaId: "cat_vendas",
    natureza: "receber",
    nome: "Vendas Online",
    ativa: true,
  };
  const contas = [cVendas1, cVendas2];
  const cats: Categoria[] = [
    { ...base, id: "cat_vendas", empresaId: "e", natureza: "receber", nome: "Vendas" },
  ];

  const l1: Lancamento = {
    ...base,
    id: "l1",
    anoId: "a",
    contaId: "c_v1",
    data: "2026-05-10",
    mes: 4,
    valor: 4000_00,
  };
  const l2: Lancamento = {
    ...base,
    id: "l2",
    anoId: "a",
    contaId: "c_v2",
    data: "2026-05-15",
    mes: 4,
    valor: 6000_00,
  };

  // Testa usando soma da categoria e conta
  const resCat = calcularFormulaLancamentos(
    "[cat:cat_vendas] * 10% + 100",
    4,
    [l1, l2],
    contas,
    cats,
  );
  // (4000 + 6000) * 0.10 + 100 = 1000 + 100 = 1100 reais = 110000 centavos
  assertEquals(resCat.ok, true);
  assertEquals(resCat.valorCentavos, 1100_00);
});

Deno.test("calcularFormulaProjecoes tolera acentos e identificadores sem colchetes", () => {
  const cSalario: Conta = {
    ...base,
    id: "c_sal",
    empresaId: "e",
    categoriaId: "cat_rec",
    natureza: "receber",
    nome: "Salário Bruto",
    ativa: true,
  };
  const p1: Projecao = { ...base, id: "p1", anoId: "a", contaId: "c_sal", mes: 0, valor: 5000_00 };

  // Usuário digitou [Salario] sem acento, mas a conta é "Salário Bruto"
  const res1 = calcularFormulaProjecoes("[Salario] * 30%", 0, [p1], [cSalario], []);
  assertEquals(res1.ok, true);
  assertEquals(res1.valorCentavos, 1500_00);

  // Usuário digitou fórmula sem colchetes: Salario * 0,3
  const res2 = calcularFormulaProjecoes("Salario * 0,3", 0, [p1], [cSalario], []);
  assertEquals(res2.ok, true);
  assertEquals(res2.valorCentavos, 1500_00);
});

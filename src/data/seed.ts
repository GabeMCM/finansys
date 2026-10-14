import { db } from "./db.ts";
import { anos, categorias, contas, empresas, lancamentos, projecoes } from "./repo.ts";
import type { Natureza } from "./types.ts";

/** Cria uma empresa de exemplo com projeções e lançamentos, útil para conhecer o sistema. */
export async function seedExemplo(anoNum = new Date().getFullYear()): Promise<string> {
  return await db.transaction("rw", db.tables, async () => {
    const emp = await empresas.create({ nome: "Empresa Exemplo", cnpj: "00.000.000/0001-00", endereco: "Rua Exemplo, 100" });
    const ano = await anos.create({ empresaId: emp.id, ano: anoNum, bancaInicial: 50_000_00 });

    const estrutura: [Natureza, string, [string, number][]][] = [
      ["receber", "Clientes", [["Cliente Alfa", 18_000_00], ["Cliente Beta", 9_500_00]]],
      ["pagar", "Fixas", [["Aluguel", 4_200_00], ["Energia", 850_00]]],
      ["pagar", "Pessoal", [["Folha de pagamento", 14_000_00]]],
      ["pagar", "Impostos", [["Simples Nacional", 3_100_00]]],
      ["aporte", "Sócios", [["Aporte do sócio", 0]]],
      ["saida", "Diversos", [["Saídas eventuais", 600_00]]],
    ];

    const mesAtual = new Date().getMonth();
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280); // determinístico

    for (const [natureza, catNome, itens] of estrutura) {
      const cat = await categorias.create({ empresaId: emp.id, natureza, nome: catNome });
      for (const [nome, valor] of itens) {
        const c = await contas.create({ empresaId: emp.id, categoriaId: cat.id, natureza, nome, ativa: true });
        for (let m = 0; m < 12; m++) {
          const v = natureza === "aporte" ? (m === 2 ? 10_000_00 : 0) : valor;
          if (v) await projecoes.create({ anoId: ano.id, contaId: c.id, mes: m, valor: v });
          if (m <= mesAtual && v) {
            const real = Math.round(v * (0.85 + rnd() * 0.3));
            await lancamentos.create({
              anoId: ano.id, contaId: c.id, mes: m, valor: real,
              data: `${anoNum}-${String(m + 1).padStart(2, "0")}-${String(5 + Math.floor(rnd() * 20)).padStart(2, "0")}`,
              descricao: nome,
              obs: natureza === "aporte" ? "Reforço de caixa" : natureza === "saida" ? "Manutenção" : undefined,
            });
          }
        }
      }
    }
    return emp.id;
  });
}

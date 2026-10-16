import type { Categoria, Conta, Lancamento, Projecao, RegraVinculo } from "../data/types.ts";

/**
 * Tokenizador e avaliador seguro de fórmulas financeiras.
 * Suporta: +, -, *, /, parênteses, porcentagem (ex: 30%), números com ponto ou vírgula,
 * e variáveis delimitadas por colchetes como [Salário Bruto] ou [c:id].
 */

export interface Token {
  tipo: "NUM" | "VAR" | "OP" | "LPAREN" | "RPAREN";
  valor: string | number;
}

export function normalizarNome(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function parseNumeroPtBr(raw: string): number {
  let s = raw.trim();
  if (s.includes(".") && s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, "");
  }
  return parseFloat(s);
}

export function extrairVariaveis(formula: string): string[] {
  const vars: string[] = [];
  const regex = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(formula)) !== null) {
    const nomeVar = match[1].trim();
    if (nomeVar && !vars.includes(nomeVar)) {
      vars.push(nomeVar);
    }
  }

  // Identificadores sem colchetes (ex: Salario, Vendas)
  try {
    const tokens = tokenizar(formula);
    for (const t of tokens) {
      if (t.tipo === "VAR") {
        const v = String(t.valor).trim();
        if (v && !vars.includes(v)) {
          vars.push(v);
        }
      }
    }
  } catch {
    // Silencia erros durante digitação
  }

  return vars;
}

export function tokenizar(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = expr.trim();

  while (i < s.length) {
    const c = s[i];

    // Espaços
    if (/\s/.test(c)) {
      i++;
      continue;
    }

    // Variável entre colchetes [Nome da Conta]
    if (c === "[") {
      const end = s.indexOf("]", i);
      if (end === -1) {
        throw new Error("Colchete '[' não fechado");
      }
      const varName = s.slice(i + 1, end).trim();
      tokens.push({ tipo: "VAR", valor: varName });
      i = end + 1;
      continue;
    }

    // Operadores
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ tipo: "OP", valor: c });
      i++;
      continue;
    }

    // Parênteses
    if (c === "(") {
      tokens.push({ tipo: "LPAREN", valor: "(" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ tipo: "RPAREN", valor: ")" });
      i++;
      continue;
    }

    // Números (inteiros, decimais brasileiros ou americanos, e com sufixo %)
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] || "")) || (c === "," && /[0-9]/.test(s[i + 1] || ""))) {
      let numStr = "";
      while (i < s.length && (/[0-9]/.test(s[i]) || s[i] === "." || s[i] === ",")) {
        numStr += s[i];
        i++;
      }
      let val = parseNumeroPtBr(numStr);
      if (isNaN(val)) throw new Error(`Número inválido: ${numStr}`);

      // Verifica se tem % logo após o número (ex: 30%)
      if (i < s.length && s[i] === "%") {
        val = val / 100;
        i++;
      }

      tokens.push({ tipo: "NUM", valor: val });
      continue;
    }

    // % isolado após expressão ou variável
    if (c === "%") {
      tokens.push({ tipo: "OP", valor: "%" });
      i++;
      continue;
    }

    // Identificador de variável sem colchetes (ex: Salario, INSS, Vendas)
    if (/[a-zA-Z\u00C0-\u00FF_]/.test(c)) {
      let ident = "";
      while (i < s.length && /[a-zA-Z0-9\u00C0-\u00FF_:\-]/.test(s[i])) {
        ident += s[i];
        i++;
      }
      tokens.push({ tipo: "VAR", valor: ident });
      continue;
    }

    throw new Error(`Caractere inesperado na fórmula: '${c}'`);
  }

  return tokens;
}

export function avaliarTokens(tokens: Token[], variaveis: Record<string, number>): number {
  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function consumir(): Token {
    return tokens[pos++];
  }

  // Expression = Term (('+' | '-') Term)*
  function parseExpression(): number {
    let result = parseTerm();

    while (peek() && peek()?.tipo === "OP" && (peek()?.valor === "+" || peek()?.valor === "-")) {
      const op = consumir().valor;
      const right = parseTerm();
      if (op === "+") result += right;
      else result -= right;
    }

    return result;
  }

  // Term = Factor (('*' | '/' | '%') Factor)*
  function parseTerm(): number {
    let result = parseFactor();

    while (peek() && peek()?.tipo === "OP" && (peek()?.valor === "*" || peek()?.valor === "/" || peek()?.valor === "%")) {
      const op = consumir().valor;
      if (op === "%") {
        // operador percentual pós-fixado
        result = result / 100;
        continue;
      }
      const right = parseFactor();
      if (op === "*") {
        result *= right;
      } else if (op === "/") {
        result = right === 0 ? 0 : result / right;
      }
    }

    return result;
  }

  // Factor = ('+' | '-')? Primary
  function parseFactor(): number {
    if (peek() && peek()?.tipo === "OP" && (peek()?.valor === "+" || peek()?.valor === "-")) {
      const sign = consumir().valor === "-" ? -1 : 1;
      return sign * parsePrimary();
    }
    return parsePrimary();
  }

  // Primary = NUM | VAR | '(' Expression ')'
  function parsePrimary(): number {
    const t = peek();
    if (!t) throw new Error("Expressão matemática incompleta");

    if (t.tipo === "NUM") {
      consumir();
      let val = Number(t.valor);
      if (peek() && peek()?.tipo === "OP" && peek()?.valor === "%") {
        consumir();
        val = val / 100;
      }
      return val;
    }

    if (t.tipo === "VAR") {
      consumir();
      const varKey = String(t.valor).trim();
      let val = 0;

      // Procura variável por chave exata ou normalizada
      if (varKey in variaveis) {
        val = variaveis[varKey];
      } else {
        const lowerKey = varKey.toLowerCase();
        for (const [k, v] of Object.entries(variaveis)) {
          if (k.toLowerCase() === lowerKey) {
            val = v;
            break;
          }
        }
      }

      if (peek() && peek()?.tipo === "OP" && peek()?.valor === "%") {
        consumir();
        val = val / 100;
      }

      return val;
    }

    if (t.tipo === "LPAREN") {
      consumir(); // consome '('
      const val = parseExpression();
      const close = peek();
      if (!close || close.tipo !== "RPAREN") {
        throw new Error("Parêntese ')' ausente");
      }
      consumir(); // consome ')'

      if (peek() && peek()?.tipo === "OP" && peek()?.valor === "%") {
        consumir();
        return val / 100;
      }

      return val;
    }

    throw new Error(`Token inesperado: ${JSON.stringify(t.valor)}`);
  }

  const res = parseExpression();
  if (pos < tokens.length) {
    throw new Error(`Sintaxe inválida próximo a '${String(tokens[pos]?.valor)}'`);
  }

  return isNaN(res) ? 0 : res;
}

/**
 * Avalia uma fórmula textual fornecendo um dicionário com os valores das variáveis em Reais.
 */
export function avaliarFormula(
  formula: string,
  variaveis: Record<string, number>,
): { ok: boolean; valor: number; erro?: string } {
  if (!formula || !formula.trim()) {
    return { ok: true, valor: 0 };
  }

  try {
    const tokens = tokenizar(formula);
    const resultadoReais = avaliarTokens(tokens, variaveis);
    return { ok: true, valor: resultadoReais };
  } catch (err) {
    return {
      ok: false,
      valor: 0,
      erro: err instanceof Error ? err.message : "Erro de sintaxe na fórmula",
    };
  }
}

/**
 * Resolve o valor em Reais de uma referência de conta ou categoria nas projeções de um mês.
 */
export function resolverValorVariavelProjecoes(
  varName: string,
  mes: number,
  projecoes: Projecao[],
  contas: Conta[],
  categorias: Categoria[],
): number {
  const clean = varName.trim();
  const norm = normalizarNome(clean);

  // 1. Verifica prefixo cat: ou categoria:
  if (norm.startsWith("cat:") || norm.startsWith("categoria:")) {
    const catRefNorm = norm.replace(/^(cat:|categoria:)\s*/, "").trim();
    const cat = categorias.find(
      (c) => c.id === clean.replace(/^(cat:|categoria:)\s*/i, "").trim() || normalizarNome(c.nome) === catRefNorm
    );
    if (!cat) return 0;
    const catContasIds = new Set(contas.filter((c) => c.categoriaId === cat.id).map((c) => c.id));
    const valMap = new Map<string, number>();
    for (const p of projecoes) {
      if (catContasIds.has(p.contaId) && Number(p.mes) === Number(mes)) {
        valMap.set(p.contaId, p.valor || 0);
      }
    }
    let totalCentavos = 0;
    for (const v of valMap.values()) totalCentavos += v;
    return totalCentavos / 100;
  }

  // 2. Verifica prefixo conta: ou c:
  let contaRefNorm = norm;
  let contaRefClean = clean;
  if (norm.startsWith("conta:") || norm.startsWith("c:")) {
    contaRefNorm = norm.replace(/^(conta:|c:)\s*/, "").trim();
    contaRefClean = clean.replace(/^(conta:|c:)\s*/i, "").trim();
  }

  // 3. Busca conta por ID ou por Nome normalizado
  let conta = contas.find((c) => c.id === contaRefClean || normalizarNome(c.nome) === contaRefNorm);
  if (!conta) {
    const candidatas = contas.filter((c) => normalizarNome(c.nome).includes(contaRefNorm));
    if (candidatas.length === 1) {
      conta = candidatas[0];
    }
  }

  if (conta) {
    let ultimoCentavos = 0;
    for (const p of projecoes) {
      if (p.contaId === conta.id && Number(p.mes) === Number(mes)) {
        ultimoCentavos = p.valor || 0;
      }
    }
    return ultimoCentavos / 100;
  }

  // 4. Se não achou como conta, verifica se é uma categoria pelo nome
  let cat = categorias.find((c) => normalizarNome(c.nome) === norm);
  if (!cat) {
    const candidatas = categorias.filter((c) => normalizarNome(c.nome).includes(norm));
    if (candidatas.length === 1) cat = candidatas[0];
  }
  if (cat) {
    const catContasIds = new Set(contas.filter((c) => c.categoriaId === cat.id).map((c) => c.id));
    const valMap = new Map<string, number>();
    for (const p of projecoes) {
      if (catContasIds.has(p.contaId) && Number(p.mes) === Number(mes)) {
        valMap.set(p.contaId, p.valor || 0);
      }
    }
    let totalCentavos = 0;
    for (const v of valMap.values()) totalCentavos += v;
    return totalCentavos / 100;
  }

  return 0;
}

/**
 * Resolve o valor em Reais de uma referência de conta ou categoria nos lançamentos realizados de um mês.
 */
export function resolverValorVariavelLancamentos(
  varName: string,
  mes: number,
  lancamentos: Lancamento[],
  contas: Conta[],
  categorias: Categoria[],
): number {
  const clean = varName.trim();
  const norm = normalizarNome(clean);

  // 1. Verifica prefixo cat: ou categoria:
  if (norm.startsWith("cat:") || norm.startsWith("categoria:")) {
    const catRefNorm = norm.replace(/^(cat:|categoria:)\s*/, "").trim();
    const cat = categorias.find(
      (c) => c.id === clean.replace(/^(cat:|categoria:)\s*/i, "").trim() || normalizarNome(c.nome) === catRefNorm
    );
    if (!cat) return 0;
    const catContasIds = new Set(contas.filter((c) => c.categoriaId === cat.id).map((c) => c.id));
    const totalCentavos = lancamentos
      .filter((l) => catContasIds.has(l.contaId) && Number(l.mes) === Number(mes))
      .reduce((s, l) => s + (l.valor || 0), 0);
    return totalCentavos / 100;
  }

  // 2. Verifica prefixo conta: ou c:
  let contaRefNorm = norm;
  let contaRefClean = clean;
  if (norm.startsWith("conta:") || norm.startsWith("c:")) {
    contaRefNorm = norm.replace(/^(conta:|c:)\s*/, "").trim();
    contaRefClean = clean.replace(/^(conta:|c:)\s*/i, "").trim();
  }

  // 3. Busca conta por ID ou por Nome normalizado
  let conta = contas.find((c) => c.id === contaRefClean || normalizarNome(c.nome) === contaRefNorm);
  if (!conta) {
    const candidatas = contas.filter((c) => normalizarNome(c.nome).includes(contaRefNorm));
    if (candidatas.length === 1) {
      conta = candidatas[0];
    }
  }

  if (conta) {
    const totalCentavos = lancamentos
      .filter((l) => l.contaId === conta.id && Number(l.mes) === Number(mes))
      .reduce((s, l) => s + (l.valor || 0), 0);
    return totalCentavos / 100;
  }

  // 4. Se não achou como conta, verifica se é categoria
  let cat = categorias.find((c) => normalizarNome(c.nome) === norm);
  if (!cat) {
    const candidatas = categorias.filter((c) => normalizarNome(c.nome).includes(norm));
    if (candidatas.length === 1) cat = candidatas[0];
  }
  if (cat) {
    const catContasIds = new Set(contas.filter((c) => c.categoriaId === cat.id).map((c) => c.id));
    const totalCentavos = lancamentos
      .filter((l) => catContasIds.has(l.contaId) && Number(l.mes) === Number(mes))
      .reduce((s, l) => s + (l.valor || 0), 0);
    return totalCentavos / 100;
  }

  return 0;
}

/**
 * Calcula uma fórmula para projeções em um mês e retorna o valor final em CENTAVOS.
 */
export function calcularFormulaProjecoes(
  formula: string,
  mes: number,
  projecoes: Projecao[],
  contas: Conta[],
  categorias: Categoria[],
): { valorCentavos: number; ok: boolean; erro?: string; variaveis: Record<string, number> } {
  const nomesVars = extrairVariaveis(formula);
  const varsMap: Record<string, number> = {};

  for (const v of nomesVars) {
    varsMap[v] = resolverValorVariavelProjecoes(v, mes, projecoes, contas, categorias);
  }

  const evalRes = avaliarFormula(formula, varsMap);
  const valorCentavos = evalRes.ok ? Math.max(0, Math.round(evalRes.valor * 100)) : 0;

  return {
    valorCentavos,
    ok: evalRes.ok,
    erro: evalRes.erro,
    variaveis: varsMap,
  };
}

/**
 * Calcula uma fórmula para lançamentos em um mês e retorna o valor final em CENTAVOS.
 */
export function calcularFormulaLancamentos(
  formula: string,
  mes: number,
  lancamentos: Lancamento[],
  contas: Conta[],
  categorias: Categoria[],
): { valorCentavos: number; ok: boolean; erro?: string; variaveis: Record<string, number> } {
  const nomesVars = extrairVariaveis(formula);
  const varsMap: Record<string, number> = {};

  for (const v of nomesVars) {
    varsMap[v] = resolverValorVariavelLancamentos(v, mes, lancamentos, contas, categorias);
  }

  const evalRes = avaliarFormula(formula, varsMap);
  const valorCentavos = evalRes.ok ? Math.max(0, Math.round(evalRes.valor * 100)) : 0;

  return {
    valorCentavos,
    ok: evalRes.ok,
    erro: evalRes.erro,
    variaveis: varsMap,
  };
}

import { ocultarValores } from "../state.ts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Valores monetários são armazenados em centavos (inteiros) para evitar erros de ponto flutuante. */
export const money = (cents: number) => brl.format(cents / 100);
export const moneyCompact = (cents: number) => brlCompact.format(cents / 100);
export const signed = (cents: number) => (cents > 0 ? "+" : "") + money(cents);

/** Formata valor ocultando com máscara se o modo de privacidade estiver ativo */
export const moneyPrivacidade = (cents: number) => (ocultarValores.value ? "••••••" : money(cents));
export const signedPrivacidade = (cents: number) => (ocultarValores.value ? "••••••" : signed(cents));

export const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Aplica máscara dinâmica de CPF (11 dígitos) ou CNPJ (14 dígitos) conforme digitação. */
export function formatCpfCnpj(value: string = ""): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);

  if (digits.length <= 11) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** Formata e adiciona o prefixo 'CPF: ' ou 'CNPJ: ' para exibição. */
export function labelCpfCnpj(value?: string): string {
  if (!value) return "";
  const clean = value.replace(/\D/g, "");
  if (!clean) return "";
  const formatted = formatCpfCnpj(clean);
  return clean.length <= 11 ? `CPF: ${formatted}` : `CNPJ: ${formatted}`;
}

/** Converte string de dígitos para centavos (ex: "2400" -> 2400, que equivale a R$ 24,00). */
export function digitsToCentavos(raw: string | number = ""): number {
  if (typeof raw === "number") {
    if (isNaN(raw)) return 0;
    return Math.round(raw);
  }
  const digits = String(raw).replace(/\D/g, "").slice(0, 12);
  if (!digits) return 0;
  return parseInt(digits, 10);
}

/** Formata centavos como valor monetário brasileiro sem símbolo (ex: 2400 -> "24,00"). */
export function formatCentavosValor(cents: number = 0): string {
  const c = Math.max(0, Math.round(cents || 0));
  const reais = Math.floor(c / 100);
  const centavos = c % 100;
  const reaisFormatados = new Intl.NumberFormat("pt-BR").format(reais);
  return `${reaisFormatados},${String(centavos).padStart(2, "0")}`;
}

/** Formata centavos com símbolo R$ (ex: 2400 -> "R$ 24,00"). */
export function formatCentavosBRL(cents: number = 0): string {
  return `R$ ${formatCentavosValor(cents)}`;
}


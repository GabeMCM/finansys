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

export const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

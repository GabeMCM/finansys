import type { Natureza } from "../data/types.ts";
import type { IconName } from "../components/Icon.tsx";

export const NATURE_META: Record<Natureza, { label: string; tone: string; icon: IconName }> = {
  receber: { label: "A Receber", tone: "in", icon: "arrowDown" },
  pagar: { label: "A Pagar", tone: "out", icon: "arrowUp" },
  aporte: { label: "Aporte Livre", tone: "aporte", icon: "wallet" },
  saida: { label: "Saída Livre", tone: "saida", icon: "sparkle" },
};

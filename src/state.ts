import { signal } from "@preact/signals";
import { anos, empresas, settings } from "./data/repo.ts";

export type Theme = "dark" | "light";

/** Empresa e ano ativos, persistidos localmente. */
export const empresaAtiva = signal<string | null>(null);
export const anoAtivo = signal<number>(new Date().getFullYear());
export const theme = signal<Theme>(
  (localStorage.getItem("theme") as Theme) ??
    (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"),
);

export function applyTheme(t: Theme) {
  theme.value = t;
  document.documentElement.dataset.theme = t;
  localStorage.setItem("theme", t); // síncrono para evitar "flash" de tema ao abrir
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#ffffff" : "#13161c");
}

export async function loadState() {
  applyTheme(theme.value);
  empresaAtiva.value = await settings.get<string | null>("empresaAtiva", null);
  anoAtivo.value = await settings.get("anoAtivo", new Date().getFullYear());

  // Garante empresa/ano válidos (ex: empresa removida ou primeiro acesso)
  const lista = await empresas.list();
  if (!lista.some((e) => e.id === empresaAtiva.value)) empresaAtiva.value = lista[0]?.id ?? null;
  if (empresaAtiva.value) {
    const as = await anos.byEmpresa(empresaAtiva.value);
    if (as.length && !as.some((a) => a.ano === anoAtivo.value)) anoAtivo.value = as[as.length - 1].ano;
  }
}

export function setEmpresa(id: string) {
  empresaAtiva.value = id;
  settings.set("empresaAtiva", id);
}

export function setAno(ano: number) {
  anoAtivo.value = ano;
  settings.set("anoAtivo", ano);
}

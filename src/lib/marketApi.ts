import type { LongTermAnalysis } from "../data/types.ts";

const HOTLIST_STORAGE_KEY = "finansys_market_hotlist";
const TICKER_CACHE_PREFIX = "finansys_market_ticker_";

/**
 * Busca o ranking completo da Hotlist do backend (ou do cache local se offline).
 */
export async function fetchHotlist(): Promise<LongTermAnalysis[]> {
  try {
    const res = await fetch("/api/market/hotlist");
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        try {
          localStorage.setItem(HOTLIST_STORAGE_KEY, JSON.stringify(data.items));
        } catch (_storageErr) {
          // Ignora quota cheia
        }
        return data.items;
      }
    }
  } catch (err) {
    console.warn("[Market API] Falha de conexão ao carregar Hotlist remota:", err);
  }

  // Fallback offline a partir do cache persistente local
  try {
    const local = localStorage.getItem(HOTLIST_STORAGE_KEY);
    if (local) {
      return JSON.parse(local);
    }
  } catch (_e) {
    // Ignora erro de parse
  }

  return [];
}

/**
 * Consulta e analisa qualquer ativo mundial digitado pelo usuário.
 */
export async function searchTicker(symbol: string): Promise<LongTermAnalysis> {
  const clean = symbol.trim().toUpperCase();
  if (!clean) {
    throw new Error("Digite o código do ativo.");
  }

  try {
    const res = await fetch(`/api/market/ticker?symbol=${encodeURIComponent(clean)}`);
    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || `Não foi possível encontrar dados para o ativo "${clean}".`);
    }

    try {
      localStorage.setItem(`${TICKER_CACHE_PREFIX}${clean}`, JSON.stringify(json.data));
    } catch (_e) {
      // Ignora erro de cache
    }

    return json.data;
  } catch (err: any) {
    // Tenta fallback do cache local do ticker
    try {
      const local = localStorage.getItem(`${TICKER_CACHE_PREFIX}${clean}`);
      if (local) {
        return JSON.parse(local);
      }
    } catch (_e2) {
      // Ignora
    }
    throw err;
  }
}

import type { LongTermAnalysis } from "../data/types.ts";

const HOTLIST_STORAGE_KEY = "finansys_market_hotlist";
const HOTLIST_META_STORAGE_KEY = "finansys_market_hotlist_meta";
const TICKER_CACHE_PREFIX = "finansys_market_ticker_";

export interface HotlistResponse {
  items: LongTermAnalysis[];
  updatedAt: number;
  scanned?: number;
}

/**
 * Busca o ranking do HOT 100 do backend (com opção de forçar nova varredura diária no mercado).
 */
export async function fetchHotlist(forceRefresh = false): Promise<HotlistResponse> {
  try {
    const url = forceRefresh ? "/api/market/hotlist?refresh=true" : "/api/market/hotlist";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        try {
          localStorage.setItem(HOTLIST_STORAGE_KEY, JSON.stringify(data.items));
          localStorage.setItem(HOTLIST_META_STORAGE_KEY, JSON.stringify({ updatedAt: data.updatedAt || Date.now() }));
        } catch (_storageErr) {
          // Ignora quota cheia
        }
        return {
          items: data.items,
          updatedAt: data.updatedAt || Date.now(),
          scanned: data.scanned,
        };
      }
    }
  } catch (err) {
    console.warn("[Market API] Falha de conexão ao carregar Hotlist remota:", err);
  }

  // Fallback offline a partir do cache persistente local
  try {
    const local = localStorage.getItem(HOTLIST_STORAGE_KEY);
    const meta = localStorage.getItem(HOTLIST_META_STORAGE_KEY);
    if (local) {
      const items = JSON.parse(local);
      const metaObj = meta ? JSON.parse(meta) : {};
      return {
        items,
        updatedAt: metaObj.updatedAt || Date.now(),
      };
    }
  } catch (_e) {
    // Ignora erro de parse
  }

  return { items: [], updatedAt: Date.now() };
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

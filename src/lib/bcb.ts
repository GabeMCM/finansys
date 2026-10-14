/**
 * Consulta índices oficiais na API aberta do Banco Central do Brasil (SGS).
 * Série 13522: IPCA acumulado dos últimos 12 meses (%)
 * Série 189: IGP-M mensal
 */

export interface IndiceEconomico {
  nome: string;
  valor: number; // Porcentagem ex: 4.25
  data: string;
}

export async function consultarIndices(): Promise<{ ipca: number; dataReferencia: string }> {
  try {
    const res = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json", {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error("Falha na resposta do Banco Central");
    const json = await res.json();
    if (Array.isArray(json) && json.length > 0) {
      const item = json[0];
      const val = parseFloat(item.valor.replace(",", "."));
      return { ipca: isNaN(val) ? 4.5 : val, dataReferencia: item.data };
    }
  } catch (_e) {
    // Offline ou bloqueio de CORS / timeout: fallback seguro para a meta de inflação corrente
  }
  return { ipca: 4.5, dataReferencia: "Estimativa segura" };
}

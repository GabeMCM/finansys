import { liveQuery } from "dexie";
import { useEffect, useState } from "react";

/** Executa uma consulta Dexie e re-renderiza automaticamente quando os dados mudam. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: console.error });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}

import { useEffect, useState } from "react";

/** Roteador mínimo baseado em hash (#/rota) — funciona offline e em hospedagem estática. */
export function useRoute(): string {
  const read = () => location.hash.replace(/^#/, "") || "/";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      scrollTo({ top: 0 });
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

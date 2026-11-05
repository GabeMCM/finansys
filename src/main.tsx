import { render } from "preact";
import { AppShell } from "./components/AppShell.tsx";
import { useRoute } from "./lib/router.ts";
import { Ajustes } from "./pages/Ajustes.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { Investimentos } from "./pages/Investimentos.tsx";
import { Lancamentos } from "./pages/Lancamentos.tsx";
import { Placeholder } from "./pages/Placeholder.tsx";
import { Projecoes } from "./pages/Projecoes.tsx";
import { Reservas } from "./pages/Reservas.tsx";
import { initCloudSync } from "./data/cloudSync.ts";
import { initInactivityGuard } from "./data/inactivityGuard.ts";
import { loadState } from "./state.ts";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/mobile.css";

import { useIsMobile } from "./lib/useIsMobile.ts";
import { MobileShell } from "./mobile/MobileShell.tsx";

function App() {
  const route = useRoute();
  const isMobile = useIsMobile();

  // Em dispositivos móveis (< 768px), carrega a experiência mobile completa
  if (isMobile) {
    return <MobileShell route={route} />;
  }

  // Em desktop (>= 768px), mantém a estação de trabalho completa
  let page;
  if (route === "/" || route.startsWith("/relatorios")) page = <Dashboard />;
  else if (route.startsWith("/projecoes")) page = <Projecoes />;
  else if (route === "/realizacoes/novo" || route === "/lancamentos/novo") page = <Lancamentos openNewOnMount={true} />;
  else if (route.startsWith("/realizacoes") || route.startsWith("/lancamentos")) page = <Lancamentos />;
  else if (route.startsWith("/reservas")) page = <Reservas />;
  else if (route.startsWith("/investimentos")) page = <Investimentos />;
  else if (route.startsWith("/ajustes")) page = <Ajustes />;
  else page = <Placeholder title="Página não encontrada" desc={route} icon="home" etapa={1} />;

  return <AppShell route={route}>{page}</AppShell>;
}

const container = document.getElementById("app");
if (container) {
  render(<App />, container);
}

loadState().finally(() => {
  initCloudSync();
  initInactivityGuard();
});

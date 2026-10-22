import { render } from "preact";
import { AppShell } from "./components/AppShell.tsx";
import { useRoute } from "./lib/router.ts";
import { Ajustes } from "./pages/Ajustes.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { Investimentos } from "./pages/Investimentos.tsx";
import { Lancamentos } from "./pages/Lancamentos.tsx";
import { Placeholder } from "./pages/Placeholder.tsx";
import { Projecoes } from "./pages/Projecoes.tsx";
import { Relatorios } from "./pages/Relatorios.tsx";
import { initCloudSync } from "./data/cloudSync.ts";
import { initInactivityGuard } from "./data/inactivityGuard.ts";
import { loadState } from "./state.ts";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";

function App() {
  const route = useRoute();

  let page;
  if (route === "/") page = <Dashboard />;
  else if (route.startsWith("/projecoes")) page = <Projecoes />;
  else if (route === "/lancamentos/novo") page = <Lancamentos openNewOnMount={true} />;
  else if (route.startsWith("/lancamentos")) page = <Lancamentos />;
  else if (route.startsWith("/investimentos")) page = <Investimentos />;
  else if (route.startsWith("/relatorios")) page = <Relatorios />;
  else if (route.startsWith("/ajustes")) page = <Ajustes />;
  else page = <Placeholder title="Página não encontrada" desc={route} icon="home" etapa={1} />;

  return <AppShell route={route}>{page}</AppShell>;
}

loadState().finally(() => {
  initCloudSync();
  initInactivityGuard();
  render(<App />, document.getElementById("app")!);
});

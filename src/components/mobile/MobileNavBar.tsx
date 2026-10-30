import { Icon, type IconName } from "../Icon.tsx";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const MOBILE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: "chart" },
  { href: "/realizacoes", label: "Extrato", icon: "list" },
  { href: "/projecoes", label: "Projeções", icon: "grid" },
  { href: "/reservas", label: "Reservas", icon: "wallet" },
  { href: "/ajustes", label: "Ajustes", icon: "settings" },
];

export function MobileNavBar({ route }: { route: string }) {
  const isItemActive = (href: string) => {
    if (href === "/") return route === "/" || route.startsWith("/relatorios");
    if (href === "/realizacoes") return route.startsWith("/realizacoes") || route.startsWith("/lancamentos");
    return route.startsWith(href);
  };

  return (
    <nav class="mobile-nav only-mobile" aria-label="Navegação inferior mobile">
      {MOBILE_NAV_ITEMS.map((item) => {
        const active = isItemActive(item.href);
        return (
          <a
            key={item.href}
            href={`#${item.href}`}
            class={`mobile-nav__item ${active ? "is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {active && <span class="mobile-nav__indicator" />}
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

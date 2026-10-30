/**
 * Normalizador transparente de JSX para React 18.
 * Permite que strings de CSS em `style` e classes em `class` funcionem 100% nativamente
 * com o motor oficial do React 18 sem quebras de runtime.
 */

export function parseCss(s: string): Record<string, string> {
  const o: Record<string, string> = {};
  if (!s || typeof s !== "string") return o;
  const decls = s.split(";");
  for (let i = 0; i < decls.length; i++) {
    const trimmed = decls[i].trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim();
    if (!prop || !val) continue;
    const camelProp = prop.startsWith("--")
      ? prop
      : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    o[camelProp] = val;
  }
  return o;
}

export function normalizeProps<T extends Record<string, any>>(props: T): T {
  if (!props || typeof props !== "object") return props;

  let newProps = props;
  let changed = false;

  if (typeof props.style === "string") {
    if (!changed) {
      newProps = { ...props };
      changed = true;
    }
    newProps.style = parseCss(props.style);
  }

  if ("class" in props) {
    if (!changed) {
      newProps = { ...props };
      changed = true;
    }
    const c = props.class;
    if (newProps.className) {
      newProps.className = `${c} ${newProps.className}`;
    } else {
      newProps.className = c;
    }
    delete newProps.class;
  }

  return newProps;
}

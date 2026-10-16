import { NATUREZAS, type Natureza } from "../../data/types.ts";
import { NATURE_META } from "../../lib/natureza.ts";
import { Icon } from "../Icon.tsx";

export interface NaturezaSegmentedProps {
  value: Natureza;
  onChange?: (nat: Natureza) => void;
  readonly?: boolean;
}

export function NaturezaSegmented({ value, onChange, readonly = false }: NaturezaSegmentedProps) {
  const currentMeta = NATURE_META[value];

  if (readonly) {
    return (
      <div
        class="badge"
        style={`display:inline-flex;align-items:center;gap:6px;padding:6px 12px;font-size:var(--fs-xs);font-weight:700;border-radius:var(--r-md);background:var(--${currentMeta.tone}-soft);color:var(--${currentMeta.tone});border:1px solid color-mix(in srgb, var(--${currentMeta.tone}) 25%, transparent);`}
      >
        <Icon name={currentMeta.icon} style="width:14px;height:14px;" />
        <span>{currentMeta.label}</span>
      </div>
    );
  }

  return (
    <div class="segmented" role="tablist" aria-label="Selecione a Natureza">
      {NATUREZAS.map((nat) => {
        const meta = NATURE_META[nat];
        const isActive = value === nat;
        return (
          <button
            key={nat}
            type="button"
            role="tab"
            aria-selected={isActive}
            class={`segmented__item segmented__item--${nat} ${isActive ? "segmented__item--active" : ""}`}
            onClick={() => onChange && onChange(nat)}
          >
            <Icon name={meta.icon} style="width:14px;height:14px;" />
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

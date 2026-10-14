import { useEffect, useRef, useState } from "preact/hooks";
import { Icon, type IconName } from "./Icon.tsx";

export interface CustomSelectOption {
  value: string | number;
  label: string;
  icon?: IconName;
  badge?: string;
}

export interface CustomSelectGroup {
  group: string;
  options: CustomSelectOption[];
}

export type CustomSelectItem = CustomSelectOption | CustomSelectGroup;

function isGroup(item: CustomSelectItem): item is CustomSelectGroup {
  return "group" in item && Array.isArray((item as CustomSelectGroup).options);
}

export interface CustomSelectProps {
  id?: string;
  value: string | number;
  options: CustomSelectItem[];
  onChange: (val: string) => void;
  placeholder?: string;
  icon?: IconName;
  variant?: "default" | "chip";
  disabled?: boolean;
  style?: string;
  ariaLabel?: string;
}

export function CustomSelect({
  id,
  value,
  options,
  onChange,
  placeholder = "Selecione...",
  icon,
  variant = "default",
  disabled = false,
  style,
  ariaLabel,
}: CustomSelectProps) {
  const [aberto, setAberto] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Encontra o item selecionado
  let opcaoSelecionada: CustomSelectOption | undefined;
  for (const item of options) {
    if (isGroup(item)) {
      const achou = item.options.find((o) => String(o.value) === String(value));
      if (achou) {
        opcaoSelecionada = achou;
        break;
      }
    } else if (String(item.value) === String(value)) {
      opcaoSelecionada = item;
      break;
    }
  }

  // Fecha ao clicar fora ou pressionar ESC e ajusta alinhamento
  useEffect(() => {
    if (!aberto) return;

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setAlignRight(rect.left + 220 > window.innerWidth);
    }

    const handleClickFora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };

    document.addEventListener("mousedown", handleClickFora);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickFora);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [aberto]);

  const handleSelect = (val: string | number) => {
    onChange(String(val));
    setAberto(false);
  };

  const isChip = variant === "chip";

  return (
    <div
      ref={containerRef}
      class={`custom-select-container ${isChip ? "custom-select-container--chip" : ""} ${aberto ? "is-open" : ""}`}
      style={style}
    >
      <button
        id={id}
        type="button"
        class={`custom-select-trigger ${isChip ? "custom-select-trigger--chip" : ""} ${aberto ? "is-open" : ""}`}
        onClick={() => !disabled && setAberto(!aberto)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={ariaLabel}
      >
        <span class="custom-select-trigger__content">
          {icon && <Icon name={icon} class="custom-select-trigger__icon" />}
          {opcaoSelecionada?.icon && !icon && (
            <Icon name={opcaoSelecionada.icon} class="custom-select-trigger__icon" />
          )}
          <span class="custom-select-trigger__label">
            {opcaoSelecionada ? opcaoSelecionada.label : placeholder}
          </span>
        </span>
        <Icon
          name="chevron"
          class={`custom-select-trigger__chevron ${aberto ? "is-rotated" : ""}`}
        />
      </button>

      {aberto && (
        <div class={`custom-select-menu ${alignRight ? "custom-select-menu--align-right" : ""}`} role="listbox">
          {options.length === 0 ? (
            <div class="custom-select-empty">Nenhuma opção disponível</div>
          ) : (
            options.map((item, idx) => {
              if (isGroup(item)) {
                return (
                  <div key={`group-${idx}`} class="custom-select-group">
                    <div class="custom-select-group__title">{item.group}</div>
                    {item.options.map((opt) => {
                      const isSelected = String(opt.value) === String(value);
                      return (
                        <div
                          key={String(opt.value)}
                          role="option"
                          aria-selected={isSelected}
                          class={`custom-select-item ${isSelected ? "is-selected" : ""}`}
                          onClick={() => handleSelect(opt.value)}
                        >
                          <div class="custom-select-item__label">
                            {opt.icon && <Icon name={opt.icon} class="custom-select-item__icon" />}
                            <span>{opt.label}</span>
                            {opt.badge && <span class="badge badge--in">{opt.badge}</span>}
                          </div>
                          {isSelected && <Icon name="check" class="custom-select-item__check" />}
                        </div>
                      );
                    })}
                  </div>
                );
              }

              const isSelected = String(item.value) === String(value);
              return (
                <div
                  key={String(item.value)}
                  role="option"
                  aria-selected={isSelected}
                  class={`custom-select-item ${isSelected ? "is-selected" : ""}`}
                  onClick={() => handleSelect(item.value)}
                >
                  <div class="custom-select-item__label">
                    {item.icon && <Icon name={item.icon} class="custom-select-item__icon" />}
                    <span>{item.label}</span>
                    {item.badge && <span class="badge badge--in">{item.badge}</span>}
                  </div>
                  {isSelected && <Icon name="check" class="custom-select-item__check" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

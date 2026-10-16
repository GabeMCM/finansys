import { formatCentavosValor, digitsToCentavos } from "../../lib/format.ts";

export interface MoneyInputProps {
  id?: string;
  valueCentavos: number;
  onChangeCentavos: (cents: number) => void;
  variant?: "hero" | "compact";
  autoFocus?: boolean;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
}

export function MoneyInput({
  id,
  valueCentavos,
  onChangeCentavos,
  variant = "hero",
  autoFocus,
  placeholder = "0,00",
  disabled = false,
  required = false,
  ariaLabel,
}: MoneyInputProps) {
  const isHero = variant === "hero";
  const displayVal = valueCentavos > 0 ? formatCentavosValor(valueCentavos) : "";

  const handleInput = (e: Event) => {
    const target = e.currentTarget as HTMLInputElement;
    const cents = digitsToCentavos(target.value);
    onChangeCentavos(cents);
  };

  return (
    <div class="money-input-wrap">
      <span class={isHero ? "money-input__prefix--hero" : "money-input__prefix--compact"}>
        R$
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        class={`money-input ${isHero ? "money-input--hero" : "money-input--compact"}`}
        value={displayVal}
        onInput={handleInput}
        autoFocus={autoFocus}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel || "Valor em Reais"}
      />
    </div>
  );
}

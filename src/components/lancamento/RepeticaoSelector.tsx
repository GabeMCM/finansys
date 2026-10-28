import { MONTHS } from "../../lib/format.ts";
import { Icon } from "../Icon.tsx";

export type TipoRepeticaoReal = "unico" | "parcelado" | "recorrente";
export type ModoDistribuicaoProjecao = "fixo" | "parcelado" | "especifico" | "mensal";

export interface RepeticaoRealProps {
  modo: "real";
  tipo: TipoRepeticaoReal;
  onChangeTipo: (tipo: TipoRepeticaoReal) => void;
  numRepeticoes: number;
  onChangeNumRepeticoes: (n: number) => void;
  dividirValor: boolean;
  onChangeDividirValor: (dividir: boolean) => void;
}

export interface RepeticaoProjecaoProps {
  modo: "projecao";
  distribuicao: ModoDistribuicaoProjecao;
  onChangeDistribuicao: (dist: ModoDistribuicaoProjecao) => void;
  mesInicioParcela: number;
  onChangeMesInicioParcela: (mes: number) => void;
  numParcelas: number;
  onChangeNumParcelas: (qtd: number) => void;
  dividirValor: boolean;
  onChangeDividirValor: (dividir: boolean) => void;
  mesEspecifico: number;
  onChangeMesEspecifico: (mes: number) => void;
  valoresMensais: string[];
  onChangeValoresMensais: (vals: string[]) => void;
  desabilitadoPorCalculado?: boolean;
}

export type RepeticaoSelectorProps = RepeticaoRealProps | RepeticaoProjecaoProps;

export function RepeticaoSelector(props: RepeticaoSelectorProps) {
  if (props.modo === "real") {
    const { tipo, onChangeTipo, numRepeticoes, onChangeNumRepeticoes, dividirValor, onChangeDividirValor } = props;

    return (
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div class="segmented segmented--3">
          <button
            type="button"
            class={`segmented__item ${tipo === "unico" ? "segmented__item--active" : ""}`}
            onClick={() => onChangeTipo("unico")}
          >
            Lançamento Único
          </button>
          <button
            type="button"
            class={`segmented__item ${tipo === "parcelado" ? "segmented__item--active" : ""}`}
            onClick={() => onChangeTipo("parcelado")}
          >
            <Icon name="calendar" style="width:13px;height:13px;" />
            Parcelado
          </button>
          <button
            type="button"
            class={`segmented__item ${tipo === "recorrente" ? "segmented__item--active" : ""}`}
            onClick={() => onChangeTipo("recorrente")}
          >
            <Icon name="refresh" style="width:13px;height:13px;" />
            Fixo Recorrente
          </button>
        </div>

        {tipo === "parcelado" && (
          <div class="form-row form-row--2" style="align-items:flex-end;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="real-num-parc">Nº de Parcelas</label>
              <input
                id="real-num-parc"
                type="number"
                min="2"
                max="60"
                class="input"
                value={numRepeticoes}
                onInput={(e) =>
                  onChangeNumRepeticoes(Math.max(2, Math.min(60, parseInt(e.currentTarget.value, 10) || 2)))
                }
              />
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Modo do Valor</label>
              <div style="display:flex;gap:12px;align-items:center;min-height:36px;font-size:var(--fs-xs);">
                <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">
                  <input
                    type="radio"
                    name="real-dividir"
                    checked={dividirValor}
                    onChange={() => onChangeDividirValor(true)}
                  />
                  Dividir total
                </label>
                <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">
                  <input
                    type="radio"
                    name="real-dividir"
                    checked={!dividirValor}
                    onChange={() => onChangeDividirValor(false)}
                  />
                  Valor por parcela
                </label>
              </div>
            </div>
          </div>
        )}

        {tipo === "recorrente" && (
          <div class="form-row form-row--2" style="align-items:flex-end;">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="real-num-rec">Repetir por quantos meses?</label>
              <input
                id="real-num-rec"
                type="number"
                min="2"
                max="60"
                class="input"
                value={numRepeticoes}
                onInput={(e) =>
                  onChangeNumRepeticoes(Math.max(2, Math.min(60, parseInt(e.currentTarget.value, 10) || 2)))
                }
              />
            </div>
            <div style="display:flex;align-items:center;font-size:var(--fs-xs);color:var(--text-muted);min-height:36px;">
              Repetirá todo mês no mesmo dia de vencimento.
            </div>
          </div>
        )}
      </div>
    );
  }

  // Modo Projeção
  const {
    distribuicao,
    onChangeDistribuicao,
    mesInicioParcela,
    onChangeMesInicioParcela,
    numParcelas,
    onChangeNumParcelas,
    dividirValor,
    onChangeDividirValor,
    mesEspecifico,
    onChangeMesEspecifico,
    valoresMensais,
    onChangeValoresMensais,
    desabilitadoPorCalculado,
  } = props;

  if (desabilitadoPorCalculado) {
    return (
      <div style="font-size:var(--fs-xs);color:var(--text-muted);padding:8px 12px;background:var(--surface);border-radius:var(--r-sm);border:1px dashed var(--border);">
        ℹ️ Com valor <b>Calculado (Vínculo/Fórmula)</b>, a distribuição é gerada automaticamente mês a mês conforme os cálculos.
      </div>
    );
  }

  return (
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="segmented">
        <button
          type="button"
          class={`segmented__item ${distribuicao === "fixo" ? "segmented__item--active" : ""}`}
          onClick={() => onChangeDistribuicao("fixo")}
        >
          Fixo Mensal (12x)
        </button>
        <button
          type="button"
          class={`segmented__item ${distribuicao === "parcelado" ? "segmented__item--active" : ""}`}
          onClick={() => onChangeDistribuicao("parcelado")}
        >
          <Icon name="calendar" style="width:13px;height:13px;" />
          Parcelado
        </button>
        <button
          type="button"
          class={`segmented__item ${distribuicao === "especifico" ? "segmented__item--active" : ""}`}
          onClick={() => onChangeDistribuicao("especifico")}
        >
          Mês Pontual
        </button>
        <button
          type="button"
          class={`segmented__item ${distribuicao === "mensal" ? "segmented__item--active" : ""}`}
          onClick={() => onChangeDistribuicao("mensal")}
        >
          Grade Mês a Mês
        </button>
      </div>

      {distribuicao === "parcelado" && (
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div class="form-row form-row--2">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="proj-mes-ini">Mês da 1ª Parcela</label>
              <select
                id="proj-mes-ini"
                class="select"
                value={mesInicioParcela}
                onChange={(e) => onChangeMesInicioParcela(parseInt((e.currentTarget as HTMLSelectElement).value, 10))}
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="proj-num-parc">Nº de Parcelas</label>
              <input
                id="proj-num-parc"
                type="number"
                min="2"
                max="60"
                class="input"
                value={numParcelas}
                onInput={(e) =>
                  onChangeNumParcelas(Math.max(2, Math.min(60, parseInt(e.currentTarget.value, 10) || 2)))
                }
              />
            </div>
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Modo do Valor</label>
            <div style="display:flex;gap:14px;align-items:center;font-size:var(--fs-xs);">
              <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">
                <input
                  type="radio"
                  name="proj-dividir"
                  checked={dividirValor}
                  onChange={() => onChangeDividirValor(true)}
                />
                Dividir total pelas parcelas
              </label>
              <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">
                <input
                  type="radio"
                  name="proj-dividir"
                  checked={!dividirValor}
                  onChange={() => onChangeDividirValor(false)}
                />
                Valor informado por parcela
              </label>
            </div>
          </div>
        </div>
      )}

      {distribuicao === "especifico" && (
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label" for="proj-mes-esp">Mês do Lançamento Previsto</label>
          <select
            id="proj-mes-esp"
            class="select"
            value={mesEspecifico}
            onChange={(e) => onChangeMesEspecifico(parseInt((e.currentTarget as HTMLSelectElement).value, 10))}
          >
            {MONTHS.map((m, idx) => (
              <option key={m} value={idx}>{m}</option>
            ))}
          </select>
        </div>
      )}

      {distribuicao === "mensal" && (
        <div>
          <div class="form-label" style="margin-bottom:6px;">Valores Previstos Mês a Mês:</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(90px, 1fr));gap:6px;">
            {MONTHS.map((m, idx) => (
              <div key={m} style="display:flex;flex-direction:column;gap:2px;">
                <span style="font-size:0.68rem;font-weight:700;color:var(--text-muted);">{m}</span>
                <input
                  type="number"
                  step="0.01"
                  class="input"
                  style="min-height:30px;padding:2px 8px;font-size:var(--fs-xs);text-align:right;"
                  placeholder="0,00"
                  value={valoresMensais[idx] || ""}
                  onInput={(e) => {
                    const novos = [...valoresMensais];
                    novos[idx] = (e.currentTarget as HTMLInputElement).value;
                    onChangeValoresMensais(novos);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

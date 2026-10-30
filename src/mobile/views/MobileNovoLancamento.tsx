import { useState } from "react";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { anos, categorias, contas, contasBancarias, lancamentos } from "../../data/repo.ts";
import type { Conta, ContaBancaria, Natureza } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { digitsToCentavos, formatCentavosValor } from "../../lib/format.ts";
import { useSignal } from "../../lib/signal.ts";
import { anoAtivo, empresaAtiva } from "../../state.ts";

interface MobileNovoLancamentoProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialContaId?: string;
  initialValorCentavos?: number;
  initialData?: string;
  initialDescricao?: string;
}

export function MobileNovoLancamento({
  onSuccess,
  onCancel,
  initialContaId,
  initialValorCentavos,
  initialData,
  initialDescricao,
}: MobileNovoLancamentoProps) {
  const empId = useSignal(empresaAtiva);
  const anoNum = useSignal(anoAtivo);

  const [natureza, setNatureza] = useState<Natureza>("saida");
  const [centavos, setCentavos] = useState<number>(initialValorCentavos || 0);
  const [descricao, setDescricao] = useState<string>(initialDescricao || "");
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [contaId, setContaId] = useState<string>(initialContaId || "");
  const [bancoId, setBancoId] = useState<string>("");
  const [bancoDestinoId, setBancoDestinoId] = useState<string>("");
  const [isTransferencia, setIsTransferencia] = useState<boolean>(false);

  // Parcelamento / Repetição
  const [modoRepeticao, setModoRepeticao] = useState<"unico" | "parcelado">("unico");
  const [qtdParcelas, setQtdParcelas] = useState<number>(3);
  const [dividirValor, setDividirValor] = useState<boolean>(true);

  const [dataPreset, setDataPreset] = useState<"hoje" | "ontem" | "outro">(initialData ? "outro" : "hoje");
  const [dataCustom, setDataCustom] = useState<string>(() => {
    if (initialData) return initialData;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [obs, setObs] = useState<string>("");
  const [salvando, setSalvando] = useState<boolean>(false);

  // Carrega dados
  const dados = useLive(async () => {
    if (!empId) return null;
    const ano = await anos.find(empId, anoNum);
    if (!ano) return null;
    const [cs, cats, bancos] = await Promise.all([
      contas.byEmpresa(empId),
      categorias.byEmpresa(empId),
      contasBancarias.byEmpresa(empId),
    ]);
    return { ano, cs, cats, bancos };
  }, [empId, anoNum], null);

  const cs = dados?.cs || [];
  const cats = dados?.cats || [];
  const bancos = dados?.bancos || [];
  const ano = dados?.ano;

  // Filtra categorias e contas pela natureza selecionada
  const catsFiltradas = cats.filter((c) => c.natureza === natureza);
  const contasFiltradas = cs.filter((c) => {
    if (c.natureza !== natureza) return false;
    if (categoriaId && c.categoriaId !== categoriaId) return false;
    return true;
  });

  // Calcula data final
  const hoje = new Date();
  const formatarData = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const dataFinal = (() => {
    if (dataPreset === "hoje") return formatarData(hoje);
    if (dataPreset === "ontem") {
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      return formatarData(ontem);
    }
    return dataCustom;
  })();

  const displayValor = centavos > 0 ? formatCentavosValor(centavos) : "";

  const handleSalvar = async () => {
    if (!empId || !ano) {
      toast.warn("Empresa ou ano não configurado.");
      return;
    }
    if (centavos <= 0) {
      toast.warn("Informe um valor maior que zero.");
      return;
    }

    let finalContaId = contaId;
    if (!finalContaId && contasFiltradas.length > 0) {
      finalContaId = contasFiltradas[0].id;
    }

    if (!finalContaId) {
      toast.warn("Selecione ou cadastre uma conta para esta transação.");
      return;
    }

    const [yyyyStr, mmStr, ddStr] = (dataFinal || "").split("-");
    const anoBase = parseInt(yyyyStr, 10);
    const mesBase = parseInt(mmStr, 10) - 1;
    const diaBase = parseInt(ddStr, 10);

    try {
      setSalvando(true);

      if (modoRepeticao === "parcelado" && qtdParcelas > 1) {
        // Parcelamento em N vezes
        const valorPorParcela = dividirValor ? Math.round(centavos / qtdParcelas) : centavos;
        for (let i = 0; i < qtdParcelas; i++) {
          const dParcela = new Date(anoBase, mesBase + i, diaBase);
          const mesParcela = dParcela.getMonth();
          const dataParcelaStr = formatarData(dParcela);
          const descParcela = `${descricao.trim() || "Lançamento"} (${i + 1}/${qtdParcelas})`;

          await lancamentos.create({
            anoId: ano.id,
            contaId: finalContaId,
            mes: mesParcela,
            data: dataParcelaStr,
            valor: valorPorParcela,
            descricao: descParcela,
            bancoId: bancoId || undefined,
            bancoDestinoId: isTransferencia && bancoDestinoId ? bancoDestinoId : undefined,
            obs: obs.trim() || undefined,
          });
        }
        toast.success(`Compra parcelada em ${qtdParcelas}x registrada com sucesso!`);
      } else {
        // Lançamento Único
        await lancamentos.create({
          anoId: ano.id,
          contaId: finalContaId,
          mes: mesBase,
          data: dataFinal,
          valor: centavos,
          descricao: descricao.trim() || undefined,
          bancoId: bancoId || undefined,
          bancoDestinoId: isTransferencia && bancoDestinoId ? bancoDestinoId : undefined,
          obs: obs.trim() || undefined,
        });
        toast.success(natureza === "receber" || natureza === "aporte" ? "Receita registrada!" : "Gasto registrado com sucesso!");
      }

      onSuccess();
    } catch (e) {
      toast.error("Erro ao registrar lançamento: " + (e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style="display:flex;flex-direction:column;min-height:calc(100dvh - 120px);padding-bottom:80px;">
      {/* Top Header do Fluxo */}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <button
          type="button"
          class="btn btn--ghost btn--icon"
          onClick={onCancel}
          aria-label="Voltar"
        >
          <Icon name="arrowLeft" />
        </button>
        <h2 style="font-size:1rem;font-weight:800;margin:0;color:var(--text);">
          Nova Transação
        </h2>
        <div style="width:36px;" />
      </div>

      {/* 1. Seletor de Natureza (Despesa / Receita / Aporte) */}
      <div class="mobile-segmented" style="grid-template-columns:1fr 1fr;margin-bottom:10px;">
        <button
          type="button"
          class={`mobile-segmented__btn ${natureza === "saida" ? "is-active-out" : ""}`}
          onClick={() => {
            setNatureza("saida");
            setCategoriaId("");
            setContaId("");
          }}
        >
          <Icon name="arrowUp" style="width:15px;height:15px;" /> Despesa
        </button>
        <button
          type="button"
          class={`mobile-segmented__btn ${natureza === "receber" ? "is-active-in" : ""}`}
          onClick={() => {
            setNatureza("receber");
            setCategoriaId("");
            setContaId("");
          }}
        >
          <Icon name="arrowDown" style="width:15px;height:15px;" /> Receita
        </button>
      </div>

      {/* 2. Display de Valor */}
      <div class="mobile-amount-box" style="margin-bottom:12px;">
        <span class="mobile-amount-box__label">
          {natureza === "receber" ? "Valor da Receita" : "Valor do Gasto"}
        </span>
        <div class="mobile-amount-box__input-row">
          <span class="mobile-amount-box__currency">R$</span>
          <input
            type="text"
            inputMode="numeric"
            class="mobile-amount-box__input"
            placeholder="0,00"
            value={displayValor}
            onChange={(e) => {
              const val = (e.currentTarget as HTMLInputElement).value;
              setCentavos(digitsToCentavos(val));
            }}
            autoFocus
          />
        </div>
      </div>

      {/* 3. Descrição */}
      <div style="margin-bottom:12px;">
        <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;display:block;">
          Descrição
        </label>
        <input
          type="text"
          class="input"
          placeholder="Ex: Mercado, Aluguel, Combustível, Salário..."
          value={descricao}
          onInput={(e) => setDescricao((e.currentTarget as HTMLInputElement).value)}
          style="border-radius:12px;min-height:42px;font-size:0.85rem;"
        />
      </div>

      {/* 4. Escolha da Categoria */}
      <div style="margin-bottom:12px;">
        <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;display:block;">
          Categoria
        </label>
        <div class="hscroll" style="gap:4px;padding-bottom:2px;">
          {catsFiltradas.map((cat) => {
            const isSelected = categoriaId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                class={`chip ${isSelected ? "is-active" : ""}`}
                onClick={() => {
                  setCategoriaId(isSelected ? "" : cat.id);
                  setContaId("");
                }}
              >
                <span>{cat.nome}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Escolha da Conta / Subcategoria */}
      {contasFiltradas.length > 0 && (
        <div style="margin-bottom:12px;">
          <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;display:block;">
            Conta
          </label>
          <div class="hscroll" style="gap:4px;padding-bottom:2px;">
            {contasFiltradas.map((c) => {
              const isSelected = contaId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  class={`chip ${isSelected ? "is-active" : ""}`}
                  onClick={() => setContaId(isSelected ? "" : c.id)}
                >
                  <span>{c.nome}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Modo de Repetição / Parcelamento */}
      <div style="margin-bottom:12px;">
        <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;display:block;">
          Repetição / Parcelas
        </label>
        <div class="mobile-segmented" style="margin-bottom:6px;">
          <button
            type="button"
            class={`mobile-segmented__btn ${modoRepeticao === "unico" ? "is-active" : ""}`}
            onClick={() => setModoRepeticao("unico")}
          >
            Lançamento Único
          </button>
          <button
            type="button"
            class={`mobile-segmented__btn ${modoRepeticao === "parcelado" ? "is-active" : ""}`}
            onClick={() => setModoRepeticao("parcelado")}
          >
            Parcelado em N vezes
          </button>
        </div>

        {modoRepeticao === "parcelado" && (
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:0.78rem;font-weight:700;">Número de Parcelas:</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  onClick={() => setQtdParcelas((p) => Math.max(2, p - 1))}
                >
                  -
                </button>
                <strong style="font-size:0.95rem;width:24px;text-align:center;">{qtdParcelas}x</strong>
                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  onClick={() => setQtdParcelas((p) => Math.min(24, p + 1))}
                >
                  +
                </button>
              </div>
            </div>

            <div style="display:flex;gap:6px;">
              <button
                type="button"
                class={`chip ${dividirValor ? "is-active" : ""}`}
                style="flex:1;justify-content:center;"
                onClick={() => setDividirValor(true)}
              >
                Dividir valor total
              </button>
              <button
                type="button"
                class={`chip ${!dividirValor ? "is-active" : ""}`}
                style="flex:1;justify-content:center;"
                onClick={() => setDividirValor(false)}
              >
                Valor fixo p/ parcela
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 7. Data da Transação */}
      <div style="margin-bottom:12px;">
        <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;display:block;">
          Data
        </label>
        <div style="display:flex;gap:6px;">
          <button
            type="button"
            class={`mobile-choice-chip ${dataPreset === "hoje" ? "is-selected" : ""}`}
            style="flex:1;justify-content:center;min-height:34px;font-size:0.78rem;"
            onClick={() => setDataPreset("hoje")}
          >
            Hoje
          </button>
          <button
            type="button"
            class={`mobile-choice-chip ${dataPreset === "ontem" ? "is-selected" : ""}`}
            style="flex:1;justify-content:center;min-height:34px;font-size:0.78rem;"
            onClick={() => setDataPreset("ontem")}
          >
            Ontem
          </button>
          <button
            type="button"
            class={`mobile-choice-chip ${dataPreset === "outro" ? "is-selected" : ""}`}
            style="flex:1;justify-content:center;min-height:34px;font-size:0.78rem;"
            onClick={() => setDataPreset("outro")}
          >
            Outra data
          </button>
        </div>

        {dataPreset === "outro" && (
          <input
            type="date"
            class="input"
            value={dataCustom}
            onChange={(e) => setDataCustom((e.currentTarget as HTMLInputElement).value)}
            style="margin-top:6px;border-radius:12px;min-height:40px;font-size:0.85rem;"
          />
        )}
      </div>

      {/* 8. Banco / Conta Bancária */}
      {bancos.length > 0 && (
        <div style="margin-bottom:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin:0;">
              Banco / Forma de Pagamento
            </label>
            {bancos.length > 1 && (
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                style="padding:0;font-size:0.70rem;height:auto;color:var(--primary);"
                onClick={() => setIsTransferencia(!isTransferencia)}
              >
                {isTransferencia ? "Lançamento Normal" : "+ Transferência"}
              </button>
            )}
          </div>

          <div class="hscroll" style="gap:4px;padding-bottom:2px;">
            {bancos.map((b) => {
              const isSelected = bancoId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  class={`chip ${isSelected ? "is-active" : ""}`}
                  onClick={() => setBancoId(isSelected ? "" : b.id)}
                >
                  <Icon name="bank" style="width:12px;height:12px;" />
                  <span>{b.nome}</span>
                </button>
              );
            })}
          </div>

          {/* Banco Destino se for Transferência */}
          {isTransferencia && (
            <div style="margin-top:8px;">
              <label class="form-label" style="font-size:0.70rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;display:block;">
                Banco de Destino
              </label>
              <select
                class="select"
                value={bancoDestinoId}
                onChange={(e) => setBancoDestinoId((e.currentTarget as HTMLSelectElement).value)}
                style="border-radius:12px;min-height:40px;font-size:0.80rem;"
              >
                <option value="">Selecione o banco de destino...</option>
                {bancos
                  .filter((b) => b.id !== bancoId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* 9. Observação Opcional */}
      <div style="margin-bottom:24px;">
        <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;display:block;">
          Observação (Opcional)
        </label>
        <input
          type="text"
          class="input"
          placeholder="Ex: Pago via Pix, nota fiscal, etc."
          value={obs}
          onInput={(e) => setObs((e.currentTarget as HTMLInputElement).value)}
          style="border-radius:12px;min-height:40px;font-size:0.80rem;"
        />
      </div>

      {/* 10. Botão Fixo de Confirmação na Base */}
      <div class="mobile-bottom-bar">
        <button
          type="button"
          class="mobile-cta-btn"
          disabled={salvando || centavos <= 0}
          onClick={handleSalvar}
        >
          <Icon name="check" />
          <span>{salvando ? "Salvando..." : `Confirmar ${natureza === "receber" ? "Receita" : "Gasto"}`}</span>
        </button>
      </div>
    </div>
  );
}

import { useState } from "preact/hooks";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { anos, categorias, contas, contasBancarias, lancamentos } from "../../data/repo.ts";
import type { Conta, ContaBancaria, Natureza } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { anoAtivo, empresaAtiva } from "../../state.ts";

interface MobileNovoLancamentoProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function MobileNovoLancamento({ onSuccess, onCancel }: MobileNovoLancamentoProps) {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  const [natureza, setNatureza] = useState<Natureza>("saida");
  const [valorStr, setValorStr] = useState<string>("");
  const [descricao, setDescricao] = useState<string>("");
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [contaId, setContaId] = useState<string>("");
  const [bancoId, setBancoId] = useState<string>("");
  const [dataPreset, setDataPreset] = useState<"hoje" | "ontem" | "outro">("hoje");
  const [dataCustom, setDataCustom] = useState<string>(() => {
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

  // Formatação de valor em centavos
  const centavos = (() => {
    const limpo = valorStr.replace(/\D/g, "");
    return limpo ? parseInt(limpo, 10) : 0;
  })();

  const valorFormatado = (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

    const mes = parseInt(dataFinal.split("-")[1], 10) - 1;

    try {
      setSalvando(true);
      await lancamentos.create({
        anoId: ano.id,
        contaId: finalContaId,
        mes,
        data: dataFinal,
        valor: centavos,
        descricao: descricao.trim() || undefined,
        bancoId: bancoId || undefined,
        obs: obs.trim() || undefined,
      });

      toast.success(natureza === "receber" || natureza === "aporte" ? "Receita registrada!" : "Gasto registrado com sucesso!");
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
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <button
          type="button"
          class="btn btn--ghost btn--icon"
          onClick={onCancel}
          aria-label="Voltar"
        >
          <Icon name="arrowLeft" />
        </button>
        <h2 style="font-size:1.05rem;font-weight:800;margin:0;color:var(--text);">
          Nova Transação
        </h2>
        <div style="width:36px;" />
      </div>

      {/* 1. Seletor de Natureza (Despesa / Receita) */}
      <div class="mobile-segmented">
        <button
          type="button"
          class={`mobile-segmented__btn ${natureza === "saida" ? "is-active-out" : ""}`}
          onClick={() => {
            setNatureza("saida");
            setCategoriaId("");
            setContaId("");
          }}
        >
          <Icon name="arrowUp" style="width:16px;height:16px;" /> Despesa
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
          <Icon name="arrowDown" style="width:16px;height:16px;" /> Receita
        </button>
      </div>

      {/* 2. Display de Valor Gigante */}
      <div class="mobile-amount-box">
        <span class="mobile-amount-box__label">
          {natureza === "receber" ? "Valor a Receber" : "Valor a Pagar"}
        </span>
        <div class="mobile-amount-box__input-row">
          <span class="mobile-amount-box__currency">R$</span>
          <input
            type="text"
            inputMode="numeric"
            class="mobile-amount-box__input"
            placeholder="0,00"
            value={valorFormatado}
            onInput={(e) => {
              const val = (e.currentTarget as HTMLInputElement).value;
              setValorStr(val);
            }}
            autoFocus
          />
        </div>
      </div>

      {/* 3. Descrição Curta */}
      <div style="margin-bottom:16px;">
        <label class="form-label" style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;display:block;">
          Descrição (Opcional)
        </label>
        <input
          type="text"
          class="input"
          placeholder="Ex: Mercado, Aluguel, Salário, Internet..."
          value={descricao}
          onInput={(e) => setDescricao((e.currentTarget as HTMLInputElement).value)}
          style="border-radius:14px;min-height:46px;"
        />
      </div>

      {/* 4. Escolha da Categoria */}
      <div style="margin-bottom:16px;">
        <label class="form-label" style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;display:block;">
          Categoria
        </label>
        <div class="mobile-pill-grid">
          {catsFiltradas.map((cat) => {
            const isSelected = categoriaId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                class={`mobile-choice-chip ${isSelected ? "is-selected" : ""}`}
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
        <div style="margin-bottom:16px;">
          <label class="form-label" style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;display:block;">
            Conta Específica
          </label>
          <div class="mobile-pill-grid">
            {contasFiltradas.map((c) => {
              const isSelected = contaId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  class={`mobile-choice-chip ${isSelected ? "is-selected" : ""}`}
                  onClick={() => setContaId(isSelected ? "" : c.id)}
                >
                  <span>{c.nome}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Data da Transação */}
      <div style="margin-bottom:16px;">
        <label class="form-label" style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;display:block;">
          Data
        </label>
        <div style="display:flex;gap:8px;">
          <button
            type="button"
            class={`mobile-choice-chip ${dataPreset === "hoje" ? "is-selected" : ""}`}
            style="flex:1;justify-content:center;"
            onClick={() => setDataPreset("hoje")}
          >
            Hoje
          </button>
          <button
            type="button"
            class={`mobile-choice-chip ${dataPreset === "ontem" ? "is-selected" : ""}`}
            style="flex:1;justify-content:center;"
            onClick={() => setDataPreset("ontem")}
          >
            Ontem
          </button>
          <button
            type="button"
            class={`mobile-choice-chip ${dataPreset === "outro" ? "is-selected" : ""}`}
            style="flex:1;justify-content:center;"
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
            style="margin-top:8px;border-radius:14px;min-height:44px;"
          />
        )}
      </div>

      {/* 7. Banco / Instituição Financeira */}
      {bancos.length > 0 && (
        <div style="margin-bottom:16px;">
          <label class="form-label" style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;display:block;">
            Banco / Forma de Pagamento
          </label>
          <div class="mobile-pill-grid">
            {bancos.map((b) => {
              const isSelected = bancoId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  class={`mobile-choice-chip ${isSelected ? "is-selected" : ""}`}
                  onClick={() => setBancoId(isSelected ? "" : b.id)}
                >
                  <Icon name="bank" style="width:14px;height:14px;" />
                  <span>{b.nome}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 8. Botão Fixo de Confirmação na Base */}
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

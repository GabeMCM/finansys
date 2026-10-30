import { useState } from "react";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { anos, categorias, contas, contasBancarias, lancamentos, reservas, reservaMovimentos } from "../../data/repo.ts";
import { FORMAS_PAGAMENTO_PADRAO, type Conta, type ContaBancaria, type Natureza, type Reserva } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { digitsToCentavos, formatCentavosValor, money } from "../../lib/format.ts";
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
  const [formaPagamento, setFormaPagamento] = useState<string>("PIX");
  const [reservaId, setReservaId] = useState<string>("");

  // Parcelamento / Recorrência
  const [modoRepeticao, setModoRepeticao] = useState<"unico" | "parcelado" | "recorrente">("unico");
  const [qtdParcelas, setQtdParcelas] = useState<number>(3);
  const [qtdRecorrencias, setQtdRecorrencias] = useState<number>(6);
  const [dividirValor, setDividirValor] = useState<boolean>(true);

  const [dataPreset, setDataPreset] = useState<"hoje" | "ontem" | "primeiro_mes" | "outro">(initialData ? "outro" : "hoje");
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
    const [cs, cats, bancos, resList] = await Promise.all([
      contas.byEmpresa(empId),
      categorias.byEmpresa(empId),
      contasBancarias.byEmpresa(empId),
      reservas.byEmpresa(empId),
    ]);
    return { ano, cs, cats, bancos, resList };
  }, [empId, anoNum], null);

  const cs = dados?.cs || [];
  const cats = dados?.cats || [];
  const bancos = dados?.bancos || [];
  const resList = dados?.resList || [];
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
    if (dataPreset === "primeiro_mes") {
      const d1 = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      return formatarData(d1);
    }
    return dataCustom;
  })();

  const displayValor = centavos > 0 ? formatCentavosValor(centavos) : "";
  const reservaSelecionada = resList.find((r) => r.id === reservaId);

  const handleSalvar = async (criarOutro = false) => {
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

    const tipoRes = reservaId
      ? (natureza === "saida" || natureza === "pagar" ? "aporte" : "resgate")
      : undefined;

    try {
      setSalvando(true);

      if (modoRepeticao === "parcelado" && qtdParcelas > 1) {
        // 1. Compra Parcelada em N vezes
        const valorPorParcela = dividirValor ? Math.round(centavos / qtdParcelas) : centavos;
        for (let i = 0; i < qtdParcelas; i++) {
          const dParcela = new Date(anoBase, mesBase + i, diaBase);
          const mesParcela = dParcela.getMonth();
          const dataParcelaStr = formatarData(dParcela);
          const descParcela = `${descricao.trim() || "Lançamento"} (${i + 1}/${qtdParcelas})`;

          const novoLanc = await lancamentos.create({
            anoId: ano.id,
            contaId: finalContaId,
            mes: mesParcela,
            data: dataParcelaStr,
            valor: valorPorParcela,
            descricao: descParcela,
            parcela: i + 1,
            totalParcelas: qtdParcelas,
            bancoId: bancoId || undefined,
            bancoDestinoId: isTransferencia && bancoDestinoId ? bancoDestinoId : undefined,
            formaPagamento: formaPagamento || undefined,
            reservaId: reservaId || undefined,
            tipoReserva: tipoRes,
            obs: obs.trim() || undefined,
          });

          // Sincroniza movimento na carteira de reservas se vinculado
          if (reservaId && tipoRes) {
            await reservaMovimentos.create({
              empresaId: empId,
              anoId: ano.id,
              reservaId,
              tipo: tipoRes,
              valor: valorPorParcela,
              data: dataParcelaStr,
              mes: mesParcela,
              contaId: finalContaId,
              bancoId: bancoId || undefined,
              lancamentoId: novoLanc.id,
              obs: descParcela,
            });
          }
        }
        toast.success(`Compra parcelada em ${qtdParcelas}x de ${money(valorPorParcela)} registrada!`);
      } else if (modoRepeticao === "recorrente" && qtdRecorrencias > 1) {
        // 2. Fixo Recorrente Mensal (repetir por N meses)
        const recorrenciaId = crypto.randomUUID();
        for (let i = 0; i < qtdRecorrencias; i++) {
          const dRec = new Date(anoBase, mesBase + i, diaBase);
          const mesRec = dRec.getMonth();
          const dataRecStr = formatarData(dRec);
          const descRec = descricao.trim() || "Fixo Recorrente";

          const novoLanc = await lancamentos.create({
            anoId: ano.id,
            contaId: finalContaId,
            mes: mesRec,
            data: dataRecStr,
            valor: centavos,
            descricao: descRec,
            recorrenciaId,
            bancoId: bancoId || undefined,
            bancoDestinoId: isTransferencia && bancoDestinoId ? bancoDestinoId : undefined,
            formaPagamento: formaPagamento || undefined,
            reservaId: reservaId || undefined,
            tipoReserva: tipoRes,
            obs: obs.trim() || undefined,
          });

          if (reservaId && tipoRes) {
            await reservaMovimentos.create({
              empresaId: empId,
              anoId: ano.id,
              reservaId,
              tipo: tipoRes,
              valor: centavos,
              data: dataRecStr,
              mes: mesRec,
              contaId: finalContaId,
              bancoId: bancoId || undefined,
              lancamentoId: novoLanc.id,
              obs: descRec,
            });
          }
        }
        toast.success(`Lançamento recorrente por ${qtdRecorrencias} meses registrado!`);
      } else {
        // 3. Lançamento Único
        const novoLanc = await lancamentos.create({
          anoId: ano.id,
          contaId: finalContaId,
          mes: mesBase,
          data: dataFinal,
          valor: centavos,
          descricao: descricao.trim() || undefined,
          bancoId: bancoId || undefined,
          bancoDestinoId: isTransferencia && bancoDestinoId ? bancoDestinoId : undefined,
          formaPagamento: formaPagamento || undefined,
          reservaId: reservaId || undefined,
          tipoReserva: tipoRes,
          obs: obs.trim() || undefined,
        });

        if (reservaId && tipoRes) {
          await reservaMovimentos.create({
            empresaId: empId,
            anoId: ano.id,
            reservaId,
            tipo: tipoRes,
            valor: centavos,
            data: dataFinal,
            mes: mesBase,
            contaId: finalContaId,
            bancoId: bancoId || undefined,
            lancamentoId: novoLanc.id,
            obs: descricao.trim() || undefined,
          });
        }
        toast.success(natureza === "receber" || natureza === "aporte" ? "Receita registrada!" : "Gasto registrado com sucesso!");
      }

      if (criarOutro) {
        setCentavos(0);
        setDescricao("");
        setObs("");
      } else {
        onSuccess();
      }
    } catch (e) {
      toast.error("Erro ao registrar lançamento: " + (e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style="display:flex;flex-direction:column;min-height:calc(100dvh - 120px);padding-bottom:90px;">
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

      {/* 1. Seletor de Natureza (Despesa / Receita) */}
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

      {/* 6. Modo de Repetição (Único / Parcelado / Recorrente) */}
      <div style="margin-bottom:12px;">
        <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;display:block;">
          Repetição / Parcelamento
        </label>
        <div class="mobile-segmented" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:6px;">
          <button
            type="button"
            class={`mobile-segmented__btn ${modoRepeticao === "unico" ? "is-active" : ""}`}
            onClick={() => setModoRepeticao("unico")}
          >
            Único
          </button>
          <button
            type="button"
            class={`mobile-segmented__btn ${modoRepeticao === "parcelado" ? "is-active" : ""}`}
            onClick={() => setModoRepeticao("parcelado")}
          >
            Parcelado
          </button>
          <button
            type="button"
            class={`mobile-segmented__btn ${modoRepeticao === "recorrente" ? "is-active" : ""}`}
            onClick={() => setModoRepeticao("recorrente")}
          >
            Recorrente
          </button>
        </div>

        {modoRepeticao === "parcelado" && (
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:0.78rem;font-weight:700;">Nº de Parcelas:</span>
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
                style="flex:1;justify-content:center;font-size:0.72rem;"
                onClick={() => setDividirValor(true)}
              >
                Dividir valor total
              </button>
              <button
                type="button"
                class={`chip ${!dividirValor ? "is-active" : ""}`}
                style="flex:1;justify-content:center;font-size:0.72rem;"
                onClick={() => setDividirValor(false)}
              >
                Valor fixo p/ parcela
              </button>
            </div>
          </div>
        )}

        {modoRepeticao === "recorrente" && (
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:0.78rem;font-weight:700;">Repetir por quantos meses?</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  onClick={() => setQtdRecorrencias((r) => Math.max(2, r - 1))}
                >
                  -
                </button>
                <strong style="font-size:0.95rem;width:24px;text-align:center;">{qtdRecorrencias}m</strong>
                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  onClick={() => setQtdRecorrencias((r) => Math.min(60, r + 1))}
                >
                  +
                </button>
              </div>
            </div>
            <span style="font-size:0.70rem;color:var(--text-muted);">
              Cria {qtdRecorrencias} lançamentos mensais automáticos no mesmo dia de vencimento.
            </span>
          </div>
        )}
      </div>

      {/* 7. Data da Transação com Atalhos Rápidos */}
      <div style="margin-bottom:12px;">
        <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;display:block;">
          Data do Lançamento
        </label>
        <div style="display:flex;gap:4px;">
          <button
            type="button"
            class={`mobile-choice-chip ${dataPreset === "hoje" ? "is-selected" : ""}`}
            style="flex:1;justify-content:center;min-height:34px;font-size:0.74rem;"
            onClick={() => setDataPreset("hoje")}
          >
            Hoje
          </button>
          <button
            type="button"
            class={`mobile-choice-chip ${dataPreset === "ontem" ? "is-selected" : ""}`}
            style="flex:1;justify-content:center;min-height:34px;font-size:0.74rem;"
            onClick={() => setDataPreset("ontem")}
          >
            Ontem
          </button>
          <button
            type="button"
            class={`mobile-choice-chip ${dataPreset === "primeiro_mes" ? "is-selected" : ""}`}
            style="flex:1;justify-content:center;min-height:34px;font-size:0.74rem;"
            onClick={() => setDataPreset("primeiro_mes")}
          >
            1º do Mês
          </button>
          <button
            type="button"
            class={`mobile-choice-chip ${dataPreset === "outro" ? "is-selected" : ""}`}
            style="flex:1;justify-content:center;min-height:34px;font-size:0.74rem;"
            onClick={() => setDataPreset("outro")}
          >
            Outra
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

      {/* 8. Forma de Pagamento */}
      <div style="margin-bottom:12px;">
        <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;display:block;">
          Forma de Pagamento
        </label>
        <div class="hscroll" style="gap:4px;padding-bottom:2px;">
          {FORMAS_PAGAMENTO_PADRAO.map((f) => {
            const isSel = formaPagamento === f;
            return (
              <button
                key={f}
                type="button"
                class={`chip ${isSel ? "is-active" : ""}`}
                onClick={() => setFormaPagamento(isSel ? "" : f)}
              >
                <span>{f}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 9. Banco / Instituição */}
      {bancos.length > 0 && (
        <div style="margin-bottom:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin:0;">
              Banco Liquidante
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

      {/* 10. Vínculo com Caixinha / Reserva */}
      {resList.length > 0 && (
        <div style="margin-bottom:12px;">
          <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;display:block;">
            Vínculo com Caixinha / Reserva (Opcional)
          </label>
          <div class="hscroll" style="gap:4px;padding-bottom:2px;">
            <button
              type="button"
              class={`chip ${!reservaId ? "is-active" : ""}`}
              onClick={() => setReservaId("")}
            >
              <span>Nenhuma Caixinha</span>
            </button>
            {resList.map((r) => {
              const isSelected = reservaId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  class={`chip ${isSelected ? "is-active" : ""}`}
                  onClick={() => setReservaId(isSelected ? "" : r.id)}
                >
                  <Icon name="wallet" style="width:12px;height:12px;" />
                  <span>{r.nome}</span>
                </button>
              );
            })}
          </div>

          {reservaSelecionada && (
            <div
              style={{
                marginTop: "6px",
                padding: "8px 10px",
                borderRadius: "10px",
                background: "var(--surface-soft)",
                fontSize: "0.72rem",
                color: "var(--text-muted)",
              }}
            >
              💡 Este lançamento registrará um{" "}
              <strong style={{ color: natureza === "saida" ? "var(--in)" : "var(--out)" }}>
                {natureza === "saida" ? "Aporte (+)" : "Resgate (−)"}
              </strong>{" "}
              na caixinha <strong>{reservaSelecionada.nome}</strong>.
            </div>
          )}
        </div>
      )}

      {/* 11. Observação Opcional */}
      <div style="margin-bottom:24px;">
        <label class="form-label" style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;display:block;">
          Observação (Opcional)
        </label>
        <input
          type="text"
          class="input"
          placeholder="Ex: Nota fiscal, detalhes, justificativa..."
          value={obs}
          onInput={(e) => setObs((e.currentTarget as HTMLInputElement).value)}
          style="border-radius:12px;min-height:40px;font-size:0.80rem;"
        />
      </div>

      {/* 12. Barra Inferior com Salvar e Criar Outro / Confirmar */}
      <div class="mobile-bottom-bar" style="display:flex;gap:8px;">
        <button
          type="button"
          class="btn btn--secondary"
          style="flex:1;min-height:46px;border-radius:14px;font-weight:700;font-size:0.82rem;"
          disabled={salvando || centavos <= 0}
          onClick={() => handleSalvar(true)}
        >
          Salvar e Criar Outro
        </button>
        <button
          type="button"
          class="mobile-cta-btn"
          style="flex:1.4;"
          disabled={salvando || centavos <= 0}
          onClick={() => handleSalvar(false)}
        >
          <Icon name="check" />
          <span>{salvando ? "Salvando..." : `Confirmar ${natureza === "receber" ? "Receita" : "Gasto"}`}</span>
        </button>
      </div>
    </div>
  );
}

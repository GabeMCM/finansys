import { useState } from "preact/hooks";
import { CustomSelect } from "../components/CustomSelect.tsx";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/Modal.tsx";
import { ModalAuth } from "../components/ModalAuth.tsx";
import { ModalConfirm, confirmarAcao } from "../components/ModalConfirm.tsx";
import { ModalReplicacao } from "../components/ModalReplicacao.tsx";
import { toast } from "../components/Toast.tsx";
import { MoneyInput } from "../components/lancamento/MoneyInput.tsx";
import { dumpDatabase, restoreDatabase } from "../data/backup.ts";
import { atualizarNomePerfil, cloudSyncStatus, cloudUltimoBackup, cloudUser, desconectarConta, enviarBackupNuvem, puxarBackupNuvem } from "../data/cloudSync.ts";
import { getInactivityTimeout, inactivityTimeoutSignal, lockScreenNow, setInactivityTimeout } from "../data/inactivityGuard.ts";
import { anos, categorias, contas, contasBancarias, empresas, projecoes } from "../data/repo.ts";
import { calcularBaseProjecoes, calcularValorVinculado } from "../data/calc.ts";
import { seedExemplo } from "../data/seed.ts";
import { type Ano, type Categoria, type Conta, type ContaBancaria, type Empresa, type Natureza, NATUREZAS, type RegraVinculo, type ModoVinculo } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { formatCpfCnpj, labelCpfCnpj, money } from "../lib/format.ts";
import { avaliarFormula, calcularFormulaProjecoes, extrairVariaveis } from "../lib/formula.ts";
import { NATURE_META } from "../lib/natureza.ts";
import { anoAtivo, applyTheme, empresaAtiva, setAno, setEmpresa, theme } from "../state.ts";

export function Ajustes() {
  const [tab, setTab] = useState<"empresas" | "anos" | "contas" | "bancos" | "sistema">("empresas");

  // Estados dos modais de Empresa
  const [modalEmpresa, setModalEmpresa] = useState<Partial<Empresa> | null>(null);

  // Estados dos modais de Ano
  const [modalAno, setModalAno] = useState<Partial<Ano> | null>(null);
  const [replicarAno, setReplicarAno] = useState<Ano | null>(null);

  // Estados dos modais de Categoria e Conta
  const [natTab, setNatTab] = useState<Natureza>("pagar");
  const [modalCat, setModalCat] = useState<Partial<Categoria> | null>(null);
  const [modalConta, setModalConta] = useState<Partial<Conta> | null>(null);

  // Estados dos modais de Conta Bancária (Bancos)
  const [modalBanco, setModalBanco] = useState<Partial<ContaBancaria> | null>(null);

  // Estado de Autenticação / Finansys Cloud Vault
  const [modalAuthAberto, setModalAuthAberto] = useState(false);
  const [modalEditarNomePerfil, setModalEditarNomePerfil] = useState<string | null>(null);

  // Live data
  const empId = empresaAtiva.value;
  const listaEmpresas = useLive(() => empresas.list(), [], []);
  const listaAnos = useLive(() => (empId ? anos.byEmpresa(empId) : Promise.resolve([])), [empId], []);
  const listaCats = useLive(() => (empId ? categorias.byEmpresa(empId, natTab) : Promise.resolve([])), [empId, natTab], []);
  const listaContas = useLive(() => (empId ? contas.byEmpresa(empId, natTab) : Promise.resolve([])), [empId, natTab], []);
  const listaBancos = useLive(() => (empId ? contasBancarias.byEmpresa(empId) : Promise.resolve([])), [empId], []);
  const todasContasEmpresa = useLive(() => (empId ? contas.byEmpresa(empId) : Promise.resolve([])), [empId], []);
  const todasCategoriasEmpresa = useLive(() => (empId ? categorias.byEmpresa(empId) : Promise.resolve([])), [empId], []);

  const getNomeOrigemVinculo = (v?: RegraVinculo) => {
    if (!v) return "";
    if (v.tipo === "conta") {
      const c = todasContasEmpresa.find((x) => x.id === v.origemId);
      return c ? c.nome : "Conta";
    }
    const cat = todasCategoriasEmpresa.find((x) => x.id === v.origemId);
    return cat ? cat.nome : "Categoria";
  };

  const getBadgeVinculo = (v?: RegraVinculo) => {
    if (!v) return null;
    if (v.modo === "formula" && v.formula) {
      return (
        <span
          class="badge"
          style="font-size:11px;background:var(--primary-soft);color:var(--primary);display:inline-flex;align-items:center;gap:4px;"
          title={`Fórmula: ${v.formula}`}
        >
          <span style="font-weight:700;font-size:10px;">fx</span>
          {v.formula.length > 25 ? `${v.formula.slice(0, 25)}...` : v.formula}
        </span>
      );
    }
    const nome = getNomeOrigemVinculo(v);
    const label = v.percentual !== undefined ? `${v.percentual}% de ${nome}` : `${money(v.valorFixo || 0)} de ${nome}`;
    return (
      <span
        class="badge"
        style="font-size:11px;background:var(--primary-soft);color:var(--primary);display:inline-flex;align-items:center;gap:4px;"
        title={`Vinculado a ${v.tipo === "conta" ? "conta" : "categoria"}: ${nome}`}
      >
        <Icon name="link" style="width:12px;height:12px;" />
        {label}
      </span>
    );
  };

  // Salvar Empresa
  const salvarEmpresa = async (e: Event) => {
    e.preventDefault();
    if (!modalEmpresa || !modalEmpresa.nome?.trim()) return;
    if (modalEmpresa.id) {
      await empresas.update(modalEmpresa.id, {
        nome: modalEmpresa.nome.trim(),
        cnpj: modalEmpresa.cnpj?.trim() || "",
        endereco: modalEmpresa.endereco?.trim() || "",
        logo: modalEmpresa.logo || "",
      });
    } else {
      const criada = await empresas.create({
        nome: modalEmpresa.nome.trim(),
        cnpj: modalEmpresa.cnpj?.trim() || "",
        endereco: modalEmpresa.endereco?.trim() || "",
        logo: modalEmpresa.logo || "",
      });
      if (!empresaAtiva.value) setEmpresa(criada.id);
    }
    setModalEmpresa(null);
  };

  // Salvar Ano
  const salvarAno = async (e: Event) => {
    e.preventDefault();
    if (!empId || !modalAno || !modalAno.ano) return;
    const bancaCentavos = Math.round(Number(modalAno.bancaInicial || 0) * 100);
    if (modalAno.id) {
      await anos.update(modalAno.id, { bancaInicial: bancaCentavos });
    } else {
      const existe = await anos.find(empId, Number(modalAno.ano));
      if (existe) {
        toast.warn(`O ano ${modalAno.ano} já está cadastrado para esta empresa.`);
        return;
      }
      const criado = await anos.create({
        empresaId: empId,
        ano: Number(modalAno.ano),
        bancaInicial: bancaCentavos,
      });
      setAno(criado.ano);
    }
    setModalAno(null);
  };

  // Salvar Categoria
  const salvarCat = async (e: Event) => {
    e.preventDefault();
    if (!empId || !modalCat || !modalCat.nome?.trim()) return;
    if (modalCat.id) {
      await categorias.update(modalCat.id, { nome: modalCat.nome.trim() });
    } else {
      await categorias.create({
        empresaId: empId,
        natureza: natTab,
        nome: modalCat.nome.trim(),
      });
    }
    setModalCat(null);
  };

  // Salvar Conta
  const salvarConta = async (e: Event) => {
    e.preventDefault();
    if (!empId || !modalConta || !modalConta.nome?.trim() || !modalConta.categoriaId) return;

    let vinculoPayload: RegraVinculo | undefined = undefined;
    if (modalConta.vinculo) {
      if (modalConta.vinculo.modo === "formula") {
        if (modalConta.vinculo.formula?.trim()) {
          vinculoPayload = {
            modo: "formula",
            formula: modalConta.vinculo.formula.trim(),
          };
        }
      } else if (modalConta.vinculo.origemId) {
        vinculoPayload = {
          modo: "simples",
          tipo: modalConta.vinculo.tipo || "conta",
          origemId: modalConta.vinculo.origemId,
          percentual: modalConta.vinculo.percentual !== undefined ? Number(modalConta.vinculo.percentual) : undefined,
          valorFixo: modalConta.vinculo.valorFixo !== undefined ? Math.round(Number(modalConta.vinculo.valorFixo)) : undefined,
        };
      }
    }

    let targetContaId = modalConta.id;
    if (modalConta.id) {
      await contas.update(modalConta.id, {
        nome: modalConta.nome.trim(),
        categoriaId: modalConta.categoriaId,
        ativa: modalConta.ativa !== false,
        vinculo: vinculoPayload,
      });
    } else {
      const criada = await contas.create({
        empresaId: empId,
        categoriaId: modalConta.categoriaId,
        natureza: natTab,
        nome: modalConta.nome.trim(),
        ativa: true,
        vinculo: vinculoPayload,
      });
      targetContaId = criada.id;
    }

    // Se possui regra de vínculo/fórmula e o ano ativo está aberto, calcula e aplica as projeções
    if (targetContaId && vinculoPayload && anoAtivo.value) {
      const anoCorrente = await anos.find(empId, anoAtivo.value);
      if (anoCorrente) {
        const [todasCs, todasCats, todasPs] = await Promise.all([
          contas.byEmpresa(empId),
          categorias.byEmpresa(empId),
          projecoes.byAno(anoCorrente.id),
        ]);
        if (vinculoPayload.modo === "formula" && vinculoPayload.formula) {
          for (let m = 0; m < 12; m++) {
            const res = calcularFormulaProjecoes(vinculoPayload.formula, m, todasPs, todasCs, todasCats);
            await projecoes.set(anoCorrente.id, targetContaId, m, res.valorCentavos);
          }
        } else if (vinculoPayload.origemId) {
          for (let m = 0; m < 12; m++) {
            const baseCentavos = calcularBaseProjecoes(vinculoPayload, m, todasPs, todasCs);
            const val = calcularValorVinculado(baseCentavos, vinculoPayload);
            await projecoes.set(anoCorrente.id, targetContaId, m, val, undefined, vinculoPayload.origemId);
          }
        }
      }
    }

    setModalConta(null);
  };

  // Imagem Logo upload
  const onLogoUpload = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setModalEmpresa((prev) => ({ ...prev, logo: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  // Salvar Conta Bancária
  const salvarBanco = async (e: Event) => {
    e.preventDefault();
    if (!empId || !modalBanco || !modalBanco.nome?.trim()) return;
    if (modalBanco.id) {
      await contasBancarias.update(modalBanco.id, {
        nome: modalBanco.nome.trim(),
        saldoInicialCentavos: modalBanco.saldoInicialCentavos || 0,
        cor: modalBanco.cor || "emerald",
        agencia: modalBanco.agencia?.trim() || undefined,
        numeroConta: modalBanco.numeroConta?.trim() || undefined,
        ativa: modalBanco.ativa !== false,
      });
      toast.success("Conta bancária atualizada com sucesso!");
    } else {
      await contasBancarias.create({
        empresaId: empId,
        nome: modalBanco.nome.trim(),
        saldoInicialCentavos: modalBanco.saldoInicialCentavos || 0,
        cor: modalBanco.cor || "emerald",
        agencia: modalBanco.agencia?.trim() || undefined,
        numeroConta: modalBanco.numeroConta?.trim() || undefined,
        ativa: modalBanco.ativa !== false,
      });
      toast.success("Conta bancária cadastrada com sucesso!");
    }
    setModalBanco(null);
  };

  // Excluir Conta Bancária
  const excluirBanco = async (b: ContaBancaria) => {
    const ok = await confirmarAcao({
      titulo: `Excluir "${b.nome}"?`,
      mensagem: "A conta bancária será desativada. Os lançamentos e movimentações vinculados continuarão preservados.",
      rotuloConfirmar: "Sim, excluir",
      tipo: "danger",
    });
    if (ok) {
      await contasBancarias.delete(b.id);
      toast.success("Conta bancária excluída.");
    }
  };

  return (
    <>
      <div class="page-head">
        <div>
          <h1>Ajustes</h1>
          <p>Cadastros de empresas, anos fiscais e plano de contas</p>
        </div>
      </div>

      <div class="tabs" style="margin-bottom: var(--sp-4);">
        <button type="button" class={`tab ${tab === "empresas" ? "is-active" : ""}`} onClick={() => setTab("empresas")}>
          <Icon name="building" /> Empresas
        </button>
        <button type="button" class={`tab ${tab === "anos" ? "is-active" : ""}`} onClick={() => setTab("anos")}>
          <Icon name="calendar" /> Anos / Banca
        </button>
        <button type="button" class={`tab ${tab === "contas" ? "is-active" : ""}`} onClick={() => setTab("contas")}>
          <Icon name="grid" /> Plano de Contas
        </button>
        <button type="button" class={`tab ${tab === "bancos" ? "is-active" : ""}`} onClick={() => setTab("bancos")}>
          <Icon name="bank" /> Contas Bancárias
        </button>
        <button type="button" class={`tab ${tab === "sistema" ? "is-active" : ""}`} onClick={() => setTab("sistema")}>
          <Icon name="settings" /> Preferências
        </button>
      </div>

      {/* ================= ABA EMPRESAS ================= */}
      {tab === "empresas" && (
        <section class="card">
          <div class="card__head">
            <h2 class="card__title">Empresas Cadastradas</h2>
            <button id="btn-nova-empresa" type="button" class="btn btn--primary" onClick={() => setModalEmpresa({ nome: "", cnpj: "", endereco: "" })}>
              <Icon name="plus" /> Nova Empresa
            </button>
          </div>

          {listaEmpresas.length === 0 ? (
            <p class="muted">Nenhuma empresa cadastrada ainda.</p>
          ) : (
            <div class="list">
              {listaEmpresas.map((emp) => {
                const isSelected = emp.id === empId;
                return (
                  <div class="list__item" key={emp.id}>
                    <div class="list__icon bg-in">
                      {emp.logo ? (
                        <img src={emp.logo} alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />
                      ) : (
                        <Icon name="building" />
                      )}
                    </div>
                    <div class="list__body">
                      <div class="list__title" style="display:flex;align-items:center;gap:6px;">
                        {emp.nome}
                        {isSelected && <span class="badge badge--in">Ativa</span>}
                      </div>
                      <div class="list__sub">
                        {emp.cnpj ? labelCpfCnpj(emp.cnpj) : "Sem CPF/CNPJ informado"}
                        {emp.endereco ? ` · ${emp.endereco}` : ""}
                      </div>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;">
                      {!isSelected && (
                        <button type="button" class="btn btn--ghost" style="font-size:var(--fs-xs);min-height:32px;" onClick={() => setEmpresa(emp.id)}>
                          Selecionar
                        </button>
                      )}
                      <button
                        type="button"
                        class="btn btn--ghost btn--icon"
                        onClick={() => setModalEmpresa({ ...emp, cnpj: formatCpfCnpj(emp.cnpj || "") })}
                        aria-label="Editar empresa"
                      >
                        <Icon name="pencil" />
                      </button>
                      <button
                        type="button"
                        class="btn btn--ghost btn--icon"
                        style="color:var(--out);"
                        onClick={async () => {
                          const ok = await confirmarAcao({
                            titulo: "Excluir Empresa",
                            mensagem: `Tem certeza que deseja excluir a empresa "${emp.nome}"? Esta ação removerá os dados vinculados a ela.`,
                            rotuloConfirmar: "Excluir Empresa",
                            tipo: "danger",
                          });
                          if (ok) {
                            await empresas.remove(emp.id);
                            if (empresaAtiva.value === emp.id) empresaAtiva.value = null;
                            toast.success(`Empresa "${emp.nome}" excluída.`);
                          }
                        }}
                        aria-label="Excluir empresa"
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ================= ABA ANOS E BANCA ================= */}
      {tab === "anos" && (
        <section class="card">
          <div class="card__head">
            <div>
              <h2 class="card__title">Anos Fiscais & Banca Inicial</h2>
              <p class="muted" style="font-size:var(--fs-xs);">Configuração para a empresa ativa</p>
            </div>
            {empId && (
              <button
                id="btn-novo-ano"
                type="button"
                class="btn btn--primary"
                onClick={() => setModalAno({ ano: new Date().getFullYear(), bancaInicial: 0 })}
              >
                <Icon name="plus" /> Abrir Ano
              </button>
            )}
          </div>

          {!empId ? (
            <p class="muted">Selecione ou cadastre uma empresa primeiro na aba Empresas.</p>
          ) : listaAnos.length === 0 ? (
            <p class="muted">Nenhum ano aberto para esta empresa. Clique em "Abrir Ano".</p>
          ) : (
            <div class="list">
              {listaAnos.map((a) => {
                const isSelected = a.ano === anoAtivo.value;
                return (
                  <div class="list__item" key={a.id}>
                    <div class="list__icon bg-aporte">
                      <Icon name="calendar" />
                    </div>
                    <div class="list__body">
                      <div class="list__title" style="display:flex;align-items:center;gap:6px;">
                        Ano {a.ano}
                        {isSelected && <span class="badge badge--in">Ativo</span>}
                      </div>
                      <div class="list__sub">
                        Banca inicial: <b class="num">{money(a.bancaInicial)}</b>
                      </div>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;">
                      {!isSelected && (
                        <button type="button" class="btn btn--ghost" style="font-size:var(--fs-xs);min-height:32px;" onClick={() => setAno(a.ano)}>
                          Selecionar
                        </button>
                      )}
                      <button
                        type="button"
                        class="btn btn--ghost btn--icon"
                        style="color:var(--primary);"
                        onClick={() => setReplicarAno(a)}
                        title="Replicar contas para o próximo ano com reajuste seguro"
                      >
                        <Icon name="sparkle" />
                      </button>
                      <button
                        type="button"
                        class="btn btn--ghost btn--icon"
                        onClick={() => setModalAno({ id: a.id, ano: a.ano, bancaInicial: a.bancaInicial / 100 })}
                        aria-label="Editar ano"
                      >
                        <Icon name="pencil" />
                      </button>
                      <button
                        type="button"
                        class="btn btn--ghost btn--icon"
                        style="color:var(--out);"
                        onClick={async () => {
                          const ok = await confirmarAcao({
                            titulo: "Remover Ano Fiscal",
                            mensagem: `Deseja remover o ano ${a.ano} e todos os seus lançamentos desta empresa?`,
                            rotuloConfirmar: "Remover Ano",
                            tipo: "danger",
                          });
                          if (ok) {
                            await anos.remove(a.id);
                            if (anoAtivo.value === a.ano) {
                              const restantes = listaAnos.filter((x) => x.id !== a.id);
                              if (restantes.length) setAno(restantes[restantes.length - 1].ano);
                            }
                            toast.success(`Ano ${a.ano} removido.`);
                          }
                        }}
                        aria-label="Excluir ano"
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ================= ABA PLANO DE CONTAS ================= */}
      {tab === "contas" && (
        <div class="stack">
          {/* Sub-tabs de natureza */}
          <div class="tabs" style="overflow-x:auto;">
            {NATUREZAS.map((nat) => {
              const meta = NATURE_META[nat];
              return (
                <button
                  type="button"
                  key={nat}
                  class={`tab ${natTab === nat ? "is-active" : ""}`}
                  onClick={() => setNatTab(nat)}
                >
                  <Icon name={meta.icon} /> {meta.label}
                </button>
              );
            })}
          </div>

          <section class="card">
            <div class="card__head">
              <div>
                <h2 class="card__title">{NATURE_META[natTab].label} — Categorias & Contas</h2>
                <p class="muted" style="font-size:var(--fs-xs);">
                  Estrutura de lançamentos para {NATURE_META[natTab].label.toLowerCase()}
                </p>
              </div>
              {empId && (
                <div style="display:flex;gap:6px;">
                  <button type="button" class="btn btn--secondary" onClick={() => setModalCat({ nome: "" })}>
                    <Icon name="plus" /> Categoria
                  </button>
                  {listaCats.length > 0 && (
                    <button
                      type="button"
                      class="btn btn--primary"
                      onClick={() => setModalConta({ nome: "", categoriaId: listaCats[0]?.id, ativa: true })}
                    >
                      <Icon name="plus" /> Conta
                    </button>
                  )}
                </div>
              )}
            </div>

            {!empId ? (
              <p class="muted">Selecione ou cadastre uma empresa primeiro.</p>
            ) : listaCats.length === 0 ? (
              <div class="empty" style="padding:var(--sp-4);">
                <p class="muted">Nenhuma categoria criada nesta natureza. Comece criando uma categoria.</p>
              </div>
            ) : (
              <div class="stack" style="gap:var(--sp-4);">
                {listaCats.map((cat) => {
                  const contasDaCat = listaContas.filter((c) => c.categoriaId === cat.id);
                  return (
                    <div
                      key={cat.id}
                      style="border: 1px solid var(--border); border-radius: var(--r-md); padding: var(--sp-3); background: var(--surface);"
                    >
                      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-2);">
                        <div style="font-weight:700;font-size:var(--fs-sm);display:flex;align-items:center;gap:6px;">
                          <i class="dot" style={`background:var(--${NATURE_META[natTab].tone})`} />
                          {cat.nome}
                          <span class="muted" style="font-size:var(--fs-xs);font-weight:normal;">
                            ({contasDaCat.length} conta{contasDaCat.length === 1 ? "" : "s"})
                          </span>
                        </div>
                        <div style="display:flex;gap:4px;">
                          <button
                            type="button"
                            class="btn btn--ghost btn--icon"
                            style="min-height:28px;width:28px;"
                            onClick={() => setModalConta({ nome: "", categoriaId: cat.id, ativa: true })}
                            title="Adicionar conta nesta categoria"
                          >
                            <Icon name="plus" />
                          </button>
                          <button
                            type="button"
                            class="btn btn--ghost btn--icon"
                            style="min-height:28px;width:28px;"
                            onClick={() => setModalCat(cat)}
                            title="Editar categoria"
                          >
                            <Icon name="pencil" />
                          </button>
                          <button
                            type="button"
                            class="btn btn--ghost btn--icon"
                            style="min-height:28px;width:28px;color:var(--out);"
                            onClick={async () => {
                              const ok = await confirmarAcao({
                                titulo: "Excluir Categoria",
                                mensagem: `Excluir a categoria "${cat.nome}" e todas as contas pertencentes a ela?`,
                                rotuloConfirmar: "Excluir Categoria",
                                tipo: "danger",
                              });
                              if (ok) {
                                await categorias.remove(cat.id);
                                for (const c of contasDaCat) await contas.remove(c.id);
                                toast.success(`Categoria "${cat.nome}" excluída.`);
                              }
                            }}
                            title="Excluir categoria"
                          >
                            <Icon name="trash" />
                          </button>
                        </div>
                      </div>

                      {contasDaCat.length === 0 ? (
                        <p class="muted" style="font-size:var(--fs-xs);padding-left:14px;">
                          Nenhuma conta nesta categoria.
                        </p>
                      ) : (
                        <div class="list" style="padding-left:14px;">
                          {contasDaCat.map((c) => (
                            <div class="list__item" key={c.id} style="padding: 6px 0;">
                              <div class="list__body">
                                <div class="list__title" style="font-size:var(--fs-sm);opacity:!c.ativa ? 0.5 : 1;display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
                                  <span>{c.nome}</span>
                                  {!c.ativa && <span class="badge badge--warn">Inativa</span>}
                                  {getBadgeVinculo(c.vinculo)}
                                </div>
                              </div>
                              <div style="display:flex;gap:4px;">
                                <button
                                  type="button"
                                  class="btn btn--ghost btn--icon"
                                  style="min-height:28px;width:28px;"
                                  onClick={() => setModalConta(c)}
                                  title="Editar conta"
                                >
                                  <Icon name="pencil" />
                                </button>
                                <button
                                  type="button"
                                  class="btn btn--ghost btn--icon"
                                  style="min-height:28px;width:28px;color:var(--out);"
                                  onClick={async () => {
                                    const ok = await confirmarAcao({
                                      titulo: "Excluir Conta",
                                      mensagem: `Deseja excluir a conta "${c.nome}"?`,
                                      rotuloConfirmar: "Excluir Conta",
                                      tipo: "danger",
                                    });
                                    if (ok) {
                                      await contas.remove(c.id);
                                      toast.success(`Conta "${c.nome}" excluída.`);
                                    }
                                  }}
                                  title="Excluir conta"
                                >
                                  <Icon name="trash" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ================= ABA CONTAS BANCÁRIAS ================= */}
      {tab === "bancos" && (
        <section class="card">
          <div class="card__head">
            <div>
              <h2 class="card__title">Contas Bancárias ({listaEmpresas.find((e) => e.id === empId)?.nome || "Empresa"})</h2>
              <p class="muted" style="font-size:var(--fs-xs);">Gerencie os bancos da empresa e seus saldos iniciais de abertura</p>
            </div>
            {empId && (
              <button
                id="btn-nova-conta-bancaria"
                type="button"
                class="btn btn--primary"
                onClick={() =>
                  setModalBanco({
                    nome: "",
                    saldoInicialCentavos: 0,
                    cor: "emerald",
                    ativa: true,
                  })
                }
              >
                <Icon name="plus" /> Nova Conta Bancária
              </button>
            )}
          </div>

          {!empId ? (
            <p class="muted">Selecione ou cadastre uma empresa primeiro na aba Empresas.</p>
          ) : listaBancos.length === 0 ? (
            <div class="empty" style="padding: var(--sp-6) var(--sp-4);">
              <div
                style="width: 56px; height: 56px; border-radius: 16px; background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); display: grid; place-items: center; margin: 0 auto var(--sp-3);"
              >
                <Icon name="bank" style="width: 28px; height: 28px;" />
              </div>
              <h2>Nenhuma conta bancária cadastrada</h2>
              <p style="max-width: 480px; margin: 0 auto 16px; color: var(--text-muted); font-size: var(--fs-sm);">
                Cadastre as contas correntes, carteiras e bancos da sua empresa (ex: Nubank PJ, Itaú, Inter) e informe o saldo inicial de cada uma.
              </p>
              <button
                type="button"
                class="btn btn--primary"
                onClick={() =>
                  setModalBanco({
                    nome: "",
                    saldoInicialCentavos: 0,
                    cor: "emerald",
                    ativa: true,
                  })
                }
              >
                <Icon name="plus" /> Cadastrar Primeira Conta Bancária
              </button>
            </div>
          ) : (
            <div class="list">
              {listaBancos.map((b) => (
                <div class="list__item" key={b.id}>
                  <div
                    class="list__icon"
                    style={`background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary);`}
                  >
                    <Icon name="bank" />
                  </div>
                  <div class="list__body">
                    <div class="list__title" style="display:flex;align-items:center;gap:8px;">
                      <span>{b.nome}</span>
                      {b.ativa ? (
                        <span class="badge badge--in">Ativa</span>
                      ) : (
                        <span class="badge badge--neutral">Inativa</span>
                      )}
                    </div>
                    <div class="list__sub" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:2px;">
                      <span>Saldo Inicial: <strong style="color:var(--text);">{money(b.saldoInicialCentavos)}</strong></span>
                      {b.agencia && <span>• Agência: {b.agencia}</span>}
                      {b.numeroConta && <span>• Conta: {b.numeroConta}</span>}
                    </div>
                  </div>
                  <div style="display:flex;gap:6px;align-items:center;">
                    <button
                      type="button"
                      class="btn btn--ghost btn--icon"
                      title="Editar conta bancária"
                      onClick={() => setModalBanco(b)}
                    >
                      <Icon name="pencil" style="width:16px;height:16px;" />
                    </button>
                    <button
                      type="button"
                      class="btn btn--ghost btn--icon"
                      style="color:var(--out);"
                      title="Excluir conta bancária"
                      onClick={() => excluirBanco(b)}
                    >
                      <Icon name="trash" style="width:16px;height:16px;" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ================= ABA PREFERÊNCIAS E SISTEMA ================= */}
      {tab === "sistema" && (
        <div class="stack" style="gap:var(--sp-4);">
          {/* ================= SEÇÃO PRINCIPAL: FINANSYS CLOUD VAULT ================= */}
          <section class="card" style="border-color:var(--primary-soft);">
            <div class="card__head">
              <div>
                <h2 class="card__title" style="display:flex;align-items:center;gap:8px;color:var(--text);">
                  <Icon name="cloud" style="color:var(--primary);" /> Sincronização em Nuvem (Finansys Cloud Vault)
                </h2>
                <p class="muted" style="font-size:var(--fs-xs);">
                  Basta entrar com seu e-mail para ter backup automático e acessar em qualquer aparelho.
                </p>
              </div>
              <span class={`badge ${cloudSyncStatus.value === "salvo" ? "badge--in" : cloudSyncStatus.value === "erro" ? "badge--warn" : ""}`}>
                {cloudSyncStatus.value === "salvo"
                  ? "Sincronizado"
                  : cloudSyncStatus.value === "salvando"
                  ? "Salvando..."
                  : cloudSyncStatus.value === "pendente"
                  ? "Pendente"
                  : cloudSyncStatus.value === "erro"
                  ? "Falha"
                  : "Não conectado"}
              </span>
            </div>

            <div class="stack" style="gap:var(--sp-3);">
              {cloudUser.value ? (
                <>
                  <div style="display:flex;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:var(--r-md);padding:14px;background:var(--surface);flex-wrap:wrap;gap:12px;">
                    <div>
                      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <i class="dot" style="background:var(--in);" />
                        <b style="font-size:var(--fs-sm);color:var(--text);">
                          {cloudUser.value.nome ? `${cloudUser.value.nome} (${cloudUser.value.email})` : cloudUser.value.email}
                        </b>
                        <span class="badge badge--in">Nuvem Ativa</span>
                        <button
                          type="button"
                          class="btn btn--ghost"
                          style="font-size:0.7rem;padding:2px 8px;min-height:22px;gap:4px;"
                          onClick={() => setModalEditarNomePerfil(cloudUser.value?.nome || "")}
                          title="Alterar seu nome salvo"
                        >
                          <Icon name="pencil" style="width:12px;height:12px;" /> Alterar nome
                        </button>
                      </div>
                      <div class="muted" style="font-size:var(--fs-xs);margin-top:4px;">
                        {cloudUltimoBackup.value ? (
                          <>Último backup em nuvem: {cloudUltimoBackup.value.toLocaleDateString("pt-BR")} às {cloudUltimoBackup.value.toLocaleTimeString("pt-BR")}</>
                        ) : (
                          "Sincronização contínua ativada."
                        )}
                      </div>
                    </div>

                    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                      <button
                        type="button"
                        class="btn btn--secondary"
                        style="font-size:var(--fs-xs);min-height:34px;"
                        onClick={async () => {
                          const res = await enviarBackupNuvem();
                          if (res.ok) toast.success("Backup em nuvem sincronizado com sucesso!");
                          else toast.error(res.error || "Não foi possível sincronizar agora.");
                        }}
                      >
                        <Icon name="cloud" /> Sincronizar Agora
                      </button>
                      <button
                        type="button"
                        class="btn btn--ghost"
                        style="font-size:var(--fs-xs);min-height:34px;"
                        onClick={async () => {
                          const ok = await confirmarAcao({
                            titulo: "Restaurar Dados da Nuvem",
                            mensagem: "Deseja baixar os dados salvos na sua conta e restaurar este aparelho? Os dados salvos na nuvem serão carregados no sistema.",
                            rotuloConfirmar: "Sim, Puxar da Nuvem",
                          });
                          if (ok) {
                            const res = await puxarBackupNuvem(true);
                            if (res.ok) toast.success(`Dados da nuvem restaurados com sucesso! (${res.count ?? 0} registros)`);
                            else toast.error(res.error || "Erro ao puxar dados da nuvem.");
                          }
                        }}
                        title="Busca e restaura manualmente os dados salvos na nuvem"
                      >
                        <Icon name="download" /> Puxar da Nuvem
                      </button>
                      <button
                        type="button"
                        class="btn btn--ghost btn--danger"
                        style="font-size:var(--fs-xs);min-height:34px;"
                        onClick={async () => {
                          const ok = await confirmarAcao({
                            titulo: "Desconectar Conta",
                            mensagem: "Deseja sair da conta neste aparelho? Para proteger suas finanças, todos os dados locais deste dispositivo serão limpos. Seus dados continuam salvos na nuvem.",
                            rotuloConfirmar: "Sair da Conta",
                            tipo: "warning",
                          });
                          if (ok) {
                            await desconectarConta(true);
                          }
                        }}
                      >
                        Sair da Conta
                      </button>
                    </div>
                  </div>

                  {/* Configuração de Bloqueio por Inatividade */}
                  <div style="margin-top:var(--sp-1);padding-top:var(--sp-2);border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                    <div>
                      <div style="font-weight:600;font-size:var(--fs-xs);color:var(--text);display:flex;align-items:center;gap:6px;">
                        <Icon name="lock" style="width:14px;height:14px;" /> Bloqueio Automático por Inatividade
                      </div>
                      <div class="muted" style="font-size:0.7rem;margin-top:2px;">
                        Protege sua tela caso você fique um período sem mexer no sistema.
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <select
                        class="input"
                        style="font-size:var(--fs-xs);min-height:32px;padding:2px 8px;"
                        value={inactivityTimeoutSignal.value}
                        onChange={(e) => {
                          const val = Number(e.currentTarget.value);
                          setInactivityTimeout(val);
                          toast.info(val === 0 ? "Bloqueio por inatividade desativado." : `Bloqueio definido para ${val >= 60 ? `${val / 60} min` : `${val}s`}.`);
                        }}
                      >
                        <option value={900}>15 minutos (Padrão)</option>
                        <option value={300}>5 minutos</option>
                        <option value={60}>1 minuto</option>
                        <option value={30}>30 segundos</option>
                        <option value={0}>Desativado</option>
                      </select>
                      <button
                        type="button"
                        class="btn btn--secondary"
                        style="font-size:var(--fs-xs);min-height:32px;"
                        title="Bloquear a tela agora para testar a proteção"
                        onClick={() => lockScreenNow()}
                      >
                        <Icon name="lock" /> Bloquear Agora
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div style="display:flex;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:var(--r-md);padding:16px;background:var(--surface);flex-wrap:wrap;gap:12px;">
                  <div>
                    <div style="font-weight:600;font-size:var(--fs-sm);color:var(--text);">
                      Sincronização e Backup Automático em Nuvem
                    </div>
                    <div class="muted" style="font-size:var(--fs-xs);margin-top:2px;">
                      Conecte sua conta para manter seus dados seguros e sincronizados entre computadores e celulares.
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn--primary"
                    style="font-size:var(--fs-xs);min-height:36px;"
                    onClick={() => setModalAuthAberto(true)}
                  >
                    <Icon name="user" /> Entrar ou Criar Conta
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Seção Backup em Arquivo Local */}
          <section class="card">
            <div class="card__head">
              <div>
                <h2 class="card__title">Backup em Arquivo (.json)</h2>
                <p class="muted" style="font-size:var(--fs-xs);">
                  Exporte e importe cópias de segurança locais sem depender de internet.
                </p>
              </div>
            </div>

            <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap;">
              <button
                type="button"
                class="btn btn--secondary"
                onClick={async () => {
                  const dump = await dumpDatabase();
                  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `finansys-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Icon name="download" /> Baixar Arquivo de Backup
              </button>

              <label class="btn btn--secondary" style="cursor:pointer;">
                <Icon name="plus" /> Restaurar Arquivo (.json)
                <input
                  type="file"
                  accept=".json,application/json"
                  style="display:none;"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async () => {
                      try {
                        const parsed = JSON.parse(reader.result as string);
                        const ok = await confirmarAcao({
                          titulo: "Restaurar Backup",
                          mensagem: "Restaurar dados do arquivo? Isso mesclará as empresas, contas e lançamentos com a base atual.",
                          rotuloConfirmar: "Restaurar Dados",
                          tipo: "primary",
                        });
                        if (ok) {
                          const res = await restoreDatabase(parsed, "merge");
                          toast.success(`Sucesso! ${res.totalImportados} registros mesclados.`);
                        }
                      } catch (err) {
                        toast.error("Erro ao ler arquivo de backup: " + String(err));
                      }
                    };
                    reader.readAsText(file);
                  }}
                />
              </label>
            </div>
          </section>

          {/* Seção Tema e Exemplos */}
          <section class="card">
            <h2 class="card__title" style="margin-bottom:var(--sp-4);">Aparência e Base de Dados</h2>

            <div class="stack" style="gap:var(--sp-4);">
              <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:var(--sp-3);">
                <div>
                  <div style="font-weight:600;">Tema visual</div>
                  <div class="muted" style="font-size:var(--fs-xs);">Alternar entre tema escuro e claro sóbrio</div>
                </div>
                <div style="display:flex;gap:6px;">
                  <button
                    type="button"
                    class={`btn ${theme.value === "dark" ? "btn--primary" : "btn--secondary"}`}
                    onClick={() => applyTheme("dark")}
                  >
                    <Icon name="moon" /> Escuro
                  </button>
                  <button
                    type="button"
                    class={`btn ${theme.value === "light" ? "btn--primary" : "btn--secondary"}`}
                    onClick={() => applyTheme("light")}
                  >
                    <Icon name="sun" /> Claro
                  </button>
                </div>
              </div>

              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div>
                  <div style="font-weight:600;">Dados de Demonstração</div>
                  <div class="muted" style="font-size:var(--fs-xs);">
                    Gera uma empresa de exemplo com contas e lançamentos para testes
                  </div>
                </div>
                <button
                  type="button"
                  class="btn btn--secondary"
                  onClick={async () => {
                    const ok = await confirmarAcao({
                      titulo: "Carregar Dados de Demonstração",
                      mensagem: "Deseja carregar uma empresa de exemplo completa com contas e lançamentos?",
                      rotuloConfirmar: "Carregar Demo",
                      tipo: "primary",
                    });
                    if (ok) {
                      const id = await seedExemplo();
                      setEmpresa(id);
                      setAno(new Date().getFullYear());
                      toast.success("Empresa de exemplo carregada com sucesso!");
                    }
                  }}
                >
                  Carregar Exemplo
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ================= MODAIS ================= */}

      {/* Modal Empresa */}
      <Modal
        title={modalEmpresa?.id ? "Editar Cadastro (PF / PJ)" : "Novo Cadastro (Pessoa Física ou Jurídica)"}
        isOpen={modalEmpresa !== null}
        onClose={() => setModalEmpresa(null)}
        footer={
          <>
            <button type="button" class="btn btn--ghost" onClick={() => setModalEmpresa(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-empresa" class="btn btn--primary">
              Salvar Cadastro
            </button>
          </>
        }
      >
        <form id="form-empresa" onSubmit={salvarEmpresa}>
          <div class="form-group">
            <label class="form-label" for="emp-nome">Nome Completo ou Razão Social (PF / PJ) *</label>
            <input
              id="emp-nome"
              class="input"
              required
              value={modalEmpresa?.nome || ""}
              onInput={(e) => setModalEmpresa({ ...modalEmpresa, nome: e.currentTarget.value })}
              placeholder="Ex: Aline Silva ou Gestão Comercial LTDA"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="emp-cnpj">CPF ou CNPJ</label>
            <input
              id="emp-cnpj"
              class="input"
              inputMode="numeric"
              maxLength={18}
              value={modalEmpresa?.cnpj || ""}
              onInput={(e) =>
                setModalEmpresa({ ...modalEmpresa, cnpj: formatCpfCnpj(e.currentTarget.value) })
              }
              placeholder="000.000.000-00 ou 00.000.000/0001-00"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="emp-end">Endereço Completo (usado no informe formal)</label>
            <input
              id="emp-end"
              class="input"
              value={modalEmpresa?.endereco || ""}
              onInput={(e) => setModalEmpresa({ ...modalEmpresa, endereco: e.currentTarget.value })}
              placeholder="Rua, número, bairro, cidade - UF"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="emp-logo">Foto de Perfil ou Logotipo</label>
            <input id="emp-logo" type="file" accept="image/*" onChange={onLogoUpload} class="input" style="padding-top:8px;" />
            {modalEmpresa?.logo && (
              <div style="margin-top:8px;display:flex;align-items:center;gap:12px;">
                <img src={modalEmpresa.logo} alt="Prévia" style="max-height:50px;border-radius:6px;border:1px solid var(--border);" />
                <button type="button" class="btn btn--ghost btn--danger" style="font-size:var(--fs-xs);" onClick={() => setModalEmpresa({ ...modalEmpresa, logo: "" })}>
                  Remover logo
                </button>
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* Modal Ano */}
      <Modal
        title={modalAno?.id ? `Editar Ano ${modalAno.ano}` : "Abrir Novo Ano"}
        isOpen={modalAno !== null}
        onClose={() => setModalAno(null)}
        footer={
          <>
            <button type="button" class="btn btn--ghost" onClick={() => setModalAno(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-ano" class="btn btn--primary">
              Salvar Ano
            </button>
          </>
        }
      >
        <form id="form-ano" onSubmit={salvarAno}>
          <div class="form-group">
            <label class="form-label" for="ano-num">Ano *</label>
            <input
              id="ano-num"
              type="number"
              min="2000"
              max="2100"
              class="input"
              required
              disabled={Boolean(modalAno?.id)}
              value={modalAno?.ano || new Date().getFullYear()}
              onInput={(e) => setModalAno({ ...modalAno, ano: Number(e.currentTarget.value) })}
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="ano-banca">Banca Inicial (R$) *</label>
            <input
              id="ano-banca"
              type="number"
              step="0.01"
              class="input"
              required
              value={modalAno?.bancaInicial ?? 0}
              onInput={(e) => setModalAno({ ...modalAno, bancaInicial: Number(e.currentTarget.value) })}
              placeholder="0,00"
            />
            <span class="muted" style="font-size:var(--fs-xs);">
              Saldo inicial em conta no primeiro dia do ano.
            </span>
          </div>
        </form>
      </Modal>

      {/* Modal Categoria */}
      <Modal
        title={modalCat?.id ? "Editar Categoria" : `Nova Categoria (${NATURE_META[natTab].label})`}
        isOpen={modalCat !== null}
        onClose={() => setModalCat(null)}
        footer={
          <>
            <button type="button" class="btn btn--ghost" onClick={() => setModalCat(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-cat" class="btn btn--primary">
              Salvar Categoria
            </button>
          </>
        }
      >
        <form id="form-cat" onSubmit={salvarCat}>
          <div class="form-group">
            <label class="form-label" for="cat-nome">Nome da Categoria *</label>
            <input
              id="cat-nome"
              class="input"
              required
              value={modalCat?.nome || ""}
              onInput={(e) => setModalCat({ ...modalCat, nome: e.currentTarget.value })}
              placeholder="Ex: Despesas Fixas, Pessoal, Clientes..."
            />
          </div>
        </form>
      </Modal>

      {/* Modal Conta */}
      <Modal
        title={modalConta?.id ? "Editar Conta" : `Nova Conta (${NATURE_META[natTab].label})`}
        isOpen={modalConta !== null}
        onClose={() => setModalConta(null)}
        footer={
          <>
            <button type="button" class="btn btn--ghost" onClick={() => setModalConta(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-conta" class="btn btn--primary">
              Salvar Conta
            </button>
          </>
        }
      >
        <form id="form-conta" onSubmit={salvarConta} class="stack" style="gap:16px;">
          {/* Bloco 1: Identificação da Conta */}
          <div class="card" style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);">
            <div style="font-weight:600;font-size:var(--fs-sm);margin-bottom:12px;display:flex;align-items:center;gap:6px;">
              <Icon name="pencil" style="width:14px;height:14px;color:var(--primary);" />
              <span>Identificação da Conta</span>
            </div>

            <div class="form-group" style="margin-bottom:10px;">
              <label class="form-label" for="conta-nome">Nome da Conta *</label>
              <input
                id="conta-nome"
                class="input"
                required
                value={modalConta?.nome || ""}
                onInput={(e) => setModalConta({ ...modalConta, nome: e.currentTarget.value })}
                placeholder="Ex: Aluguel, Salários, Pensão Alimentícia, Impostos..."
              />
            </div>

            <div class="form-group" style="margin-bottom:modalConta?.id ? '10px' : '0';">
              <label class="form-label" for="conta-cat">Categoria Pertencente *</label>
              <CustomSelect
                id="conta-cat"
                value={modalConta?.categoriaId || ""}
                placeholder={listaCats.length === 0 ? "Nenhuma categoria cadastrada" : "Selecione Categoria"}
                disabled={listaCats.length === 0}
                options={listaCats.map((c) => ({ value: c.id, label: c.nome }))}
                onChange={(categoriaId) => setModalConta({ ...modalConta, categoriaId })}
              />
            </div>

            {modalConta?.id && (
              <div class="form-group" style="flex-direction:row;align-items:center;gap:8px;margin-bottom:0;padding-top:4px;">
                <input
                  id="conta-ativa"
                  type="checkbox"
                  checked={modalConta?.ativa !== false}
                  onChange={(e) => setModalConta({ ...modalConta, ativa: e.currentTarget.checked })}
                />
                <label for="conta-ativa" style="font-size:var(--fs-sm);cursor:pointer;">
                  Conta ativa (disponível para lançamentos e projeções)
                </label>
              </div>
            )}
          </div>

          {/* Bloco 2: Automação, Vínculos & Fórmulas */}
          <div class="card" style="padding:14px;background:var(--surface-soft);border:1px solid var(--border);border-radius:var(--r-md);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <label for="conta-tem-vinculo" style="font-weight:600;font-size:var(--fs-sm);display:flex;align-items:center;gap:6px;cursor:pointer;">
                <Icon name="link" style="color:var(--primary);width:15px;height:15px;" />
                <span>Automação: Vínculos & Fórmulas (Opcional)</span>
              </label>
              <input
                id="conta-tem-vinculo"
                type="checkbox"
                checked={Boolean(modalConta?.vinculo)}
                onChange={(e) => {
                  if (e.currentTarget.checked) {
                    const defaultOrigem = todasContasEmpresa.find((c) => c.id !== modalConta?.id)?.id || "";
                    setModalConta({
                      ...modalConta,
                      vinculo: {
                        modo: "simples",
                        tipo: "conta",
                        origemId: defaultOrigem,
                        percentual: 30,
                      },
                    });
                  } else {
                    setModalConta({
                      ...modalConta,
                      vinculo: undefined,
                    });
                  }
                }}
              />
            </div>

            <p class="text-muted" style="font-size:var(--fs-xs);margin-bottom:12px;">
              Calcule valores automaticamente (% de outra conta ou fórmula com múltiplas variáveis como <code>([Salário] - [INSS]) * 30%</code>).
            </p>

            {modalConta?.vinculo && (() => {
              const v = modalConta.vinculo;
              const modoAtual: ModoVinculo = v.modo || (v.formula ? "formula" : "simples");

              return (
                <div class="stack" style="gap:12px;padding-top:10px;border-top:1px solid var(--border);">
                  {/* Seletor de Modo: Simples vs Fórmula */}
                  <div class="tabs tabs--sm" style="margin:0;">
                    <button
                      type="button"
                      class={`tab ${modoAtual === "simples" ? "is-active" : ""}`}
                      onClick={() =>
                        setModalConta({
                          ...modalConta,
                          vinculo: {
                            ...v,
                            modo: "simples",
                            origemId: v.origemId || todasContasEmpresa.find((c) => c.id !== modalConta?.id)?.id || "",
                            percentual: v.percentual ?? 30,
                          },
                        })
                      }
                    >
                      <Icon name="link" style="width:13px;height:13px;" /> Vínculo Direto (% ou Fixo)
                    </button>
                    <button
                      type="button"
                      class={`tab ${modoAtual === "formula" ? "is-active" : ""}`}
                      onClick={() =>
                        setModalConta({
                          ...modalConta,
                          vinculo: {
                            ...v,
                            modo: "formula",
                            formula: v.formula || "",
                          },
                        })
                      }
                    >
                      <span style="font-weight:700;font-size:11px;">fx</span> Fórmula com Variáveis
                    </button>
                  </div>

                  {/* Modo Simples */}
                  {modoAtual === "simples" && (
                    <div class="stack" style="gap:10px;">
                      <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;">
                        <div>
                          <label class="form-label" style="font-size:var(--fs-xs);">Vincular a:</label>
                          <div class="tabs tabs--sm" style="margin:0;">
                            <button
                              type="button"
                              class={`tab ${v.tipo !== "categoria" ? "is-active" : ""}`}
                              style="font-size:var(--fs-xs);padding:3px 8px;"
                              onClick={() => {
                                const def = todasContasEmpresa.find((c) => c.id !== modalConta?.id)?.id || "";
                                setModalConta({
                                  ...modalConta,
                                  vinculo: { ...v, tipo: "conta", origemId: def },
                                });
                              }}
                            >
                              Conta
                            </button>
                            <button
                              type="button"
                              class={`tab ${v.tipo === "categoria" ? "is-active" : ""}`}
                              style="font-size:var(--fs-xs);padding:3px 8px;"
                              onClick={() => {
                                const def = todasCategoriasEmpresa[0]?.id || "";
                                setModalConta({
                                  ...modalConta,
                                  vinculo: { ...v, tipo: "categoria", origemId: def },
                                });
                              }}
                            >
                              Categoria
                            </button>
                          </div>
                        </div>

                        <div>
                          <label class="form-label" style="font-size:var(--fs-xs);">Forma de Cálculo:</label>
                          <div class="tabs tabs--sm" style="margin:0;">
                            <button
                              type="button"
                              class={`tab ${v.percentual !== undefined ? "is-active" : ""}`}
                              style="font-size:var(--fs-xs);padding:3px 8px;"
                              onClick={() =>
                                setModalConta({
                                  ...modalConta,
                                  vinculo: { ...v, percentual: 30, valorFixo: undefined },
                                })
                              }
                            >
                              % Percentual
                            </button>
                            <button
                              type="button"
                              class={`tab ${v.valorFixo !== undefined ? "is-active" : ""}`}
                              style="font-size:var(--fs-xs);padding:3px 8px;"
                              onClick={() =>
                                setModalConta({
                                  ...modalConta,
                                  vinculo: { ...v, percentual: undefined, valorFixo: 0 },
                                })
                              }
                            >
                              Valor Fixo
                            </button>
                          </div>
                        </div>
                      </div>

                      <div class="form-group" style="margin-bottom:0;">
                        <label class="form-label" style="font-size:var(--fs-xs);">
                          Origem ({v.tipo === "categoria" ? "Categoria" : "Conta"} base) *
                        </label>
                        {v.tipo === "categoria" ? (
                          <CustomSelect
                            value={v.origemId || ""}
                            placeholder="Selecione a categoria..."
                            options={todasCategoriasEmpresa.map((cat) => ({
                              value: cat.id,
                              label: `${cat.nome} (${NATURE_META[cat.natureza]?.label || cat.natureza})`,
                            }))}
                            onChange={(origemId) =>
                              setModalConta({
                                ...modalConta,
                                vinculo: { ...v, origemId },
                              })
                            }
                          />
                        ) : (
                          <CustomSelect
                            value={v.origemId || ""}
                            placeholder="Selecione a conta..."
                            options={todasContasEmpresa
                              .filter((c) => c.id !== modalConta?.id)
                              .map((c) => ({
                                value: c.id,
                                label: `${c.nome} (${NATURE_META[c.natureza]?.label || c.natureza})`,
                              }))}
                            onChange={(origemId) =>
                              setModalConta({
                                ...modalConta,
                                vinculo: { ...v, origemId },
                              })
                            }
                          />
                        )}
                      </div>

                      {v.percentual !== undefined ? (
                        <div class="form-group" style="margin-bottom:0;">
                          <label class="form-label" style="font-size:var(--fs-xs);">Percentual da Origem (%) *</label>
                          <div style="display:flex;align-items:center;gap:6px;">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="1000"
                              class="input"
                              placeholder="Ex: 30 para 30%"
                              value={v.percentual}
                              onInput={(e) =>
                                setModalConta({
                                  ...modalConta,
                                  vinculo: {
                                    ...v,
                                    percentual: parseFloat(e.currentTarget.value) || 0,
                                  },
                                })
                              }
                            />
                            <span style="font-weight:600;font-size:var(--fs-md);">%</span>
                          </div>
                        </div>
                      ) : (
                        <div class="form-group" style="margin-bottom:0;">
                          <label class="form-label" style="font-size:var(--fs-xs);">Valor Fixo (R$) *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            class="input"
                            placeholder="Ex: 1500.00"
                            value={v.valorFixo !== undefined ? (v.valorFixo / 100).toString() : ""}
                            onInput={(e) =>
                              setModalConta({
                                ...modalConta,
                                vinculo: {
                                  ...v,
                                  valorFixo: Math.round(Number(e.currentTarget.value || 0) * 100),
                                },
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Modo Fórmula Livre */}
                  {modoAtual === "formula" && (() => {
                    const formulaTexto = v.formula || "";
                    const varsDetectadas = extrairVariaveis(formulaTexto);
                    const evalTeste = formulaTexto.trim()
                      ? avaliarFormula(
                          formulaTexto,
                          Object.fromEntries(varsDetectadas.map((varName) => [varName, 1000]))
                        )
                      : { ok: true, valor: 0 };

                    const inserirTextoFormula = (fragmento: string) => {
                      setModalConta({
                        ...modalConta,
                        vinculo: {
                          ...v,
                          formula: formulaTexto ? `${formulaTexto} ${fragmento}` : fragmento,
                        },
                      });
                    };

                    return (
                      <div class="stack" style="gap:10px;">
                        <div class="form-group" style="margin-bottom:0;">
                          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                            <label class="form-label" style="font-size:var(--fs-xs);margin-bottom:0;">
                              Expressão da Fórmula *
                            </label>
                            <span class="muted" style="font-size:11px;">
                              Ex: <code>([Salário Bruto] - [INSS]) * 30%</code>
                            </span>
                          </div>
                          <input
                            class="input"
                            placeholder="Ex: ([Salário Bruto] - [INSS]) * 30%"
                            value={formulaTexto}
                            onInput={(e) =>
                              setModalConta({
                                ...modalConta,
                                vinculo: {
                                  ...v,
                                  formula: e.currentTarget.value,
                                },
                              })
                            }
                          />
                        </div>

                        {/* Operadores e Teclado Rápido */}
                        <div>
                          <div class="muted" style="font-size:11px;margin-bottom:4px;">
                            Operadores Rápidos:
                          </div>
                          <div style="display:flex;gap:4px;flex-wrap:wrap;">
                            {["+", "-", "*", "/", "(", ")", "%"].map((op) => (
                              <button
                                key={op}
                                type="button"
                                class="btn btn--ghost btn--sm"
                                style="font-family:monospace;font-weight:700;min-width:30px;min-height:26px;padding:2px 8px;"
                                onClick={() => inserirTextoFormula(op)}
                              >
                                {op}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Chips de Variáveis das Contas */}
                        <div>
                          <div class="muted" style="font-size:11px;margin-bottom:4px;">
                            Clique para inserir conta na fórmula:
                          </div>
                          <div style="display:flex;gap:4px;flex-wrap:wrap;max-height:90px;overflow-y:auto;">
                            {todasContasEmpresa
                              .filter((c) => c.id !== modalConta?.id)
                              .map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  class="chip"
                                  style="font-size:11px;padding:3px 8px;cursor:pointer;"
                                  title={`Inserir [${c.nome}]`}
                                  onClick={() => inserirTextoFormula(`[${c.nome}]`)}
                                >
                                  + [{c.nome}]
                                </button>
                              ))}
                          </div>
                        </div>

                        {/* Validador em Tempo Real */}
                        {formulaTexto.trim() && (
                          <div
                            style={`padding:8px 12px;border-radius:var(--r-md);font-size:var(--fs-xs);${
                              evalTeste.ok
                                ? "background:var(--primary-soft);color:var(--primary);border:1px solid color-mix(in srgb, var(--primary) 20%, transparent);"
                                : "background:var(--out-soft);color:var(--out);border:1px solid color-mix(in srgb, var(--out) 20%, transparent);"
                            }`}
                          >
                            <div style="font-weight:600;display:flex;align-items:center;gap:6px;">
                              <Icon name={evalTeste.ok ? "check" : "alertTriangle"} style="width:14px;height:14px;" />
                              <span>{evalTeste.ok ? "Sintaxe da fórmula válida!" : evalTeste.erro}</span>
                            </div>
                            {varsDetectadas.length > 0 && (
                              <div style="margin-top:4px;font-size:11px;color:var(--text-muted);">
                                Variáveis detectadas: <b>{varsDetectadas.join(", ")}</b>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        </form>
      </Modal>

      {/* Modal Replicação de Ano */}
      {empId && replicarAno && (
        <ModalReplicacao
          empresaId={empId}
          anoAtual={replicarAno.ano}
          saldoFinalRealAtual={replicarAno.bancaInicial}
          isOpen={replicarAno !== null}
          onClose={() => setReplicarAno(null)}
        />
      )}

      {/* Modal de Autenticação */}
      <ModalAuth isOpen={modalAuthAberto} onClose={() => setModalAuthAberto(false)} />

      {/* Modal Editar Nome do Perfil */}
      {modalEditarNomePerfil !== null && (
        <Modal
          title="Alterar Nome da Conta"
          isOpen={true}
          onClose={() => setModalEditarNomePerfil(null)}
          footer={
            <>
              <button type="button" class="btn btn--ghost" onClick={() => setModalEditarNomePerfil(null)}>
                Cancelar
              </button>
              <button
                type="button"
                class="btn btn--primary"
                onClick={async () => {
                  if (!modalEditarNomePerfil.trim()) {
                    toast.warn("Informe um nome válido.");
                    return;
                  }
                  const res = await atualizarNomePerfil(modalEditarNomePerfil.trim());
                  if (res.ok) {
                    toast.success("Nome atualizado com sucesso!");
                    setModalEditarNomePerfil(null);
                  } else {
                    toast.error(res.error || "Erro ao atualizar nome.");
                  }
                }}
              >
                Salvar Nome
              </button>
            </>
          }
        >
          <div class="form-group">
            <label class="form-label" for="edit-perfil-nome">Seu Nome *</label>
            <input
              id="edit-perfil-nome"
              class="input"
              autoFocus
              placeholder="Ex: Aline Silva"
              value={modalEditarNomePerfil}
              onInput={(e) => setModalEditarNomePerfil(e.currentTarget.value)}
            />
            <span class="muted" style="font-size:var(--fs-xs);margin-top:4px;display:block;">
              Este nome será exibido no topo do sistema e salvo permanentemente em sua conta.
            </span>
          </div>
        </Modal>
      )}

      {/* Modal Nova / Editar Conta Bancária */}
      {modalBanco && (
        <Modal
          title={modalBanco.id ? "Editar Conta Bancária" : "Nova Conta Bancária"}
          isOpen={true}
          onClose={() => setModalBanco(null)}
          onSubmitShortcut={() => {
            const form = document.getElementById("form-modal-banco") as HTMLFormElement;
            if (form) form.requestSubmit();
          }}
          footer={
            <div class="modal-footer-actions">
              <div />
              <div class="modal-footer-actions__right">
                <button type="button" class="btn btn--ghost" onClick={() => setModalBanco(null)}>
                  Cancelar
                </button>
                <button type="submit" form="form-modal-banco" class="btn btn--primary">
                  <Icon name="check" /> {modalBanco.id ? "Salvar Alterações" : "Cadastrar Conta"}
                </button>
              </div>
            </div>
          }
        >
          <form id="form-modal-banco" onSubmit={salvarBanco} class="stack" style="gap: var(--sp-3);">
            <div class="form-group">
              <label class="form-label" for="banco-nome">Nome da Conta / Banco *</label>
              <input
                id="banco-nome"
                type="text"
                class="input"
                placeholder="Ex: Nubank PJ, Itaú Corrente, Inter, Caixa..."
                value={modalBanco.nome || ""}
                onInput={(e) => setModalBanco({ ...modalBanco, nome: (e.target as HTMLInputElement).value })}
                required
                autoFocus
              />
            </div>

            <div class="form-group">
              <label class="form-label">
                Saldo Inicial de Abertura *
                <span style="font-size: var(--fs-xs); color: var(--text-faint); margin-left: 4px; text-transform: none;">
                  (Banca existente na conta ao iniciar o controle)
                </span>
              </label>
              <MoneyInput
                variant="hero"
                valueCentavos={modalBanco.saldoInicialCentavos || 0}
                onChangeCentavos={(cents) => setModalBanco({ ...modalBanco, saldoInicialCentavos: cents })}
              />
            </div>

            <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--sp-3);">
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" for="banco-agencia">Agência (Opcional)</label>
                <input
                  id="banco-agencia"
                  type="text"
                  class="input"
                  placeholder="Ex: 0001"
                  value={modalBanco.agencia || ""}
                  onInput={(e) => setModalBanco({ ...modalBanco, agencia: (e.target as HTMLInputElement).value })}
                />
              </div>

              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" for="banco-conta">Número da Conta (Opcional)</label>
                <input
                  id="banco-conta"
                  type="text"
                  class="input"
                  placeholder="Ex: 12345-6"
                  value={modalBanco.numeroConta || ""}
                  onInput={(e) => setModalBanco({ ...modalBanco, numeroConta: (e.target as HTMLInputElement).value })}
                />
              </div>
            </div>

            <label
              style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:var(--fs-sm); font-weight:500; margin-top: var(--sp-2);"
            >
              <input
                type="checkbox"
                checked={modalBanco.ativa !== false}
                onChange={(e) => setModalBanco({ ...modalBanco, ativa: (e.target as HTMLInputElement).checked })}
              />
              <span>Conta bancária ativa (disponível para lançamentos e relatórios)</span>
            </label>
          </form>
        </Modal>
      )}
    </>
  );
}

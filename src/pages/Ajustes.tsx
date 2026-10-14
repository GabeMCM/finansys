import { useState } from "preact/hooks";
import { CustomSelect } from "../components/CustomSelect.tsx";
import { Icon } from "../components/Icon.tsx";
import { Modal } from "../components/Modal.tsx";
import { ModalAuth } from "../components/ModalAuth.tsx";
import { ModalConfirm, confirmarAcao } from "../components/ModalConfirm.tsx";
import { ModalReplicacao } from "../components/ModalReplicacao.tsx";
import { toast } from "../components/Toast.tsx";
import { dumpDatabase, restoreDatabase } from "../data/backup.ts";
import { cloudSyncStatus, cloudUltimoBackup, cloudUser, desconectarConta, enviarBackupNuvem, puxarBackupNuvem } from "../data/cloudSync.ts";
import { conectarGoogleDrive, desconectarGoogleDrive, googleUser, realizarBackupDrive, restaurarDoDrive, syncStatus, ultimoBackup } from "../data/driveSync.ts";
import { anos, categorias, contas, empresas } from "../data/repo.ts";
import { seedExemplo } from "../data/seed.ts";
import { type Ano, type Categoria, type Conta, type Empresa, type Natureza, NATUREZAS } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { money } from "../lib/format.ts";
import { NATURE_META } from "../lib/natureza.ts";
import { anoAtivo, applyTheme, empresaAtiva, setAno, setEmpresa, theme } from "../state.ts";

export function Ajustes() {
  const [tab, setTab] = useState<"empresas" | "anos" | "contas" | "sistema">("empresas");

  // Estados dos modais de Empresa
  const [modalEmpresa, setModalEmpresa] = useState<Partial<Empresa> | null>(null);

  // Estados dos modais de Ano
  const [modalAno, setModalAno] = useState<Partial<Ano> | null>(null);
  const [replicarAno, setReplicarAno] = useState<Ano | null>(null);

  // Estados dos modais de Categoria e Conta
  const [natTab, setNatTab] = useState<Natureza>("pagar");
  const [modalCat, setModalCat] = useState<Partial<Categoria> | null>(null);
  const [modalConta, setModalConta] = useState<Partial<Conta> | null>(null);

  // Estado de Autenticação / Finansys Cloud Vault
  const [modalAuthAberto, setModalAuthAberto] = useState(false);
  const [mostrarDrive, setMostrarDrive] = useState(false);

  // Live data
  const empId = empresaAtiva.value;
  const listaEmpresas = useLive(() => empresas.list(), [], []);
  const listaAnos = useLive(() => (empId ? anos.byEmpresa(empId) : Promise.resolve([])), [empId], []);
  const listaCats = useLive(() => (empId ? categorias.byEmpresa(empId, natTab) : Promise.resolve([])), [empId, natTab], []);
  const listaContas = useLive(() => (empId ? contas.byEmpresa(empId, natTab) : Promise.resolve([])), [empId, natTab], []);

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
    if (modalConta.id) {
      await contas.update(modalConta.id, {
        nome: modalConta.nome.trim(),
        categoriaId: modalConta.categoriaId,
        ativa: modalConta.ativa !== false,
      });
    } else {
      await contas.create({
        empresaId: empId,
        categoriaId: modalConta.categoriaId,
        natureza: natTab,
        nome: modalConta.nome.trim(),
        ativa: true,
      });
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
                        {emp.cnpj ? (emp.cnpj.replace(/\D/g, "").length <= 11 ? `CPF: ${emp.cnpj}` : `CNPJ: ${emp.cnpj}`) : "Sem CPF/CNPJ informado"}
                        {emp.endereco ? ` · ${emp.endereco}` : ""}
                      </div>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;">
                      {!isSelected && (
                        <button type="button" class="btn btn--ghost" style="font-size:var(--fs-xs);min-height:32px;" onClick={() => setEmpresa(emp.id)}>
                          Selecionar
                        </button>
                      )}
                      <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalEmpresa(emp)} aria-label="Editar empresa">
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
                                <div class="list__title" style="font-size:var(--fs-sm);opacity:!c.ativa ? 0.5 : 1;">
                                  {c.nome} {!c.ativa && <span class="badge badge--warn">Inativa</span>}
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
                <div style="display:flex;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:var(--r-md);padding:14px;background:var(--surface);flex-wrap:wrap;gap:12px;">
                  <div>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <i class="dot" style="background:var(--in);" />
                      <b style="font-size:var(--fs-sm);color:var(--text);">
                        {cloudUser.value.nome ? `${cloudUser.value.nome} (${cloudUser.value.email})` : cloudUser.value.email}
                      </b>
                      <span class="badge badge--in">Nuvem Ativa</span>
                    </div>
                    <div class="muted" style="font-size:var(--fs-xs);margin-top:4px;">
                      {cloudUltimoBackup.value ? (
                        <>Último backup em nuvem: {cloudUltimoBackup.value.toLocaleDateString("pt-BR")} às {cloudUltimoBackup.value.toLocaleTimeString("pt-BR")}</>
                      ) : (
                        "Sincronização contínua ativada."
                      )}
                    </div>
                  </div>

                  <div style="display:flex;gap:6px;align-items:center;">
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
                      class="btn btn--ghost btn--danger"
                      style="font-size:var(--fs-xs);min-height:34px;"
                      onClick={async () => {
                        const ok = await confirmarAcao({
                          titulo: "Desconectar Conta",
                          mensagem: "Deseja sair da conta neste aparelho? Seus dados locais serão preservados.",
                          rotuloConfirmar: "Sair da Conta",
                          tipo: "warning",
                        });
                        if (ok) {
                          desconectarConta();
                          toast.info("Você saiu da conta.");
                        }
                      }}
                    >
                      Sair
                    </button>
                  </div>
                </div>
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

          {/* ================= OUTRAS OPÇÕES DE BACKUP (RECOLHÍVEL) ================= */}
          <section class="card">
            <div class="card__head">
              <div>
                <h2 class="card__title">Opções Manuais & Google Drive</h2>
                <p class="muted" style="font-size:var(--fs-xs);">
                  Exportação manual em arquivo (.json) ou integração direta com Google Drive.
                </p>
              </div>
              <button
                type="button"
                class="btn btn--ghost"
                style="font-size:var(--fs-xs);min-height:30px;"
                onClick={() => setMostrarDrive(!mostrarDrive)}
              >
                {mostrarDrive ? "Ocultar" : "Mostrar Opções"} <Icon name="chevron" />
              </button>
            </div>

            {mostrarDrive && (
              <div class="stack" style="gap:var(--sp-4);padding-top:var(--sp-2);">
                {/* Backup Local em Arquivo */}
                <div style="border-top:1px solid var(--border);padding-top:var(--sp-3);">
                  <div style="font-weight:600;font-size:var(--fs-sm);margin-bottom:var(--sp-2);">
                    Cópia de Segurança Local (.json)
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
                      <Icon name="plus" /> Restaurar de Arquivo (.json)
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
                                mensagem: "Restaurar dados do arquivo selecionado? Isso mesclará as empresas, contas e lançamentos com os dados atuais.",
                                rotuloConfirmar: "Restaurar Dados",
                                tipo: "primary",
                              });
                              if (ok) {
                                const res = await restoreDatabase(parsed, "merge");
                                toast.success(`Sucesso! ${res.totalImportados} registros mesclados.`);
                              }
                            } catch (err) {
                              toast.error("Erro ao ler arquivo: " + String(err));
                            }
                          };
                          reader.readAsText(file);
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Google Drive Avançado */}
                <div style="border-top:1px solid var(--border);padding-top:var(--sp-3);">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-2);">
                    <div style="font-weight:600;font-size:var(--fs-sm);">Google Drive (appDataFolder)</div>
                    <span class={`badge ${syncStatus.value === "salvo" ? "badge--in" : ""}`}>
                      {googleUser.value ? "Conectado" : "Desconectado"}
                    </span>
                  </div>

                  {googleUser.value ? (
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface);border-radius:var(--r-md);border:1px solid var(--border);">
                      <div class="muted" style="font-size:var(--fs-xs);">{googleUser.value.email}</div>
                      <div style="display:flex;gap:6px;">
                        <button type="button" class="btn btn--secondary" style="font-size:var(--fs-xs);min-height:30px;" onClick={() => void realizarBackupDrive()}>
                          Backup no Drive
                        </button>
                        <button type="button" class="btn btn--danger" style="font-size:var(--fs-xs);min-height:30px;" onClick={desconectarGoogleDrive}>
                          Desconectar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div class="stack" style="gap:var(--sp-2);">
                      <input
                        class="input"
                        placeholder="Google Client ID (opcional)"
                        defaultValue={localStorage.getItem("g_client_id") || ""}
                        onBlur={(e) => localStorage.setItem("g_client_id", e.currentTarget.value.trim())}
                        style="font-size:var(--fs-xs);"
                      />
                      <button
                        type="button"
                        class="btn btn--secondary"
                        onClick={async () => {
                          const cid = localStorage.getItem("g_client_id") || prompt("Informe seu Google Client ID:") || "";
                          if (cid) {
                            localStorage.setItem("g_client_id", cid.trim());
                            await conectarGoogleDrive(cid.trim());
                          }
                        }}
                      >
                        <Icon name="cloud" /> Conectar via Google Drive
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
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
              value={modalEmpresa?.cnpj || ""}
              onInput={(e) => setModalEmpresa({ ...modalEmpresa, cnpj: e.currentTarget.value })}
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
        <form id="form-conta" onSubmit={salvarConta}>
          <div class="form-group">
            <label class="form-label" for="conta-nome">Nome da Conta *</label>
            <input
              id="conta-nome"
              class="input"
              required
              value={modalConta?.nome || ""}
              onInput={(e) => setModalConta({ ...modalConta, nome: e.currentTarget.value })}
              placeholder="Ex: Aluguel, Energia, Salários, Cliente X..."
            />
          </div>
          <div class="form-group">
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
            <div class="form-group" style="flex-direction:row;align-items:center;gap:8px;">
              <input
                id="conta-ativa"
                type="checkbox"
                checked={modalConta?.ativa !== false}
                onChange={(e) => setModalConta({ ...modalConta, ativa: e.currentTarget.checked })}
              />
              <label for="conta-ativa" style="font-size:var(--fs-sm);cursor:pointer;">
                Conta ativa (disponível para lançamentos)
              </label>
            </div>
          )}
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
    </>
  );
}

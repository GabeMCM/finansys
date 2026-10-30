import { useState } from "react";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { cloudSyncStatus, cloudUltimoBackup, cloudUser, desconectarConta, enviarBackupNuvem } from "../../data/cloudSync.ts";
import { getInactivityTimeout, lockScreenNow, setInactivityTimeout } from "../../data/inactivityGuard.ts";
import { dumpDatabase } from "../../data/backup.ts";
import { anos, contasBancarias, empresas } from "../../data/repo.ts";
import type { Ano, ContaBancaria, Empresa } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { anoAtivo, applyTheme, empresaAtiva, setAno, setEmpresa, theme } from "../../state.ts";
import { useSignal } from "../../lib/signal.ts";

export function MobileAjustes({ onOpenAuth }: { onOpenAuth: () => void }) {
  const empId = useSignal(empresaAtiva);
  const anoNum = useSignal(anoAtivo);
  const currentTheme = useSignal(theme);
  const isDark = currentTheme === "dark";
  const user = useSignal(cloudUser);
  const syncStatus = useSignal(cloudSyncStatus);

  const [modalEmpresas, setModalEmpresas] = useState(false);
  const [modalNovaEmpresa, setModalNovaEmpresa] = useState(false);
  const [novoNomeEmpresa, setNovoNomeEmpresa] = useState("");

  const [modalAnos, setModalAnos] = useState(false);
  const [modalNovoAno, setModalNovoAno] = useState(false);
  const [novoAnoNum, setNovoAnoNum] = useState(new Date().getFullYear() + 1);

  const [modalBancos, setModalBancos] = useState(false);
  const [modalNovoBanco, setModalNovoBanco] = useState(false);
  const [novoNomeBanco, setNovoNomeBanco] = useState("");

  const [modalSeguranca, setModalSeguranca] = useState(false);
  const [timeoutInatividade, setTimeoutInatividade] = useState<number>(() => getInactivityTimeout());

  // Live data
  const listaEmpresas = useLive(() => empresas.list(), [], []);
  const listaAnos = useLive(() => (empId ? anos.byEmpresa(empId) : Promise.resolve([])), [empId], []);
  const listaBancos = useLive(() => (empId ? contasBancarias.byEmpresa(empId) : Promise.resolve([])), [empId], []);

  const empAtual = listaEmpresas.find((e) => e.id === empId);

  const criarEmpresa = async () => {
    if (!novoNomeEmpresa.trim()) {
      toast.warn("Informe o nome da empresa.");
      return;
    }
    const criada = await empresas.create({ nome: novoNomeEmpresa.trim() });
    await anos.create({ empresaId: criada.id, ano: new Date().getFullYear(), bancaInicial: 0 });
    setEmpresa(criada.id);
    setAno(new Date().getFullYear());
    setNovoNomeEmpresa("");
    setModalNovaEmpresa(false);
    setModalEmpresas(false);
    toast.success("Empresa cadastrada!");
  };

  const criarAno = async () => {
    if (!empId) return;
    await anos.create({ empresaId: empId, ano: novoAnoNum, bancaInicial: 0 });
    setAno(novoAnoNum);
    setModalNovoAno(false);
    setModalAnos(false);
    toast.success(`Ano ${novoAnoNum} criado e ativado!`);
  };

  const criarBanco = async () => {
    if (!empId) return;
    if (!novoNomeBanco.trim()) {
      toast.warn("Informe o nome do banco.");
      return;
    }
    await contasBancarias.create({
      empresaId: empId,
      nome: novoNomeBanco.trim(),
      saldoInicialCentavos: 0,
      tipo: "corrente",
      ativa: true,
    });
    setNovoNomeBanco("");
    setModalNovoBanco(false);
    toast.success("Banco cadastrado!");
  };

  const exportarBackup = async () => {
    try {
      const data = await dumpDatabase();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-finansys-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup exportado!");
    } catch (e) {
      toast.error("Erro ao exportar: " + (e as Error).message);
    }
  };

  const forcarSyncNuvem = async () => {
    try {
      toast.info("Enviando dados para a nuvem...");
      await enviarBackupNuvem();
      toast.success("Sincronização concluída!");
    } catch (e) {
      toast.error("Erro na sincronização: " + (e as Error).message);
    }
  };

  return (
    <div style="display:flex;flex-direction:column;gap:20px;padding-bottom:70px;">
      {/* 1. Card de Perfil do Usuário */}
      <div
        class="card"
        style={{
          borderRadius: "20px",
          padding: "18px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          background: "var(--surface)",
        }}
      >
        <div class="mobile-avatar" style="width:48px;height:48px;font-size:1.2rem;">
          <span>{user?.nome ? user.nome.charAt(0).toUpperCase() : user?.email ? user.email.charAt(0).toUpperCase() : "U"}</span>
        </div>

        <div style="flex:1;min-width:0;">
          <h2 style="font-size:1rem;font-weight:800;margin:0;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            {user?.nome || (user?.email ? user.email.split("@")[0] : "Visitante")}
          </h2>
          <div style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">
            {user?.email || "Nuvem desconectada"}
          </div>
        </div>

        {user ? (
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            style="color:var(--out);font-size:0.75rem;padding:6px 10px;"
            onClick={() => desconectarConta()}
            title="Sair da conta"
          >
            Sair
          </button>
        ) : (
          <button
            type="button"
            class="btn btn--primary btn--sm"
            onClick={onOpenAuth}
          >
            Entrar
          </button>
        )}
      </div>

      {/* 2. Grupo: Empresa & Anos Fiscais */}
      <div class="mobile-settings-section">
        <h3 class="mobile-settings-section__title">Organização</h3>
        <div class="mobile-settings-list">
          {/* Empresa Ativa */}
          <button
            type="button"
            class="mobile-settings-row"
            onClick={() => setModalEmpresas(true)}
          >
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--primary-soft);color:var(--primary);">
                <Icon name="building" />
              </div>
              <div>
                <div class="mobile-settings-row__title">Empresa Ativa</div>
                <div class="mobile-settings-row__sub">{empAtual?.nome || "Selecionar empresa"}</div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <span>{listaEmpresas.length} cadastrada(s)</span>
              <Icon name="chevron" style="transform:rotate(-90deg);width:14px;height:14px;" />
            </div>
          </button>

          {/* Ano Fiscal */}
          <button
            type="button"
            class="mobile-settings-row"
            onClick={() => setModalAnos(true)}
          >
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--in-soft);color:var(--in);">
                <Icon name="calendar" />
              </div>
              <div>
                <div class="mobile-settings-row__title">Ano Fiscal</div>
                <div class="mobile-settings-row__sub">Exercício de {anoNum}</div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <span>{anoNum}</span>
              <Icon name="chevron" style="transform:rotate(-90deg);width:14px;height:14px;" />
            </div>
          </button>

          {/* Bancos & Instituições */}
          <button
            type="button"
            class="mobile-settings-row"
            onClick={() => setModalBancos(true)}
          >
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--warn-soft);color:var(--warn);">
                <Icon name="bank" />
              </div>
              <div>
                <div class="mobile-settings-row__title">Contas & Bancos</div>
                <div class="mobile-settings-row__sub">{listaBancos.length} conta(s) bancária(s)</div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <Icon name="chevron" style="transform:rotate(-90deg);width:14px;height:14px;" />
            </div>
          </button>
        </div>
      </div>

      {/* 3. Grupo: Nuvem & Backup */}
      <div class="mobile-settings-section">
        <h3 class="mobile-settings-section__title">Nuvem & Dados</h3>
        <div class="mobile-settings-list">
          {/* Sincronizar Nuvem */}
          <button
            type="button"
            class="mobile-settings-row"
            onClick={forcarSyncNuvem}
          >
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--primary-soft);color:var(--primary);">
                <Icon name="cloud" />
              </div>
              <div>
                <div class="mobile-settings-row__title">Backup em Nuvem</div>
                <div class="mobile-settings-row__sub">
                  {syncStatus === "salvo" ? "Sincronizado" : "Sincronizar agora"}
                </div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <Icon name="refresh" style="width:16px;height:16px;" />
            </div>
          </button>

          {/* Exportar Backup */}
          <button
            type="button"
            class="mobile-settings-row"
            onClick={exportarBackup}
          >
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--surface-hover);color:var(--text);">
                <Icon name="download" />
              </div>
              <div>
                <div class="mobile-settings-row__title">Exportar Arquivo JSON</div>
                <div class="mobile-settings-row__sub">Cópia de segurança para o celular</div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <Icon name="chevron" style="transform:rotate(-90deg);width:14px;height:14px;" />
            </div>
          </button>
        </div>
      </div>

      {/* 4. Grupo: Segurança & Sistema */}
      <div class="mobile-settings-section">
        <h3 class="mobile-settings-section__title">Segurança & Aparência</h3>
        <div class="mobile-settings-list">
          {/* Bloqueio por Inatividade */}
          <button
            type="button"
            class="mobile-settings-row"
            onClick={() => setModalSeguranca(true)}
          >
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--out-soft);color:var(--out);">
                <Icon name="lock" />
              </div>
              <div>
                <div class="mobile-settings-row__title">Bloqueio Automático</div>
                <div class="mobile-settings-row__sub">
                  {timeoutInatividade === 0 ? "Desativado" : `${Math.round(timeoutInatividade / 60000)} minutos`}
                </div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <Icon name="chevron" style="transform:rotate(-90deg);width:14px;height:14px;" />
            </div>
          </button>

          {/* Alternar Tema Escuro / Claro */}
          <button
            type="button"
            class="mobile-settings-row"
            onClick={() => applyTheme(isDark ? "light" : "dark")}
          >
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--surface-hover);color:var(--text);">
                <Icon name={isDark ? "sun" : "moon"} />
              </div>
              <div>
                <div class="mobile-settings-row__title">Modo Visual</div>
                <div class="mobile-settings-row__sub">{isDark ? "Tema Escuro" : "Tema Claro"}</div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <span>{isDark ? "Escuro" : "Claro"}</span>
            </div>
          </button>
        </div>
      </div>

      {/* Bottom Sheet: Gerenciar Empresas */}
      {modalEmpresas && (
        <div class="modal-backdrop" onClick={() => setModalEmpresas(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Empresas</h3>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                onClick={() => setModalEmpresas(false)}
              >
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:8px;">
              {listaEmpresas.map((e) => {
                const isSelected = e.id === empId;
                return (
                  <button
                    key={e.id}
                    type="button"
                    class="card card--interactive"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px",
                      borderRadius: "14px",
                      border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: isSelected ? "var(--primary-soft)" : "var(--surface)",
                      textAlign: "left",
                    }}
                    onClick={() => {
                      setEmpresa(e.id);
                      setModalEmpresas(false);
                    }}
                  >
                    <div>
                      <strong style="color:var(--text);font-size:0.95rem;">{e.nome}</strong>
                      {e.cnpj && <div style="font-size:0.75rem;color:var(--text-muted);">{e.cnpj}</div>}
                    </div>
                    {isSelected && <Icon name="check" style="color:var(--primary);" />}
                  </button>
                );
              })}

              <button
                type="button"
                class="btn btn--secondary"
                style="margin-top:8px;min-height:44px;border-radius:12px;font-weight:700;"
                onClick={() => setModalNovaEmpresa(true)}
              >
                <Icon name="plus" /> Cadastrar Nova Empresa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: Nova Empresa */}
      {modalNovaEmpresa && (
        <div class="modal-backdrop" onClick={() => setModalNovaEmpresa(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Nova Empresa</h3>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                onClick={() => setModalNovaEmpresa(false)}
              >
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <label class="form-label">Nome da Empresa</label>
              <input
                type="text"
                class="input"
                placeholder="Ex: Minha Empresa Ltda"
                value={novoNomeEmpresa}
                onInput={(e) => setNovoNomeEmpresa((e.currentTarget as HTMLInputElement).value)}
                style="border-radius:14px;min-height:44px;"
                autoFocus
              />
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:48px;border-radius:14px;font-weight:800;"
                onClick={criarEmpresa}
              >
                Salvar Empresa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: Gerenciar Anos */}
      {modalAnos && (
        <div class="modal-backdrop" onClick={() => setModalAnos(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Anos Fiscais</h3>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                onClick={() => setModalAnos(false)}
              >
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              {listaAnos.map((a) => {
                const isSelected = a.ano === anoNum;
                return (
                  <button
                    key={a.ano}
                    type="button"
                    class="card card--interactive"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "16px",
                      borderRadius: "14px",
                      border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: isSelected ? "var(--primary-soft)" : "var(--surface)",
                      cursor: "pointer",
                      gap: "4px",
                    }}
                    onClick={() => {
                      setAno(a.ano);
                      setModalAnos(false);
                    }}
                  >
                    <span style="font-size:1.3rem;font-weight:900;color:var(--text);">{a.ano}</span>
                    <span style="font-size:0.72rem;color:var(--text-muted);">
                      {isSelected ? "Ano Ativo" : "Alternar"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--secondary"
                style="width:100%;min-height:44px;border-radius:12px;font-weight:700;"
                onClick={() => setModalNovoAno(true)}
              >
                <Icon name="plus" /> Abrir Novo Ano Fiscal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: Novo Ano */}
      {modalNovoAno && (
        <div class="modal-backdrop" onClick={() => setModalNovoAno(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Abrir Novo Ano Fiscal</h3>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                onClick={() => setModalNovoAno(false)}
              >
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <label class="form-label">Número do Ano</label>
              <input
                type="number"
                class="input"
                value={novoAnoNum}
                onInput={(e) => setNovoAnoNum(parseInt((e.currentTarget as HTMLInputElement).value, 10))}
                style="border-radius:14px;min-height:44px;"
                autoFocus
              />
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:48px;border-radius:14px;font-weight:800;"
                onClick={criarAno}
              >
                Criar Ano
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: Bancos */}
      {modalBancos && (
        <div class="modal-backdrop" onClick={() => setModalBancos(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Contas & Bancos</h3>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                onClick={() => setModalBancos(false)}
              >
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:8px;">
              {listaBancos.map((b) => (
                <div
                  key={b.id}
                  class="card"
                  style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:14px;"
                >
                  <div style="display:flex;align-items:center;gap:10px;">
                    <Icon name="bank" style="color:var(--primary);" />
                    <strong>{b.nome}</strong>
                  </div>
                </div>
              ))}

              <button
                type="button"
                class="btn btn--secondary"
                style="margin-top:8px;min-height:44px;border-radius:12px;font-weight:700;"
                onClick={() => setModalNovoBanco(true)}
              >
                <Icon name="plus" /> Adicionar Banco
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: Novo Banco */}
      {modalNovoBanco && (
        <div class="modal-backdrop" onClick={() => setModalNovoBanco(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Novo Banco</h3>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                onClick={() => setModalNovoBanco(false)}
              >
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <label class="form-label">Nome da Instituição</label>
              <input
                type="text"
                class="input"
                placeholder="Ex: Nubank, Inter, Caixa, Itaú, Bradesco..."
                value={novoNomeBanco}
                onInput={(e) => setNovoNomeBanco((e.currentTarget as HTMLInputElement).value)}
                style="border-radius:14px;min-height:44px;"
                autoFocus
              />
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:48px;border-radius:14px;font-weight:800;"
                onClick={criarBanco}
              >
                Salvar Banco
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: Segurança & Inatividade */}
      {modalSeguranca && (
        <div class="modal-backdrop" onClick={() => setModalSeguranca(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Segurança & Bloqueio</h3>
              <button
                type="button"
                class="btn btn--ghost btn--icon"
                onClick={() => setModalSeguranca(false)}
              >
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:10px;">
              <p style="font-size:0.80rem;color:var(--text-muted);margin:0 0 6px;">
                Tempo de ausência sem toque para bloquear a tela:
              </p>

              {[
                { label: "1 Minuto", val: 60000 },
                { label: "5 Minutos (Recomendado)", val: 300000 },
                { label: "15 Minutos", val: 900000 },
                { label: "Desativado", val: 0 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  class="card card--interactive"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px",
                    borderRadius: "14px",
                    border: timeoutInatividade === opt.val ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: timeoutInatividade === opt.val ? "var(--primary-soft)" : "var(--surface)",
                  }}
                  onClick={() => {
                    setInactivityTimeout(opt.val);
                    setTimeoutInatividade(opt.val);
                    setModalSeguranca(false);
                    toast.success("Tempo de bloqueio atualizado!");
                  }}
                >
                  <strong style="color:var(--text);font-size:0.90rem;">{opt.label}</strong>
                  {timeoutInatividade === opt.val && <Icon name="check" style="color:var(--primary);" />}
                </button>
              ))}

              <button
                type="button"
                class="btn btn--secondary"
                style="margin-top:12px;min-height:44px;border-radius:12px;color:var(--out);font-weight:700;"
                onClick={() => {
                  setModalSeguranca(false);
                  lockScreenNow();
                }}
              >
                <Icon name="lock" /> Bloquear Tela Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

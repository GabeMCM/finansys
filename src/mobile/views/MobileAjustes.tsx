import { useState } from "react";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { confirmarAcao } from "../../components/ModalConfirm.tsx";
import { cloudSyncStatus, cloudUltimoBackup, cloudUser, desconectarConta, enviarBackupNuvem } from "../../data/cloudSync.ts";
import { getInactivityTimeout, lockScreenNow, setInactivityTimeout } from "../../data/inactivityGuard.ts";
import { dumpDatabase, restoreDatabase } from "../../data/backup.ts";
import { anos, categorias, contas, contasBancarias, empresas } from "../../data/repo.ts";
import type { Ano, Categoria, Conta, ContaBancaria, Empresa, Natureza } from "../../data/types.ts";
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

  // Modais de Empresa
  const [modalEmpresas, setModalEmpresas] = useState(false);
  const [modalNovaEmpresa, setModalNovaEmpresa] = useState(false);
  const [novoNomeEmpresa, setNovoNomeEmpresa] = useState("");

  // Modais de Ano
  const [modalAnos, setModalAnos] = useState(false);
  const [modalNovoAno, setModalNovoAno] = useState(false);
  const [novoAnoNum, setNovoAnoNum] = useState(new Date().getFullYear() + 1);

  // Modais de Bancos
  const [modalBancos, setModalBancos] = useState(false);
  const [modalNovoBanco, setModalNovoBanco] = useState(false);
  const [novoNomeBanco, setNovoNomeBanco] = useState("");
  const [novoTipoBanco, setNovoTipoBanco] = useState<"corrente" | "investimento" | "poupanca" | "dinheiro">("corrente");

  // Modais de Categorias
  const [modalCategorias, setModalCategorias] = useState(false);
  const [modalNovaCategoria, setModalNovaCategoria] = useState(false);
  const [novaCatNome, setNovaCatNome] = useState("");
  const [novaCatNat, setNovaCatNat] = useState<Natureza>("pagar");
  const [filtroNatCat, setFiltroNatCat] = useState<"todas" | Natureza>("todas");

  // Modais de Contas
  const [modalContas, setModalContas] = useState(false);
  const [modalNovaConta, setModalNovaConta] = useState(false);
  const [novaContaNome, setNovaContaNome] = useState("");
  const [novaContaCatId, setNovaContaCatId] = useState("");
  const [novaContaNat, setNovaContaNat] = useState<Natureza>("pagar");
  const [filtroNatConta, setFiltroNatConta] = useState<"todas" | Natureza>("todas");

  // Segurança
  const [modalSeguranca, setModalSeguranca] = useState(false);
  const [timeoutInatividade, setTimeoutInatividade] = useState<number>(() => getInactivityTimeout());

  // Live data
  const listaEmpresas = useLive(() => empresas.list(), [], []);
  const listaAnos = useLive(() => (empId ? anos.byEmpresa(empId) : Promise.resolve([])), [empId], []);
  const listaBancos = useLive(() => (empId ? contasBancarias.byEmpresa(empId) : Promise.resolve([])), [empId], []);
  const listaCategorias = useLive(() => (empId ? categorias.byEmpresa(empId) : Promise.resolve([])), [empId], []);
  const listaContas = useLive(() => (empId ? contas.byEmpresa(empId) : Promise.resolve([])), [empId], []);

  const empAtual = listaEmpresas.find((e) => e.id === empId);

  // Ações de Empresa
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

  // Ações de Ano
  const criarAno = async () => {
    if (!empId) return;
    await anos.create({ empresaId: empId, ano: novoAnoNum, bancaInicial: 0 });
    setAno(novoAnoNum);
    setModalNovoAno(false);
    setModalAnos(false);
    toast.success(`Ano ${novoAnoNum} criado e ativado!`);
  };

  // Ações de Banco
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
      tipo: novoTipoBanco,
      ativa: true,
    });
    setNovoNomeBanco("");
    setModalNovoBanco(false);
    toast.success("Banco cadastrado!");
  };

  // Ações de Categorias
  const criarCategoria = async () => {
    if (!empId) return;
    if (!novaCatNome.trim()) {
      toast.warn("Informe o nome da categoria.");
      return;
    }
    await categorias.create({
      empresaId: empId,
      nome: novaCatNome.trim(),
      natureza: novaCatNat,
      cor: novaCatNat === "receber" ? "emerald" : novaCatNat === "aporte" ? "blue" : "rose",
    });
    setNovaCatNome("");
    setModalNovaCategoria(false);
    toast.success("Categoria cadastrada!");
  };

  const excluirCategoria = async (cat: Categoria) => {
    const ok = await confirmarAcao({
      titulo: "Excluir Categoria",
      mensagem: `Deseja excluir a categoria "${cat.nome}"?`,
      rotuloConfirmar: "Excluir",
      tipo: "danger",
    });
    if (ok) {
      await categorias.remove(cat.id);
      toast.success("Categoria excluída.");
    }
  };

  // Ações de Contas
  const criarConta = async () => {
    if (!empId) return;
    if (!novaContaNome.trim()) {
      toast.warn("Informe o nome da conta.");
      return;
    }
    if (!novaContaCatId) {
      toast.warn("Selecione uma categoria para a conta.");
      return;
    }
    await contas.create({
      empresaId: empId,
      categoriaId: novaContaCatId,
      nome: novaContaNome.trim(),
      natureza: novaContaNat,
      ativa: true,
    });
    setNovaContaNome("");
    setModalNovaConta(false);
    toast.success("Conta cadastrada com sucesso!");
  };

  const excluirConta = async (c: Conta) => {
    const ok = await confirmarAcao({
      titulo: "Excluir Conta",
      mensagem: `Deseja excluir a conta "${c.nome}"?`,
      rotuloConfirmar: "Excluir",
      tipo: "danger",
    });
    if (ok) {
      await contas.remove(c.id);
      toast.success("Conta excluída.");
    }
  };

  // Backup & Restauração
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
      toast.success("Backup baixado com sucesso!");
    } catch (e) {
      toast.error("Erro ao exportar: " + (e as Error).message);
    }
  };

  const restaurarArquivo = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const ok = await confirmarAcao({
          titulo: "Restaurar Backup",
          mensagem: "Restaurar os dados do arquivo? Isso mesclará as empresas, contas e lançamentos com a base atual.",
          rotuloConfirmar: "Restaurar Dados",
          tipo: "primary",
        });
        if (ok) {
          const res = await restoreDatabase(parsed, "merge");
          toast.success(`Sucesso! ${res.totalImportados} registros mesclados.`);
        }
      } catch (err) {
        toast.error("Erro ao ler backup: " + String(err));
      }
    };
    reader.readAsText(file);
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

  const catsFiltradas = listaCategorias.filter((c) => {
    if (filtroNatCat === "todas") return true;
    return c.natureza === filtroNatCat;
  });

  const contasFiltradas = listaContas.filter((c) => {
    if (filtroNatConta === "todas") return true;
    return c.natureza === filtroNatConta;
  });

  const catMap = new Map(listaCategorias.map((c) => [c.id, c.nome]));

  return (
    <div style="display:flex;flex-direction:column;gap:16px;padding-bottom:70px;">
      {/* 1. Card de Perfil do Usuário */}
      <div
        class="card"
        style={{
          borderRadius: "18px",
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          background: "var(--surface)",
        }}
      >
        <div class="mobile-avatar" style="width:44px;height:44px;font-size:1.1rem;">
          <span>{user?.nome ? user.nome.charAt(0).toUpperCase() : user?.email ? user.email.charAt(0).toUpperCase() : "U"}</span>
        </div>

        <div style="flex:1;min-width:0;">
          <h2 style="font-size:0.95rem;font-weight:800;margin:0;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            {user?.nome || (user?.email ? user.email.split("@")[0] : "Visitante")}
          </h2>
          <div style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">
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

      {/* 2. Grupo: Organização (Empresa, Ano, Bancos) */}
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
                <div class="mobile-settings-row__title">Contas Bancárias</div>
                <div class="mobile-settings-row__sub">{listaBancos.length} conta(s) cadastrada(s)</div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <Icon name="chevron" style="transform:rotate(-90deg);width:14px;height:14px;" />
            </div>
          </button>
        </div>
      </div>

      {/* 3. Grupo: Plano de Contas & Classificação */}
      <div class="mobile-settings-section">
        <h3 class="mobile-settings-section__title">Plano de Contas</h3>
        <div class="mobile-settings-list">
          {/* Categorias */}
          <button
            type="button"
            class="mobile-settings-row"
            onClick={() => setModalCategorias(true)}
          >
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--primary-soft);color:var(--primary);">
                <Icon name="grid" />
              </div>
              <div>
                <div class="mobile-settings-row__title">Categorias</div>
                <div class="mobile-settings-row__sub">{listaCategorias.length} categorias cadastradas</div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <Icon name="chevron" style="transform:rotate(-90deg);width:14px;height:14px;" />
            </div>
          </button>

          {/* Contas */}
          <button
            type="button"
            class="mobile-settings-row"
            onClick={() => setModalContas(true)}
          >
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--in-soft);color:var(--in);">
                <Icon name="list" />
              </div>
              <div>
                <div class="mobile-settings-row__title">Contas Financeiras</div>
                <div class="mobile-settings-row__sub">{listaContas.length} contas cadastradas</div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <Icon name="chevron" style="transform:rotate(-90deg);width:14px;height:14px;" />
            </div>
          </button>
        </div>
      </div>

      {/* 4. Grupo: Análises & Investimentos */}
      <div class="mobile-settings-section">
        <h3 class="mobile-settings-section__title">Relatórios & Bolsa</h3>
        <div class="mobile-settings-list">
          {/* DRE & Posição Bancária */}
          <a
            href="#/relatorios"
            class="mobile-settings-row"
            style="text-decoration:none;"
          >
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--in-soft);color:var(--in);">
                <Icon name="chart" />
              </div>
              <div>
                <div class="mobile-settings-row__title">DRE & Posição Bancária</div>
                <div class="mobile-settings-row__sub">Demonstrativo e saldos por instituição</div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <Icon name="chevron" style="transform:rotate(-90deg);width:14px;height:14px;" />
            </div>
          </a>

          {/* Bolsa de Valores & Ações */}
          <a
            href="#/investimentos"
            class="mobile-settings-row"
            style="text-decoration:none;"
          >
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--primary-soft);color:var(--primary);">
                <Icon name="sparkles" />
              </div>
              <div>
                <div class="mobile-settings-row__title">Ações & Radar B3</div>
                <div class="mobile-settings-row__sub">Preço Médio, Dividendos e Barsi/Bazin</div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <Icon name="chevron" style="transform:rotate(-90deg);width:14px;height:14px;" />
            </div>
          </a>
        </div>
      </div>

      {/* 5. Grupo: Nuvem & Backup */}
      <div class="mobile-settings-section">
        <h3 class="mobile-settings-section__title">Nuvem & Backup</h3>
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

          {/* Restaurar Backup JSON */}
          <label class="mobile-settings-row" style="cursor:pointer;margin:0;">
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--warn-soft);color:var(--warn);">
                <Icon name="plus" />
              </div>
              <div>
                <div class="mobile-settings-row__title">Restaurar Arquivo JSON</div>
                <div class="mobile-settings-row__sub">Importar dados de um backup anterior</div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <Icon name="chevron" style="transform:rotate(-90deg);width:14px;height:14px;" />
            </div>
            <input
              type="file"
              accept=".json,application/json"
              style="display:none;"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) restaurarArquivo(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {/* 6. Grupo: Segurança & Sistema */}
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

          {/* Tema Visual */}
          <div class="mobile-settings-row">
            <div class="mobile-settings-row__left">
              <div class="mobile-settings-icon" style="background:var(--surface-hover);color:var(--text);">
                <Icon name="sparkles" />
              </div>
              <div>
                <div class="mobile-settings-row__title">Tema Visual</div>
                <div class="mobile-settings-row__sub">{isDark ? "Tema Escuro Ativo" : "Tema Claro Ativo"}</div>
              </div>
            </div>
            <div class="mobile-settings-row__right">
              <button
                type="button"
                class="mobile-pill"
                onClick={() => applyTheme(isDark ? "light" : "dark")}
                style="border:none;cursor:pointer;background:var(--surface-hover);"
              >
                {isDark ? "Mudar p/ Claro" : "Mudar p/ Escuro"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          BOTTOM SHEETS / MODAIS
          ========================================================================= */}

      {/* Bottom Sheet: Gerenciar Empresas */}
      {modalEmpresas && (
        <div class="modal-backdrop" onClick={() => setModalEmpresas(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Empresas</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalEmpresas(false)}>
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
                      padding: "12px",
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
                      <strong style="color:var(--text);font-size:0.90rem;">{e.nome}</strong>
                      {e.cnpj && <div style="font-size:0.72rem;color:var(--text-muted);">{e.cnpj}</div>}
                    </div>
                    {isSelected && <Icon name="check" style="color:var(--primary);" />}
                  </button>
                );
              })}

              <button
                type="button"
                class="btn btn--secondary"
                style="margin-top:8px;min-height:42px;border-radius:12px;font-weight:700;"
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
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalNovaEmpresa(false)}>
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
                style="border-radius:14px;min-height:42px;"
                autoFocus
              />
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:46px;border-radius:14px;font-weight:800;"
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
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalAnos(false)}>
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
                      padding: "14px",
                      borderRadius: "14px",
                      border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: isSelected ? "var(--primary-soft)" : "var(--surface)",
                      gap: "4px",
                    }}
                    onClick={() => {
                      setAno(a.ano);
                      setModalAnos(false);
                    }}
                  >
                    <span style="font-size:1.1rem;font-weight:900;color:var(--text);">{a.ano}</span>
                    <span style="font-size:0.68rem;color:var(--text-muted);">
                      {isSelected ? "Ativo no momento" : "Tocar para ativar"}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                class="card card--interactive"
                style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px;border-radius:14px;border:1px dashed var(--border);background:var(--surface-hover);gap:4px;"
                onClick={() => setModalNovoAno(true)}
              >
                <Icon name="plus" style="width:20px;height:20px;color:var(--primary);" />
                <span style="font-size:0.75rem;font-weight:700;color:var(--primary);">Novo Ano</span>
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
              <h3 class="modal__title">Novo Ano Fiscal</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalNovoAno(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <label class="form-label">Ano Calendário</label>
              <input
                type="number"
                class="input"
                value={novoAnoNum}
                onInput={(e) => setNovoAnoNum(Number((e.currentTarget as HTMLInputElement).value))}
                style="border-radius:14px;min-height:42px;text-align:center;font-size:1.4rem;font-weight:800;"
              />
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:46px;border-radius:14px;font-weight:800;"
                onClick={criarAno}
              >
                Cadastrar Exercício
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: Gerenciar Bancos */}
      {modalBancos && (
        <div class="modal-backdrop" onClick={() => setModalBancos(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Contas Bancárias</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalBancos(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:8px;">
              {listaBancos.map((b) => (
                <div
                  key={b.id}
                  class="card"
                  style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:14px;background:var(--surface);"
                >
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div class="mobile-tx-card__icon" style="background:var(--primary-soft);color:var(--primary);width:32px;height:32px;">
                      <Icon name="bank" style="width:16px;height:16px;" />
                    </div>
                    <div>
                      <strong style="color:var(--text);font-size:0.85rem;">{b.nome}</strong>
                      <div style="font-size:0.68rem;color:var(--text-muted);text-transform:capitalize;">
                        {b.tipo || "Conta Corrente"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                class="btn btn--secondary"
                style="margin-top:8px;min-height:42px;border-radius:12px;font-weight:700;"
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
              <h3 class="modal__title">Novo Banco / Corretora</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalNovoBanco(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <label class="form-label">Nome da Instituição</label>
              <input
                type="text"
                class="input"
                placeholder="Ex: Nubank, Itaú, XP Investimentos"
                value={novoNomeBanco}
                onInput={(e) => setNovoNomeBanco((e.currentTarget as HTMLInputElement).value)}
                style="border-radius:14px;min-height:42px;"
                autoFocus
              />

              <label class="form-label">Tipo de Conta</label>
              <select
                class="select"
                value={novoTipoBanco}
                onChange={(e) => setNovoTipoBanco((e.currentTarget as HTMLSelectElement).value as any)}
                style="border-radius:14px;min-height:42px;"
              >
                <option value="corrente">Conta Corrente</option>
                <option value="investimento">Conta Investimentos / Corretora</option>
                <option value="poupanca">Conta Poupança</option>
                <option value="dinheiro">Dinheiro Físico / Caixa</option>
              </select>
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:46px;border-radius:14px;font-weight:800;"
                onClick={criarBanco}
              >
                Salvar Banco
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: Gerenciar Categorias */}
      {modalCategorias && (
        <div class="modal-backdrop" onClick={() => setModalCategorias(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Categorias ({listaCategorias.length})</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalCategorias(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:8px;">
              {/* Filtro por Natureza */}
              <div class="hscroll" style="gap:4px;padding-bottom:4px;">
                <button
                  type="button"
                  class={`chip ${filtroNatCat === "todas" ? "is-active" : ""}`}
                  onClick={() => setFiltroNatCat("todas")}
                >
                  Todas
                </button>
                <button
                  type="button"
                  class={`chip ${filtroNatCat === "pagar" ? "is-active" : ""}`}
                  onClick={() => setFiltroNatCat("pagar")}
                >
                  Despesas
                </button>
                <button
                  type="button"
                  class={`chip ${filtroNatCat === "receber" ? "is-active" : ""}`}
                  onClick={() => setFiltroNatCat("receber")}
                >
                  Receitas
                </button>
                <button
                  type="button"
                  class={`chip ${filtroNatCat === "aporte" ? "is-active" : ""}`}
                  onClick={() => setFiltroNatCat("aporte")}
                >
                  Aportes
                </button>
              </div>

              {catsFiltradas.map((cat) => (
                <div
                  key={cat.id}
                  class="card"
                  style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:12px;background:var(--surface);"
                >
                  <div style="display:flex;align-items:center;gap:8px;">
                    <i
                      class="dot"
                      style={`background:var(--${cat.natureza === "receber" ? "in" : cat.natureza === "aporte" ? "primary" : "out"});`}
                    />
                    <strong style="color:var(--text);font-size:0.85rem;">{cat.nome}</strong>
                  </div>
                  <button
                    type="button"
                    class="btn btn--ghost btn--icon btn--sm"
                    style="color:var(--text-muted);"
                    onClick={() => excluirCategoria(cat)}
                    title="Excluir Categoria"
                  >
                    <Icon name="trash" style="width:14px;height:14px;" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                class="btn btn--secondary"
                style="margin-top:8px;min-height:42px;border-radius:12px;font-weight:700;"
                onClick={() => setModalNovaCategoria(true)}
              >
                <Icon name="plus" /> Nova Categoria
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: Nova Categoria */}
      {modalNovaCategoria && (
        <div class="modal-backdrop" onClick={() => setModalNovaCategoria(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Nova Categoria</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalNovaCategoria(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <label class="form-label">Natureza</label>
              <div class="mobile-segmented" style="margin-bottom:0;">
                <button
                  type="button"
                  class={`mobile-segmented__btn ${novaCatNat === "pagar" ? "is-active" : ""}`}
                  onClick={() => setNovaCatNat("pagar")}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  class={`mobile-segmented__btn ${novaCatNat === "receber" ? "is-active" : ""}`}
                  onClick={() => setNovaCatNat("receber")}
                >
                  Receita
                </button>
              </div>

              <label class="form-label">Nome da Categoria</label>
              <input
                type="text"
                class="input"
                placeholder="Ex: Alimentação, Moradia, Salário"
                value={novaCatNome}
                onInput={(e) => setNovaCatNome((e.currentTarget as HTMLInputElement).value)}
                style="border-radius:14px;min-height:42px;"
                autoFocus
              />
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:46px;border-radius:14px;font-weight:800;"
                onClick={criarCategoria}
              >
                Salvar Categoria
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: Gerenciar Contas */}
      {modalContas && (
        <div class="modal-backdrop" onClick={() => setModalContas(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Contas ({listaContas.length})</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalContas(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:8px;">
              {/* Filtro por Natureza */}
              <div class="hscroll" style="gap:4px;padding-bottom:4px;">
                <button
                  type="button"
                  class={`chip ${filtroNatConta === "todas" ? "is-active" : ""}`}
                  onClick={() => setFiltroNatConta("todas")}
                >
                  Todas
                </button>
                <button
                  type="button"
                  class={`chip ${filtroNatConta === "pagar" ? "is-active" : ""}`}
                  onClick={() => setFiltroNatConta("pagar")}
                >
                  Despesas
                </button>
                <button
                  type="button"
                  class={`chip ${filtroNatConta === "receber" ? "is-active" : ""}`}
                  onClick={() => setFiltroNatConta("receber")}
                >
                  Receitas
                </button>
              </div>

              {contasFiltradas.map((c) => (
                <div
                  key={c.id}
                  class="card"
                  style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:12px;background:var(--surface);"
                >
                  <div>
                    <strong style="color:var(--text);font-size:0.85rem;">{c.nome}</strong>
                    <div style="font-size:0.68rem;color:var(--text-muted);">
                      {catMap.get(c.categoriaId) || "Sem categoria"}
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn--ghost btn--icon btn--sm"
                    style="color:var(--text-muted);"
                    onClick={() => excluirConta(c)}
                    title="Excluir Conta"
                  >
                    <Icon name="trash" style="width:14px;height:14px;" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                class="btn btn--secondary"
                style="margin-top:8px;min-height:42px;border-radius:12px;font-weight:700;"
                onClick={() => {
                  setNovaContaCatId(listaCategorias[0]?.id || "");
                  setModalNovaConta(true);
                }}
              >
                <Icon name="plus" /> Nova Conta Financeira
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: Nova Conta */}
      {modalNovaConta && (
        <div class="modal-backdrop" onClick={() => setModalNovaConta(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal__head">
              <h3 class="modal__title">Nova Conta Financeira</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalNovaConta(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <label class="form-label">Natureza</label>
              <div class="mobile-segmented" style="margin-bottom:0;">
                <button
                  type="button"
                  class={`mobile-segmented__btn ${novaContaNat === "pagar" ? "is-active" : ""}`}
                  onClick={() => setNovaContaNat("pagar")}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  class={`mobile-segmented__btn ${novaContaNat === "receber" ? "is-active" : ""}`}
                  onClick={() => setNovaContaNat("receber")}
                >
                  Receita
                </button>
              </div>

              <label class="form-label">Categoria Pai</label>
              <select
                class="select"
                value={novaContaCatId}
                onChange={(e) => setNovaContaCatId((e.currentTarget as HTMLSelectElement).value)}
                style="border-radius:14px;min-height:42px;"
              >
                {listaCategorias
                  .filter((cat) => cat.natureza === novaContaNat)
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nome}
                    </option>
                  ))}
              </select>

              <label class="form-label">Nome da Conta</label>
              <input
                type="text"
                class="input"
                placeholder="Ex: Supermercado, Aluguel, Consultoria"
                value={novaContaNome}
                onInput={(e) => setNovaContaNome((e.currentTarget as HTMLInputElement).value)}
                style="border-radius:14px;min-height:42px;"
                autoFocus
              />
            </div>

            <div class="modal__foot">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:46px;border-radius:14px;font-weight:800;"
                onClick={criarConta}
              >
                Salvar Conta
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
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalSeguranca(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:8px;">
              <p style="font-size:0.75rem;color:var(--text-muted);margin:0 0 6px;">
                Tempo de ausência sem toque para bloquear o aplicativo:
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
                    padding: "12px 14px",
                    borderRadius: "12px",
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
                  <strong style="color:var(--text);font-size:0.85rem;">{opt.label}</strong>
                  {timeoutInatividade === opt.val && <Icon name="check" style="color:var(--primary);" />}
                </button>
              ))}

              <button
                type="button"
                class="btn btn--secondary"
                style="margin-top:8px;min-height:42px;border-radius:12px;color:var(--out);font-weight:700;"
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

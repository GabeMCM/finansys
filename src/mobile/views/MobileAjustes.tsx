import { useState } from "react";
import { Icon } from "../../components/Icon.tsx";
import { toast } from "../../components/Toast.tsx";
import { confirmarAcao } from "../../components/ModalConfirm.tsx";
import { ModalReplicacao } from "../../components/ModalReplicacao.tsx";
import { atualizarNomePerfil, cloudSyncStatus, cloudUltimoBackup, cloudUser, desconectarConta, enviarBackupNuvem } from "../../data/cloudSync.ts";
import { getInactivityTimeout, lockScreenNow, setInactivityTimeout } from "../../data/inactivityGuard.ts";
import { dumpDatabase, restoreDatabase } from "../../data/backup.ts";
import { anos, categorias, contas, contasBancarias, empresas } from "../../data/repo.ts";
import type { Ano, Categoria, Conta, ContaBancaria, Empresa, Natureza } from "../../data/types.ts";
import { useLive } from "../../data/useLive.ts";
import { MoneyInput } from "../../components/lancamento/MoneyInput.tsx";
import { formatCpfCnpj, money } from "../../lib/format.ts";
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
  const [empresaEdicao, setEmpresaEdicao] = useState<Empresa | null>(null);

  // Modais de Ano
  const [modalAnos, setModalAnos] = useState(false);
  const [modalNovoAno, setModalNovoAno] = useState(false);
  const [novoAnoNum, setNovoAnoNum] = useState(new Date().getFullYear() + 1);
  const [modalReplicacaoAno, setModalReplicacaoAno] = useState(false);
  const [anoEdicao, setAnoEdicao] = useState<Ano | null>(null);

  // Modais de Bancos
  const [modalBancos, setModalBancos] = useState(false);
  const [modalBancoEdicao, setModalBancoEdicao] = useState<Partial<ContaBancaria> | null>(null);

  // Modais de Categorias
  const [modalCategorias, setModalCategorias] = useState(false);
  const [modalNovaCategoria, setModalNovaCategoria] = useState(false);
  const [novaCatNome, setNovaCatNome] = useState("");
  const [novaCatNat, setNovaCatNat] = useState<Natureza>("pagar");
  const [filtroNatCat, setFiltroNatCat] = useState<"todas" | Natureza>("todas");
  const [catEdicao, setCatEdicao] = useState<Categoria | null>(null);

  // Modais de Contas
  const [modalContas, setModalContas] = useState(false);
  const [modalNovaConta, setModalNovaConta] = useState(false);
  const [novaContaNome, setNovaContaNome] = useState("");
  const [novaContaCatId, setNovaContaCatId] = useState("");
  const [novaContaNat, setNovaContaNat] = useState<Natureza>("pagar");
  const [filtroNatConta, setFiltroNatConta] = useState<"todas" | Natureza>("todas");
  const [contaEdicao, setContaEdicao] = useState<Conta | null>(null);

  // Perfil Cloud
  const [modalNomePerfil, setModalNomePerfil] = useState<string | null>(null);

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

  const salvarEdicaoEmpresa = async () => {
    if (!empresaEdicao) return;
    const nome = (empresaEdicao.nome || "").trim();
    if (!nome) {
      toast.warn("Informe o nome da empresa.");
      return;
    }
    await empresas.update(empresaEdicao.id, {
      nome,
      cnpj: empresaEdicao.cnpj?.trim() || undefined,
      endereco: empresaEdicao.endereco?.trim() || undefined,
    });
    setEmpresaEdicao(null);
    toast.success("Empresa atualizada!");
  };

  const excluirEmpresa = async (emp: Empresa) => {
    const ok = await confirmarAcao({
      titulo: "Excluir Empresa",
      mensagem: `Tem certeza que deseja excluir a empresa "${emp.nome}"? Esta ação removerá todos os dados vinculados a ela.`,
      rotuloConfirmar: "Excluir Empresa",
      tipo: "danger",
    });
    if (ok) {
      await empresas.remove(emp.id);
      if (empId === emp.id) {
        const restantes = listaEmpresas.filter((x) => x.id !== emp.id);
        setEmpresa(restantes[0]?.id || "");
      }
      setEmpresaEdicao(null);
      toast.success(`Empresa "${emp.nome}" excluída.`);
    }
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

  const salvarEdicaoAno = async () => {
    if (!anoEdicao) return;
    await anos.update(anoEdicao.id, {
      bancaInicial: anoEdicao.bancaInicial || 0,
    });
    setAnoEdicao(null);
    toast.success(`Banca inicial do ano ${anoEdicao.ano} atualizada!`);
  };

  const excluirAno = async (a: Ano) => {
    const ok = await confirmarAcao({
      titulo: "Remover Ano Fiscal",
      mensagem: `Deseja remover o ano ${a.ano} e todos os seus lançamentos desta empresa?`,
      rotuloConfirmar: "Remover Ano",
      tipo: "danger",
    });
    if (ok) {
      await anos.remove(a.id);
      if (anoNum === a.ano) {
        const restantes = listaAnos.filter((x) => x.id !== a.id);
        if (restantes.length) setAno(restantes[restantes.length - 1].ano);
      }
      setAnoEdicao(null);
      toast.success(`Ano ${a.ano} removido.`);
    }
  };

  const salvarEdicaoCategoria = async () => {
    if (!catEdicao) return;
    const nome = (catEdicao.nome || "").trim();
    if (!nome) {
      toast.warn("Informe o nome da categoria.");
      return;
    }
    await categorias.update(catEdicao.id, { nome });
    setCatEdicao(null);
    toast.success("Categoria atualizada!");
  };

  const salvarEdicaoConta = async () => {
    if (!contaEdicao) return;
    const nome = (contaEdicao.nome || "").trim();
    if (!nome) {
      toast.warn("Informe o nome da conta.");
      return;
    }
    await contas.update(contaEdicao.id, {
      nome,
      categoriaId: contaEdicao.categoriaId,
      ativa: contaEdicao.ativa !== false,
    });
    setContaEdicao(null);
    toast.success("Conta atualizada!");
  };

  const salvarNomePerfil = async () => {
    if (modalNomePerfil === null) return;
    const nome = modalNomePerfil.trim();
    if (!nome) {
      toast.warn("Informe seu nome.");
      return;
    }
    await atualizarNomePerfil(nome);
    setModalNomePerfil(null);
    toast.success("Nome de perfil atualizado!");
  };

  // Ações de Banco
  const salvarBanco = async () => {
    if (!empId || !modalBancoEdicao) return;
    const nome = (modalBancoEdicao.nome || "").trim();
    if (!nome) {
      toast.warn("Informe o nome do banco.");
      return;
    }
    const dados = {
      empresaId: empId,
      nome,
      tipo: modalBancoEdicao.tipo || "corrente",
      saldoInicialCentavos: modalBancoEdicao.saldoInicialCentavos || 0,
      agencia: (modalBancoEdicao.agencia || "").trim() || undefined,
      numeroConta: (modalBancoEdicao.numeroConta || "").trim() || undefined,
      ativa: modalBancoEdicao.ativa !== false,
    };

    if (modalBancoEdicao.id) {
      await contasBancarias.update(modalBancoEdicao.id, dados);
      toast.success("Banco atualizado!");
    } else {
      await contasBancarias.create(dados);
      toast.success("Banco cadastrado!");
    }
    setModalBancoEdicao(null);
  };

  const excluirBanco = async (b: ContaBancaria) => {
    const ok = await confirmarAcao({
      titulo: "Excluir Conta Bancária",
      mensagem: `Deseja excluir a conta bancária "${b.nome}"?`,
      rotuloConfirmar: "Excluir",
      tipo: "danger",
    });
    if (!ok) return;
    await contasBancarias.remove(b.id);
    toast.success("Banco excluído!");
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
          <div style="display:flex;align-items:center;gap:6px;">
            <h2 style="font-size:0.95rem;font-weight:800;margin:0;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              {user?.nome || (user?.email ? user.email.split("@")[0] : "Visitante")}
            </h2>
            {user && (
              <button
                type="button"
                class="btn btn--ghost btn--icon btn--sm"
                style="width:24px;height:24px;color:var(--text-muted);"
                onClick={() => setModalNomePerfil(user.nome || "")}
                title="Editar nome do perfil"
              >
                <Icon name="pencil" style="width:12px;height:12px;" />
              </button>
            )}
          </div>
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
                  <div
                    key={e.id}
                    class="card"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: "14px",
                      border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: isSelected ? "var(--primary-soft)" : "var(--surface)",
                    }}
                  >
                    <div
                      style="flex:1;cursor:pointer;min-width:0;"
                      onClick={() => {
                        setEmpresa(e.id);
                        setModalEmpresas(false);
                      }}
                    >
                      <strong style="color:var(--text);font-size:0.90rem;">{e.nome}</strong>
                      {e.cnpj && <div style="font-size:0.72rem;color:var(--text-muted);">{e.cnpj}</div>}
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                      {isSelected && <Icon name="check" style="color:var(--primary);width:16px;height:16px;" />}
                      <button
                        type="button"
                        class="btn btn--ghost btn--icon btn--sm"
                        style="width:32px;height:32px;color:var(--text-muted);"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setEmpresaEdicao({ ...e, cnpj: formatCpfCnpj(e.cnpj || "") });
                        }}
                        title="Editar empresa"
                      >
                        <Icon name="pencil" style="width:14px;height:14px;" />
                      </button>
                    </div>
                  </div>
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

      {/* Modal: Editar Empresa */}
      {empresaEdicao && (
        <div class="modal-backdrop" onClick={() => setEmpresaEdicao(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()} style="max-height:85dvh;overflow-y:auto;">
            <div class="modal__head">
              <h3 class="modal__title">Editar Empresa</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setEmpresaEdicao(null)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <div>
                <label class="form-label">Nome da Empresa *</label>
                <input
                  type="text"
                  class="input"
                  value={empresaEdicao.nome}
                  onInput={(e) => setEmpresaEdicao({ ...empresaEdicao, nome: (e.currentTarget as HTMLInputElement).value })}
                  style="border-radius:14px;min-height:42px;"
                />
              </div>

              <div>
                <label class="form-label">CPF / CNPJ (Opcional)</label>
                <input
                  type="text"
                  class="input"
                  placeholder="00.000.000/0000-00"
                  value={empresaEdicao.cnpj || ""}
                  onInput={(e) => setEmpresaEdicao({ ...empresaEdicao, cnpj: formatCpfCnpj((e.currentTarget as HTMLInputElement).value) })}
                  style="border-radius:14px;min-height:42px;"
                />
              </div>

              <div>
                <label class="form-label">Endereço (Opcional)</label>
                <input
                  type="text"
                  class="input"
                  placeholder="Rua, número, cidade/UF"
                  value={empresaEdicao.endereco || ""}
                  onInput={(e) => setEmpresaEdicao({ ...empresaEdicao, endereco: (e.currentTarget as HTMLInputElement).value })}
                  style="border-radius:14px;min-height:42px;"
                />
              </div>

              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px;">
                <button
                  type="button"
                  class="btn btn--secondary"
                  style="color:var(--out);border-radius:12px;padding:0 12px;min-height:42px;"
                  onClick={() => excluirEmpresa(empresaEdicao)}
                  title="Excluir Empresa"
                >
                  <Icon name="trash" /> Excluir
                </button>
                <div style="display:flex;gap:8px;">
                  <button type="button" class="btn btn--ghost" style="border-radius:12px;min-height:42px;" onClick={() => setEmpresaEdicao(null)}>
                    Cancelar
                  </button>
                  <button type="button" class="btn btn--primary" style="border-radius:12px;min-height:42px;font-weight:700;" onClick={salvarEdicaoEmpresa}>
                    <Icon name="check" /> Salvar
                  </button>
                </div>
              </div>
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
                  <div
                    key={a.ano}
                    class="card card--interactive"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      padding: "12px",
                      borderRadius: "14px",
                      border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: isSelected ? "var(--primary-soft)" : "var(--surface)",
                      position: "relative",
                      gap: "4px",
                    }}
                  >
                    <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
                      <span style="font-size:1.15rem;font-weight:900;color:var(--text);">{a.ano}</span>
                      <button
                        type="button"
                        class="btn btn--ghost btn--icon btn--sm"
                        style="width:28px;height:28px;color:var(--text-muted);"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setAnoEdicao({ ...a });
                        }}
                        title="Editar ano"
                      >
                        <Icon name="pencil" style="width:13px;height:13px;" />
                      </button>
                    </div>

                    <div
                      style="cursor:pointer;flex:1;width:100%;"
                      onClick={() => {
                        setAno(a.ano);
                        setModalAnos(false);
                      }}
                    >
                      <div style="font-size:0.68rem;color:var(--text-muted);font-variant-numeric:tabular-nums;">
                        Banca: <strong style="color:var(--text);">{money(a.bancaInicial)}</strong>
                      </div>
                      <div style="font-size:0.65rem;color:isSelected ? 'var(--primary)' : 'var(--text-faint)';margin-top:2px;font-weight:600;">
                        {isSelected ? "● Ativo no momento" : "Tocar para ativar"}
                      </div>
                    </div>
                  </div>
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

            <div style="padding:12px 16px 16px;border-top:1px solid var(--border-soft);">
              <button
                type="button"
                class="btn btn--secondary"
                style="width:100%;min-height:44px;border-radius:14px;font-weight:700;font-size:0.80rem;gap:6px;"
                onClick={() => {
                  setModalAnos(false);
                  setModalReplicacaoAno(true);
                }}
              >
                <Icon name="copy" style="width:16px;height:16px;" />
                Replicar Ano com IPCA / Banco Central
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Ano */}
      {anoEdicao && (
        <div class="modal-backdrop" onClick={() => setAnoEdicao(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()} style="max-height:85dvh;overflow-y:auto;">
            <div class="modal__head">
              <h3 class="modal__title">Editar Exercício {anoEdicao.ano}</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setAnoEdicao(null)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <div>
                <label class="form-label">Banca Inicial de Abertura (R$)</label>
                <MoneyInput
                  variant="hero"
                  valueCentavos={anoEdicao.bancaInicial || 0}
                  onChangeCentavos={(cents) => setAnoEdicao({ ...anoEdicao, bancaInicial: cents })}
                />
                <span class="muted" style="font-size:0.68rem;margin-top:4px;display:block;">
                  Saldo de caixa consolidado com o qual este ano fiscal se inicia.
                </span>
              </div>

              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px;">
                <button
                  type="button"
                  class="btn btn--secondary"
                  style="color:var(--out);border-radius:12px;padding:0 12px;min-height:42px;"
                  onClick={() => excluirAno(anoEdicao)}
                  title="Excluir Ano"
                >
                  <Icon name="trash" /> Excluir Ano
                </button>
                <div style="display:flex;gap:8px;">
                  <button type="button" class="btn btn--ghost" style="border-radius:12px;min-height:42px;" onClick={() => setAnoEdicao(null)}>
                    Cancelar
                  </button>
                  <button type="button" class="btn btn--primary" style="border-radius:12px;min-height:42px;font-weight:700;" onClick={salvarEdicaoAno}>
                    <Icon name="check" /> Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Replicação de Ano com IPCA */}
      {modalReplicacaoAno && empId && (
        <ModalReplicacao
          empresaId={empId}
          anoAtual={anoNum}
          saldoFinalRealAtual={0}
          isOpen={modalReplicacaoAno}
          onClose={() => setModalReplicacaoAno(false)}
        />
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
              <h3 class="modal__title">Contas Bancárias ({listaBancos.length})</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalBancos(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:8px;max-height:65dvh;overflow-y:auto;">
              {listaBancos.length === 0 ? (
                <div class="card empty" style="border-radius:14px;padding:20px;text-align:center;">
                  <Icon name="bank" style="width:28px;height:28px;margin:0 auto 6px;color:var(--text-muted);display:block;" />
                  <p style="font-size:0.80rem;color:var(--text-muted);margin:0;">Nenhum banco cadastrado.</p>
                </div>
              ) : (
                listaBancos.map((b) => (
                  <div
                    key={b.id}
                    class="card"
                    style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:14px;background:var(--surface);gap:8px;"
                  >
                    <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
                      <div class="mobile-tx-card__icon" style="background:var(--primary-soft);color:var(--primary);width:34px;height:34px;flex-shrink:0;">
                        <Icon name="bank" style="width:16px;height:16px;" />
                      </div>
                      <div style="min-width:0;flex:1;">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                          <strong style="color:var(--text);font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{b.nome}</strong>
                          <span class="badge" style="font-size:0.65rem;padding:1px 6px;">
                            {b.tipo === "investimento" ? "Investimento" : b.tipo === "poupanca" ? "Poupança" : "Corrente"}
                          </span>
                        </div>
                        <div style="font-size:0.70rem;color:var(--text-muted);margin-top:2px;">
                          Saldo Inicial: <strong style="color:var(--text);">{money(b.saldoInicialCentavos || 0)}</strong>
                          {b.agencia ? ` · Ag ${b.agencia}` : ""}
                          {b.numeroConta ? ` · Cc ${b.numeroConta}` : ""}
                        </div>
                      </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                      <button
                        type="button"
                        class="btn btn--ghost btn--icon"
                        style="min-height:32px;width:32px;"
                        title="Editar banco"
                        onClick={() => setModalBancoEdicao({ ...b })}
                      >
                        <Icon name="pencil" style="width:15px;height:15px;" />
                      </button>
                      <button
                        type="button"
                        class="btn btn--ghost btn--icon"
                        style="min-height:32px;width:32px;color:var(--out);"
                        title="Excluir banco"
                        onClick={() => excluirBanco(b)}
                      >
                        <Icon name="trash" style="width:15px;height:15px;" />
                      </button>
                    </div>
                  </div>
                ))
              )}

              <button
                type="button"
                class="btn btn--secondary"
                style="margin-top:8px;min-height:44px;border-radius:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;"
                onClick={() => setModalBancoEdicao({ nome: "", tipo: "corrente", saldoInicialCentavos: 0, ativa: true })}
              >
                <Icon name="plus" /> Adicionar Banco / Conta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: Novo / Editar Banco */}
      {modalBancoEdicao && (
        <div class="modal-backdrop" onClick={() => setModalBancoEdicao(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()} style="max-height:85dvh;overflow-y:auto;">
            <div class="modal__head">
              <h3 class="modal__title">
                {modalBancoEdicao.id ? "Editar Conta Bancária" : "Novo Banco / Corretora"}
              </h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalBancoEdicao(null)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <div>
                <label class="form-label">Nome da Instituição *</label>
                <input
                  type="text"
                  class="input"
                  placeholder="Ex: Nubank, Itaú, XP Investimentos"
                  value={modalBancoEdicao.nome || ""}
                  onInput={(e) => setModalBancoEdicao({ ...modalBancoEdicao, nome: (e.currentTarget as HTMLInputElement).value })}
                  style="border-radius:14px;min-height:42px;"
                  autoFocus
                />
              </div>

              <div>
                <label class="form-label">Tipo de Conta</label>
                <select
                  class="select"
                  value={modalBancoEdicao.tipo || "corrente"}
                  onChange={(e) => setModalBancoEdicao({ ...modalBancoEdicao, tipo: (e.currentTarget as HTMLSelectElement).value as any })}
                  style="border-radius:14px;min-height:42px;"
                >
                  <option value="corrente">Conta Corrente</option>
                  <option value="investimento">Conta Investimentos / Corretora</option>
                  <option value="poupanca">Conta Poupança</option>
                  <option value="dinheiro">Dinheiro Físico / Caixa</option>
                </select>
              </div>

              <div>
                <label class="form-label">Saldo Inicial de Abertura (Banca)</label>
                <MoneyInput
                  variant="hero"
                  valueCentavos={modalBancoEdicao.saldoInicialCentavos || 0}
                  onChangeCentavos={(cents) => setModalBancoEdicao({ ...modalBancoEdicao, saldoInicialCentavos: cents })}
                />
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <div>
                  <label class="form-label">Agência (Opcional)</label>
                  <input
                    type="text"
                    class="input"
                    placeholder="Ex: 0001"
                    value={modalBancoEdicao.agencia || ""}
                    onInput={(e) => setModalBancoEdicao({ ...modalBancoEdicao, agencia: (e.currentTarget as HTMLInputElement).value })}
                    style="border-radius:12px;min-height:40px;"
                  />
                </div>
                <div>
                  <label class="form-label">Conta (Opcional)</label>
                  <input
                    type="text"
                    class="input"
                    placeholder="Ex: 12345-6"
                    value={modalBancoEdicao.numeroConta || ""}
                    onInput={(e) => setModalBancoEdicao({ ...modalBancoEdicao, numeroConta: (e.currentTarget as HTMLInputElement).value })}
                    style="border-radius:12px;min-height:40px;"
                  />
                </div>
              </div>
            </div>

            <div class="modal__foot" style="margin-top:14px;">
              <button
                type="button"
                class="btn btn--primary"
                style="width:100%;min-height:46px;border-radius:14px;font-weight:800;"
                onClick={salvarBanco}
              >
                Salvar Conta Bancária
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
                  <div style="display:flex;align-items:center;gap:4px;">
                    <button
                      type="button"
                      class="btn btn--ghost btn--icon btn--sm"
                      style="color:var(--text-muted);width:32px;height:32px;"
                      onClick={() => setCatEdicao({ ...cat })}
                      title="Editar Categoria"
                    >
                      <Icon name="pencil" style="width:14px;height:14px;" />
                    </button>
                    <button
                      type="button"
                      class="btn btn--ghost btn--icon btn--sm"
                      style="color:var(--text-muted);width:32px;height:32px;"
                      onClick={() => excluirCategoria(cat)}
                      title="Excluir Categoria"
                    >
                      <Icon name="trash" style="width:14px;height:14px;" />
                    </button>
                  </div>
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
                      {!c.ativa && " · Inativa"}
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;gap:4px;">
                    <button
                      type="button"
                      class="btn btn--ghost btn--icon btn--sm"
                      style="color:var(--text-muted);width:32px;height:32px;"
                      onClick={() => setContaEdicao({ ...c })}
                      title="Editar Conta"
                    >
                      <Icon name="pencil" style="width:14px;height:14px;" />
                    </button>
                    <button
                      type="button"
                      class="btn btn--ghost btn--icon btn--sm"
                      style="color:var(--text-muted);width:32px;height:32px;"
                      onClick={() => excluirConta(c)}
                      title="Excluir Conta"
                    >
                      <Icon name="trash" style="width:14px;height:14px;" />
                    </button>
                  </div>
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

      {/* Modal: Editar Categoria */}
      {catEdicao && (
        <div class="modal-backdrop" onClick={() => setCatEdicao(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()} style="max-height:85dvh;overflow-y:auto;">
            <div class="modal__head">
              <h3 class="modal__title">Editar Categoria</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setCatEdicao(null)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <div>
                <label class="form-label">Nome da Categoria *</label>
                <input
                  type="text"
                  class="input"
                  value={catEdicao.nome}
                  onInput={(e) => setCatEdicao({ ...catEdicao, nome: (e.currentTarget as HTMLInputElement).value })}
                  style="border-radius:14px;min-height:42px;"
                  autoFocus
                />
              </div>

              <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
                <button type="button" class="btn btn--ghost" style="border-radius:12px;min-height:42px;" onClick={() => setCatEdicao(null)}>
                  Cancelar
                </button>
                <button type="button" class="btn btn--primary" style="border-radius:12px;min-height:42px;font-weight:700;" onClick={salvarEdicaoCategoria}>
                  <Icon name="check" /> Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Conta Financeira */}
      {contaEdicao && (
        <div class="modal-backdrop" onClick={() => setContaEdicao(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()} style="max-height:85dvh;overflow-y:auto;">
            <div class="modal__head">
              <h3 class="modal__title">Editar Conta Financeira</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setContaEdicao(null)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <div>
                <label class="form-label">Nome da Conta *</label>
                <input
                  type="text"
                  class="input"
                  value={contaEdicao.nome}
                  onInput={(e) => setContaEdicao({ ...contaEdicao, nome: (e.currentTarget as HTMLInputElement).value })}
                  style="border-radius:14px;min-height:42px;"
                  autoFocus
                />
              </div>

              <div>
                <label class="form-label">Categoria</label>
                <select
                  class="select"
                  value={contaEdicao.categoriaId}
                  onChange={(e) => setContaEdicao({ ...contaEdicao, categoriaId: (e.currentTarget as HTMLSelectElement).value })}
                  style="border-radius:14px;min-height:42px;"
                >
                  {listaCategorias
                    .filter((cat) => cat.natureza === contaEdicao.natureza)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nome}
                      </option>
                    ))}
                </select>
              </div>

              <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer;color:var(--text);">
                <input
                  type="checkbox"
                  checked={contaEdicao.ativa !== false}
                  onChange={(e) => setContaEdicao({ ...contaEdicao, ativa: (e.currentTarget as HTMLInputElement).checked })}
                />
                Conta Ativa no Exercício
              </label>

              <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
                <button type="button" class="btn btn--ghost" style="border-radius:12px;min-height:42px;" onClick={() => setContaEdicao(null)}>
                  Cancelar
                </button>
                <button type="button" class="btn btn--primary" style="border-radius:12px;min-height:42px;font-weight:700;" onClick={salvarEdicaoConta}>
                  <Icon name="check" /> Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Nome de Perfil Cloud */}
      {modalNomePerfil !== null && (
        <div class="modal-backdrop" onClick={() => setModalNomePerfil(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()} style="max-height:85dvh;overflow-y:auto;">
            <div class="modal__head">
              <h3 class="modal__title">Editar Nome de Perfil</h3>
              <button type="button" class="btn btn--ghost btn--icon" onClick={() => setModalNomePerfil(null)}>
                <Icon name="x" />
              </button>
            </div>

            <div class="modal__body" style="display:flex;flex-direction:column;gap:12px;">
              <div>
                <label class="form-label">Seu Nome *</label>
                <input
                  type="text"
                  class="input"
                  placeholder="Ex: João da Silva"
                  value={modalNomePerfil}
                  onInput={(e) => setModalNomePerfil((e.currentTarget as HTMLInputElement).value)}
                  style="border-radius:14px;min-height:42px;"
                  autoFocus
                />
              </div>

              <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
                <button type="button" class="btn btn--ghost" style="border-radius:12px;min-height:42px;" onClick={() => setModalNomePerfil(null)}>
                  Cancelar
                </button>
                <button type="button" class="btn btn--primary" style="border-radius:12px;min-height:42px;font-weight:700;" onClick={salvarNomePerfil}>
                  <Icon name="check" /> Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

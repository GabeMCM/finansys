import { useState, useRef, useEffect } from "preact/hooks";
import type { Categoria, Conta, Natureza } from "../../data/types.ts";
import { Icon } from "../Icon.tsx";

export interface ContaPickerProps {
  id?: string;
  natureza: Natureza;
  categorias: Categoria[];
  contas: Conta[];
  selectedContaId: string;
  onChange: (contaId: string, categoriaId: string) => void;
  onCriarCategoria: (nome: string) => Promise<string>;
  onCriarConta: (nome: string, categoriaId: string) => Promise<string>;
  disabled?: boolean;
}

export function ContaPicker({
  id,
  natureza,
  categorias,
  contas,
  selectedContaId,
  onChange,
  onCriarCategoria,
  onCriarConta,
  disabled = false,
}: ContaPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [inlineMode, setInlineMode] = useState<"none" | "nova-cat" | "nova-conta">("none");
  const [novoNome, setNovoNome] = useState("");
  const [novaContaCatId, setNovaContaCatId] = useState("");
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setInlineMode("none");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Foco no campo apropriado
  useEffect(() => {
    if (isOpen) {
      if (inlineMode !== "none") {
        inlineInputRef.current?.focus();
      } else {
        searchInputRef.current?.focus();
      }
    }
  }, [isOpen, inlineMode]);

  // Contas e categorias filtradas pela natureza e ativas
  const catsDaNat = categorias.filter((c) => c.natureza === natureza);
  const contasDaNat = contas.filter((c) => c.natureza === natureza && c.ativa);

  // Mapeamento conta selecionada
  const contaSelecionada = contas.find((c) => c.id === selectedContaId);
  const catSelecionada = contaSelecionada ? categorias.find((c) => c.id === contaSelecionada.categoriaId) : null;

  const q = search.trim().toLowerCase();
  const contasFiltradas = contasDaNat.filter((c) => {
    if (!q) return true;
    const cat = categorias.find((cat) => cat.id === c.categoriaId);
    return c.nome.toLowerCase().includes(q) || (cat && cat.nome.toLowerCase().includes(q));
  });

  // Agrupa contas por categoria
  const grupos = catsDaNat
    .map((cat) => ({
      categoria: cat,
      contas: contasFiltradas.filter((c) => c.categoriaId === cat.id),
    }))
    .filter((g) => g.contas.length > 0 || !q);

  const handleSelect = (c: Conta) => {
    onChange(c.id, c.categoriaId);
    setIsOpen(false);
    setInlineMode("none");
    setSearch("");
  };

  const handleSalvarInline = async (e: Event) => {
    e.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;

    setLoading(true);
    try {
      if (inlineMode === "nova-cat") {
        const catId = await onCriarCategoria(nome);
        setNovoNome("");
        // Já prepara para criar uma conta dentro da nova categoria
        setNovaContaCatId(catId);
        setInlineMode("nova-conta");
      } else if (inlineMode === "nova-conta") {
        const catIdAlvo = novaContaCatId || (catsDaNat[0]?.id || "");
        if (!catIdAlvo) {
          setInlineMode("nova-cat");
          return;
        }
        const criadaContaId = await onCriarConta(nome, catIdAlvo);
        onChange(criadaContaId, catIdAlvo);
        setNovoNome("");
        setInlineMode("none");
        setIsOpen(false);
        setSearch("");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="picker" ref={containerRef}>
      <button
        id={id}
        type="button"
        class={`picker__trigger ${isOpen ? "picker__trigger--open" : ""}`}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setInlineMode("none");
          }
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span style="display:flex;align-items:center;gap:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          {contaSelecionada ? (
            <>
              <span style="color:var(--text-muted);font-size:var(--fs-xs);">
                {catSelecionada?.nome || "Sem Categoria"} ›
              </span>
              <strong style="color:var(--text);">{contaSelecionada.nome}</strong>
            </>
          ) : (
            <span style="color:var(--text-muted);">Selecione Categoria › Conta...</span>
          )}
        </span>
        <Icon name="chevronDown" style={`width:15px;height:15px;color:var(--text-muted);transition:transform 0.15s;${isOpen ? "transform:rotate(180deg);" : ""}`} />
      </button>

      {isOpen && (
        <div class="picker__dropdown" role="listbox">
          {inlineMode === "none" && (
            <>
              <div class="picker__search">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Buscar categoria ou conta..."
                  value={search}
                  onInput={(e) => setSearch((e.currentTarget as HTMLInputElement).value)}
                />
              </div>

              <div class="picker__list">
                {grupos.length === 0 ? (
                  <div style="padding:14px;text-align:center;font-size:var(--fs-xs);color:var(--text-muted);">
                    Nenhuma conta encontrada.
                  </div>
                ) : (
                  grupos.map((g) => (
                    <div key={g.categoria.id} style="margin-bottom:4px;">
                      <div class="picker__group-title">
                        {g.categoria.nome}
                      </div>
                      {g.contas.length === 0 ? (
                        <div style="padding:4px 10px;font-size:11px;color:var(--text-muted);font-style:italic;">
                          Nenhuma conta nesta categoria
                        </div>
                      ) : (
                        g.contas.map((c) => {
                          const isSelected = c.id === selectedContaId;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              class={`picker__item ${isSelected ? "picker__item--active" : ""}`}
                              onClick={() => handleSelect(c)}
                            >
                              <span>{c.nome}</span>
                              {isSelected && <Icon name="check" style="width:14px;height:14px;color:var(--primary);" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  ))
                )}
              </div>

              <div class="picker__create-footer">
                <button
                  type="button"
                  class="btn btn--ghost btn--sm"
                  style="font-size:var(--fs-xs);padding:4px 8px;gap:4px;"
                  onClick={() => {
                    setNovoNome("");
                    setInlineMode("nova-cat");
                  }}
                >
                  <Icon name="plus" style="width:12px;height:12px;" /> Nova Categoria
                </button>
                <button
                  type="button"
                  class="btn btn--secondary btn--sm"
                  style="font-size:var(--fs-xs);padding:4px 8px;gap:4px;"
                  onClick={() => {
                    setNovoNome("");
                    setNovaContaCatId(catSelecionada?.id || catsDaNat[0]?.id || "");
                    setInlineMode("nova-conta");
                  }}
                >
                  <Icon name="plus" style="width:12px;height:12px;" /> Nova Conta
                </button>
              </div>
            </>
          )}

          {inlineMode !== "none" && (
            <form class="picker__inline-form" onSubmit={handleSalvarInline}>
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <strong style="font-size:var(--fs-xs);color:var(--text);">
                  {inlineMode === "nova-cat" ? "Criar Nova Categoria" : "Criar Nova Conta"}
                </strong>
                <button
                  type="button"
                  class="btn btn--ghost btn--icon"
                  style="padding:2px;min-height:auto;"
                  onClick={() => setInlineMode("none")}
                >
                  <Icon name="x" style="width:14px;height:14px;" />
                </button>
              </div>

              {inlineMode === "nova-conta" && (
                <div>
                  <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">
                    Categoria da Conta:
                  </label>
                  <select
                    class="select"
                    style="min-height:30px;padding:4px 8px;font-size:var(--fs-xs);"
                    value={novaContaCatId || (catsDaNat[0]?.id || "")}
                    onChange={(e) => setNovaContaCatId((e.currentTarget as HTMLSelectElement).value)}
                  >
                    {catsDaNat.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label class="form-label" style="font-size:0.7rem;margin-bottom:2px;">
                  {inlineMode === "nova-cat" ? "Nome da Categoria:" : "Nome da Conta:"}
                </label>
                <input
                  ref={inlineInputRef}
                  type="text"
                  required
                  class="input"
                  style="min-height:30px;font-size:var(--fs-xs);padding:4px 8px;"
                  placeholder={inlineMode === "nova-cat" ? "Ex: Imóveis, Marketing..." : "Ex: Aluguel, Google Ads..."}
                  value={novoNome}
                  onInput={(e) => setNovoNome((e.currentTarget as HTMLInputElement).value)}
                />
              </div>

              <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:4px;">
                <button
                  type="button"
                  class="btn btn--ghost btn--sm"
                  style="padding:3px 8px;font-size:var(--fs-xs);"
                  onClick={() => setInlineMode("none")}
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  class="btn btn--primary btn--sm"
                  style="padding:3px 10px;font-size:var(--fs-xs);"
                  disabled={loading || !novoNome.trim()}
                >
                  {loading ? "Salvando..." : inlineMode === "nova-cat" ? "Salvar Categoria" : "Salvar Conta"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

import { Icon } from "../components/Icon.tsx";
import { calcular } from "../data/calc.ts";
import { anos, contas, empresas, lancamentos, projecoes } from "../data/repo.ts";
import { seedExemplo } from "../data/seed.ts";
import { NATUREZAS } from "../data/types.ts";
import { useLive } from "../data/useLive.ts";
import { money, moneyCompact, MONTHS, signed } from "../lib/format.ts";
import { NATURE_META } from "../lib/natureza.ts";
import { anoAtivo, empresaAtiva, setAno, setEmpresa } from "../state.ts";

const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function Vazio() {
  const carregar = async () => {
    const id = await seedExemplo();
    setEmpresa(id);
    setAno(new Date().getFullYear());
  };
  return (
    <section class="card empty">
      <Icon name="building" />
      <h2>Bem-vindo ao Finansys</h2>
      <p>Cadastre sua primeira empresa em Ajustes, ou carregue um exemplo para conhecer o sistema.</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap">
        <button id="seed-demo" class="btn" type="button" onClick={carregar}>Carregar exemplo</button>
        <a id="go-settings" class="btn btn--primary" href="#/ajustes">Cadastrar empresa</a>
      </div>
    </section>
  );
}

export function Dashboard() {
  const empId = empresaAtiva.value;
  const anoNum = anoAtivo.value;

  const dados = useLive(async () => {
    if (!empId) return null;
    const [emp, ano] = await Promise.all([empresas.get(empId), anos.find(empId, anoNum)]);
    if (!emp || !ano) return { emp, ano: undefined } as const;
    const [cs, ps, ls] = await Promise.all([contas.byEmpresa(empId), projecoes.byAno(ano.id), lancamentos.byAno(ano.id)]);
    return { emp, ano, cs, ps, ls } as const;
  }, [empId, anoNum], undefined);

  if (dados === undefined) return null; // carregando
  if (!dados || !dados.emp) return <Vazio />;
  if (!dados.ano) {
    return (
      <section class="card empty">
        <Icon name="calendar" />
        <h2>Nenhum ano aberto para {anoNum}</h2>
        <p>Abra o ano e informe a banca inicial em Ajustes.</p>
      </section>
    );
  }

  const { ano, cs, ps, ls } = dados;
  const hoje = new Date();
  const mesRef = ano.ano < hoje.getFullYear() ? 11 : ano.ano > hoje.getFullYear() ? -1 : hoje.getMonth();
  const r = calcular(ano.bancaInicial, cs, ps, ls, mesRef);
  const idx = Math.max(0, mesRef);
  const saldoReal = r.saldoReal[idx];
  const saldoProj = r.saldoProj[idx];
  const desvio = saldoReal - saldoProj;
  const max = Math.max(1, ...r.resultadoProj.map(Math.abs), ...r.resultadoReal.map(Math.abs));

  const contaNome = new Map(cs.map((c) => [c.id, c]));
  const recentes = [...ls].sort((a, b) => b.data.localeCompare(a.data) || b.createdAt - a.createdAt).slice(0, 6);

  return (
    <>
      <div class="page-head">
        <div>
          <h1>Visão geral</h1>
          <p>{mesRef >= 0 ? `Até ${MESES_LONGOS[idx]} de ${ano.ano}` : `Ano ${ano.ano} (futuro)`}</p>
        </div>
      </div>

      <div class="grid grid--dash">
        <div class="stack">
          <section class="hero" aria-label="Saldo em conta">
            <div class="hero__label">Saldo em conta</div>
            <div class="hero__value num">{money(saldoReal)}</div>
            <div class="hero__row num">
              <div><span>Projetado </span>{money(saldoProj)}</div>
              <div><span>Desvio </span><b>{signed(desvio)}</b></div>
              <div><span>Banca inicial </span>{money(ano.bancaInicial)}</div>
            </div>
          </section>

          <div class="grid grid--stats">
            {NATUREZAS.map((k) => {
              const meta = NATURE_META[k];
              const proj = r.projetado[k].slice(0, idx + 1).reduce((a, b) => a + b, 0);
              const real = r.real[k].slice(0, idx + 1).reduce((a, b) => a + b, 0);
              const pct = proj ? Math.round((real / proj) * 100) : 0;
              return (
                <div class="stat">
                  <div class="stat__label"><i class="dot" style={`background:var(--${meta.tone})`} />{meta.label}</div>
                  <div class="stat__value num">{moneyCompact(real)}</div>
                  <div class="stat__sub num">de {moneyCompact(proj)} · {pct}%</div>
                  <div class="progress" style="margin-top:8px">
                    <i style={`width:${Math.min(100, pct)}%;background:var(--${meta.tone})`} />
                  </div>
                </div>
              );
            })}
          </div>

          <section class="card">
            <div class="card__head">
              <h2 class="card__title">Resultado mensal</h2>
              <div class="legend">
                <span><i class="dot" style="background:color-mix(in srgb, var(--primary) 30%, transparent)" />Projetado</span>
                <span><i class="dot" style="background:var(--primary)" />Real</span>
              </div>
            </div>
            <div class="bars" role="img" aria-label="Resultado projetado versus real por mês">
              {MONTHS.map((m, i) => (
                <div class={`bars__col ${i === mesRef ? "is-current" : ""}`} title={`${m}: proj. ${money(r.resultadoProj[i])} · real ${money(r.resultadoReal[i])}`}>
                  <div class="bars__pair">
                    <div class="bars__bar bars__bar--proj" style={`height:${(Math.abs(r.resultadoProj[i]) / max) * 100}%;animation-delay:${i * 30}ms`} />
                    <div
                      class={`bars__bar ${i <= mesRef ? "bars__bar--real" : "bars__bar--future"} ${r.resultadoReal[i] < 0 ? "is-neg" : ""}`}
                      style={`height:${(Math.abs(r.resultadoReal[i]) / max) * 100}%;animation-delay:${i * 30 + 80}ms`}
                    />
                  </div>
                  <span class="bars__label">{m[0]}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section class="card">
          <div class="card__head">
            <h2 class="card__title">Últimos lançamentos</h2>
            <a href="#/lancamentos" class="btn btn--ghost" style="min-height:32px">Ver todos</a>
          </div>
          {recentes.length === 0 ? <p class="muted">Nenhum lançamento ainda.</p> : (
            <div class="list">
              {recentes.map((l) => {
                const c = contaNome.get(l.contaId);
                if (!c) return null;
                const meta = NATURE_META[c.natureza];
                const sinal = c.natureza === "pagar" || c.natureza === "saida" ? -1 : 1;
                const [, mm, dd] = l.data.split("-");
                return (
                  <div class="list__item">
                    <div class={`list__icon bg-${meta.tone}`}><Icon name={meta.icon} /></div>
                    <div class="list__body">
                      <div class="list__title">{l.descricao || c.nome}</div>
                      <div class="list__sub">{meta.label} · {dd}/{mm}{l.obs ? ` · ${l.obs}` : ""}</div>
                    </div>
                    <div class={`list__value num tone-${meta.tone}`}>{signed(sinal * l.valor)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

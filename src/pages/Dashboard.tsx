import { Icon } from "../components/Icon.tsx";
import { calcular, calcularCarteiraReservas } from "../data/calc.ts";
import { anos, categorias, contas, empresas, lancamentos, projecoes, reservaMovimentos, reservaProjecoes, reservas } from "../data/repo.ts";
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
    const [cs, ps, ls, cats, resList, movList, projResList] = await Promise.all([
      contas.byEmpresa(empId),
      projecoes.byAno(ano.id),
      lancamentos.byAno(ano.id),
      categorias.byEmpresa(empId),
      reservas.byEmpresa(empId),
      reservaMovimentos.byAno(ano.id),
      reservaProjecoes.byAno(ano.id),
    ]);
    return { emp, ano, cs, ps, ls, cats, resList, movList, projResList } as const;
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

  const { ano, cs, ps, ls, cats, resList, movList, projResList } = dados;
  const hoje = new Date();
  const mesRef = ano.ano < hoje.getFullYear() ? 11 : ano.ano > hoje.getFullYear() ? -1 : hoje.getMonth();
  const r = calcular(ano.bancaInicial, cs, ps, ls, mesRef);
  const idx = Math.max(0, mesRef);
  const saldoReal = r.saldoReal[idx];
  const saldoProj = r.saldoProj[idx];
  const desvio = saldoReal - saldoProj;
  const max = Math.max(1, ...r.resultadoProj.map(Math.abs), ...r.resultadoReal.map(Math.abs));

  const carteira = calcularCarteiraReservas(resList, movList, projResList, idx);
  const totalReservasReal = carteira.totalPatrimonioReal;
  const patrimonioConsolidado = saldoReal + totalReservasReal;

  const contaNome = new Map(cs.map((c) => [c.id, c]));
  const recentes = [...ls].sort((a, b) => b.data.localeCompare(a.data) || b.createdAt - a.createdAt).slice(0, 6);

  // Monitoramento do teto orçamentário por categoria no mês de referência
  const catDespesas = cats.filter((c) => c.natureza === "pagar" || c.natureza === "saida");
  const controleTeto = catDespesas.map((cat) => {
    const contasDestaCat = cs.filter((c) => c.categoriaId === cat.id);
    const cIds = new Set(contasDestaCat.map((c) => c.id));
    const proj = ps.filter((p) => cIds.has(p.contaId) && p.mes === idx).reduce((s, p) => s + p.valor, 0);
    const real = ls.filter((l) => cIds.has(l.contaId) && l.mes === idx).reduce((s, l) => s + l.valor, 0);
    const pct = proj > 0 ? Math.round((real / proj) * 100) : (real > 0 ? 100 : 0);
    const status: "estourado" | "alerta" | "sem_teto" | "ok" =
      proj === 0 && real > 0 ? "sem_teto" : real > proj ? "estourado" : pct >= 80 ? "alerta" : "ok";
    return { cat, proj, real, pct, status, excesso: real - proj };
  }).filter((item) => item.proj > 0 || item.real > 0)
    .sort((a, b) => {
      const peso: Record<string, number> = { estourado: 3, alerta: 2, sem_teto: 1, ok: 0 };
      return (peso[b.status] - peso[a.status]) || (b.pct - a.pct) || (b.real - a.real);
    });

  const estouradas = controleTeto.filter((c) => c.status === "estourado");
  const alertas = controleTeto.filter((c) => c.status === "alerta");

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
              {resList.length > 0 && (
                <>
                  <div>
                    <span>Reservas </span>
                    <a href="#/investimentos" style="color:inherit;text-decoration:underline;">
                      {money(totalReservasReal)}
                    </a>
                  </div>
                  <div>
                    <span>Patrimônio Total </span>
                    <b>{money(patrimonioConsolidado)}</b>
                  </div>
                </>
              )}
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

          {/* Controle de Teto Orçamentário */}
          <section class="card">
            <div class="card__head">
              <div>
                <h2 class="card__title" style="display:flex;align-items:center;gap:8px;">
                  <Icon name="wallet" /> Controle de Teto Orçamentário
                </h2>
                <span class="muted" style="font-size:var(--fs-xs);">
                  Categorias de despesa em {MESES_LONGOS[idx]} de {ano.ano}
                </span>
              </div>
              {estouradas.length > 0 ? (
                <span class="badge badge--out">
                  <Icon name="alertTriangle" style="width:12px;height:12px;" /> {estouradas.length} estourada{estouradas.length > 1 ? "s" : ""}
                </span>
              ) : alertas.length > 0 ? (
                <span class="badge badge--warn">
                  <Icon name="alertTriangle" style="width:12px;height:12px;" /> {alertas.length} em alerta
                </span>
              ) : controleTeto.length > 0 ? (
                <span class="badge badge--in">
                  <Icon name="check" style="width:12px;height:12px;" /> No teto
                </span>
              ) : null}
            </div>

            {estouradas.length > 0 && (
              <div
                class="alert alert--danger"
                style="margin-bottom:var(--sp-3);padding:10px 14px;border-radius:var(--r-md);"
              >
                <div class="alert__icon">
                  <Icon name="alertTriangle" />
                </div>
                <div class="alert__body">
                  <div class="alert__title">Atenção ao teto orçamentário!</div>
                  <div style="font-size:var(--fs-xs);">
                    {estouradas.length === 1
                      ? `A categoria "${estouradas[0].cat.nome}" ultrapassou o teto projetado em +${money(estouradas[0].excesso)}.`
                      : `${estouradas.length} categorias ultrapassaram o teto projetado para este mês.`}
                  </div>
                </div>
              </div>
            )}

            {controleTeto.length === 0 ? (
              <p class="muted" style="font-size:var(--fs-xs);padding:var(--sp-2) 0;">
                Nenhuma despesa ou projeção registrada para {MESES_LONGOS[idx]}.
              </p>
            ) : (
              <div style="display:flex;flex-direction:column;gap:14px;">
                {controleTeto.map((item) => {
                  const barColor =
                    item.status === "estourado"
                      ? "var(--out)"
                      : item.status === "alerta"
                      ? "var(--warn)"
                      : item.status === "sem_teto"
                      ? "var(--warn)"
                      : "var(--in)";
                  return (
                    <div key={item.cat.id} style="display:flex;flex-direction:column;gap:5px;">
                      <div style="display:flex;justify-content:space-between;align-items:center;font-size:var(--fs-xs);gap:8px;flex-wrap:wrap;">
                        <span style="font-weight:600;display:flex;align-items:center;gap:6px;">
                          <i class="dot" style={`background:${barColor}`} />
                          {item.cat.nome}
                        </span>
                        <div style="display:flex;align-items:center;gap:8px;">
                          <span class="num" style="color:var(--text);">
                            <b>{money(item.real)}</b>{" "}
                            <span class="muted" style="font-weight:normal;">
                              de {money(item.proj)}
                            </span>
                          </span>
                          {item.status === "estourado" ? (
                            <span class="badge badge--out" style="font-size:0.7rem;padding:1px 6px;">
                              +{money(item.excesso)} ({item.pct}%)
                            </span>
                          ) : item.status === "alerta" ? (
                            <span class="badge badge--warn" style="font-size:0.7rem;padding:1px 6px;">
                              Atenção ({item.pct}%)
                            </span>
                          ) : item.status === "sem_teto" ? (
                            <span class="badge badge--warn" style="font-size:0.7rem;padding:1px 6px;">
                              Sem teto
                            </span>
                          ) : (
                            <span class="badge badge--in" style="font-size:0.7rem;padding:1px 6px;">
                              {item.pct}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div class="progress" style="height:6px;">
                        <i
                          style={`width:${Math.min(100, item.pct)}%;background:${barColor};transition:width 0.4s ease;`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

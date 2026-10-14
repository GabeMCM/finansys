import { Icon, type IconName } from "../components/Icon.tsx";

/** Tela provisória para seções que serão construídas nas próximas etapas. */
export function Placeholder({ title, desc, icon, etapa }: { title: string; desc: string; icon: IconName; etapa: number }) {
  return (
    <>
      <div class="page-head">
        <div>
          <h1>{title}</h1>
          <p>{desc}</p>
        </div>
      </div>
      <section class="card empty">
        <Icon name={icon} />
        <h2>Em construção</h2>
        <p>Esta seção será implementada na etapa {etapa}.</p>
      </section>
    </>
  );
}

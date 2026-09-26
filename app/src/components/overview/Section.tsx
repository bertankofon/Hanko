/** A titled band of the Overview page, with the vertical rhythm the page reads by. */
export function Section({
  eyebrow,
  title,
  children,
  id,
}: {
  eyebrow?: string;
  title?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="border-t border-line py-14 sm:py-20">
      {eyebrow && (
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-seal">{eyebrow}</p>
      )}
      {title && <h2 className="text-section mb-8 max-w-3xl text-balance">{title}</h2>}
      {children}
    </section>
  );
}

/**
 * A cited quotation.
 *
 * The Overview page argues almost entirely through quotes from the order itself rather than
 * through our own prose — a reader deciding whether to believe the premise should be reading the
 * regulator, not us. Every one carries its source.
 */
export function Quote({
  children,
  source,
  href,
}: {
  children: React.ReactNode;
  source: string;
  href?: string;
}) {
  return (
    <figure className="border-l-2 border-seal pl-5 sm:pl-7">
      <blockquote className="pull-quote text-ink">{children}</blockquote>
      <figcaption className="mt-3 text-sm text-muted">
        {href ? (
          <a className="underline underline-offset-4 hover:text-ink" href={href} target="_blank" rel="noreferrer">
            {source} ↗
          </a>
        ) : (
          source
        )}
      </figcaption>
    </figure>
  );
}

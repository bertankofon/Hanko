/**
 * What Hanko is built on, and why that piece and not another.
 *
 * Logos are the projects' own official brand assets, used to say what this integrates with. The
 * trademarks belong to them.
 */
export function StackCard({
  logo,
  alt,
  logoWidth,
  what,
  why,
  points,
  href,
}: {
  logo: string;
  alt: string;
  logoWidth: number;
  what: string;
  why: string;
  points: {bold: string; rest: string}[];
  href: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-panel p-7">
      <a href={href} target="_blank" rel="noreferrer" className="mb-6 inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand SVG */}
        <img src={logo} alt={alt} width={logoWidth} height={32} className="h-8 w-auto" />
      </a>

      <p className="text-lead text-balance">{what}</p>
      <p className="text-body mt-3 text-muted">{why}</p>

      <ul className="mt-6 space-y-3 border-t border-line pt-6">
        {points.map((p) => (
          <li key={p.bold} className="text-body">
            <span className="font-semibold text-ink">{p.bold}</span>{' '}
            <span className="text-muted">{p.rest}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

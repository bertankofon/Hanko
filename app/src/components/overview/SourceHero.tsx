/**
 * The order itself, at the top of the page, because it is the reason the project exists.
 *
 * A screenshot of the press release next to the SEC's own video: the argument starts with the
 * regulator's words and the regulator's face, not with ours. Both are clickable through to the
 * source — a reader who wants to check should not have to go looking.
 */
const PRESS_RELEASE =
  'https://www.sec.gov/newsroom/press-releases/2026-90-sec-issues-innovation-exemption-facilitate-trading-tokenized-nms-stock-request-comment';

export function SourceHero() {
  return (
    <div className="grid gap-4 md:grid-cols-[1.3fr_1fr] md:items-start">
      <a
        href={PRESS_RELEASE}
        target="_blank"
        rel="noreferrer"
        className="group block overflow-hidden rounded-2xl border border-line bg-white transition-colors hover:border-seal"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static screenshot, no optimisation needed */}
        <img
          src="/media/sec-press-release.webp"
          alt="SEC press release 2026-90: SEC Issues “Innovation Exemption” to Facilitate the Trading of Tokenized NMS Stock and Request for Comment"
          className="w-full"
        />
        <p className="bg-panel px-5 py-3 text-sm text-muted group-hover:text-ink">
          sec.gov · press release 2026-90 · 17 September 2026 ↗
        </p>
      </a>

      <div className="flex flex-col">
        <div className="overflow-hidden rounded-2xl border border-line bg-black">
          <div className="relative aspect-video">
            <iframe
              className="absolute inset-0 size-full"
              src="https://www.youtube.com/embed/prnA6M4rSUM"
              title="SEC Issues “Innovation Exemption”"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">
          Chairman Paul S. Atkins · U.S. Securities and Exchange Commission
        </p>
      </div>
    </div>
  );
}

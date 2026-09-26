import Link from 'next/link';
import {FlowDiagram} from '@/components/overview/FlowDiagram';
import {Reveal} from '@/components/overview/Reveal';

export const metadata = {
  title: 'Overview — Hanko',
  description:
    'The SEC gave tokenized securities venues two jobs. Uniswap solved the first. Hanko is the second: who may trade, held in ENS, enforced on every swap.',
};

const PRESS_RELEASE =
  'https://www.sec.gov/newsroom/press-releases/2026-90-sec-issues-innovation-exemption-facilitate-trading-tokenized-nms-stock-request-comment';
const HARVARD =
  'https://corpgov.law.harvard.edu/2026/09/25/sec-issues-innovation-exemption-for-tokenized-securities/';

const band = 'border-t border-line py-20 sm:py-28';
const eyebrow = 'mb-6 text-sm font-medium uppercase tracking-[0.2em] text-seal';
const primaryButton =
  'rounded-xl border border-seal bg-seal/10 px-6 py-3 text-body font-medium text-seal transition-colors hover:bg-seal/20';
const ghostButton =
  'rounded-xl border border-line px-6 py-3 text-body transition-colors hover:bg-panel';

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="py-16 sm:py-28">
        <Reveal>
          <p className={eyebrow}>判 · Hanko</p>
          <h1 className="text-display text-balance">
            Who may trade here — as an ENS name the pool reads on every swap.
          </h1>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/pool" className={primaryButton}>
              Open the venue
            </Link>
            <Link href="/identity" className={ghostButton}>
              See the permissions
            </Link>
          </div>
        </Reveal>
      </header>

      {/* One sentence from the order. Everything else follows from it. */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>SEC · 17 September 2026</p>
        </Reveal>

        <Reveal delay={100}>
          <blockquote className="text-display text-balance font-normal">
            <span className="text-muted">A venue provides the pools, and</span>{' '}
            <span className="text-ink">sets standards for persons to access trading.</span>
          </blockquote>
        </Reveal>

        <Reveal delay={200}>
          <a
            href={PRESS_RELEASE}
            target="_blank"
            rel="noreferrer"
            className="text-body mt-7 inline-block text-muted underline underline-offset-4 hover:text-ink"
          >
            Press release 2026-90 ↗
          </a>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          <Reveal delay={120}>
            <div className="h-full rounded-2xl border border-line bg-panel p-7">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand SVG */}
              <img src="/brand/uniswap-logo-white.svg" alt="Uniswap" className="h-7 w-auto" />
              <p className="text-lead mt-6">Solved the pools.</p>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <div className="h-full rounded-2xl border border-seal/50 bg-seal/5 p-7">
              <p className="text-lg font-semibold">判 Hanko</p>
              <p className="text-lead mt-6">Solves the standards.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* The mechanism, animated. */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>Every swap</p>
          <h2 className="text-section text-balance">The rule runs inside the trade.</h2>
        </Reveal>

        <Reveal delay={140} className="mt-10">
          <FlowDiagram />
        </Reveal>
      </section>

      {/* ENS, stated as three properties rather than described. */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>Why a name</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size brand SVG */}
          <img src="/brand/ens-logo-White.svg" alt="ENS" className="mb-8 h-9 w-auto" />
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {title: 'It expires.', line: 'Nobody has to remember to revoke it.'},
            {title: 'It cannot be sold.', line: 'Granted with no transfer right.'},
            {title: 'It nests.', line: 'A bot’s name dies with its owner’s.'},
          ].map((p, i) => (
            <Reveal key={p.title} delay={i * 130}>
              <div className="h-full rounded-2xl border border-line bg-panel p-7">
                <p className="text-lead font-semibold">{p.title}</p>
                <p className="text-body mt-3 text-muted">{p.line}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={420}>
          <p className="text-lead mt-10 text-balance text-muted">
            <span className="text-ink">A mapping gives you none of these.</span> You write all three
            yourself, and nobody outside your contract can read them.
          </p>
        </Reveal>
      </section>

      {/* The order's conditions, as ticks rather than prose. */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>The conditions</p>
          <h2 className="text-section text-balance">Three of the six are access rules. Those are ours.</h2>
        </Reveal>

        <div className="mt-10 space-y-3">
          {[
            'Contracts auditable, public, on a permissionless ledger',
            'Trading stops when the underlying stops',
            'Public notice of operations and trading activity',
          ].map((c, i) => (
            <Reveal key={c} delay={i * 120}>
              <div className="flex items-center gap-4 rounded-xl border border-line bg-panel px-6 py-5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-pass/40 bg-pass/10 text-pass">
                  ✓
                </span>
                <p className="text-lead">{c}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={400}>
          <p className="text-body mt-6 text-muted">
            The other three — symbol limits, token rights, issuer notice —{' '}
            <span className="text-ink">are not access control, and we do not claim them.</span>{' '}
            <a
              className="underline underline-offset-4 hover:text-ink"
              href={HARVARD}
              target="_blank"
              rel="noreferrer"
            >
              Summary of the order ↗
            </a>
          </p>
        </Reveal>
      </section>

      {/* The SEC's own video, as they published it. */}
      <section className={band}>
        <Reveal>
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
          <p className="mt-4 text-sm text-muted">
            Chairman Paul S. Atkins · U.S. Securities and Exchange Commission
          </p>
        </Reveal>
      </section>

      {/* Honesty, as four lines. */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>Not claimed</p>
        </Reveal>

        <div className="space-y-5">
          {[
            ['Not KYC.', 'That answers who you are. This answers who may trade.'],
            ['Not a restriction on DeFi.', 'Permissionless pools are untouched.'],
            ['Not custody.', 'A delegated bot trades its own wallet, never yours.'],
            ['A testnet demo.', 'Mock asset, round-number price, server-signed actors.'],
          ].map(([bold, rest], i) => (
            <Reveal key={bold} delay={i * 110}>
              <p className="text-lead text-balance">
                <span className="font-semibold text-ink">{bold}</span>{' '}
                <span className="text-muted">{rest}</span>
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      <footer className="border-t border-line py-20">
        <Reveal>
          <p className="text-section text-balance">Everything else on this site is read from Sepolia.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/pool" className={primaryButton}>
              Open the venue
            </Link>
            <Link href="/audit" className={ghostButton}>
              Read the record
            </Link>
          </div>
          <p className="mt-10 text-sm text-muted">
            Uniswap and ENS are trademarks of their respective owners; logos are their official
            brand assets, used to indicate what this project integrates with.
          </p>
        </Reveal>
      </footer>
    </div>
  );
}

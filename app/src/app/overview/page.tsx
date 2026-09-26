import Link from 'next/link';
import {NameResolution} from '@/components/overview/NameResolution';
import {PoolGate} from '@/components/overview/PoolGate';
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

      {/* Step one: what already exists. */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>What Uniswap already gives you</p>
          <h2 className="text-section text-balance">
            A pool that refuses anyone it has not been told to allow.
          </h2>
        </Reveal>

        <Reveal delay={140} className="mt-10">
          <PoolGate />
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-8 space-y-4">
            <p className="text-lead text-balance">
              <span className="font-semibold text-ink">Uniswap ships the socket, not the answer.</span>{' '}
              <span className="text-muted">
                A permissioned pool calls one function on every swap and on every deposit of
                liquidity — is this address allowed? Who decides, and on what basis, is left to
                whoever runs the venue.
              </span>
            </p>
            <p className="text-lead text-balance">
              <span className="font-semibold text-ink">Most venues answer with a mapping.</span>{' '}
              <span className="text-muted">
                An address and a boolean. It works, and it forgets everything else: when the
                permission should end, whether it can be handed on, who granted it, and who is
                acting for whom.
              </span>
            </p>
          </div>
        </Reveal>
      </section>

      {/* Step two: what we put behind it. */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>What Hanko puts behind it</p>
          <h2 className="text-section text-balance">
            The same question, answered by a name instead of a boolean.
          </h2>
        </Reveal>

        <Reveal delay={140} className="mt-10">
          <NameResolution />
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-8 space-y-4">
            <p className="text-lead text-balance">
              <span className="font-semibold text-ink">
                The shape of the name is the permission.
              </span>{' '}
              <span className="text-muted">
                A name under <span className="font-mono">swap.tnvda.eth</span> means this wallet may
                trade. One under <span className="font-mono">lp.tnvda.eth</span> means it may
                provide liquidity. A name sitting <em>inside</em> an investor&apos;s own registry
                means it is their agent, and can only trade.
              </span>
            </p>
            <p className="text-lead text-balance">
              <span className="font-semibold text-ink">Nothing is kept in our contract.</span>{' '}
              <span className="text-muted">
                Expiry, revocation and the whole delegation chain are ENS behaviour. Revoke the
                investor and the pool stops resolving their bot in the same transaction — with no
                list of ours to go and clean up.
              </span>
            </p>
          </div>
        </Reveal>
      </section>

      {/* What the project is trying to achieve. */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>What this is for</p>
          <h2 className="text-section text-balance">
            Making a venue&apos;s access rules something anyone can check.
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {[
            [
              'Enforced, not promised.',
              'The restriction runs inside the swap, not in a document nobody reads.',
            ],
            [
              'Nothing goes stale.',
              'Permissions end on their own, and revoking one revokes everything under it.',
            ],
            [
              'Delegation with a limit.',
              'A bot can trade its principal’s strategy and can never commit their capital.',
            ],
            [
              'Readable by outsiders.',
              'A regulator or a counterparty checks ENS, not our database.',
            ],
          ].map(([bold, rest], i) => (
            <Reveal key={bold} delay={i * 120}>
              <div className="h-full rounded-2xl border border-line bg-panel p-7">
                <p className="text-lead font-semibold">{bold}</p>
                <p className="text-body mt-3 text-muted">{rest}</p>
              </div>
            </Reveal>
          ))}
        </div>
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

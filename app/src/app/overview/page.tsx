import Link from 'next/link';
import {AuditTrail} from '@/components/overview/AuditTrail';
import {HierarchyTree} from '@/components/overview/HierarchyTree';
import {NameResolution} from '@/components/overview/NameResolution';
import {NonTransferable} from '@/components/overview/NonTransferable';
import {PoolGate} from '@/components/overview/PoolGate';
import {Reveal} from '@/components/overview/Reveal';
import {SeparatedPowers} from '@/components/overview/SeparatedPowers';
import {SourceHero} from '@/components/overview/SourceHero';

export const metadata = {
  title: 'Overview — Hanko',
  description:
    'The SEC cleared tokenized stocks to trade on permissioned AMM pools. Hanko is the access layer a venue needs to meet the conditions that came with it.',
};

const PRESS_RELEASE =
  'https://www.sec.gov/newsroom/press-releases/2026-90-sec-issues-innovation-exemption-facilitate-trading-tokenized-nms-stock-request-comment';
const HARVARD =
  'https://corpgov.law.harvard.edu/2026/09/25/sec-issues-innovation-exemption-for-tokenized-securities/';

const band = 'border-t border-line py-20 sm:py-28';
const eyebrow = 'mb-6 text-sm font-medium uppercase tracking-[0.2em] text-seal';
const primaryButton =
  'rounded-xl border border-seal bg-seal/10 px-6 py-3 text-body font-medium text-seal transition-colors hover:bg-seal/20';
const ghostButton = 'rounded-xl border border-line px-6 py-3 text-body transition-colors hover:bg-panel';

/** A quotation from the order, set so it cannot be mistaken for our own words. */
function OrderQuote({children}: {children: React.ReactNode}) {
  return (
    <figure className="border-l-2 border-seal pl-5 sm:pl-8">
      <blockquote className="pull-quote text-balance">
        <span className="text-seal">“</span>
        {children}
        <span className="text-seal">”</span>
      </blockquote>
      <figcaption className="mt-4 text-sm text-muted">
        <a
          className="underline underline-offset-4 hover:text-ink"
          href={PRESS_RELEASE}
          target="_blank"
          rel="noreferrer"
        >
          SEC press release 2026-90 ↗
        </a>
      </figcaption>
    </figure>
  );
}

/** Bold claim, then the sentence that carries it. Used under every animation. */
function Note({bold, children}: {bold: string; children: React.ReactNode}) {
  return (
    <p className="text-lead text-balance">
      <span className="font-semibold text-ink">{bold}</span> <span className="text-muted">{children}</span>
    </p>
  );
}

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-4xl">
      {/* The order, first, because it is the reason any of this exists. */}
      <header className="py-10 sm:py-16">
        <Reveal>
          <p className={eyebrow}>17 September 2026 · the reason for this project</p>
        </Reveal>

        <Reveal delay={100}>
          <SourceHero />
        </Reveal>

        <Reveal delay={220}>
          <h1 className="text-display mt-14 text-balance">
            Tokenized stocks are approved. Everything about{' '}
            <span className="text-seal">who may trade them</span> is now the venue&apos;s problem.
          </h1>
        </Reveal>

        <Reveal delay={320}>
          <p className="text-lead mt-7 max-w-2xl text-muted">
            Hanko is that layer: permissions held as ENS names, enforced by the pool on every swap.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/pool" className={primaryButton}>
              Open the venue
            </Link>
            <Link href="/identity" className={ghostButton}>
              See the permissions
            </Link>
          </div>
        </Reveal>
      </header>

      {/* ---- The two jobs ------------------------------------------------ */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>What a venue is</p>
          <OrderQuote>
            TSVs bring together buyers and sellers of tokenized NMS stock by: (1) providing one or
            more AMM Liquidity Pool(s) for permissioned participants to interact and agree to terms
            of a trade and (2){' '}
            <span className="text-seal">setting standards for persons to access trading</span> on
            such AMM Liquidity Pool(s).
          </OrderQuote>
        </Reveal>

        <Reveal delay={140} className="mt-12">
          <PoolGate />
        </Reveal>

        <Reveal delay={220}>
          <div className="mt-8 space-y-4">
            <Note bold="Uniswap ships the first job.">
              A v4 permissioned pool calls one function on every swap and every deposit of
              liquidity — is this address allowed? The pool, the adapter and the hook are theirs and
              we use them as shipped.
            </Note>
            <Note bold="It deliberately leaves the second one open.">
              Who decides, on what basis, and for how long is the venue&apos;s to answer. That empty
              socket is where Hanko goes.
            </Note>
          </div>
        </Reveal>
      </section>

      {/* ---- Our answer to job two --------------------------------------- */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>Our answer</p>
          <h2 className="text-section text-balance">
            The same question, answered by a name instead of a boolean.
          </h2>
        </Reveal>

        <Reveal delay={140} className="mt-10">
          <NameResolution />
        </Reveal>

        <Reveal delay={220}>
          <div className="mt-8 space-y-4">
            <Note bold="The shape of the name is the permission.">
              A name under <span className="font-mono">swap.tnvda.eth</span> may trade. One under{' '}
              <span className="font-mono">lp.tnvda.eth</span> may provide liquidity. A name sitting
              inside an investor&apos;s own registry is their agent, and can only trade.
            </Note>
            <Note bold="A mapping would answer yes or no and forget the rest.">
              When it should end, whether it can be handed on, who granted it, who is acting for
              whom — none of that survives a boolean.
            </Note>
          </div>
        </Reveal>
      </section>

      {/* ---- Conditions ---------------------------------------------------- */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>The conditions</p>
          <OrderQuote>
            The exemption from the definition of “exchange” for TSVs is subject to conditions
            designed to ensure the exemptive relief is in the public interest and consistent with
            the protection of investors…
          </OrderQuote>
        </Reveal>

        <Reveal delay={180}>
          <p className="text-lead mt-8 text-balance text-muted">
            <span className="text-ink">Six of them.</span> Three are access rules, and those are the
            three ENSv2 answers. The others — symbol limits, token rights, issuer notice — are not
            access control and we do not claim them.{' '}
            <a className="underline underline-offset-4 hover:text-ink" href={HARVARD} target="_blank" rel="noreferrer">
              Summary of the order ↗
            </a>
          </p>
        </Reveal>
      </section>

      {/* ---- Condition: stopping trading ----------------------------------- */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>Condition · stopping</p>
          <OrderQuote>
            A TSV must stop trading in a tokenized NMS stock concurrently with any stoppage of
            trading in the underlying NMS stock on the primary listing exchange.
          </OrderQuote>
        </Reveal>

        <Reveal delay={140} className="mt-12">
          <SeparatedPowers />
        </Reveal>

        <Reveal delay={220}>
          <div className="mt-8 space-y-4">
            <Note bold="The seals a member holds are the venue’s to withdraw.">
              Halting the asset stops everyone at once. Revoking one member stops only them — and
              everyone acting on their behalf.
            </Note>
            <Note bold="ENSv2 roles split who may do what.">
              Registering a member and clearing one are separate grants, and a member&apos;s scope is
              separate again: some may only swap, some may only add liquidity. Nobody holds a power
              they were not given.
            </Note>
          </div>
        </Reveal>
      </section>

      {/* ---- Property: non-transferable ------------------------------------ */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>Property · non-transferable</p>
          <h2 className="text-section text-balance">Clearance is not something you can sell.</h2>
        </Reveal>

        <Reveal delay={140} className="mt-10">
          <NonTransferable />
        </Reveal>

        <Reveal delay={220}>
          <div className="mt-8 space-y-4">
            <Note bold="Hanko registers every member name without the transfer role.">
              An investor cannot sell, lend or gift their seal. The attempt reverts at the registry.
            </Note>
            <Note bold="Without this, clearance becomes a tradable asset.">
              A venue that vetted one party would find itself facing another, with no event to tell
              it that happened.
            </Note>
          </div>
        </Reveal>
      </section>

      {/* ---- Property: hierarchical delegation ------------------------------ */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>Property · hierarchical delegation</p>
          <h2 className="text-section text-balance">
            Clear a firm once. Its bots hang underneath it.
          </h2>
        </Reveal>

        <Reveal delay={140} className="mt-10">
          <HierarchyTree />
        </Reveal>

        <Reveal delay={220}>
          <div className="mt-8 space-y-4">
            <Note bold="A capital firm passes KYC once, not once per bot.">
              It opens names for its own agents under its own name, scoped as it likes — swap only,
              liquidity only. The venue is not asked, and does not need to be.
            </Note>
            <Note bold="Revoke the firm and every bot under it goes in the same transaction.">
              Nothing cascades because nothing has to: a child of a lapsed name has nothing left to
              resolve through. There is no list of agents to find and clean up.
            </Note>
          </div>
        </Reveal>
      </section>

      {/* ---- Condition: public notice --------------------------------------- */}
      <section className={band}>
        <Reveal>
          <p className={eyebrow}>Condition · public notice</p>
          <OrderQuote>
            A TSV must provide public notice about its operations, trading activities, and the
            trading activities of its affiliates on the TSV.
          </OrderQuote>
        </Reveal>

        <Reveal delay={140} className="mt-12">
          <AuditTrail />
        </Reveal>

        <Reveal delay={220}>
          <div className="mt-8 space-y-4">
            <Note bold="Every operation on an ENS name is already an event.">
              Grants, revocations, halts and trades are emitted by the contracts themselves. Hanko
              reads them back; it does not author them.
            </Note>
            <Note bold="Notice you publish can be doubted. A public ledger cannot.">
              A regulator or a counterparty checks ENS and the chain, not a page the venue maintains.
            </Note>
          </div>
        </Reveal>
      </section>

      {/* ---- Honesty --------------------------------------------------------- */}
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
            Uniswap and ENS are trademarks of their respective owners; logos are their official brand
            assets, used to indicate what this project integrates with. Press release text and video
            are works of the U.S. Securities and Exchange Commission.
          </p>
        </Reveal>
      </footer>
    </div>
  );
}

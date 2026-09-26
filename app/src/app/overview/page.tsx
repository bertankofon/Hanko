import Link from 'next/link';
import {Conditions} from '@/components/overview/Conditions';
import {Quote} from '@/components/overview/Quote';
import {Section} from '@/components/overview/Section';
import {StackCard} from '@/components/overview/StackCard';

export const metadata = {
  title: 'Overview — Hanko',
  description:
    'Why Hanko exists: the SEC’s Innovation Exemption gave tokenized securities venues two jobs, and Hanko is the on-chain layer for the second one.',
};

const PRESS_RELEASE =
  'https://www.sec.gov/newsroom/press-releases/2026-90-sec-issues-innovation-exemption-facilitate-trading-tokenized-nms-stock-request-comment';
const HARVARD =
  'https://corpgov.law.harvard.edu/2026/09/25/sec-issues-innovation-exemption-for-tokenized-securities/';

const AUDIENCE = [
  {
    who: 'Venue operators',
    what: 'Run a permissioned pool without writing an access-control system, and hold a halt switch that maps to the condition it answers.',
  },
  {
    who: 'Investors',
    what: 'Hold a permission you can see, that nobody can transfer away from you, and that you can delegate on your own terms.',
  },
  {
    who: 'Trading agents',
    what: 'Trade for a cleared investor under their clearance, scoped to swaps only, and stop the moment theirs does.',
  },
  {
    who: 'Auditors and regulators',
    what: 'Read every grant, revocation and halt from the chain and from ENS, without asking the venue for its logs.',
  },
];

const CLAIMS = [
  {
    bold: 'A rule in code, not in a terms-of-service page.',
    rest: 'Today most tokenized-security restrictions live in a document. Here the pool asks on every swap and every deposit of liquidity.',
  },
  {
    bold: 'Permissions that end by themselves.',
    rest: 'A name lapses and access goes with it. No sweep to run, no stale row left behind in a mapping.',
  },
  {
    bold: 'Delegation with a leash.',
    rest: 'An investor can hand a bot the right to trade and not the right to commit capital — and revoking the investor revokes the bot in the same transaction.',
  },
  {
    bold: 'Management that leaves a trail.',
    rest: 'Every decision is an on-chain event. The audit record is not a feature we added; it is what the system is made of.',
  },
];

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-4xl">
      {/* Hero */}
      <header className="py-12 sm:py-20">
        <p className="mb-5 text-sm font-medium uppercase tracking-[0.18em] text-seal">
          判 · Hanko
        </p>
        <h1 className="text-display text-balance">
          A regulated venue needs to know who may trade. Hanko makes that answer an ENS name.
        </h1>
        <p className="text-lead mt-7 max-w-2xl text-muted">
          Expiring, non-transferable, delegatable permissions for a Uniswap v4 permissioned pool —
          enforced on every swap, readable by anyone.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/pool"
            className="rounded-xl border border-seal bg-seal/10 px-5 py-2.5 text-body text-seal hover:bg-seal/20"
          >
            Open the venue
          </Link>
          <Link
            href="/identity"
            className="rounded-xl border border-line px-5 py-2.5 text-body hover:bg-panel"
          >
            See the permissions
          </Link>
        </div>
      </header>

      {/* The order */}
      <Section eyebrow="17 September 2026" title="The SEC opened a door, and left a question behind it.">
        <Quote source="SEC press release 2026-90" href={PRESS_RELEASE}>
          TSVs bring together buyers and sellers of tokenized NMS stock by: (1) providing one or more
          AMM Liquidity Pool(s) for permissioned participants to interact and agree to terms of a
          trade and (2){' '}
          <span className="text-seal">setting standards for persons to access trading</span> on such
          AMM Liquidity Pool(s).
        </Quote>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-panel p-6">
            <p className="text-lead">Uniswap solved the first job.</p>
            <p className="text-body mt-2 text-muted">
              Permissioned pools ship as part of v4: the pool, the adapter, the hook.
            </p>
          </div>
          <div className="rounded-2xl border border-seal/40 bg-seal/5 p-6">
            <p className="text-lead">Hanko is the second one.</p>
            <p className="text-body mt-2 text-muted">
              Who may access trading, for how long, with what scope — held in ENS and read by the
              pool.
            </p>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-line bg-black">
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
          Chairman Paul S. Atkins on the Innovation Exemption · published by the U.S. Securities and
          Exchange Commission.{' '}
          <a className="underline underline-offset-4 hover:text-ink" href={HARVARD} target="_blank" rel="noreferrer">
            A law-firm summary of the order ↗
          </a>
        </p>
      </Section>

      {/* Conditions */}
      <Section
        eyebrow="The conditions"
        title="Six conditions come with the exemption. Hanko answers three of them, and says so about the rest."
      >
        <Conditions />
        <p className="text-body mt-6 text-muted">
          Conditions quoted from the press release. The five-year figure in the order is when the{' '}
          <span className="font-semibold text-ink">exemption itself sunsets</span> — it says nothing
          about how long a participant stays cleared.
        </p>
      </Section>

      {/* The stack */}
      <Section eyebrow="Built on" title="Two pieces of infrastructure, each doing what it is already good at.">
        <div className="grid gap-5 md:grid-cols-2">
          <StackCard
            logo="/brand/uniswap-logo-white.svg"
            alt="Uniswap"
            logoWidth={160}
            href="https://docs.uniswap.org/"
            what="The venue itself."
            why="A permissioned pool is a v4 feature, not a fork. The hook rejects a swap before it happens, so the rule runs inside the AMM rather than beside it."
            points={[
              {bold: 'Permissioned pools.', rest: 'Adapter, hook and position manager, used as shipped.'},
              {bold: 'One interface.', rest: 'Hanko implements IAllowlistChecker; the pool asks it on every swap.'},
              {bold: 'Nothing forked.', rest: 'Liquidity and audits stay where they are.'},
            ]}
          />
          <StackCard
            logo="/brand/ens-logo-White.svg"
            alt="ENS"
            logoWidth={140}
            href="https://ens.domains/"
            what="Where the permission lives."
            why="A name already expires, already refuses to be transferred, and already nests. Writing those three properties into a mapping means writing them from scratch — and nobody else can read them."
            points={[
              {bold: 'It ends by itself.', rest: 'An expired name resolves to nobody.'},
              {bold: 'It cannot be sold on.', rest: 'Granted with no transfer role.'},
              {bold: 'It nests.', rest: 'An agent’s name lives inside its principal’s registry, so it dies with theirs.'},
            ]}
          />
        </div>
        <p className="mt-5 text-sm text-muted">
          Uniswap and ENS are trademarks of their respective owners. Logos are their official brand
          assets, used here to indicate what this project integrates with.
        </p>
      </Section>

      {/* Claims */}
      <Section eyebrow="What it changes" title="Four things that are true here and usually are not.">
        <ul className="grid gap-5 sm:grid-cols-2">
          {CLAIMS.map((c) => (
            <li key={c.bold} className="rounded-2xl border border-line bg-panel p-6">
              <p className="text-body">
                <span className="font-semibold text-ink">{c.bold}</span>
              </p>
              <p className="text-body mt-2 text-muted">{c.rest}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* Audience */}
      <Section eyebrow="Who it is for" title="Four people look at this system, and each needs a different thing from it.">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {AUDIENCE.map((a) => (
            <div key={a.who} className="bg-panel p-6">
              <p className="text-lead">{a.who}</p>
              <p className="text-body mt-2 text-muted">{a.what}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Honesty */}
      <Section eyebrow="What this is not" title="The claims we are not making.">
        <ul className="space-y-4">
          <li className="text-body">
            <span className="font-semibold text-ink">It is not KYC.</span>{' '}
            <span className="text-muted">
              KYC answers who someone is. Hanko governs who may trade, for how long, with what scope —
              and takes the answer to the first question from whatever credential provider the venue
              chooses.
            </span>
          </li>
          <li className="text-body">
            <span className="font-semibold text-ink">It does not restrict DeFi.</span>{' '}
            <span className="text-muted">
              Permissionless pools are untouched. This exists so that regulated venues can use the
              same infrastructure — the order itself says it is not about decentralised finance.
            </span>
          </li>
          <li className="text-body">
            <span className="font-semibold text-ink">It does not hold anyone’s money.</span>{' '}
            <span className="text-muted">
              A delegated agent trades from its own wallet. The permission admits it to the venue; it
              gives no access to the investor’s funds.
            </span>
          </li>
          <li className="text-body">
            <span className="font-semibold text-ink">It is a demo on a testnet.</span>{' '}
            <span className="text-muted">
              tNVDA is a mock asset, the price is a round number chosen for the demo, and the actors
              are signed server-side so nobody has to switch wallets on stage.
            </span>
          </li>
        </ul>
      </Section>

      <footer className="border-t border-line py-14">
        <p className="text-lead text-balance">
          Everything on the following pages is read from Sepolia as you load it.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/pool"
            className="rounded-xl border border-seal bg-seal/10 px-5 py-2.5 text-body text-seal hover:bg-seal/20"
          >
            Open the venue
          </Link>
          <Link
            href="/audit"
            className="rounded-xl border border-line px-5 py-2.5 text-body hover:bg-panel"
          >
            Read the record
          </Link>
        </div>
      </footer>
    </div>
  );
}

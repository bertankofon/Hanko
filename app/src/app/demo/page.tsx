import {Walkthrough} from '@/components/demo/Walkthrough';
import {DEMO_STEPS} from '@/lib/demo-steps';

export const dynamic = 'force-dynamic';

export const metadata = {title: 'Demo — Hanko'};

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="text-section">Watch the venue decide</h1>
        <p className="mt-3 text-body text-muted">
          Eight steps, each one a real transaction on Sepolia. Run them in order and the whole
          product happens in front of you: a refusal, a grant, a delegation, a halt, and a
          revocation that reaches an agent nobody touched.
        </p>
        <p className="mt-3 text-body text-muted">
          The last step puts everything back, so the next person starts where you did.
        </p>
      </header>

      <Walkthrough steps={DEMO_STEPS} />

      <p className="mt-8 text-sm text-muted">
        Transactions are signed server-side by demo wallets so nobody has to approve eight
        MetaMask prompts on stage. A real venue would have each party sign for themselves; the
        contracts cannot tell the difference, and the permission checks are identical.
      </p>
    </div>
  );
}

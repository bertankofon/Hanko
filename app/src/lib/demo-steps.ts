/**
 * The walkthrough, as data.
 *
 * Shared between the server action that runs a step and the client that draws it, so the claim a
 * step makes and the transaction it sends can never drift apart.
 */
export interface DemoStep {
  id: string;
  /** Who the step acts as, in the venue's terms. */
  actor: 'Venue operator' | 'A stranger' | 'The investor' | 'Her bot';
  title: string;
  /** One sentence: what this proves. */
  claim: string;
  /** What the viewer should expect to see, so a surprise reads as a surprise. */
  expect: string;
}

export const DEMO_STEPS: DemoStep[] = [
  {
    id: 'stranger-refused',
    actor: 'A stranger',
    title: 'Someone uncleared tries to buy',
    claim: 'The pool asks one question before the trade, and the answer is no.',
    expect: 'Refused, with the contract’s own reason.',
  },
  {
    id: 'clear-stranger',
    actor: 'Venue operator',
    title: 'The venue clears them',
    claim: 'Clearance is an ENS name, granted with no transfer role and a real expiry.',
    expect: 'Two names registered under hanko.eth.',
  },
  {
    id: 'stranger-trades',
    actor: 'A stranger',
    title: 'The same trade, now allowed',
    claim: 'Nothing about the trade changed. Only who was asking.',
    expect: 'Filled.',
  },
  {
    id: 'delegate',
    actor: 'The investor',
    title: 'An investor delegates to her bot',
    claim: 'The bot gets a name inside her registry. The venue is not asked and does not need to be.',
    expect: 'A name one level deeper than hers.',
  },
  {
    id: 'bot-trades',
    actor: 'Her bot',
    title: 'The bot trades on her behalf',
    claim: 'A delegated name carries swap and never liquidity — a bot may trade her position, not commit her capital.',
    expect: 'Filled, from the bot’s own wallet.',
  },
  {
    id: 'halt',
    actor: 'Venue operator',
    title: 'The venue halts one symbol',
    claim: 'Halting is a property of the asset, not of the people. tNVDA stops; tAAPL does not.',
    expect: 'tNVDA refused, tAAPL filled, same wallet, same second.',
  },
  {
    id: 'revoke',
    actor: 'Venue operator',
    title: 'The venue revokes the investor',
    claim: 'Her agent stops in the same transaction. Nobody touched the agent.',
    expect: 'Both refused.',
  },
  {
    id: 'reset',
    actor: 'Venue operator',
    title: 'Put it back',
    claim: 'The venue returns to its starting state, so the next person sees what you saw.',
    expect: 'Trading resumed, seals restored, delegation re-made.',
  },
];

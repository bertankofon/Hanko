# Hanko — judging notes

Live: **https://hanko-app.vercel.app** · Repo: **github.com/bertankofon/Hanko** · Sepolia

---

## The 90-second opening

> On 17 September 2026 the SEC issued its Innovation Exemption. It defined a Tokenized
> Securities Venue as doing **two** things: running AMM pools for permissioned participants, and
> **setting the standards for who may access them**.
>
> Uniswap solved the first one. Permissioned pools shipped. The second one is left open on
> purpose, and the interface Uniswap gives you for it is a single function:
> *is this address allowed?*
>
> Today every venue answers that with a mapping, or a spreadsheet. We answer it with ENS.
>
> A cleared participant holds a name — `0x053674af….swap.hanko.eth`. The pool resolves it on
> every swap. And because it is a name in a hierarchy rather than a boolean, three things come
> free: it **expires**, it **cannot be transferred**, and it **nests** — so a firm cleared once
> can open names for its own trading bots, and revoking the firm stops every bot in the same
> transaction, without anyone touching the bots.

**Then go straight to the demo.** Do not explain the architecture first.

---

## The live run — eight clicks

Open **hanko-app.vercel.app/demo**. Say what each one proves *before* you click.

| # | Say this | Then |
|---|---|---|
| 1 | "Someone who isn't cleared tries to buy NVIDIA." | Run → `reverted with Unauthorized` |
| 2 | "The venue clears them. That's an ENS name being minted." | Run |
| 3 | "Same trade. Nothing changed except who was asking." | Run → filled |
| 4 | "Now an investor delegates to her trading bot. Watch who signs — she does, not the venue." | Run |
| 5 | "The bot trades her position. It can swap. It can never provide liquidity." | Run |
| 6 | **"Here's the one I care about."** "We halt NVIDIA. Same wallet, same second." | Run → NVDA refused, **AAPL fills** |
| 7 | "The venue revokes the investor — and her bot dies with her. Nobody touched the bot." | Run → both refused |
| 8 | "And it puts itself back, so the next person sees what you saw." | Run |

**Step 6 is the pitch.** If you only get one click, make it that one. It proves the distinction
nobody else is making: *clearance is a property of the person, halting is a property of the asset*
— and that is exactly how the order is written.

If the room is impatient, run **1 → 2 → 3 → 6** and stop.

### Backup if the network is slow
Switch the header role to **A visitor**, open **Trade**, and show the button: dashed, red,
*"The pool will refuse"* — the verdict is known before anything is signed. Then switch to
**Investor** and watch the same button turn solid. No transaction needed.

---

## The two sentences that win the ENS prize

> "This is not ENS used as a nickname. The **hierarchy is the mechanism.** Expiry, revocation and
> delegation are not features we wrote — they are what ENS already does, and we put the
> permission where those properties apply."

> "There is no list of agents anywhere in our contracts. A bot stops trading because a child of a
> lapsed name has nothing left to resolve through. That's not cleanup — that's absence."

## The two sentences that win the Uniswap prize

> "We use the stack as shipped: PoolManager, PermissionsAdapter, PermissionedHooks,
> PermissionedPositionManager, UniversalRouter v2.2. We wrote one contract — the checker."

> "The permission layer costs **2 to 4 percent of a swap**. 668 gas warm on `checkAllowlist`,
> against about 215,000 for the swap. That number is in our FEEDBACK.md, along with the four
> things that cost us the most time."

---

## Numbers to have ready

| | |
|---|---|
| `checkAllowlist` | 668 gas warm · 2,668 cold |
| Swap total | ~215,000 gas → permission layer is **2–4%** |
| Tests | **67**, most forked against live Sepolia |
| Symbols listed | 3 (tNVDA, tAAPL, tMSFT), one permissioned pool each |
| Contracts we wrote | **1** that matters: `EnsAllowlistChecker` |
| ENS root | `hanko.eth`, ENSv2 Sepolia (15 Sep 2026 deployment) |

---

## Hard questions, honest answers

**"Isn't this just a whitelist with extra steps?"**
> A whitelist answers yes or no and forgets everything else. It doesn't know when access should
> end, whether it can be handed on, or who is acting for whom. We didn't add those — we picked a
> primitive that already has them.

**"Why not just use a mapping and a timestamp?"**
> You can. Then you write the expiry check, the transfer ban, the delegation table, and the
> cascade that cleans up agents when a principal is revoked. That last one is where mappings
> break: you need a list of agents, and you need it to be complete. We have no list.

**"Does this replace KYC?"**
> No, and we're careful about that. KYC answers *who you are*. This answers *who may trade*. It
> carries a verified identity; it doesn't establish one. A credential provider plugs in above us.

**"Is this anti-DeFi?"**
> Commissioner Peirce's own words: *"This order is not about decentralized finance."* Permissionless
> pools are untouched. This exists so regulated venues can use Uniswap's infrastructure instead of
> building their own matching engine.

**"Why is clearance venue-wide and not per stock?"**
> Because that's how the order reads. It says standards "for **persons** to access trading" —
> person-level. The condition that's per symbol is the halt, and that lives on each pool's adapter.
> Per-instrument permissions are a registry lookup away; `checkAllowlist` already carries the token.

**"What's not real here?"**
> Mock assets on a testnet, round-number listing prices, and demo wallets signed server-side so I
> don't approve eight MetaMask prompts on stage. The permission checks are identical either way —
> the contracts can't tell who held the key.

**"Show me it's live, not hard-coded."**
> Open **Access** — every name is read from the checker, every address links to Etherscan. Prices
> on **Trade** come from each pool's `slot0`; they've drifted from the listing price because the
> demo swaps actually moved them.
>
> *Note:* ENS's own explorer shows `hanko.eth` with 0 subnames — their staging indexer is about
> 6.5 hours behind Sepolia's head. Chain state is correct; say so before they check.

---

## What we'd build next

1. **A credential provider interface.** Today the venue clears people by hand. The natural next
   step is `verify(request) → {ok, subjectId, expiry}` so the expiry comes from the credential —
   a passport's own end date, a KYC renewal cycle — instead of a number we chose.
2. **Per-instrument permissions**, for the real-world cases the order doesn't cover: options
   levels, accredited-only products.
3. **An oracle-driven halt**, so the venue stops when the primary listing exchange stops rather
   than when an operator clicks.

---

## Do not say

- "SEC compliant." Say *"built against the access layer the SEC's model describes."*
- "We replace KYC."
- "Clearance" to a finance audience without context — they hear clearing and settlement.

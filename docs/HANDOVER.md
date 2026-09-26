# HANDOVER — read this first

You are picking up **Hanko**, an ETHGlobal Tokyo 2026 project. The previous session ran out of
context. This file is what it would have told you over the shoulder.

**Read in this order:** `CLAUDE.md` (how we work, verified addresses, common traps) →
`docs/PHASES.md` (the plan, reordered — see below) → this file → `docs/LEARNINGS.md` (every
surprise, phase by phase; it becomes `FEEDBACK.md` in Phase 7).

---

## 1. Where things stand

Five phases are done and **live on Sepolia**. 67 Foundry tests pass. 33 commits, all pushed to
`github.com/bertankofon/Hanko` (public).

| Phase | | Status |
|---|---|---|
| 0 | Setup, pinned addresses, verification, System tab | done |
| 1 | tNVDA + mapping-backed checker | done |
| 2 | Uniswap v4 permissioned pool, liquidity, swaps | done |
| 3 | ENSv2 registries + ENS-backed checker | done |
| 6 | Agent delegation through the name hierarchy | done |
| 5 | Operator console (halt/revoke/unwind) + Audit | done |
| 7 | Demo, deploy, README, FEEDBACK, video | **next** |
| 4 | World ID + HumanRegistrar | **deferred to last** |

The user reordered phases on 2026-09-27: **6 → 5 → 7 → 4**. Reasons are recorded at the top of
`docs/PHASES.md`. Do not reorder again without asking.

---

## 2. What is live right now

Everything below is deployed and working on Sepolia. Addresses also live in
`deployments/11155111.json`, which every script and the app read — never hardcode one.

| | |
|---|---|
| tNVDA (MockStockToken) | `0x301b61f063fc6232D21cdFa5D97042910ee3994F` |
| MockUSDC (6 decimals) | `0xB30c9206F2747f122A3AB2924a537193eCB623fa` |
| PermissionsAdapter | `0x7060947614ECED6CA376A318C81dF6C088f00718` |
| SimpleAllowlistChecker (the "before") | `0xc229c68F0C22301d3b332e0EAEfB3a93ebbe683D` |
| **EnsAllowlistChecker (live)** | `0x44f5f3F9376bEea9E2433898821e30F0BaCBd1Af` |
| tnvda.eth registry | `0x2462d01326F42ccfDbcC6358e2c8B4fd157Ea7fC` |
| swap.tnvda.eth | `0xbB8A0C79945993eCf1ACd4177B896A75C2998dce` |
| lp.tnvda.eth | `0xA35983B2b124e34AC65e77F4c854a3a356274A55` |
| agents.tnvda.eth | `0x385C90b1613D30706828380133bfdC3D61A49107` |
| Alice's own registry | `0xBA8daFac04175cbc3cD25d596046F9B71cFf169b` |
| Pool | tNVDA/USDC, fee 3000, tickSpacing 60, position tokenId 1 owned by Alice |

Actors (keys in `.env`, server-side only):

| | Address | Expected |
|---|---|---|
| Issuer / operator | `0x9e3008A5…8BB7fD` | `0x0003`, ~0.67 ETH |
| Alice | `0x053674AF…8055C9` | `0x0003`, ~0.03 ETH |
| Bot | `0xC408d425…2B2226` | `0x0001` (agent of Alice) |
| Stranger | `0x2f6c3BDE…9f297d` | `0x0000`, funded with USDC on purpose |

`tnvda.eth` is registered to the issuer for a year. ENS's own indexer resolves our names —
`registry(0xbB8A0C79…)` comes back as `swap.tnvda.eth`.

---

## 3. Decisions the user made — do not relitigate

- **Language:** speak Turkish with the user. Everything shipped is English — code, comments,
  commits, UI copy, CLI output, README. `docs/` internal notes may stay Turkish.
- **Push at the end of every phase.** Remote is `bertankofon/Hanko`. Check `.env` derivatives and
  the RPC key are untracked before pushing.
- **Expiry is not a feature to promote.** The mechanism stays (it is the ENS argument), but it is
  not a demo step and the number is not interesting. Default member TTL is **30 days** so nobody
  has to re-admit before a demo. The five years in the SEC order is the *exemption's* sunset and
  has nothing to do with participant permissions — do not conflate them, especially on stage.
- **World is deferred.** Until it lands, two claims are **not true** and must not be made:
  sybil resistance ("one passport, one wallet") and separation of powers ("the backend can admit
  but not revoke"). `ROLE_REGISTRAR` is still the issuer's.
- **Do not imitate Uniswap's interface.** Use their conventions, not their brand.

### The account isolation rule does NOT apply here

There is a memory about keeping a project away from the `bertankofon` GitHub account. That rule is
scoped to a **different** project (`~/dev/verdict`). Hanko's remote is deliberately
`bertankofon/Hanko` and the user confirmed it. Push normally with the default SSH key.

---

## 4. Traps that cost the last session real time

These are the ones that are not obvious and not in the upstream docs.

**Uniswap / permissioned pools**
- The token's allowlist needs **five protocol addresses**, not just the adapter: PoolManager,
  PermissionedPositionManager, UniversalRouter v2.2, the factory and PermissionedHooks.
- Verification is `approve` → `depositForVerification(1)` → `verifyPermissionsAdapter`. A plain
  transfer does not emit the event the factory's flow expects.
- **PoolManager itself must be an allowed wrapper.**
- `PermissionedHooks` lives in `Uniswap/v4-hooks-public`, not v4-periphery.
- Currency order depends on the adapter's CREATE address, so both orders must work and the price
  inverted for one. A wrong inversion is off by 1e12 and still looks like a working pool.
- The setup order is written down in exactly one place upstream:
  `v4-periphery/test/hooks/permissionedPools/…::setUpPermissionsAdapter`. **Read upstream tests
  before writing setup code.** That habit saved hours twice.

**ENSv2**
- `getSubregistry`, `getResolver` and `findOwner` all return zero for an expired name, and
  `unregister` sets the expiry to the current block — so revocation cascades for free.
- `setSubregistry` is not enough; `setParent` must be called too or `getParent()` is empty and the
  agent chain silently resolves to nothing.
- The agent index pointer lives in the entry's **resolver** field, not `subregistry`. Indexers read
  `subregistry` to place a registry in the hierarchy, and using it made ENS's own indexer believe
  the principal's registry hung under `agents.tnvda.eth`. This is documented in the contract.
- **Revoking a name and granting it again creates a new entry** with no subregistry and no roles.
  That silently detaches an investor from their own registry and kills every agent under it.
  `SetupPhase6.delegate()` handles it by re-attaching a recorded registry; do not break that.

**Foundry**
- `vm.expectRevert` binds to the *next* call. Funding or reads in between make a test pass for the
  wrong reason.
- Any external read between `vm.prank` and the target call **consumes the prank**. Use
  `startPrank`, or compute everything first. This bit twice.
- Some `makeAddr` labels have live code on Sepolia (`makeAddr("alice")` does). Minting an ERC-1155
  name to them runs the receiver check and reverts. `vm.etch(addr, "")` **after** selecting the
  fork.
- An anvil fork reports the forked chain's id, so a rehearsal overwrites the real deployments
  file. Pass `DEPLOYMENTS_SUFFIX=-local`.

**Infrastructure**
- Alchemy's free tier caps `eth_getLogs` at a **10 block range**. The audit tab uses the Etherscan
  API instead (key already in `.env`), which also returns timestamps.
- Etherscan free tier is 5 requests/second. Fetching audit sources in parallel silently dropped
  some, leaving whole registries out of the list with no sign of it. They are fetched in sequence
  now and an unreadable source is reported, not hidden.
- Sepolia's txpool fills up. A multi-transaction `forge script` can half-land while the logs say
  it succeeded. **Any script that writes several transactions must be idempotent.**

---

## 5. Known issues to fix

1. **`app/src/components/OperatorControls.tsx` says unwind "delivers both assets back to the
   liquidity provider". That is false and must be corrected.** A revoked LP gets the USDC back but
   **not** the tNVDA — our own token refuses delivery to a wallet that may not hold it, so the
   restricted leg stays as an ERC-6909 claim. The fork test only asserts the USDC leg; it should
   assert the tNVDA leg explicitly too, and nobody has yet measured whether the claim lands with
   the LP or the admin. The user said "skip for now"; it still has to be fixed before submission
   because it is a false claim on screen.
2. ENS's staging indexer (`https://staging-graphql.ens.dev/`) was stalled at block 11787289 for
   over ten minutes. Worth re-checking; if it caught up, the delegation name should now read
   `0xbot….0xalice….swap.tnvda.eth` and that is worth showing on stage.
3. `expiryOf` on the checker only covers the swap/lp registries, so an agent's row shows no
   expiry. Cosmetic.

---

## 6. UI work in progress

The user asked for a proper product UI, not the test surface we had. Agreed plan:

- **Done:** `Overview` page — one large quote from the order, an animated flow diagram
  (trader → Uniswap pool → Hanko checker → ENS, allowed/refused), official Uniswap and ENS brand
  assets in `app/public/brand/`, minimal text. Type scale raised (body 17px); the user explicitly
  said **no small fonts and far less text**.
- **Next:** a **global role switcher** in the app chrome — pick who you are once and the whole app
  reflects it, instead of an Actor dropdown inside each panel. The user liked this a lot.
- **Then:** rename tabs (Pool → Trade, Identity → Access, Venue operator → Operator), restyle
  those pages into the Overview's visual language, and build the Walkthrough (guided demo).

Animations use a small `Reveal` component (IntersectionObserver) and CSS. No animation library was
added on purpose. `prefers-reduced-motion` is honoured.

---

## 7. What is left, in priority order

**Submission requirements come before more UI.** A beautiful app with no live link and no README
loses prizes.

1. **Vercel deploy** (~30 min) — ENS requires a live demo link. Needs the user's account. Actor
   private keys go in server-side env; say plainly in the README that this is a demo convenience.
2. **README** (~30 min) — one-line summary, architecture, addresses, setup and test commands, and
   Uniswap's specific requirement: **file and line references for the integration**.
3. **`FEEDBACK.md`** (~20 min) — material is already in `docs/LEARNINGS.md`, section 4 above is the
   short version. The user must also fill the
   [Uniswap feedback form](https://developers.uniswap.org/hackathon-feedback).
4. Remaining UI stages (role switcher → renames/restyle → Walkthrough).
5. Demo reset script, demo video, a small PR to `uniswap-ai`.
6. Phase 4 (World) only if time genuinely allows; a clean "provider interface designed,
   implementation on the roadmap" note beats a half-wired QR flow.

**Ask the user how much time is left before planning further.** The previous session asked three
times and never got an answer, and the answer changes everything.

---

## 8. Operating the thing

```bash
# app (dev server)
cd /Users/bertan/dev/Hanko && pnpm --filter @hanko/app dev     # http://localhost:3000

# verification — 53 checks, all should be green
cd /Users/bertan/dev/Hanko/scripts && npx tsx verify-env.ts

# tests (67) — fork tests need a real RPC
cd /Users/bertan/dev/Hanko/contracts && forge test --fork-url sepolia

# restore demo state after a revoke
cd /Users/bertan/dev/Hanko/contracts \
  && forge script script/AdmitMembers.s.sol --rpc-url sepolia --broadcast --slow \
  && forge script script/SetupPhase6.s.sol --sig "delegate()" --rpc-url sepolia --broadcast --slow

# switch the pool's allowlist (both directions work, one transaction)
forge script script/SwitchChecker.s.sol --sig "toEns()"    --rpc-url sepolia --broadcast --slow
forge script script/SwitchChecker.s.sol --sig "toSimple()" --rpc-url sepolia --broadcast --slow
```

`contracts/.env` is a symlink to the root `.env`; forge reads from its own project root.
Use `--slow` on Sepolia — the txpool drops transactions otherwise.

**Do not run `unwindPosition` against Sepolia.** It closes the pool's only position and the
liquidity has to be rebuilt by hand. It is covered by fork tests.

---

## 9. Measurements the jury will ask for

Same route, same amount, real Sepolia swaps:

| Path | swap gas |
|---|---|
| Mapping checker | 215,010 |
| ENS, direct name | 272,640 |
| ENS, agent chain | 349,123 |

`checkAllowlist` alone: 668 warm / 2,668 cold for the mapping, ~39,310 for ENS. The honest framing
is that the ENS path costs ~27% more per swap and buys expiry, non-transferability, separated
admit/revoke powers, a delegation hierarchy, and a permission anyone can read.

---

## 10. How the user likes to work

Experienced Solidity/EVM developer. Wants to understand each step, not just receive working code.
Plan before building and wait for approval; explain concepts concretely with real addresses and
real numbers rather than abstractions — "which folder, which link, what does the bot's name look
like" was a genuine complaint about an over-abstract explanation.

Say plainly when something is wrong, unverified, or when you were the one who broke it. The
session that went well was the one that reported its own mistakes early.

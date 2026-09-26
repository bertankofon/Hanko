# Feedback — Uniswap v4 permissioned pools

Written while building [Hanko](README.md) at ETHGlobal Tokyo 2026: an ENSv2-backed
`IAllowlistChecker` behind three permissioned pools on Sepolia.

Time from first line to a permissioned swap filling on Sepolia: **about six hours**, and roughly
half of that went to the four things below. The contracts themselves were not the hard part.

---

## 1. The deployment file points at a router that cannot do permissioned swaps

`Uniswap/contracts` → `deployments/json/11155111.json` has a `UniversalRouter` key holding
v2.1.2 (`0x7E4f…43f3`). Permissioned swaps need **v2.2** (`0x5093…787c`), which is in the same file
under a different key. Taking the obvious one costs an afternoon, because the failure is not
"wrong router" — it is a revert from inside the hook, wrapped, with no hint about the cause.

**Suggested fix:** either make the default key point at the version that supports every pool type,
or add a `requires` note next to the permissioned-pool entries. One line in that JSON would have
saved the most expensive hour of this build.

A smaller version of the same problem: the `deployedCommit` recorded for universal-router
(`e34ba78`) is not reachable in the public clone, so signatures had to be read at a nearby commit
and cross-checked on chain.

## 2. The required setup order exists only in your integration tests

There is no page that says how to stand up a permissioned pool. We found the order by reading
`v4-periphery/test/hooks/permissionedPools/…::setUpPermissionsAdapter`, and it contained three
things we would not have guessed:

1. **Five protocol addresses** need to be allowed to receive the underlying, not just the adapter:
   PoolManager, PermissionedPositionManager, UniversalRouter, PermissionsAdapterFactory and
   PermissionedHooks. Miss one and the wrap reverts with *your token's* error, which sends you
   looking in the wrong codebase.
2. **`depositForVerification` before `verifyPermissionsAdapter`** — the factory refuses to verify
   an adapter with a zero balance. A plain transfer works for the balance but skips the
   `VerificationDeposit` event.
3. **PoolManager must be registered as an allowed wrapper**, not only the router and the position
   manager. This one is genuinely surprising: it reads like an internal.

**Suggested fix:** lift that test's sequence into a short "listing an asset" page. It is maybe
thirty lines of commentary and it is the difference between an afternoon and an hour.

## 3. Currency ordering depends on an address the factory has not created yet

`createPermissionsAdapter` uses plain `CREATE`, so which side of the pool the permissioned
currency lands on is unknown until it exists. Your own tests handle this by re-creating the adapter
in a loop until the address sorts the way they want.

We supported both orderings and inverted `sqrtPriceX96` for one of them. The reason this is worth
flagging: **getting it backwards produces a pool that looks fine.** The price is off by 1e12, the
pool initialises, liquidity mints, swaps execute. We only caught it because a test read the price
back and asserted a round number.

**Suggested fix:** a `CREATE2` variant with a salt, or a helper in periphery that builds the key
and the price together. We ended up writing that helper
([`PermissionedPoolWiring.buildPoolKey`](contracts/src/PermissionedPoolWiring.sol#L74)) and it is
the piece we would most like not to have owned.

## 4. A refused swap does not say why

The router wraps the inner failure, so a refusal arrives as
`WrappedError(hook, beforeSwap.selector, 0x82b42900, …)`. Off-chain libraries cannot name a
selector they have no ABI for, so what the user sees is raw hex.

For a permissioned pool this matters more than usual: **the refusal is the product.** A venue needs
to tell someone whether they were refused because they are not cleared, because the asset is
halted, or because the adapter is misconfigured — and those are three different conversations.

We ended up scanning every hex blob in the error object for known selectors
([`app/src/app/trade/actions.ts`](app/src/app/trade/actions.ts)). It works, but it is a hack sitting
in the most user-visible path of the app.

**Suggested fix:** ship an errors ABI alongside the permissioned-pool addresses, or have the
periphery re-throw the inner error unwrapped.

---

## What worked well

- **`IAllowlistChecker` is the right shape.** One function, an address and a token, returning a
  flag word. It gave us room to answer from ENS rather than a mapping without asking anything of
  the pool, and to return different permissions for swapping and for providing liquidity from the
  same call.
- **The token parameter matters even when you ignore it.** We answer venue-wide today, because the
  SEC order describes clearance as a property of the person. Per-instrument permissions are a
  registry lookup away precisely because the interface already carries the token.
- **Cost is negligible.** `checkAllowlist` measured 668 gas warm, 2,668 cold. A swap is around
  215,000 gas total, and the checker is called a few times per swap, so the whole permission layer
  is **2–4% of a swap**. That number ended a design argument for us; it is worth publishing.
- **The separation between the adapter's `swappingEnabled` switch and the checker** turned out to
  map exactly onto the regulation we were building for: halts are per asset and hit everyone,
  clearance is per person. We did not have to invent either half.

## Smaller notes

- `PermissionedHooks` lives in `Uniswap/v4-hooks-public`, not `v4-periphery` (moved out in
  `15daba8b`). The periphery README does not mention it.
- Liquidity on the permissioned side does not use Permit2 — the LP sends the underlying to the
  position manager first and settles with `payerIsUser: false`. Swaps *do* use Permit2. Having the
  two paths differ is reasonable but undocumented, and we lost time assuming symmetry.
- `PermissionFlag` is a `bytes2`, not a `uint`. Easy to mis-type, silent when you do.

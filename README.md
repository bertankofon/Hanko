<img src="app/public/brand/hanko-lockup-trimmed.webp" alt="Hanko" height="72">

**Tokenized stocks, permissioned by ENS.**

Live demo: **https://hanko-app.vercel.app** · Sepolia · ETHGlobal Tokyo 2026

---

## What this is

On 17 September 2026 the SEC's Innovation Exemption defined a Tokenized Securities Venue as doing
two things: running AMM pools for permissioned participants, and **setting the standards for who
may access them**.

Uniswap v4 permissioned pools cover the first. The second is left to the venue, and the interface
Uniswap gives you is one function returning a flag for an address:

```solidity
function checkAllowlist(address account, address token) external view returns (PermissionFlag);
```

Hanko answers that function with ENS. A cleared participant holds a name under `swap.hanko.eth` or
`lp.hanko.eth`, and the shape of the name is the permission. Every swap and every liquidity deposit
resolves it live.

Three things come free because it is ENS rather than a mapping:

- **Names expire**, so access lapses on its own.
- **Names are registered without the transfer role**, so clearance cannot be sold to a wallet the
  venue never cleared.
- **Names nest**, so an investor can open names for their own trading bots inside their own
  registry without asking the venue — and revoking the investor stops every bot in the same
  transaction, because a child of a lapsed name has nothing left to resolve through.

### Venue-wide access, per-symbol halts

The venue lists three symbols and clears people once. That split follows the order rather than
convenience: clearance is described as a property of the person ("standards for **persons** to
access trading"), while the condition that is per symbol — "must stop trading in a tokenized NMS
stock concurrently with any stoppage of trading in the underlying" — lives on each pool's own
adapter switch. One checker, one halt switch per symbol.

The demo makes the difference visible: halt tNVDA and the same wallet is refused on tNVDA and
filled on tAAPL in the same breath.

---

## Uniswap integration — file and line references

| What | Where |
|---|---|
| `IAllowlistChecker` implementation the pool calls on every swap and deposit | [`contracts/src/EnsAllowlistChecker.sol:79`](contracts/src/EnsAllowlistChecker.sol#L79) |
| Agent resolution — how a delegated bot is traced back to its principal | [`contracts/src/EnsAllowlistChecker.sol:108`](contracts/src/EnsAllowlistChecker.sol#L108) |
| Permissions adapter creation, verification and admin wiring, in the required order | [`contracts/src/PermissionedPoolWiring.sol:38`](contracts/src/PermissionedPoolWiring.sol#L38) |
| Pool key and starting price, handling either currency ordering | [`contracts/src/PermissionedPoolWiring.sol:74`](contracts/src/PermissionedPoolWiring.sol#L74) |
| Transfer restriction on the underlying, reading the same checker as the pool | [`contracts/src/MockStockToken.sol:86`](contracts/src/MockStockToken.sol#L86) |
| Listing a symbol: token → adapter → pool → liquidity via `PermissionedPositionManager` | [`contracts/script/ListStock.s.sol:38`](contracts/script/ListStock.s.sol#L38) |
| Full-range position minted through the permissioned position manager | [`contracts/script/ListStock.s.sol:147`](contracts/script/ListStock.s.sol#L147) |
| `V4_SWAP` command encoding for UniversalRouter **v2.2** | [`app/src/lib/swap.ts:179`](app/src/lib/swap.ts#L179) |
| Swap execution, with the refusal decoded back to the contract's own error | [`app/src/app/trade/actions.ts:198`](app/src/app/trade/actions.ts#L198) |

### Uniswap contracts used (Sepolia, pinned)

| Contract | Address |
|---|---|
| PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| PermissionsAdapterFactory | `0xe6b0d96919334c33d06266d1420f97f6f434fa2b` |
| PermissionedHooks | `0x51247e2291d290d17c08813a175ac86465ede8c0` |
| PermissionedPositionManager | `0x864c37908aa5e10b100cacee1c62e3954d76f5e1` |
| UniversalRouter **v2.2** | `0x5093f1cded83d99ffed6602da6260672ae16787c` |

> The default `UniversalRouter` entry in Uniswap's deployment file is v2.1.2, which cannot execute
> permissioned swaps. See [`FEEDBACK.md`](FEEDBACK.md).

---

## ENS integration — file and line references

| What | Where |
|---|---|
| Registries, roles and the name tree under `hanko.eth` | [`contracts/script/MoveRootToHanko.s.sol:92`](contracts/script/MoveRootToHanko.s.sol#L92) |
| Re-parenting a live registry without rebuilding it | [`contracts/script/MoveRootToHanko.s.sol:182`](contracts/script/MoveRootToHanko.s.sol#L182) |
| Granting and revoking a member's names, from the app | [`app/src/app/venue-actions.ts`](app/src/app/venue-actions.ts) |
| Delegation: the venue records a pointer, the investor makes the grant | [`app/src/app/venue-actions.ts:286`](app/src/app/venue-actions.ts#L286) |

ENSv2 Sepolia deployment pinned at `ensdomains/contracts-v2@366de74` (2026-09-15). Addresses are in
[`deployments/11155111.json`](deployments/11155111.json); the app reads them from that file and
verifies them on chain in the System tab. **Nothing in the UI is hard-coded** — prices come from
each pool's `slot0`, permissions from `checkAllowlist`, trading status from the adapter.

---

## Hanko's own deployments (Sepolia)

| Contract | Address |
|---|---|
| EnsAllowlistChecker | `0x44f5f3F9376bEea9E2433898821e30F0BaCBd1Af` |
| `hanko.eth` registry | `0xD7b4e2653fCEC23f7e8A2A5FFc7CD8f31aa69707` |
| `swap.hanko.eth` | `0xbB8A0C79945993eCf1ACd4177B896A75C2998dce` |
| `lp.hanko.eth` | `0xA35983B2b124e34AC65e77F4c854a3a356274A55` |
| `agents.hanko.eth` | `0x385C90b1613D30706828380133bfdC3D61A49107` |
| tNVDA / adapter | `0x504A42D07c7cB0A9b2404115aAF1589cCb703ED3` / `0x331a5383Ca4A95802FD6b49593Bcc44906404475` |
| tAAPL / adapter | `0xBbB490fd551765BF2b2aC67c68ebb004013C7186` / `0xeb33CBF1BF0a5e524B003E8e658d8FeDbbAd1f25` |
| tMSFT / adapter | `0xf4db10BC5f11C6474E5d3284CFd42f7F11c0A05F` / `0x317d6FD1ADdB880c5B2fDb9E4abEdf6db1e1B59C` |

---

## Running it

```bash
pnpm install
cp .env.example .env        # fill in the values it lists
pnpm verify                 # checks RPC, keys and every pinned address on chain
pnpm dev                    # http://localhost:3000
```

```bash
cd contracts
forge test                                            # unit tests
forge test --fork-url $SEPOLIA_RPC_URL                # 67 tests, most forked against live Sepolia
```

Deploying a venue from scratch:

```bash
forge script script/DeployPhase1.s.sol      --rpc-url sepolia --broadcast
forge script script/SetupPhase2.s.sol       --rpc-url sepolia --broadcast
forge script script/SetupPhase3.s.sol --sig "commitName()" --rpc-url sepolia --broadcast
# wait 75s for the ENS commit/reveal window
forge script script/SetupPhase3.s.sol       --rpc-url sepolia --broadcast --slow
forge script script/MoveRootToHanko.s.sol --sig "commitName()" --rpc-url sepolia --broadcast
# wait 75s
forge script script/MoveRootToHanko.s.sol   --rpc-url sepolia --broadcast --slow
forge script script/ListStock.s.sol --sig "run(string)" tNVDA --rpc-url sepolia --broadcast --slow
```

---

## Testing

67 Foundry tests. Most run against a Sepolia fork, so the ENS registries, the PoolManager, the
permissioned hook and the router under test are the real deployed contracts rather than mocks.

| Suite | Covers |
|---|---|
| `test/PermissionedPool.fork.t.sol` | Adapter wiring, swaps, liquidity, refusals, the halt switch |
| `test/EnsAllowlistChecker.fork.t.sol` | Name resolution, expiry, revocation, the agent cascade |
| `test/MockStockToken.t.sol` | Transfer restriction and the system-address exemption |
| `test/SimpleAllowlistChecker.t.sol` | The mapping-based checker the pool starts on |

---

## What this is not

- **Not KYC.** It carries a verified identity; it does not establish one. Who you are is a
  question for a credential provider. Who may trade is the question here.
- **Not a restriction on DeFi.** Permissionless pools are untouched. This exists so regulated
  venues can use Uniswap's infrastructure.
- **A testnet demo.** Mock assets, round-number listing prices, and demo wallets signed
  server-side so nobody approves eight MetaMask prompts on stage. A real venue would have each
  party sign for themselves; the contracts cannot tell the difference.

## Licence

MIT.

import 'server-only';

import {encodeAbiParameters, keccak256, parseAbiParameters, type Address, type Hex} from 'viem';
import {
  adapterAbi,
  checkerAbi,
  decodeFlags,
  getClient,
  hankoAddress,
  STATE_VIEW,
  stateViewAbi,
  tokenAbi,
  usdcPerTnvda,
} from './hanko';
import type {Stock} from './venue';

/** v4 pool id: keccak of the abi-encoded key. Matches PoolId.toId(). */
export function poolIdOf(stock: Stock): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks'),
      [stock.currency0, stock.currency1, stock.fee, stock.tickSpacing, stock.hooks],
    ),
  );
}

export interface Market {
  stock: Stock;
  /** Mid price in USDC, read from the pool's own slot0. */
  price: number | null;
  liquidity: bigint | null;
  /** The adapter's own switch — this is the trading halt. */
  tradable: boolean;
  /** How much of the stock the viewer holds. */
  balance: bigint;
  /** What the checker says about the viewer, for this token. */
  maySwap: boolean;
  mayProvideLiquidity: boolean;
}

/**
 * Reads everything the Trade screen shows for one symbol, from chain.
 *
 * Price comes from slot0 rather than the listing constant: after a few demo swaps the two differ,
 * and showing the constant would be the kind of hard-coded value the ENS criteria ask about.
 */
export async function readMarket(stock: Stock, viewer: Address | null): Promise<Market> {
  const client = getClient();
  const checker = hankoAddress('EnsAllowlistChecker');

  if (!client) {
    return {stock, price: null, liquidity: null, tradable: false, balance: 0n, maySwap: false, mayProvideLiquidity: false};
  }

  const poolId = poolIdOf(stock);

  const [slot0, liquidity, tradable, balance, flags] = await Promise.all([
    client
      .readContract({address: STATE_VIEW, abi: stateViewAbi, functionName: 'getSlot0', args: [poolId]})
      .catch(() => null),
    client
      .readContract({address: STATE_VIEW, abi: stateViewAbi, functionName: 'getLiquidity', args: [poolId]})
      .catch(() => null),
    client
      .readContract({address: stock.adapter, abi: adapterAbi, functionName: 'swappingEnabled'})
      .catch(() => false),
    viewer
      ? client
          .readContract({address: stock.token, abi: tokenAbi, functionName: 'balanceOf', args: [viewer]})
          .catch(() => 0n)
      : Promise.resolve(0n),
    viewer && checker
      ? client
          .readContract({
            address: checker,
            abi: checkerAbi,
            functionName: 'checkAllowlist',
            args: [viewer, stock.token],
          })
          .catch(() => '0x0000' as const)
      : Promise.resolve('0x0000' as const),
  ]);

  const decoded = decodeFlags(flags as `0x${string}`);

  return {
    stock,
    price: slot0 ? usdcPerTnvda(slot0[0], stock.stockIsCurrency0) : null,
    liquidity: liquidity ?? null,
    tradable: Boolean(tradable),
    balance: balance as bigint,
    maySwap: decoded.swap,
    mayProvideLiquidity: decoded.liquidity,
  };
}

export async function readMarkets(stocks: Stock[], viewer: Address | null): Promise<Market[]> {
  return Promise.all(stocks.map((s) => readMarket(s, viewer)));
}

import 'server-only';

import {getAddress, type Address} from 'viem';
import {d} from '@hanko/verify';

/**
 * The venue's listed symbols, read from the deployments record.
 *
 * One checker clears people for the venue; each symbol carries its own adapter, and so its own
 * halt switch. That split is not ours — it is how the exemption is written. Access is a standard
 * "for persons to access trading"; halting is per symbol, "concurrently with any stoppage of
 * trading in the underlying NMS stock".
 */
export interface Stock {
  symbol: string;
  name: string;
  /** Ticker of the stock this tracks, for the logo and the "tracks X" line. */
  underlying: string;
  token: Address;
  adapter: Address;
  /** Listing price in whole USDC, for display before the pool is read. */
  markUsd: number;
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  /** The permissioned hook, the same contract for every symbol on the venue. */
  hooks: Address;
  /** True when the permissioned currency is currency0 — decides which way the price inverts. */
  stockIsCurrency0: boolean;
  logo: string;
}

type RawStock = (typeof d)['stocks'][keyof (typeof d)['stocks']];

function toStock(symbol: string, raw: RawStock): Stock | null {
  if (!raw?.token || !raw.adapter || !raw.currency0 || !raw.currency1) return null;

  const adapter = getAddress(raw.adapter);
  return {
    symbol,
    name: raw.name,
    underlying: raw.underlying,
    token: getAddress(raw.token),
    adapter,
    markUsd: Number(raw.usdcPerUnit) / 1e6,
    currency0: getAddress(raw.currency0),
    currency1: getAddress(raw.currency1),
    fee: Number(raw.fee),
    tickSpacing: Number(raw.tickSpacing),
    hooks: getAddress(d.uniswap.PermissionedHooks),
    stockIsCurrency0: getAddress(raw.currency0) === adapter,
    logo: `/brand/stocks/${raw.underlying.toLowerCase()}.svg`,
  };
}

/** Every symbol the venue has actually listed, in the order the record holds them. */
export function getStocks(): Stock[] {
  return Object.entries(d.stocks ?? {}).flatMap(([symbol, raw]) => {
    const stock = toStock(symbol, raw as RawStock);
    return stock ? [stock] : [];
  });
}

export function getStock(symbol: string): Stock | null {
  return getStocks().find((s) => s.symbol.toLowerCase() === symbol.toLowerCase()) ?? null;
}

export function usdcAddress(): Address | null {
  return d.hanko.MockUSDC ? getAddress(d.hanko.MockUSDC) : null;
}

import Link from 'next/link';
import {StockLogo} from '@/components/trade/StockLogo';
import {SwapCard} from '@/components/trade/SwapCard';
import {formatAmount, getClient, tokenAbi} from '@/lib/hanko';
import {readMarkets, type Market} from '@/lib/market';
import {getViewer} from '@/lib/role';
import {getStocks, usdcAddress} from '@/lib/venue';

export const dynamic = 'force-dynamic';

export const metadata = {title: 'Trade — Hanko'};

function money(value: number | null): string {
  if (value === null) return '—';
  return `$${value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

function StatusPill({market}: {market: Market}) {
  if (!market.tradable) {
    return (
      <span className="rounded-full border border-fail/50 bg-fail/10 px-2.5 py-1 text-xs font-medium text-fail">
        Halted
      </span>
    );
  }
  return (
    <span className="rounded-full border border-pass/40 bg-pass/10 px-2.5 py-1 text-xs font-medium text-pass">
      Open
    </span>
  );
}

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{symbol?: string}>;
}) {
  const stocks = getStocks();
  const viewer = await getViewer();
  const {symbol} = await searchParams;

  if (stocks.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-panel p-6 text-body text-muted">
        No symbols are listed yet. Run the listing script first.
      </p>
    );
  }

  const markets = await readMarkets(stocks, viewer.address);
  const selected = markets.find((m) => m.stock.symbol.toLowerCase() === symbol?.toLowerCase()) ?? markets[0];

  const client = getClient();
  const usdc = usdcAddress();
  const usdcBalance =
    client && usdc && viewer.address
      ? await client
          .readContract({address: usdc, abi: tokenAbi, functionName: 'balanceOf', args: [viewer.address]})
          .catch(() => 0n)
      : 0n;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div>
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-section">Listed symbols</h1>
            <p className="mt-1 text-body text-muted">
              Three tokenized stocks, one permissioned pool each. Prices are the pools&apos; own.
            </p>
          </div>
          <span className="rounded-full border border-line px-3 py-1 text-xs uppercase tracking-[0.14em] text-muted">
            Mock assets · Sepolia
          </span>
        </header>

        <div className="overflow-hidden rounded-2xl border border-line bg-panel">
          {/* The header only earns its space once the columns exist; below sm the row carries
              its own labels instead. */}
          <div className="hidden grid-cols-[1fr_7rem_6rem_7rem] gap-3 border-b border-line px-5 py-3 text-xs uppercase tracking-[0.14em] text-muted sm:grid">
            <span>Symbol</span>
            <span className="text-right">Price</span>
            <span className="text-right">Status</span>
            <span className="text-right">You hold</span>
          </div>

          {markets.map((market) => {
            const active = market.stock.symbol === selected.stock.symbol;
            return (
              <Link
                key={market.stock.symbol}
                href={`/trade?symbol=${market.stock.symbol}`}
                scroll={false}
                className={[
                  'flex items-center gap-3 border-b border-line px-4 py-4 transition-colors last:border-b-0 sm:px-5',
                  'sm:grid sm:grid-cols-[1fr_7rem_6rem_7rem]',
                  active ? 'bg-panel-2' : 'hover:bg-panel-2/60',
                ].join(' ')}
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <StockLogo underlying={market.stock.underlying} />
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium">{market.stock.name}</span>
                    <span className="flex items-center gap-2 text-sm text-muted">
                      <span className="truncate">
                        {market.stock.symbol} · tracks {market.stock.underlying}
                      </span>
                      {/* The pill has no column of its own on a phone, so it rides here. */}
                      <span className="sm:hidden">
                        <StatusPill market={market} />
                      </span>
                    </span>
                  </span>
                </span>

                {/* Below sm, price and status stack in one right-hand block and the holding
                    moves under the price, so nothing has to scroll sideways. */}
                <span className="shrink-0 text-right text-base tabular-nums">
                  {money(market.price)}
                  <span className="block text-sm text-muted sm:hidden">
                    {formatAmount(market.balance, 18, 2)} held
                  </span>
                </span>
                <span className="hidden shrink-0 text-right sm:block">
                  <StatusPill market={market} />
                </span>
                <span className="hidden text-right text-base tabular-nums text-muted sm:block">
                  {formatAmount(market.balance, 18, 2)}
                </span>
              </Link>
            );
          })}
        </div>

        <p className="mt-4 text-sm text-muted">
          Every row is read from Sepolia: the price from the pool&apos;s slot0, the status from the
          permissions adapter&apos;s own switch, the holding from the token.
        </p>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-3 flex items-center gap-3">
          <StockLogo underlying={selected.stock.underlying} size={32} />
          <div>
            <p className="text-base font-medium">{selected.stock.symbol}</p>
            <p className="text-sm text-muted">{money(selected.price)}</p>
          </div>
        </div>

        <SwapCard
          symbol={selected.stock.symbol}
          underlying={selected.stock.underlying}
          price={selected.price}
          tradable={selected.tradable}
          maySwap={selected.maySwap}
          viewerLabel={viewer.label}
          usdcBalance={formatAmount(usdcBalance as bigint, 6, 2)}
          stockBalance={formatAmount(selected.balance, 18, 2)}
        />

        <div className="mt-4 rounded-2xl border border-line bg-panel p-4 text-sm">
          <p className="font-medium">Acting as {viewer.label}</p>
          <p className="mt-1 text-muted">{viewer.blurb}</p>
          <p className="mt-2 text-muted">
            {selected.maySwap
              ? 'Holds a seal on this venue right now.'
              : 'Holds no seal right now. The venue operator grants and withdraws them.'}
          </p>
          {viewer.address && (
            <a
              className="mt-2 block font-mono text-xs text-muted underline underline-offset-4 hover:text-ink"
              href={`https://sepolia.etherscan.io/address/${viewer.address}`}
              target="_blank"
              rel="noreferrer"
            >
              {viewer.address}
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}

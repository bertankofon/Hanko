/**
 * A listed symbol's mark, on a round tile.
 *
 * Microsoft keeps its own colours because the four squares are only legible that way; the other
 * two are single-colour marks and inherit the text colour, which keeps them readable on this
 * background the way the companies themselves set them on dark.
 */
const SIZING: Record<string, string> = {
  NVDA: 'w-[62%]',
  AAPL: 'w-[42%]',
  MSFT: 'w-[46%]',
};

export function StockLogo({underlying, size = 40}: {underlying: string; size?: number}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-panel-2 text-ink"
      style={{width: size, height: size}}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local brand asset, fixed size */}
      <img
        src={`/brand/stocks/${underlying.toLowerCase()}.svg`}
        alt=""
        className={SIZING[underlying] ?? 'w-1/2'}
      />
    </span>
  );
}

/**
 * A listed symbol's mark, on a round tile.
 *
 * Each file carries its own fill rather than inheriting one: an <img> loads an SVG as a separate
 * document, so `currentColor` never reaches it. Microsoft keeps its four brand colours because
 * they are only legible that way; the others are set light, as the companies themselves set them
 * on dark backgrounds.
 */
const SIZING: Record<string, string> = {
  NVDA: 'w-[62%]',
  AAPL: 'w-[42%]',
  MSFT: 'w-[46%]',
};

export function StockLogo({underlying, size = 40}: {underlying: string; size?: number}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-panel-2"
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

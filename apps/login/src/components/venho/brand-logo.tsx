import { assetUrl } from "./asset";

/**
 * VENHO FORK — the venho.ai lockup in the top-left of every page.
 *
 * Deliberately not upstream's `<Logo>`: that renders the instance's branding
 * logoUrl inside the card, which is not where the designs put it, and an
 * instance with no uploaded logo renders nothing at all.
 *
 * The artwork is the marketing brand kit's horizontal lockup, copied from
 * `venho-desktop/source/personal/presentation/Venho-Brand-Kit-Marketing-v1/`
 * rather than re-exported from the login Figma page — that file is the brand's
 * own source, and the Figma frame composes its logomark out of positioned
 * layers that no SVG export reproduces. `-h-cd` is the on-dark treatment
 * (pale-blue mark, white wordmark); `-h-cw` is the on-light one.
 *
 * Native width is 127×33; rendered at 24px tall to match the designs.
 */
export function BrandLogo() {
  return (
    <div className="h-[24px]" data-testid="venho-logo">
      <img
        src={assetUrl("/venho/venho-logo-dark.svg")}
        alt="venho.ai"
        className="hidden h-[24px] w-auto dark:block"
      />
      <img
        src={assetUrl("/venho/venho-logo-light.svg")}
        alt="venho.ai"
        className="block h-[24px] w-auto dark:hidden"
      />
    </div>
  );
}

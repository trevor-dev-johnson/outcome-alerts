# oddsUp design rules

These rules apply to every frontend change in oddsUp. Read them before editing UI code. Project-specific product, security, and functional requirements take precedence over general design guidance.

## Design philosophy

- Design through deliberate decisions, not vague instructions such as modern, sleek, or clean.
- Prioritize readability, information hierarchy, density, and usability.
- Every element must serve a purpose.
- Prefer removing unnecessary elements over adding decorative ones.
- The product should feel calm, fast, intentional, and trustworthy.
- Reference existing high-quality components and established product patterns rather than inventing everything from scratch.

## Prohibited patterns

- No gradients.
- No glowing buttons or decorative glow effects.
- No glassmorphism.
- No decorative eyebrow labels.
- No unnecessary uppercase text.
- No icons inside decorative rounded containers.
- No nested cards.
- No gratuitous badges or pills.
- No decorative left-border selection indicators.
- No arbitrary leading-zero numbering.
- No redundant subtitles.
- No unnecessary dividers.
- No excessive rounded corners.
- No oversized whitespace that reduces useful information density.
- No decorative shadows on stationary elements.
- No animations whose only purpose is decoration.

Meaningful market terminology, ticker symbols, acronyms, and data representations are exempt from sentence-case restrictions.

## Color system

Use existing brand colors and consolidate them into semantic design tokens where necessary:

- Background
- Surface
- Foreground
- Text secondary
- Text muted
- Border
- Accent
- Positive
- Negative
- Warning
- Focus

Do not introduce hardcoded color values inside individual components. Raw color definitions belong only in centralized design tokens.

Keep surfaces neutral. Preserve the existing oddsUp lime accent, using it deliberately for primary actions, active selections, and other meaningful states.

Positive and negative market movements must remain visually distinguishable without depending exclusively on color.

Do not introduce new accent colors without justification.

## Typography

- Use a consistent typography scale.
- Use sentence case for interface labels.
- Prefer regular and medium font weights.
- Establish hierarchy through size, spacing, contrast, and placement rather than excessive boldness.
- Avoid arbitrary font sizes.
- Use tabular numerals for market data where supported.
- Body text should generally be at least 16px on mobile.
- Supporting text should generally be at least 14px.
- Nonessential metadata may use 12px where legibility is maintained.
- Avoid excessive letter spacing.
- Do not sacrifice readability to fit additional information.

## Layout

- Mobile-first development.
- Maintain a consistent spacing system.
- Minimum 44px touch targets for primary interactive controls.
- Avoid horizontal overflow.
- Prioritize useful content above the fold.
- Reduce unnecessary containers and borders.
- Support long market questions without clipping or losing meaningful information.
- Maintain consistent visual hierarchy across all pages.

## Motion

- Interface transitions must remain under 300ms.
- Exits should be faster than entries.
- No bounce effects.
- No staggered entrance animations.
- No unnecessary page-load animations.
- Buttons may use a subtle 0.97 press scale where appropriate.
- Keyboard navigation must respond immediately.
- Respect reduced-motion preferences.

## Accessibility

- Meet WCAG AA contrast requirements.
- Provide visible keyboard focus states.
- Preserve semantic HTML and accessible labels.
- Never communicate important information exclusively through color.
- Maintain accessible interaction targets on mobile.

## Mandatory visual verification

No UI task is complete until rendered screenshots have been inspected.

Use Playwright to capture and inspect:

- 320px mobile
- 375px mobile
- 390px mobile
- 430px mobile
- 768px tablet
- 1440px desktop

Inspect every officially supported theme. Do not introduce a new theme simply for testing.

Check for:

- Clipped or overlapping text
- Horizontal overflow
- Poor contrast
- Excessive whitespace
- Inconsistent spacing
- Broken responsive layouts
- Unnecessary decorative elements
- Incorrect data presentation
- Violations of these design rules

Taking screenshots without inspecting them does not satisfy this requirement.

Perform a final simplification pass. Remove anything that does not improve comprehension, navigation, functionality, or trust.

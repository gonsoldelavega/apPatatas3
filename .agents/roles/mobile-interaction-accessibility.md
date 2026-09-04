# Role: Mobile Interaction & Accessibility Specialist

## Mission

Make Factupapa excellent on touch devices and keyboard-accessible, with resilient responsive behavior and no hidden/obscured controls.

## Primary test surfaces

Check representative mobile widths around 375, 390 and 430 CSS px plus a desktop width. Test both light and dark themes when relevant.

## Inspect

- Safe-area insets, sticky headers, bottom navigation and modal/sheet geometry.
- Vertical overflow and whether bottom fields/actions remain reachable.
- On-screen keyboard behavior: focused input visibility, scroll restoration, sticky actions and closing behavior.
- Touch targets and spacing; target at least WCAG 2.2 AA requirements and prefer comfortable mobile controls.
- Focus order, focus visibility, dialog focus containment and close behavior.
- Labels, accessible names, status announcements and semantic controls.
- Color contrast, disabled states and information conveyed only by color.
- Zoom/reflow and long-text behavior.
- Motion/transitions and reduced-motion compatibility where applicable.
- Tap latency, accidental double actions and controls too close together.

## Fix principles

- Prefer approximately 44 CSS px for primary touch controls where practical while never falling below applicable accessibility requirements without a justified exception.
- Do not hide required actions below inaccessible fixed layers.
- Do not make users rotate the device to complete a business task.
- Use native semantics before custom ARIA workarounds.
- Preserve scroll/focus context after modal and navigation transitions.

## Boundaries

Coordinate visual changes with Visual Design and workflow changes with Product UX.
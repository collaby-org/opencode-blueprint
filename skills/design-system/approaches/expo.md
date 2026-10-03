# Approach: Expo (native tokens, no CSS)

- No CSS on native: tokens materialize as a typed theme object (colors, spacing, type scale, radius, shadows), consumed via hooks/context — never hardcoded palettes.
- Primitives map to Pressable/View/Text reading theme values; pressed/disabled via theme opacity/scale, motion via Reanimated (no CSS transitions exist here).
- One icon family throughout; never hand-roll SVGs, never emoji icons.
- Navigation via expo-router; screen compositions documented as page patterns in the registry.
- Dark mode via theme switch from the first primitive; every token needs both modes.
- Validate per `reference/master-instructions.md` §41 adapted: render every state on device/simulator, not just the happy path.

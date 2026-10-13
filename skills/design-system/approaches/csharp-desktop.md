# Approach: C# desktop (framework-first: WPF, WinUI, or WinForms)

- Choose the framework first and never mix idioms: WPF (XAML + resource dictionaries + styles/templates + MVVM bindings), WinUI (theme resources + styles + navigation view patterns), WinForms (designer + shared user controls + owner-drawn only where native cannot reach).
- Tokens map to real runtime resources: WPF resource dictionaries, WinUI theme resources, WinForms shared style helpers — consumed by every view, never hardcoded palettes. Every supported theme authored as real values.
- Native controls first: buttons, lists, dialogs, and navigation compose from the framework's own controls styled by the system; custom controls only when no native control fits, built on primitives + tokens with explicit contracts.
- Shared views (cards, buttons, badges, tags, nav items, form fields, dialogs, feedback) live once as shared controls/templates — never reimplemented per window or page. Variants via styles/templates/parameters; variants may differ in appearance (documented); reuse ≠ identical.
- Navigation + dialogs + page patterns per the framework's idioms; responsive means window-size adaptation (no mobile-collapse demands on desktop).
- Accessibility: keyboard navigation, screen-reader names, visible focus, contrast minimums per platform.
- Validate per framework: applicable states per §30, build + tests, interaction-state walkthroughs, registry consistency (see `reference/master-instructions.md` §41, §59).

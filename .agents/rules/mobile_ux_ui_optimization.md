# Mobile-First UX/UI Optimization Rule

This codebase is strictly mobile-first, designed for riders mounting smartphones on handlebars (motorcycles, bicycles, convoys). All agents and developers modifying this codebase MUST adhere to the following mobile UX/UI rules:

## 1. Viewport & Sizing Standards
- **Dynamic Viewport Height**: Always use `100dvh` (never raw `100vh` or `w-screen`/`100vw`).
- **Map Viewport Containment**: Realtime map views MUST use `fixed inset-0 overflow-hidden` to prevent mobile address bars from pushing UI elements below the screen.
- **Safe Area Insets**: Floating elements, drawers, headers, and bottom modals MUST include `env(safe-area-inset-*)` padding for iOS home indicator bars, dynamic islands, and Android gesture navigation bars.

## 2. Touch & Riding Ergonomics
- **Minimum Tap Target**: Interactive buttons, controls, and quick action chips MUST be at least **44×44px** (or have sufficient padding) to ensure reliability when using gloves or while riding.
- **1-Tap Quick Actions**: Critical actions (Quick Shouts, Recenter, Follow, 2D/3D toggle) must execute in 1 tap without nested multi-step dialogs.
- **Haptic Tactile Feedback**: Use `navigator.vibrate?.(30)` on critical button presses for physical confirmation.

## 3. Virtual Keyboard & Form Ergonomics
- **16px Input Font Size**: All `<input>` and `<textarea>` elements must have a minimum `16px` font size on mobile (`text-base sm:text-sm`) to prevent iOS Safari and Android Chrome from triggering unwanted viewport auto-zoom.
- **Centered Vertical Layout with `my-auto`**: Form pages must use `min-h-[100dvh] flex flex-col justify-center items-center` with `my-auto` on the form card to ensure the form remains centered when resting and smoothly scrolls upward into view when the on-screen keyboard appears.

## 4. High-DPI & Text Rendering
- **Flexbox Safety**: Always pair flex children containing text with `min-w-0` and `truncate` to prevent subpixel horizontal overflow on 2x/3x/4x high-DPI screens.
- **Universal Box-Sizing**: Ensure all elements use `box-sizing: border-box`.

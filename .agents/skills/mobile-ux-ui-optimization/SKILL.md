---
name: mobile-ux-ui-optimization
description: Enforce and implement mobile-first UX/UI design patterns, viewport containment, glove-friendly ergonomics, and keyboard handling.
---

# Mobile-First UX/UI Optimization Skill

Use this skill whenever designing, modifying, or reviewing mobile user interfaces, navigation layouts, touch controls, or form inputs.

## Core Directives

### 1. Viewport & Layout Architecture
- Use `100dvh` for full-height containers to account for dynamic mobile browser address bars.
- Scoped full-screen maps require `fixed inset-0 overflow-hidden` to avoid off-screen sinking.
- Standard document pages (landing, settings, about) must allow natural vertical scrolling with `w-full min-h-[100dvh] overflow-x-hidden`.

### 2. Virtual Keyboard Optimization
- Set `fontSize: 16px` or `text-base sm:text-sm` on all inputs to eliminate mobile auto-zoom.
- Wrap form cards with `my-auto` inside `min-h-[100dvh] flex flex-col justify-center items-center py-6 sm:py-12` so content remains centered when resting and smoothly translates upward when the keyboard is focused.

### 3. Glove & Touch Targets
- Minimum touch target: **44×44px**.
- Provide active scale animations (`active:scale-95` or `active:scale-90`) and haptic feedback (`window.navigator?.vibrate?.(30)`).
- Quick alerts / shouts must be accessible via 1-tap horizontal carousels with smooth swipe inertia.

### 4. Safe Area Inset Management
- Apply `env(safe-area-inset-top)` to floating top bars and headers.
- Apply `env(safe-area-inset-bottom)` with a fallback margin (`pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))]`) to bottom drawers, sheets, and action footers.
- Apply `env(safe-area-inset-left)` and `env(safe-area-inset-right)` for landscape orientation.

### 5. High-DPI & Horizontal Containment
- Always use `min-w-0 flex-1 truncate` on text containers inside flexboxes.
- Never use `100vw` or `w-screen` as it causes horizontal scrollbars on high-DPI screens with scrollbars. Use `w-full`.

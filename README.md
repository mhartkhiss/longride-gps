# LongRide GPS 🏍️ 🚴 🧭

> **Realtime multiplayer GPS navigation for group rides, convoys, and cycling packs.**

LongRide GPS lets riders create a temporary ride room, share a 6-character room code, and see each other's live positions moving on a shared interactive map in real-time. The session host can set a shared destination, and everyone's app calculates and overlays the optimized route.

---

## ✨ Features

- **Live Multiplayer GPS**: Watch every rider's position, heading orientation, and live speed with smooth marker interpolation.
- **Shared Destination & Route**: Host can search or pin destinations; route geometry, distance, and ETA synchronize across all devices.
- **Battery & Bandwidth Throttling**: GPS updates are filtered client-side (1.5s interval + 3m movement threshold) before broadcasting.
- **No Sign-Up Barriers**: Instant anonymous/guest authentication—no passwords or emails required to ride.
- **Ephemeral Realtime Architecture**: Live GPS coordinates stream over **Supabase Realtime Broadcast** (never clogging your database), while **Presence** tracks who is online/offline.
- **Mobile-First Dark UI**: Designed strictly for mounted smartphones (motorcycles, bikes, cars) with high-contrast night aesthetics, glove-friendly touch targets (min 44px), collapsible bottom sheets, 2D/3D tilt toggle, and 1-tap recenter/fit-group controls.
- **Strict Mobile Ergonomics**: Fixed `100dvh` viewport containment, iOS/Android gesture navigation safe area insets, 16px inputs to prevent mobile browser auto-zoom, and tactile haptic feedback.

---

## 📱 Mobile-First UI/UX Design Standards

This project adheres strictly to mobile-first UI/UX engineering standards:

1. **True Viewport Sizing (`100dvh`)**: Always use dynamic viewport units (`100dvh`) and `fixed inset-0` on map viewports to prevent browser address bars and gesture navigation bars from clipping or pushing UI off-screen.
2. **Safe-Area Inset Handling**: All floating controls, bottom sheets, and headers MUST utilize `env(safe-area-inset-*)` padding for iOS home indicators, dynamic islands, and Android navigation bars.
3. **Glove & One-Thumb Ergonomics**:
   - Touch targets must adhere to a minimum of **44×44px** tap areas.
   - 1-tap quick actions (Quick Shouts, Recenter, Follow Rider, 2D/3D toggle) for handlebar use.
   - Haptic vibration feedback (`navigator.vibrate`) on critical interactions.
4. **Virtual Keyboard Handling**:
   - Form inputs enforce a minimum `16px` font size to completely eliminate unwanted iOS Safari / Chrome auto-zoom.
   - Form containers use `my-auto` centering inside `min-h-[100dvh]` so elements seamlessly scroll and remain visible when on-screen virtual keyboards appear.
5. **High-DPI / Subpixel Rendering**: Use responsive truncation, `min-w-0`, and universal `box-sizing: border-box` to eliminate horizontal subpixel scroll clipping on 2x/3x/4x retina/AMOLED screens.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | [React 18](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/), Glassmorphism Dark Theme, [Lucide Icons](https://lucide.dev/) |
| **State Management** | [Zustand](https://github.com/pmndrs/zustand) |
| **Maps & Routing** | [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/), [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/) |
| **Backend & Realtime** | [Supabase](https://supabase.com/) (Auth, PostgreSQL DB, Realtime Broadcast & Presence, RLS) |
| **Location** | Native Browser Geolocation API (`navigator.geolocation.watchPosition`) |

---

## 🚀 Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- npm or pnpm

### 2. Clone and Install Dependencies

```bash
git clone https://github.com/your-username/longride-gps.git
cd longride-gps
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase project credentials and Mapbox token:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Mapbox Access Token (pk.eyJ...)
VITE_MAPBOX_ACCESS_TOKEN=your-mapbox-access-token
```

> **Note**: A free Mapbox public access token can be generated at [account.mapbox.com](https://account.mapbox.com/).

### 4. Database Setup

Execute the SQL migration found in [`supabase/migrations/001_create_rides_and_participants.sql`](./supabase/migrations/001_create_rides_and_participants.sql) in your Supabase SQL Editor to create:
- `rides` table
- `ride_participants` table
- 6-character room code generator function
- Row Level Security (RLS) policies
- Realtime table publications

### 5. Run the Development Server

```bash
npm run dev -- --host
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📱 Testing on Mobile Devices (Local Network)

1. Ensure your phone and development computer are connected to the same Wi-Fi network.
2. Check the Network IP address displayed in your terminal (e.g. `http://192.168.1.X:3000`).
3. Open that address on two different phones or browser tabs:
   - **Device 1**: Tap **Create New Ride** -> Enter ride name -> Share code.
   - **Device 2**: Tap **Join with Code** -> Enter the 6-character code.
4. Allow Location Permissions to start broadcasting live GPS positions.

---

## 🏗️ Architecture Overview

```text
                        ┌──────────────────────┐
                        │      React App       │
                        │  TypeScript + Vite   │
                        └──────────┬───────────┘
                                   │
             ┌─────────────────────┼─────────────────────┐
             │                     │                     │
             ▼                     ▼                     ▼
      Browser GPS             Mapbox APIs          Supabase Client
      Geolocation             Map + Routes         Auth + DB + Realtime
             │                     │                     │
             │                     │          ┌──────────┼───────────┐
             │                     │          ▼          ▼           ▼
             │                     │       Auth       Postgres   Realtime
             │                     │                                │
             │                     │                    ┌───────────┴─────────┐
             │                     │                    ▼                     ▼
             │                     │                Broadcast             Presence
             │                     │                GPS/events            online state
             └─────────────────────┴────────────────────────────────────────────
```

- **Durable Ride State (`Postgres`)**: Room code, host user ID, destination coordinates, ride status.
- **Ephemeral GPS Stream (`Broadcast`)**: Throttled coordinates (`lat`, `lng`, `accuracy`, `heading`, `speed`) sent peer-to-peer over WebSockets.
- **Online/Offline State (`Presence`)**: Detects rider disconnections or app closures automatically.

---

## 📄 License

MIT License — free for personal, educational, and commercial use.

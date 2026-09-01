# Group Ride GPS Web App — Implementation Plan

## 1. Project Overview

### Working concept

Build a browser-based group ride navigation application that feels similar to a lightweight Google Maps experience, but adds multiplayer ride sessions so multiple riders can see each other's live positions on the same map.

### Core user flow

1. User opens the web app.
2. User creates a ride session or joins one using a short room code.
3. User enters a display name.
4. Browser requests location permission.
5. User sees their own GPS location on the map.
6. All riders in the same session see each other's live positions.
7. The host can choose a shared destination.
8. The app calculates and displays a shared route.
9. Riders can continue navigating while seeing the group.
10. The session can be ended, and temporary session data can eventually expire.

### Main constraint

Do **not** build or deploy a custom backend server. The application should use managed backend services and a static/frontend deployment only.

The target is a free or near-zero-cost personal/school project. Exact provider free-tier limits can change, so the implementation must include lightweight usage controls and avoid unnecessary API calls.

---

# 2. Recommended Tech Stack

## Frontend

- **React + TypeScript**
- **Vite** for development/build tooling
- **Tailwind CSS** for styling
- **React Router** for page routing
- **Zustand** for client-side session/map state where needed
- Native browser **Geolocation API** for GPS

## Backend-as-a-Service

- **Supabase** (use the supabase MCP)
  - Supabase Auth
  - Anonymous authentication for guest users
  - PostgreSQL database
  - Realtime Broadcast for high-frequency GPS updates
  - Realtime Presence for online/offline rider status
  - Row Level Security (RLS)

Do not create a Node.js/Django/Express/FastAPI backend for the MVP.

## Maps and routing

- **Mapbox GL JS** for the interactive map
- **Mapbox Directions API** for route calculation
- **Mapbox Geocoding/Search** only when destination/address search is needed


# 3. Architecture

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
              │                     │          │          │           │
              │                     │          ▼          ▼           ▼
              │                     │       Auth       Postgres   Realtime
              │                     │                                │
              │                     │                    ┌───────────┴─────────┐
              │                     │                    │                     │
              │                     │                    ▼                     ▼
              │                     │                Broadcast             Presence
              │                     │                GPS/events            online state
              │                     │
              └─────────────────────┴────────────────────────────────────────────
```

### Important architectural rule

Use different mechanisms for different types of data:

| Data | Mechanism |
|---|---|
| User identity | Supabase Auth |
| Ride/session configuration | Supabase Postgres |
| Participants/membership | Supabase Postgres |
| Shared destination | Supabase Postgres + Realtime/refresh |
| Live GPS | Supabase Realtime Broadcast |
| Online/offline status | Supabase Realtime Presence |
| Final/periodic ride history | Supabase Postgres, optional |
| Map tiles | Mapbox |
| Route calculation | Mapbox Directions |

Do **not** write every GPS update into PostgreSQL.

Supabase documents Presence for slowly changing state such as online/offline information and recommends Broadcast for high-frequency messages. This matches the GPS use case.

---

# 4. Authentication Strategy

Use **Supabase Anonymous Sign-In** for the MVP.

The rider should not need to create an email/password account.

### Startup flow

```text
App loads
   ↓
Check Supabase session
   ↓
No session?
   ↓
signInAnonymously()
   ↓
Authenticated Supabase user exists
   ↓
Ask rider for display name
```

The anonymous Supabase user ID becomes the stable identifier for that browser session.

Store only non-sensitive local preferences such as:

- Display name
- Selected vehicle icon/type
- Last-used UI settings

Do not store precise location history in browser local storage.

---

# 5. Ride Session Model

The main multiplayer object is a **Ride Session**.

Example:

```text
Ride Name: Sunday Cebu Ride
Room Code: CEB824
Host: Juan
Status: waiting
Destination: Moalboal
```

A user joins using the room code.

### Room code requirements

- 6 uppercase alphanumeric characters
- Exclude visually confusing characters where practical
- Generated server-side using a database function or secure random generation strategy
- Unique among active rides

Example:

```text
CEB824
MOTO71
RIDE29
```

---

# 6. Database Schema

Use a minimal schema initially.

## `rides`

Suggested fields:

```text
id                  uuid primary key
room_code           text unique not null
name                text not null
host_user_id        uuid not null references auth.users(id)
status              text not null
vehicle_mode        text not null default 'driving'
destination_lat    double precision null
destination_lng    double precision null
destination_name   text null
route_version       integer not null default 0
created_at          timestamptz not null default now()
updated_at          timestamptz not null default now()
expires_at          timestamptz null
```

Suggested status values:

```text
waiting
active
ended
```

## `ride_participants`

```text
id                  uuid primary key
ride_id             uuid not null references rides(id) on delete cascade
user_id             uuid not null references auth.users(id) on delete cascade
display_name        text not null
vehicle_type        text null
joined_at           timestamptz not null default now()
last_seen_at        timestamptz null
is_host             boolean not null default false
```

Add a unique constraint on:

```text
(ride_id, user_id)
```

## Optional: `ride_events`

Only add this after the MVP is working.

```text
id                  uuid primary key
ride_id             uuid not null references rides(id) on delete cascade
user_id             uuid null references auth.users(id)
event_type          text not null
payload             jsonb null
created_at          timestamptz not null default now()
```

Use this for important low-frequency events such as:

- destination changed
- rider joined
- rider left
- host changed
- ride started
- ride ended

Do not use this table for every GPS packet.

---

# 7. Supabase Realtime Design

Use one Realtime channel per ride:

```text
ride:<ride-id>
```

Example:

```text
ride:6a1d5d5b-....
```

Use a **private** Realtime channel and authorize access using RLS/realtime authorization.

## Broadcast event types

Recommended events:

```text
location
ride-event
route-updated
ping
```

### `location` payload

Keep it small:

```json
{
  "userId": "uuid",
  "lat": 10.3157,
  "lng": 123.8854,
  "accuracy": 8.4,
  "heading": 92,
  "speed": 11.5,
  "timestamp": 1720000000000
}
```

Units:

- `lat`: degrees
- `lng`: degrees
- `accuracy`: meters
- `heading`: degrees from north
- `speed`: meters/second
- `timestamp`: Unix epoch milliseconds

### Do not send

Do not broadcast:

- Full database objects
- Large route GeoJSON on every location update
- User profile information
- Unnecessary UI state

---

# 8. GPS Update Strategy

Use:

```javascript
navigator.geolocation.watchPosition()
```

The browser geolocation API requires user permission and a secure context such as HTTPS.

### GPS throttling

Do not broadcast every raw callback immediately.

Implement a small client-side throttling layer.

Recommended initial strategy:

```text
Receive browser GPS update
        ↓
Validate coordinates
        ↓
Check accuracy
        ↓
Check minimum time since last broadcast
        ↓
Check minimum distance moved
        ↓
Broadcast if needed
```

Initial tuning target:

- Send at most roughly once every 1–2 seconds while moving
- Suppress duplicate/no-change updates
- Ignore obviously invalid coordinates
- Do not broadcast extremely inaccurate readings unless necessary for availability

The exact values should be configurable rather than hard-coded in many files.

### Location state model

Each rider location should have:

```text
fresh
stale
offline
```

For example:

```text
fresh   = recent update
stale   = no update for a configurable period
offline = user left channel / presence indicates disconnected
```

---

# 9. Rider Marker Behavior

Every participant gets a map marker.

### Own rider

Use a visually distinct marker.

### Other riders

Use a consistent rider marker with:

- avatar/initial
- display name
- optional heading rotation
- optional vehicle icon

### Marker movement

Do not teleport the marker between every GPS point.

Interpolate/smooth movement for a better visual experience.

Basic approach:

```text
previous GPS position
        ↓
new GPS position
        ↓
animate marker over short duration
```

If the new GPS fix is very far from the previous position, snap/teleport instead of interpolating.

---

# 10. Map Features

## MVP

The map must support:

- Map display
- Current user location
- Other riders
- Zoom controls
- Recenter-on-me
- Fit-to-group
- Destination marker
- Shared route line

## Later

- Heading-based navigation camera
- Traffic layer if provider/plan supports it
- Road labels
- Checkpoints
- Gas/rest stop markers
- Rider distance from host
- Group separation warnings

---

# 11. Routing Strategy

Use Mapbox Directions API.

For the MVP:

```text
Current user location → shared destination
```

The route displayed by the ride should be based on the **host/leader's current route origin** or a clearly defined group origin strategy.

Recommended MVP behavior:

- Host sets destination.
- Every rider receives the destination.
- Each rider may optionally calculate their own route from their current location to the shared destination.
- The UI identifies the destination as shared even if route geometry differs by rider.

### Important distinction

Do not pretend that one route geometry is equally correct for every rider.

A better product model is:

```text
Shared destination
        +
Optional common route
        +
Individual navigation from current position
```

For the first prototype, keep the route behavior simple.

---

# 12. Destination Workflow

Only the host should be allowed to change the shared destination in the MVP.

```text
Host taps Search
      ↓
Search destination
      ↓
Select place
      ↓
Save destination to ride
      ↓
Increment route_version
      ↓
Broadcast route-updated event
      ↓
Riders refresh route state
```

### Why `route_version`?

It allows clients to detect that the destination/route has changed without comparing large objects.

Example:

```text
route_version = 3
```

New destination:

```text
route_version = 4
```

---

# 13. Security Model

Security is especially important because this app shares live location.

## Database

Enable RLS on exposed application tables.

At minimum:

- User can read a ride if they are a participant.
- User can read participants of rides they belong to.
- User can insert their own participation record.
- Only the host can modify host-controlled ride settings.
- Users cannot modify another user's participant record.
- Users cannot update another user's identity.

## Realtime

Use private channels.

A rider should only be able to join:

```text
ride:<ride-id>
```

when they are an active participant of that ride.

Use Supabase Realtime authorization/RLS for Broadcast and Presence access.

## Client keys

The frontend may contain the Supabase publishable/anon client key and Mapbox public token as intended by the provider model.

Never put a secret/service-role key in the browser.

## Mapbox token protection

Restrict the Mapbox public token by allowed web origins where supported and configure usage limits.

---

# 14. Location Privacy Rules

The application should make the sharing state obvious.

Before starting GPS sharing, show a clear message such as:

```text
Your live location will be visible to riders in this ride session.
```

Provide:

- Start sharing
- Stop sharing

When location sharing is disabled, the user should stop broadcasting GPS.

Do not collect long-term location history by default.

For the MVP, keep live location ephemeral.

---

# 15. Application Pages

## `/`

Landing page.

Buttons:

```text
Create Ride
Join Ride
```

## `/create`

Fields:

```text
Ride name
Your display name
Vehicle type (optional)
```

Button:

```text
Create Ride
```

After creation:

```text
Ride code: CEB824
Share this code with riders.

[Enter Ride]
[Copy Code]
```

## `/join`

Fields:

```text
Ride code
Display name
```

Button:

```text
Join Ride
```

## `/ride/:rideId`

Main multiplayer map.

Desktop:

```text
┌────────────────────────────────────────────────────┐
│ Ride name        Code       Riders                 │
├────────────────────────────────────────────────────┤
│                                                    │
│                    MAP                             │
│                                                    │
│                         rider markers              │
│                                                    │
│                                                    │
├───────────────────────┬────────────────────────────┤
│ Rider list             │ Route / destination       │
│                        │                            │
│ Juan   ●               │ Destination               │
│ Mark   ●               │ 42 km                     │
│ Dave   ●               │ ETA 48 min                │
│                        │                            │
└────────────────────────┴────────────────────────────┘
```

Mobile:

- Full-screen map
- Floating recenter button
- Bottom sheet for riders/route details
- Host controls in a compact menu

---

# 16. State Management

Use clear separation between:

## Server/session state

Supabase-backed information:

```text
ride
participants
host
shared destination
ride status
```

## Realtime state

```text
connected riders
live locations
presence
```

## Local UI state

```text
map camera
selected rider
bottom sheet open/closed
settings
```

## Suggested stores

```text
useSessionStore
useRideStore
useRealtimeStore
useMapStore
```

Do not put the entire application state into a single giant Zustand store.

---

# 17. Suggested Project Structure

```text
src/
├── app/
│   ├── router.tsx
│   └── providers.tsx
│
├── components/
│   ├── ui/
│   ├── map/
│   │   ├── RideMap.tsx
│   │   ├── RiderMarker.tsx
│   │   ├── DestinationMarker.tsx
│   │   └── RouteLayer.tsx
│   ├── ride/
│   │   ├── RideHeader.tsx
│   │   ├── RiderList.tsx
│   │   ├── RideCode.tsx
│   │   └── HostControls.tsx
│   └── common/
│
├── features/
│   ├── auth/
│   │   ├── authService.ts
│   │   └── useAnonymousAuth.ts
│   ├── rides/
│   │   ├── rideService.ts
│   │   ├── rideRepository.ts
│   │   └── rideTypes.ts
│   ├── realtime/
│   │   ├── rideChannel.ts
│   │   ├── locationBroadcast.ts
│   │   ├── presence.ts
│   │   └── realtimeTypes.ts
│   ├── location/
│   │   ├── geolocation.ts
│   │   ├── locationFilter.ts
│   │   ├── locationThrottle.ts
│   │   └── locationTypes.ts
│   └── routing/
│       ├── mapboxDirections.ts
│       └── routeTypes.ts
│
├── hooks/
│   ├── useRide.ts
│   ├── useRideChannel.ts
│   ├── useCurrentLocation.ts
│   └── useRiderLocations.ts
│
├── lib/
│   ├── supabase.ts
│   ├── mapbox.ts
│   └── env.ts
│
├── stores/
│   ├── sessionStore.ts
│   ├── rideStore.ts
│   └── mapStore.ts
│
├── types/
│   └── database.ts
│
└── main.tsx
```

Keep provider-specific logic isolated so Supabase and Mapbox calls do not appear throughout presentation components.

---

# 18. Environment Variables

Example `.env.local`:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_MAPBOX_ACCESS_TOKEN=
```

Never commit `.env.local`.

Use `.env.example` with empty values.

Example:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_MAPBOX_ACCESS_TOKEN=
```

---

# 19. Supabase SQL/Migrations Strategy

Use SQL migrations rather than manually creating everything in the dashboard.

Suggested folders:

```text
supabase/
├── migrations/
│   ├── 001_create_rides.sql
│   ├── 002_create_participants.sql
│   ├── 003_create_rls_policies.sql
│   └── 004_realtime_authorization.sql
└── seed.sql
```

The exact SQL should be generated and tested against the real Supabase project rather than guessed by the agent.

The agent must not disable RLS simply to make development easier.

---

# 20. Realtime Lifecycle

When entering a ride:

```text
Load ride
   ↓
Verify participant access
   ↓
Create private channel
   ↓
Subscribe
   ↓
Join Presence
   ↓
Start listening for location broadcasts
   ↓
Start local GPS watcher after permission
```

When leaving:

```text
Stop GPS watcher
   ↓
Stop location broadcasts
   ↓
Untrack Presence
   ↓
Unsubscribe channel
   ↓
Navigate away
```

Handle cleanup in React effects so a route change cannot leave stale listeners running.

---

# 21. Connection Failure Handling

The app must handle:

- GPS permission denied
- GPS unavailable
- Browser offline
- Supabase channel disconnected
- Supabase subscription error
- Mapbox API failure
- Directions API failure
- Expired/invalid ride code
- Ride ended
- User removed from ride

### Realtime reconnection behavior

On reconnect:

1. Resubscribe to the ride channel.
2. Restore Presence.
3. Publish a fresh current location.
4. Refresh ride/participant state if necessary.

Do not create duplicate subscriptions during reconnect.

---

# 22. Stale Rider Handling

A rider may appear connected while their GPS is no longer updating.

Each client should maintain:

```text
lastLocationAt[userId]
```

UI example:

```text
Juan    Online
Mark    GPS updating
Dave    Location stale
Alex    Offline
```

Avoid displaying a rider as live forever.

---

# 23. Performance Rules

These rules are mandatory for the MVP:

1. Never poll Supabase every second for GPS.
2. Use Realtime Broadcast for live position delivery.
3. Use Presence for connection/online status, not GPS.
4. Throttle GPS broadcasts.
5. Keep GPS payloads tiny.
6. Avoid recalculating routes on every GPS update.
7. Recalculate route only when meaningful route inputs change.
8. Update map markers without rerendering the entire map component.
9. Do not recreate the Mapbox map object on normal React state changes.
10. Clean up every subscription, watcher, listener, and animation loop.

---

# 24. Free-Tier Cost Protection

The project is intended to remain usable within free service limits.

Implement these safeguards:

### GPS

Throttle updates.

### Routing

Do not call Directions API for every location update.

### Geocoding

Debounce search input, for example around 300–500 ms.

### Database

Do not store every GPS point.

### Realtime

Keep payloads minimal.

### Session expiry

Implement expiration for abandoned rides.

Suggested MVP policy:

```text
Ride not active for several hours/days
        ↓
Mark expired/endable
```

The exact retention period can be configured later.

### Development

Avoid repeatedly testing with dozens of browser tabs unless intentionally load-testing.

---

# 25. Feature Roadmap

## Phase 0 — Project bootstrap

Deliver:

- React + TypeScript + Vite
- Tailwind
- ESLint/Prettier
- Supabase client
- Mapbox client
- Environment handling
- Basic routing

Acceptance:

- App starts locally.
- TypeScript compiles.
- Map renders.
- Supabase client initializes.

---

## Phase 1 — Anonymous identity

Deliver:

- Anonymous Supabase sign-in
- Display name screen
- Session persistence

Acceptance:

- New browser can obtain an anonymous user.
- Refresh does not unnecessarily create another user.
- User ID is available to ride features.

---

## Phase 2 — Create and join ride

Deliver:

- Create ride
- Generate room code
- Join by room code
- Participant table
- Host flag

Acceptance:

- Browser A creates ride.
- Browser B joins using code.
- Both can see the participant list.

---

## Phase 3 — Realtime channel

Deliver:

- Private ride channel
- Presence
- Broadcast
- Reconnection
- Cleanup

Acceptance:

- Two browsers join the same ride.
- Presence correctly reports online riders.
- Disconnect/reconnect works.

---

## Phase 4 — Own GPS

Deliver:

- Location permission UI
- `watchPosition`
- Current location marker
- Accuracy indicator
- Start/stop sharing

Acceptance:

- User sees own position.
- Denied permission is handled gracefully.
- Stopping sharing stops updates.

---

## Phase 5 — Multiplayer GPS

Deliver:

- Location Broadcast
- Rider markers
- Marker interpolation
- Stale rider state

Acceptance:

With two or more real devices:

- Device A moves.
- Device B sees A move.
- Device B moves.
- Device A sees B move.
- The markers do not jump unnecessarily.

---

## Phase 6 — Destination and route

Deliver:

- Host destination selection
- Search/geocoding
- Directions API
- Route line
- Destination marker
- Route metadata

Acceptance:

- Host selects destination.
- All riders see the same destination.
- Route renders correctly.
- Changing destination updates the route.

---

## Phase 7 — Ride UI polish

Deliver:

- Mobile-first responsive UI
- Rider drawer/bottom sheet
- Recenter button
- Fit group button
- Ride code copy/share
- Connection status
- GPS status
- Host controls

Acceptance:

The application is usable from a phone browser while riding **without requiring the rider to continuously interact with the screen**.

---

## Phase 8 — Testing and hardening

Deliver:

- Unit tests
- Integration tests
- E2E tests
- RLS verification
- Realtime reconnect tests
- GPS failure tests
- Mobile browser testing

Acceptance:

No critical console errors and no obvious listener/subscription leaks.

---

# 26. MVP Non-Goals

Do **not** implement these during the initial build:

- Native Android/iOS apps
- Custom backend API
- Complex turn-by-turn voice navigation
- Full social network profiles
- Payments
- Long-term GPS history
- Advanced traffic prediction
- Automatic group leader election
- AI features
- Offline map downloads

They can be considered after the multiplayer GPS MVP works.

---

# 27. Important Product Decisions

## Who controls the destination?

MVP:

```text
Host only
```

## Who can see live locations?

```text
Only active members of the same ride session
```

## Do riders need an account?

```text
No email/password account.
Use anonymous Supabase authentication.
```

## Is location stored permanently?

```text
No, not by default.
```

## Is GPS written to PostgreSQL?

```text
No, not for every update.
```

## How are live positions distributed?

```text
Supabase Realtime Broadcast
```

## How is online state distributed?

```text
Supabase Realtime Presence
```

---

# 28. Testing Plan

## Unit tests

Test:

- Room code generation/validation
- Coordinate validation
- Distance calculation
- GPS throttling
- Stale-location calculation
- Route input validation

## Integration tests

Test:

- Create ride
- Join ride
- Participant permissions
- Host-only destination update
- RLS behavior

## E2E tests

Test at minimum:

```text
Create ride in Browser A
       ↓
Join ride in Browser B
       ↓
Verify both participants visible
       ↓
Enable simulated location
       ↓
Verify Broadcast path
       ↓
Change destination as host
       ↓
Verify destination update
```

## Real-device test

At least two physical phones should be tested because desktop browser GPS simulation does not reproduce all mobile GPS behavior.

---

# 29. Vibe Coding Agent Rules

These rules should be included in the coding agent's project instructions.

## General

- Work incrementally.
- Never rewrite large parts of the project unless necessary.
- Inspect existing code before changing it.
- Prefer small, testable modules.
- Keep provider-specific code behind services/adapters.
- Do not invent Supabase APIs; verify the installed SDK/API when needed.
- Do not invent database columns that do not exist.
- After changing schema, update generated database types if used.
- Run type checking after meaningful changes.
- Run tests after meaningful changes.
- Do not leave TODO placeholders for core MVP functionality.

## Security

- Never expose service-role/secret keys in frontend code.
- Never disable RLS as a shortcut.
- Never trust client-provided `userId` when server/database authorization can determine `auth.uid()`.
- Validate ride membership before allowing private-channel access.
- Keep live location limited to ride members.

## Realtime

- One channel per ride.
- Exactly one active subscription per ride page.
- Clean up on unmount/navigation.
- Use Broadcast for GPS.
- Use Presence for connection state.
- Throttle GPS transmissions.
- Do not persist every GPS point.

## Mapbox

- Reuse one Mapbox map instance per page.
- Prefer GeoJSON sources/layers for groups/routes where practical.
- Do not recreate the full map whenever rider state changes.
- Avoid unnecessary Directions API requests.

## UX

- Mobile first.
- Show location permission state clearly.
- Make connection status visible.
- Make "sharing my location" state visible.
- Avoid large forms on the ride map.
- Handle loading, empty, stale, offline, and error states.

---

# 30. Agent Execution Order

The coding agent should execute the project in this exact order.

```text
1. Inspect repository
2. Bootstrap React + TypeScript + Vite
3. Configure Tailwind/ESLint/Prettier
4. Add Supabase client
5. Add Mapbox client
6. Implement anonymous auth
7. Implement database migrations
8. Implement RLS policies
9. Implement create ride
10. Implement join ride
11. Implement participant list
12. Implement private Realtime channel
13. Implement Presence
14. Implement GPS watcher
15. Implement GPS throttling/filter
16. Implement location Broadcast
17. Implement rider markers
18. Implement stale/offline states
19. Implement destination selection
20. Implement Directions API
21. Implement route layer
22. Implement mobile UI
23. Add error/reconnect handling
24. Add tests
25. Perform security review
26. Perform real-device testing
27. Prepare frontend deployment
```

Do not jump directly to advanced navigation features before the realtime multiplayer foundation works.

---

# 31. Suggested Agent Milestones

Each milestone should leave the app in a runnable state.

### Milestone A

```text
Map loads + anonymous user exists
```

### Milestone B

```text
Create and join ride works
```

### Milestone C

```text
Two browsers can join the same private realtime channel
```

### Milestone D

```text
Two physical devices can see each other's GPS
```

### Milestone E

```text
Host can set destination and everyone sees it
```

### Milestone F

```text
Shared route is visible
```

### Milestone G

```text
Mobile UI is polished and stable
```

---

# 32. Definition of Done for MVP

The MVP is complete when all of the following are true:

- [ ] User can open the app without creating an account.
- [ ] Anonymous Supabase authentication succeeds.
- [ ] User can create a ride.
- [ ] Ride receives a shareable room code.
- [ ] Another user can join using the code.
- [ ] Participants are visible.
- [ ] Users are authorized only for their ride.
- [ ] Realtime private channel works.
- [ ] Presence shows online riders.
- [ ] GPS permission is handled correctly.
- [ ] Rider can start/stop location sharing.
- [ ] Own location appears on the map.
- [ ] Other riders' live locations appear.
- [ ] GPS messages are throttled.
- [ ] Stale/offline riders are indicated.
- [ ] Host can set a destination.
- [ ] Destination is synchronized.
- [ ] Route displays correctly.
- [ ] Changing destination updates the route.
- [ ] Refreshing a page does not create duplicate subscriptions.
- [ ] Leaving a ride cleans up realtime/GPS resources.
- [ ] RLS prevents unauthorized ride access.
- [ ] No secret keys are present in frontend code.
- [ ] App works on mobile HTTPS.
- [ ] App has no critical runtime errors.

---

# 33. Possible Future Features

After the MVP is stable:

## Group navigation

```text
Leader
  ↓
Shared route
  ↓
All riders
```

## Group separation alerts

```text
Mark is 800 m behind the group
```

## Checkpoints

```text
Start
 ↓
Checkpoint 1
 ↓
Gas Station
 ↓
Rest Stop
 ↓
Destination
```

## Ride chat

Use another Realtime Broadcast event or a lightweight persisted messages table.

## Ride history

Persist summarized or sampled location history rather than every GPS point.

## Emergency/incident reporting

Add a low-frequency event system for reporting problems or requesting assistance.

## Native PWA behavior

Turn the web app into an installable Progressive Web App after the browser MVP is stable.

---

# 34. Reference Architecture Summary

```text
Frontend
────────
React
TypeScript
Vite
Tailwind
Zustand

Map
───
Mapbox GL JS
Mapbox Directions
Mapbox Search/Geocoding

Backend-as-a-Service
────────────────────
Supabase Auth
Supabase PostgreSQL
Supabase Realtime Broadcast
Supabase Realtime Presence
Supabase RLS

Browser capabilities
────────────────────
Geolocation API
HTTPS

Hosting
───────
Static/frontend hosting only
No custom server
```

This architecture intentionally keeps the application simple enough for vibe coding while still giving it a real multiplayer foundation.

---

# 35. Official Documentation to Verify During Implementation

The coding agent should consult the current official documentation instead of relying on remembered APIs, especially for SDK versions and provider limits.

- Supabase Realtime: Broadcast and Presence
- Supabase Realtime Authorization
- Supabase Anonymous Sign-Ins
- Supabase Row Level Security
- Supabase JavaScript client
- Mapbox GL JS
- Mapbox Directions API
- Browser Geolocation API

Reference links:

- Supabase Realtime: https://supabase.com/docs/guides/realtime
- Supabase Broadcast: https://supabase.com/docs/guides/realtime/broadcast
- Supabase Presence: https://supabase.com/docs/guides/realtime/presence
- Supabase Realtime Authorization: https://supabase.com/docs/guides/realtime/authorization
- Supabase Anonymous Sign-Ins: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Mapbox GL JS: https://docs.mapbox.com/mapbox-gl-js/
- Mapbox Directions API: https://docs.mapbox.com/api/navigation/directions/
- Browser Geolocation: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition

---

# 36. Final Recommendation

Use **React + TypeScript + Vite + Tailwind + Supabase + Mapbox**.

Do not build a custom backend.

The most important technical decision is:

```text
Supabase Database
    → durable ride/session data

Supabase Presence
    → who is online

Supabase Broadcast
    → live GPS + low-frequency realtime events

Mapbox
    → map + route

Browser Geolocation
    → current device position
```

Build the multiplayer GPS layer before adding advanced navigation. Once two physical phones can reliably join the same ride and see each other's moving positions, the project has its core technical foundation.

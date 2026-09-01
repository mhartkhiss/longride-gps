-- Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to generate 6-character room codes (excluding ambiguous chars: 0, O, 1, I, L)
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS text AS $$
DECLARE
  chars text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Table: rides
CREATE TABLE IF NOT EXISTS public.rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text UNIQUE NOT NULL,
  name text NOT NULL,
  host_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'ended')),
  vehicle_mode text NOT NULL DEFAULT 'driving' CHECK (vehicle_mode IN ('driving', 'cycling', 'walking')),
  destination_lat double precision NULL,
  destination_lng double precision NULL,
  destination_name text NULL,
  route_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL DEFAULT (now() + interval '24 hours')
);

-- Table: ride_participants
CREATE TABLE IF NOT EXISTS public.ride_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  vehicle_type text NULL DEFAULT 'motorcycle',
  is_host boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_ride_user UNIQUE (ride_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rides_room_code ON public.rides (room_code);
CREATE INDEX IF NOT EXISTS idx_ride_participants_ride_id ON public.ride_participants (ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_participants_user_id ON public.ride_participants (user_id);

ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view ride by room code or membership" ON public.rides;
CREATE POLICY "Anyone can view ride by room code or membership"
ON public.rides FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Authenticated users can create rides" ON public.rides;
CREATE POLICY "Authenticated users can create rides"
ON public.rides FOR INSERT
TO authenticated, anon
WITH CHECK (auth.uid() = host_user_id);

DROP POLICY IF EXISTS "Host can update their ride" ON public.rides;
CREATE POLICY "Host can update their ride"
ON public.rides FOR UPDATE
TO authenticated, anon
USING (auth.uid() = host_user_id)
WITH CHECK (auth.uid() = host_user_id);

DROP POLICY IF EXISTS "Host can delete their ride" ON public.rides;
CREATE POLICY "Host can delete their ride"
ON public.rides FOR DELETE
TO authenticated, anon
USING (auth.uid() = host_user_id);

DROP POLICY IF EXISTS "Participants can view members of their rides" ON public.ride_participants;
CREATE POLICY "Participants can view members of their rides"
ON public.ride_participants FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Users can insert their own participant record" ON public.ride_participants;
CREATE POLICY "Users can insert their own participant record"
ON public.ride_participants FOR INSERT
TO authenticated, anon
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own participant record" ON public.ride_participants;
CREATE POLICY "Users can update their own participant record"
ON public.ride_participants FOR UPDATE
TO authenticated, anon
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users or host can remove participant" ON public.ride_participants;
CREATE POLICY "Users or host can remove participant"
ON public.ride_participants FOR DELETE
TO authenticated, anon
USING (
  auth.uid() = user_id 
  OR EXISTS (
    SELECT 1 FROM public.rides WHERE rides.id = ride_participants.ride_id AND rides.host_user_id = auth.uid()
  )
);

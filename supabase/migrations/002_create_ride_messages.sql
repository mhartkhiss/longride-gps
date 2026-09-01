-- Table: ride_messages
CREATE TABLE IF NOT EXISTS public.ride_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  text text NOT NULL,
  is_quick_alert boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ride_messages_ride_id_created_at ON public.ride_messages (ride_id, created_at ASC);

ALTER TABLE public.ride_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view messages of their rides" ON public.ride_messages;
CREATE POLICY "Participants can view messages of their rides"
ON public.ride_messages FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Users can insert messages to their rides" ON public.ride_messages;
CREATE POLICY "Users can insert messages to their rides"
ON public.ride_messages FOR INSERT
TO authenticated, anon
WITH CHECK (auth.uid() = user_id);

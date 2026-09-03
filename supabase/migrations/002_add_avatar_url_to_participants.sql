-- Migration: Add avatar_url to ride_participants table
ALTER TABLE public.ride_participants 
ADD COLUMN IF NOT EXISTS avatar_url text NULL;

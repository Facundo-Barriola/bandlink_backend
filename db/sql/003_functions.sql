CREATE OR REPLACE FUNCTION auth.fn_list_roles(p_user_id uuid)
 RETURNS TABLE(role text, created_at timestamp with time zone)
 LANGUAGE sql
AS $function$
  SELECT ur.role, ur.created_at
  FROM auth.user_roles ur
  WHERE ur.user_id = p_user_id
  ORDER BY ur.created_at ASC;
$function$



CREATE OR REPLACE FUNCTION auth.fn_list_user_sessions(p_user_id uuid, p_only_active boolean DEFAULT true)
 RETURNS TABLE(session_id uuid, user_agent text, ip inet, expires_at timestamp with time zone, created_at timestamp with time zone, revoked_at timestamp with time zone)
 LANGUAGE sql
AS $function$
  SELECT s.session_id, s.user_agent, s.ip, s.expires_at, s.created_at, s.revoked_at
  FROM auth.sessions s
  WHERE s.user_id = p_user_id
    AND (
      NOT p_only_active
      OR (s.revoked_at IS NULL AND s.expires_at > now())
    )
  ORDER BY s.created_at DESC;
$function$



CREATE OR REPLACE FUNCTION bookings.fn_booking_conflicts(p_room_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_exclude_booking_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF p_room_id IS NULL OR p_starts_at IS NULL OR p_ends_at IS NULL THEN
        RAISE EXCEPTION 'room_id, starts_at y ends_at son requeridos';
    END IF;

    IF p_starts_at >= p_ends_at THEN
        RAISE EXCEPTION 'starts_at debe ser menor a ends_at';
    END IF;

    -- Bloqueos (studios.room_blocks)
    IF EXISTS (
        SELECT 1
        FROM studios.room_blocks rb
        WHERE rb.room_id = p_room_id
          AND rb.starts_at IS NOT NULL AND rb.ends_at IS NOT NULL
          AND tstzrange(rb.starts_at, rb.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
    ) THEN
        RETURN true;
    END IF;

    -- Reservas existentes (excluye canceladas/deleted)
    IF EXISTS (
        SELECT 1
        FROM bookings.bookings b
        WHERE b.room_id = p_room_id
          AND b.starts_at IS NOT NULL AND b.ends_at IS NOT NULL
          AND (p_exclude_booking_id IS NULL OR b.booking_id <> p_exclude_booking_id)
          AND COALESCE(b.status, '') NOT IN ('cancelled', 'canceled', 'deleted')
          AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$function$



CREATE OR REPLACE FUNCTION bookings.fn_get_room_availability(p_room_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_slot_minutes integer DEFAULT 30)
 RETURNS TABLE(slot_start timestamp with time zone, slot_end timestamp with time zone, available boolean)
 LANGUAGE sql
AS $function$
    SELECT
        s AS slot_start,
        s + make_interval(mins => p_slot_minutes) AS slot_end,
        NOT (
            -- bloqueos
            EXISTS (
                SELECT 1
                FROM studios.room_blocks rb
                WHERE rb.room_id = p_room_id
                  AND tstzrange(rb.starts_at, rb.ends_at, '[)') &&
                      tstzrange(s, s + make_interval(mins => p_slot_minutes), '[)')
            )
            OR
            -- reservas activas
            EXISTS (
                SELECT 1
                FROM bookings.bookings b
                WHERE b.room_id = p_room_id
                  AND COALESCE(b.status,'') NOT IN ('cancelled','canceled','deleted')
                  AND tstzrange(b.starts_at, b.ends_at, '[)') &&
                      tstzrange(s, s + make_interval(mins => p_slot_minutes), '[)')
            )
        ) AS available
    FROM generate_series(
        p_from,
        p_to - make_interval(mins => p_slot_minutes),
        make_interval(mins => p_slot_minutes)
    ) AS s
$function$



CREATE OR REPLACE FUNCTION geo.fn_places_nearby(p_lat double precision, p_lng double precision, p_radius_meters double precision DEFAULT 2000)
 RETURNS TABLE(place_id uuid, name text, distance_m double precision)
 LANGUAGE sql
AS $function$
    SELECT
        p.place_id,
        p.name,
        ST_Distance(
            p.geom::geography,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        ) AS distance_m
    FROM geo.places p
    WHERE p.geom IS NOT NULL
      AND ST_DWithin(
          p.geom::geography,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_meters
      )
    ORDER BY distance_m ASC
$function$



CREATE OR REPLACE FUNCTION music.fn_get_genre_by_id(p_genre_id uuid)
 RETURNS TABLE(genre_id uuid, name text, normalized_name text, source text, external_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
AS $function$
  SELECT g.genre_id, g.name, g.normalized_name, g.source, g.external_id, g.created_at
  FROM music.genres g
  WHERE g.genre_id = p_genre_id
$function$



CREATE OR REPLACE FUNCTION music.fn_get_instrument_by_id(p_instrument_id uuid)
 RETURNS TABLE(instrument_id uuid, name text, normalized_name text, category text, source text, external_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
AS $function$
  SELECT i.instrument_id, i.name, i.normalized_name, i.category, i.source, i.external_id, i.created_at
  FROM music.instrument i
  WHERE i.instrument_id = p_instrument_id
$function$



CREATE OR REPLACE FUNCTION music.fn_get_musician_full_profile(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
AS $function$
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(mp) FROM (
      SELECT username, display_name, bio, years_experience, skill_summary
      FROM music.musician_profile m
	  INNER JOIN auth.users u
	  ON u.user_id = m.user_id
      WHERE u.user_id = p_user_id
    ) mp),
    'genres', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'genre_id', g.genre_id,
        'name', g.name,
        'source', g.source
      ) ORDER BY g.name)
      FROM music.musician_genre mg
      JOIN music.genres g ON g.genre_id = mg.genre_id
      WHERE mg.user_id = p_user_id
    ), '[]'::jsonb),
    'instruments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'instrument_id', i.instrument_id,
        'name', i.name,
        'category', i.category,
        'level', mi.level,
        'is_primary', mi.is_primary
      ) ORDER BY mi.is_primary DESC, i.category NULLS LAST, i.name)
      FROM music.musician_instrument mi
      JOIN music.instrument i ON i.instrument_id = mi.instrument_id
      WHERE mi.user_id = p_user_id
    ), '[]'::jsonb)
  )
$function$



CREATE OR REPLACE FUNCTION music.fn_list_genres(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(genre_id uuid, name text, source text, external_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
AS $function$
  SELECT g.genre_id, g.name, g.source, g.external_id, g.created_at
  FROM music.genres g
  WHERE p_search IS NULL
     OR g.name ILIKE ('%' || p_search || '%')
     OR g.normalized_name ILIKE ('%' || music.fn_normalize_name(p_search) || '%')
  ORDER BY g.name ASC
  LIMIT GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0)
$function$



CREATE OR REPLACE FUNCTION music.fn_list_instruments(p_search text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(instrument_id uuid, name text, category text, source text, external_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
AS $function$
  SELECT i.instrument_id, i.name, i.category, i.source, i.external_id, i.created_at
  FROM music.instrument i
  WHERE (p_category IS NULL OR i.category = p_category)
    AND (
      p_search IS NULL
      OR i.name ILIKE ('%' || p_search || '%')
      OR i.normalized_name ILIKE ('%' || music.fn_normalize_name(p_search) || '%')
    )
  ORDER BY i.category NULLS LAST, i.name ASC
  LIMIT GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0)
$function$



CREATE OR REPLACE FUNCTION music.fn_list_musician_genres(p_user_id uuid)
 RETURNS TABLE(genre_id uuid, name text, source text, external_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
AS $function$
  SELECT g.genre_id, g.name, g.source, g.external_id, mg.created_at
  FROM music.musician_genre mg
  JOIN music.genres g ON g.genre_id = mg.genre_id
  WHERE mg.user_id = p_user_id
  ORDER BY g.name ASC
$function$



CREATE OR REPLACE FUNCTION music.fn_list_musician_instruments(p_user_id uuid)
 RETURNS TABLE(instrument_id uuid, name text, category text, level text, is_primary boolean, created_at timestamp with time zone)
 LANGUAGE sql
AS $function$
  SELECT i.instrument_id, i.name, i.category, mi.level, mi.is_primary, mi.created_at
  FROM music.musician_instrument mi
  JOIN music.instrument i ON i.instrument_id = mi.instrument_id
  WHERE mi.user_id = p_user_id
  ORDER BY mi.is_primary DESC, i.category NULLS LAST, i.name ASC
$function$



CREATE OR REPLACE FUNCTION music.fn_normalize_name(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT NULLIF(
    lower(trim(regexp_replace(COALESCE(p_name,''), '\s+', ' ', 'g'))),
    ''
  )
$function$



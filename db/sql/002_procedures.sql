CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS plpgsql;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS bands;
CREATE SCHEMA IF NOT EXISTS bookings;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS geo;
CREATE SCHEMA IF NOT EXISTS media;
CREATE SCHEMA IF NOT EXISTS music;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS reviews;
CREATE SCHEMA IF NOT EXISTS social; 
CREATE SCHEMA IF NOT EXISTS studios;

CREATE OR REPLACE PROCEDURE auth.sp_change_password(IN p_user_id uuid, IN p_old_password_hash text, IN p_new_password_hash text, IN p_revoke_sessions boolean DEFAULT true)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_db_hash text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  IF p_old_password_hash IS NULL OR length(trim(p_old_password_hash)) < 20 THEN
    RAISE EXCEPTION 'old password_hash inválido';
  END IF;

  IF p_new_password_hash IS NULL OR length(trim(p_new_password_hash)) < 20 THEN
    RAISE EXCEPTION 'new password_hash inválido';
  END IF;

  SELECT u.password_hash INTO v_db_hash
  FROM auth.users u
  WHERE u.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario inexistente';
  END IF;

  IF v_db_hash IS DISTINCT FROM trim(p_old_password_hash) THEN
    RAISE EXCEPTION 'Password actual inválida';
  END IF;

  UPDATE auth.users
     SET password_hash = trim(p_new_password_hash),
         updated_at = now()
   WHERE user_id = p_user_id;

  IF p_revoke_sessions THEN
    UPDATE auth.sessions
       SET revoked_at = now()
     WHERE user_id = p_user_id
       AND revoked_at IS NULL
       AND expires_at > now();
  END IF;
END;
$procedure$;


CREATE OR REPLACE PROCEDURE auth.sp_cleanup_expired_sessions(OUT o_deleted_count integer, IN p_user_id uuid DEFAULT NULL::uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  DELETE FROM auth.sessions s
   WHERE (p_user_id IS NULL OR s.user_id = p_user_id)
     AND s.expires_at <= now();

  GET DIAGNOSTICS o_deleted_count = ROW_COUNT;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_consume_email_verification_token(OUT o_user_id uuid, IN p_token_hash text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 20 THEN
    RAISE EXCEPTION 'token_hash inválido';
  END IF;

  SELECT t.user_id
    INTO v_user_id
  FROM auth.email_verification_tokens t
  WHERE t.token_hash = trim(p_token_hash)
    AND t.consumed_at IS NULL
    AND t.expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token inválido o expirado';
  END IF;

  UPDATE auth.email_verification_tokens
     SET consumed_at = now()
   WHERE token_hash = trim(p_token_hash)
     AND consumed_at IS NULL;

  UPDATE auth.users
     SET email_verified = true,
         updated_at = now()
   WHERE user_id = v_user_id;

  o_user_id := v_user_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_consume_password_reset_token(OUT o_user_id uuid, IN p_token_hash text, IN p_new_password_hash text, IN p_revoke_sessions boolean DEFAULT true)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 20 THEN
    RAISE EXCEPTION 'token_hash inválido';
  END IF;

  IF p_new_password_hash IS NULL OR length(trim(p_new_password_hash)) < 20 THEN
    RAISE EXCEPTION 'new password_hash inválido';
  END IF;

  SELECT t.user_id
    INTO v_user_id
  FROM auth.password_reset_tokens t
  WHERE t.token_hash = trim(p_token_hash)
    AND t.consumed_at IS NULL
    AND t.expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token inválido o expirado';
  END IF;

  UPDATE auth.password_reset_tokens
     SET consumed_at = now()
   WHERE token_hash = trim(p_token_hash)
     AND consumed_at IS NULL;

  UPDATE auth.users
     SET password_hash = trim(p_new_password_hash),
         updated_at = now()
   WHERE user_id = v_user_id;

  IF p_revoke_sessions THEN
    UPDATE auth.sessions
       SET revoked_at = now()
     WHERE user_id = v_user_id
       AND revoked_at IS NULL
       AND expires_at > now();
  END IF;

  o_user_id := v_user_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_create_email_verification_token(OUT o_token_id uuid, IN p_user_id uuid, IN p_token_hash text, IN p_expires_at timestamp with time zone, IN p_user_agent text DEFAULT NULL::text, IN p_ip inet DEFAULT NULL::inet, IN p_revoke_others boolean DEFAULT true)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_constraint text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 20 THEN
    RAISE EXCEPTION 'token_hash inválido';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at debe ser futura';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.user_id = p_user_id AND u.is_active = true) THEN
    RAISE EXCEPTION 'Usuario inexistente o inactivo';
  END IF;

  IF p_revoke_others THEN
    UPDATE auth.email_verification_tokens
       SET consumed_at = now()
     WHERE user_id = p_user_id
       AND consumed_at IS NULL
       AND expires_at > now();
  END IF;

  INSERT INTO auth.email_verification_tokens(user_id, token_hash, expires_at, user_agent, ip)
  VALUES (p_user_id, trim(p_token_hash), p_expires_at, p_user_agent, p_ip)
  RETURNING token_id INTO o_token_id;

EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'uq_email_verification_token_hash' THEN
      RAISE EXCEPTION 'Token ya existe';
    END IF;
    RAISE;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_create_password_reset_token(OUT o_token_id uuid, IN p_user_id uuid, IN p_token_hash text, IN p_expires_at timestamp with time zone, IN p_user_agent text DEFAULT NULL::text, IN p_ip inet DEFAULT NULL::inet, IN p_revoke_others boolean DEFAULT true)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_constraint text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 20 THEN
    RAISE EXCEPTION 'token_hash inválido';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at debe ser futura';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.user_id = p_user_id AND u.is_active = true) THEN
    RAISE EXCEPTION 'Usuario inexistente o inactivo';
  END IF;

  IF p_revoke_others THEN
    UPDATE auth.password_reset_tokens
       SET consumed_at = now()
     WHERE user_id = p_user_id
       AND consumed_at IS NULL
       AND expires_at > now();
  END IF;

  INSERT INTO auth.password_reset_tokens(user_id, token_hash, expires_at, user_agent, ip)
  VALUES (p_user_id, trim(p_token_hash), p_expires_at, p_user_agent, p_ip)
  RETURNING token_id INTO o_token_id;

EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'uq_password_reset_token_hash' THEN
      RAISE EXCEPTION 'Token ya existe';
    END IF;
    RAISE;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_create_session(OUT o_session_id uuid, IN p_user_id uuid, IN p_refresh_token_hash text, IN p_expires_at timestamp with time zone, IN p_user_agent text DEFAULT NULL::text, IN p_ip inet DEFAULT NULL::inet, IN p_revoke_others boolean DEFAULT false, IN p_max_active_sessions integer DEFAULT 5)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_constraint text;
BEGIN
  -- Validaciones
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  IF p_refresh_token_hash IS NULL OR length(trim(p_refresh_token_hash)) < 20 THEN
    RAISE EXCEPTION 'refresh_token_hash inválido';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at debe ser futura';
  END IF;

  -- Validar usuario existente y activo
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.user_id = p_user_id
      AND u.is_active = true
  ) THEN
    RAISE EXCEPTION 'Usuario inexistente o inactivo';
  END IF;

  
  DELETE FROM auth.sessions s
   WHERE s.user_id = p_user_id
     AND s.expires_at <= now();

 
  IF p_revoke_others THEN
    UPDATE auth.sessions s
       SET revoked_at = now()
     WHERE s.user_id = p_user_id
       AND s.revoked_at IS NULL
       AND s.expires_at > now();
  END IF;


  IF p_max_active_sessions IS NOT NULL AND p_max_active_sessions > 0 THEN
    UPDATE auth.sessions s
       SET revoked_at = now()
     WHERE s.session_id IN (
       SELECT s2.session_id
       FROM auth.sessions s2
       WHERE s2.user_id = p_user_id
         AND s2.revoked_at IS NULL
         AND s2.expires_at > now()
       ORDER BY s2.created_at ASC
       OFFSET GREATEST(p_max_active_sessions - 1, 0)  
     );
  END IF;

  -- Insert
  INSERT INTO auth.sessions (
    user_id, refresh_token_hash, user_agent, ip, expires_at, created_at, revoked_at
  )
  VALUES (
    p_user_id, trim(p_refresh_token_hash), p_user_agent, p_ip, p_expires_at, now(), NULL
  )
  RETURNING session_id INTO o_session_id;

EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

    CASE v_constraint
      WHEN 'uq_sessions_refresh_token_hash' THEN
        RAISE EXCEPTION 'Refresh token ya existe';
      ELSE
        RAISE;
    END CASE;

  WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

    CASE v_constraint
      WHEN 'fk_sessions_user_id' THEN
        RAISE EXCEPTION 'Usuario inexistente para la sesión';
      ELSE
        RAISE;
    END CASE;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_create_user(OUT o_user_id uuid, IN p_email text, IN p_username text, IN p_password_hash text, IN p_display_name text, IN p_birthdate date, IN p_bio text DEFAULT NULL::text, IN p_phone text DEFAULT NULL::text, IN p_place_id uuid DEFAULT NULL::uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_email        text;
  v_username     text;
  v_display_name text;
  v_bio          text;
  v_phone        text;
  v_constraint   text;
BEGIN

  v_email        := lower(trim(p_email));
  v_username     := trim(p_username);
  v_display_name := trim(p_display_name);
  v_bio          := nullif(trim(p_bio), '');
  v_phone        := nullif(trim(p_phone), '');

    IF v_email = '' OR v_email IS NULL THEN
    RAISE EXCEPTION 'Email requerido';
  END IF;

  IF v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;

  IF v_username IS NULL OR v_username = '' THEN
    RAISE EXCEPTION 'Username requerido';
  END IF;

  IF v_username !~ '^[a-zA-Z0-9._]{3,30}$' THEN
    RAISE EXCEPTION 'Username inválido (3-30, letras/números/./_)';
  END IF;

  IF v_display_name IS NULL OR v_display_name = '' THEN
    RAISE EXCEPTION 'Display name requerido';
  END IF;

  IF length(v_display_name) > 60 THEN
    RAISE EXCEPTION 'Display name demasiado largo';
  END IF;
  
  IF v_bio IS NOT NULL AND length(v_bio) > 500 THEN
    RAISE EXCEPTION 'Bio demasiado larga';
  END IF;

  IF p_birthdate > current_date THEN
    RAISE EXCEPTION 'Birthdate no puede ser futura';
  END IF;

  IF p_place_id is not null and not exists (SELECT 1 FROM geo.places p where p.place_id = p_place_id) THEN
  	RAISE EXCEPTION 'No existe ubicación';
  END IF;
  

  INSERT INTO auth.users (email, username, password_hash, display_name, bio, phone, birthdate, place_id, profile_visibility,
  is_active, email_verified)
  VALUES (v_email, v_username, p_password_hash, v_display_name, v_bio, v_phone, p_birthdate, p_place_id, 'public', true, false)
  RETURNING user_id INTO o_user_id;

  INSERT INTO auth.user_roles (user_id, role)
  VALUES (o_user_id, 'estandar');

EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

    CASE v_constraint
      WHEN 'uq_users_email' THEN
        RAISE EXCEPTION 'Email ya registrado';
      WHEN 'uq_users_username' THEN
        RAISE EXCEPTION 'Username ya registrado';
      ELSE
        RAISE; 
    END CASE;

  WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

    IF v_constraint = 'fk_users_place_id' THEN
      RAISE EXCEPTION 'No existe ubicación';
    ELSE
      RAISE;
    END IF;

END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_get_session(OUT o_session_id uuid, OUT o_user_id uuid, OUT o_user_agent text, OUT o_ip inet, OUT o_expires_at timestamp with time zone, OUT o_created_at timestamp with time zone, OUT o_revoked_at timestamp with time zone, IN p_session_id uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_id requerido';
  END IF;

  SELECT s.session_id, s.user_id, s.user_agent, s.ip, s.expires_at, s.created_at, s.revoked_at
    INTO o_session_id, o_user_id, o_user_agent, o_ip, o_expires_at, o_created_at, o_revoked_at
  FROM auth.sessions s
  WHERE s.session_id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión inexistente';
  END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_get_user_by_oauth(OUT o_user_id uuid, OUT o_oauth_account_id uuid, IN p_provider text, IN p_provider_user_id uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_provider text;
BEGIN
  v_provider := lower(trim(p_provider));

  IF v_provider IS NULL OR v_provider = '' THEN
    RAISE EXCEPTION 'provider requerido';
  END IF;

  IF p_provider_user_id IS NULL THEN
    RAISE EXCEPTION 'provider_user_id requerido';
  END IF;

  SELECT oa.user_id, oa.oauth_account_id
    INTO o_user_id, o_oauth_account_id
  FROM auth.oauth_accounts oa
  WHERE oa.provider = v_provider
    AND oa.provider_user_id = p_provider_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe vínculo OAuth';
  END IF;

  -- opcional: validar usuario activo
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.user_id = o_user_id AND u.is_active = true) THEN
    RAISE EXCEPTION 'Usuario inexistente o inactivo';
  END IF;
END;
$procedure$;


CREATE OR REPLACE PROCEDURE auth.sp_get_user_for_login(OUT o_user_id uuid, OUT o_password_hash text, OUT o_is_active boolean, OUT o_email_verified boolean, OUT o_email text, OUT o_username text, OUT o_display_name text, IN p_identifier text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_ident text;
BEGIN
  v_ident := lower(trim(p_identifier));

  IF v_ident IS NULL OR v_ident = '' THEN
    RAISE EXCEPTION 'identifier requerido';
  END IF;

  SELECT u.user_id, u.password_hash, u.is_active, u.email_verified,
         u.email::text, u.username::text, u.display_name
    INTO o_user_id, o_password_hash, o_is_active, o_email_verified,
         o_email, o_username, o_display_name
  FROM auth.users u
  WHERE u.email = v_ident::citext
     OR u.username = v_ident::citext;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credenciales inválidas';
  END IF;

  IF o_is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Usuario inactivo';
  END IF;
END;
$procedure$;


CREATE OR REPLACE PROCEDURE auth.sp_grant_role(IN p_user_id uuid, IN p_role text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_role text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  v_role := lower(trim(p_role));
  IF v_role IS NULL OR v_role = '' THEN
    RAISE EXCEPTION 'role requerido';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.user_id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario inexistente';
  END IF;

  INSERT INTO auth.user_roles(user_id, role)
  VALUES (p_user_id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$procedure$;


CREATE OR REPLACE PROCEDURE auth.sp_link_oauth_account(OUT o_oauth_account_id uuid, IN p_user_id uuid, IN p_provider text, IN p_provider_user_id uuid, IN p_access_token text DEFAULT NULL::text, IN p_refresh_token text DEFAULT NULL::text, IN p_token_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, IN p_scopes text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_existing_user_id uuid;
  v_constraint text;
BEGIN
  -- Validaciones mínimas
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  IF p_provider IS NULL OR trim(p_provider) = '' THEN
    RAISE EXCEPTION 'provider requerido';
  END IF;

  IF p_provider_user_id IS NULL THEN
    RAISE EXCEPTION 'provider_user_id requerido';
  END IF;

  -- Validar usuario existente (y si querés, activo)
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.user_id = p_user_id
      AND u.is_active = true
  ) THEN
    RAISE EXCEPTION 'Usuario inexistente o inactivo';
  END IF;

  -- Intento insert directo
  BEGIN
    INSERT INTO auth.oauth_accounts (
      user_id, provider, provider_user_id,
      access_token, refresh_token, token_expires_at, scopes,
      created_at, updated_at
    )
    VALUES (
      p_user_id, trim(p_provider), p_provider_user_id,
      p_access_token, p_refresh_token, p_token_expires_at, p_scopes,
      now(), now()
    )
    RETURNING oauth_account_id INTO o_oauth_account_id;

    RETURN;
  EXCEPTION
    WHEN unique_violation THEN
      -- ya existe provider+provider_user_id
      NULL;
  END;

  -- Si existe, chequeo de ownership
  SELECT oa.user_id, oa.oauth_account_id
    INTO v_existing_user_id, o_oauth_account_id
  FROM auth.oauth_accounts oa
  WHERE oa.provider = trim(p_provider)
    AND oa.provider_user_id = p_provider_user_id;

  IF v_existing_user_id IS NULL THEN
    -- raro, pero por las dudas
    RAISE EXCEPTION 'No se pudo vincular la cuenta OAuth';
  END IF;

  IF v_existing_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Esta cuenta OAuth ya está vinculada a otro usuario';
  END IF;

  -- Update tokens / scopes
  UPDATE auth.oauth_accounts
     SET access_token      = COALESCE(p_access_token, access_token),
         refresh_token     = COALESCE(p_refresh_token, refresh_token),
         token_expires_at  = COALESCE(p_token_expires_at, token_expires_at),
         scopes            = COALESCE(p_scopes, scopes),
         updated_at        = now()
   WHERE oauth_account_id = o_oauth_account_id;

EXCEPTION
  WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

    IF v_constraint = 'fk_oauth_accounts_user_id' THEN
      RAISE EXCEPTION 'Usuario inexistente';
    ELSE
      RAISE;
    END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_revoke_all_sessions(OUT o_revoked_count integer, IN p_user_id uuid, IN p_except_session_id uuid DEFAULT NULL::uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  UPDATE auth.sessions s
     SET revoked_at = now()
   WHERE s.user_id = p_user_id
     AND s.revoked_at IS NULL
     AND (p_except_session_id IS NULL OR s.session_id <> p_except_session_id);

  GET DIAGNOSTICS o_revoked_count = ROW_COUNT;


END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_revoke_role(IN p_user_id uuid, IN p_role text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_role text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  v_role := lower(trim(p_role));
  IF v_role IS NULL OR v_role = '' THEN
    RAISE EXCEPTION 'role requerido';
  END IF;

  DELETE FROM auth.user_roles
   WHERE user_id = p_user_id
     AND role = v_role;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario no posee ese rol';
  END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_revoke_session(OUT o_revoked boolean, IN p_user_id uuid, IN p_session_id uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  o_revoked := false;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_id requerido';
  END IF;

  UPDATE auth.sessions s
     SET revoked_at = now()
   WHERE s.session_id = p_session_id
     AND s.user_id = p_user_id
     AND s.revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión inexistente, no pertenece al usuario, o ya estaba revocada';
  END IF;

  o_revoked := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_rotate_refresh_token(OUT o_session_id uuid, OUT o_expires_at timestamp with time zone, IN p_user_id uuid, IN p_session_id uuid, IN p_old_refresh_token_hash text, IN p_new_refresh_token_hash text, IN p_new_expires_at timestamp with time zone, IN p_user_agent text DEFAULT NULL::text, IN p_ip inet DEFAULT NULL::inet)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_db_hash text;
  v_revoked_at timestamptz;
  v_expires_at timestamptz;
  v_constraint text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_id requerido';
  END IF;

  IF p_old_refresh_token_hash IS NULL OR length(trim(p_old_refresh_token_hash)) < 20 THEN
    RAISE EXCEPTION 'old refresh_token_hash inválido';
  END IF;

  IF p_new_refresh_token_hash IS NULL OR length(trim(p_new_refresh_token_hash)) < 20 THEN
    RAISE EXCEPTION 'new refresh_token_hash inválido';
  END IF;

  IF p_new_expires_at IS NULL OR p_new_expires_at <= now() THEN
    RAISE EXCEPTION 'new expires_at debe ser futura';
  END IF;

  -- Lock de la sesión para rotar de forma atómica
  SELECT s.refresh_token_hash, s.revoked_at, s.expires_at
    INTO v_db_hash, v_revoked_at, v_expires_at
  FROM auth.sessions s
  WHERE s.session_id = p_session_id
    AND s.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión inexistente o no pertenece al usuario';
  END IF;

  IF v_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Sesión revocada';
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at <= now() THEN
    RAISE EXCEPTION 'Sesión expirada';
  END IF;

  IF v_db_hash IS DISTINCT FROM trim(p_old_refresh_token_hash) THEN
    RAISE EXCEPTION 'Refresh token inválido';
  END IF;

  -- Rotación (y opcionalmente actualizás metadata)
  UPDATE auth.sessions
     SET refresh_token_hash = trim(p_new_refresh_token_hash),
         expires_at         = p_new_expires_at,
         user_agent         = COALESCE(p_user_agent, user_agent),
         ip                 = COALESCE(p_ip, ip),
         revoked_at         = NULL
   WHERE session_id = p_session_id
     AND user_id = p_user_id;

  o_session_id := p_session_id;
  o_expires_at := p_new_expires_at;

EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

    CASE v_constraint
      WHEN 'uq_sessions_refresh_token_hash' THEN
        RAISE EXCEPTION 'Refresh token ya existe';
      ELSE
        RAISE;
    END CASE;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_set_password(IN p_user_id uuid, IN p_new_password_hash text, IN p_revoke_sessions boolean DEFAULT true)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  IF p_new_password_hash IS NULL OR length(trim(p_new_password_hash)) < 20 THEN
    RAISE EXCEPTION 'new password_hash inválido';
  END IF;

  UPDATE auth.users
     SET password_hash = trim(p_new_password_hash),
         updated_at = now()
   WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario inexistente';
  END IF;

  IF p_revoke_sessions THEN
    UPDATE auth.sessions
       SET revoked_at = now()
     WHERE user_id = p_user_id
       AND revoked_at IS NULL
       AND expires_at > now();
  END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_set_user_active(IN p_user_id uuid, IN p_is_active boolean)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  UPDATE auth.users
     SET is_active = COALESCE(p_is_active, is_active),
         updated_at = now()
   WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario inexistente';
  END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_unlink_oauth_account(IN p_user_id uuid, IN p_provider text)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  IF p_provider IS NULL OR trim(p_provider) = '' THEN
    RAISE EXCEPTION 'provider requerido';
  END IF;

  DELETE FROM auth.oauth_accounts
   WHERE user_id = p_user_id
     AND provider = trim(p_provider);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe vínculo OAuth para ese usuario y provider';
  END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_update_oauth_tokens(IN p_provider text, IN p_provider_user_id uuid, IN p_access_token text DEFAULT NULL::text, IN p_refresh_token text DEFAULT NULL::text, IN p_token_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, IN p_scopes text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_provider IS NULL OR trim(p_provider) = '' THEN
    RAISE EXCEPTION 'provider requerido';
  END IF;

  IF p_provider_user_id IS NULL THEN
    RAISE EXCEPTION 'provider_user_id requerido';
  END IF;

  UPDATE auth.oauth_accounts
     SET access_token     = COALESCE(p_access_token, access_token),
         refresh_token    = COALESCE(p_refresh_token, refresh_token),
         token_expires_at = COALESCE(p_token_expires_at, token_expires_at),
         scopes           = COALESCE(p_scopes, scopes),
         updated_at       = now()
   WHERE provider = trim(p_provider)
     AND provider_user_id = p_provider_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe oauth account para ese provider/provider_user_id';
  END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE auth.sp_update_user_profile(IN p_user_id uuid, IN p_display_name text DEFAULT NULL::text, IN p_bio text DEFAULT NULL::text, IN p_phone text DEFAULT NULL::text, IN p_place_id uuid DEFAULT NULL::uuid, IN p_profile_visibility text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_display_name text;
  v_bio text;
  v_phone text;
  v_visibility text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.user_id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario inexistente';
  END IF;

  v_display_name := CASE WHEN p_display_name IS NULL THEN NULL ELSE trim(p_display_name) END;
  v_bio := CASE WHEN p_bio IS NULL THEN NULL ELSE nullif(trim(p_bio), '') END;
  v_phone := CASE WHEN p_phone IS NULL THEN NULL ELSE nullif(trim(p_phone), '') END;
  v_visibility := CASE WHEN p_profile_visibility IS NULL THEN NULL ELSE lower(trim(p_profile_visibility)) END;

  IF v_display_name IS NOT NULL AND v_display_name = '' THEN
    RAISE EXCEPTION 'Display name inválido';
  END IF;

  IF v_display_name IS NOT NULL AND length(v_display_name) > 60 THEN
    RAISE EXCEPTION 'Display name demasiado largo';
  END IF;

  IF v_bio IS NOT NULL AND length(v_bio) > 500 THEN
    RAISE EXCEPTION 'Bio demasiado larga';
  END IF;

  IF p_place_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM geo.places p WHERE p.place_id = p_place_id) THEN
    RAISE EXCEPTION 'No existe ubicación';
  END IF;

  IF v_visibility IS NOT NULL AND v_visibility NOT IN ('public','private','friends') THEN
    RAISE EXCEPTION 'profile_visibility inválida';
  END IF;

  UPDATE auth.users
     SET display_name       = COALESCE(v_display_name, display_name),
         bio                = COALESCE(v_bio, bio),
         phone              = COALESCE(v_phone, phone),
         place_id           = COALESCE(p_place_id, place_id),
         profile_visibility = COALESCE(v_visibility, profile_visibility),
         updated_at         = now()
   WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo actualizar el perfil';
  END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_accept_band_invite(IN p_invite_id uuid, IN p_to_user_id uuid, IN p_member_description text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_band_id uuid;
BEGIN
    IF p_invite_id IS NULL OR p_to_user_id IS NULL THEN
        RAISE EXCEPTION 'invite_id y to_user_id son requeridos';
    END IF;

    UPDATE bands.band_invite bi
    SET status = 'Aceptada',
        responded_at = now()
    WHERE bi.invite_id = p_invite_id
      AND bi.to_user_id = p_to_user_id
      AND bi.status = 'Pendiente'
    RETURNING bi.band_id INTO v_band_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se pudo aceptar: invitación inexistente, no pendiente o no corresponde al usuario';
    END IF;

    -- Si ya existe miembro, reactivar / actualizar
    IF EXISTS (
        SELECT 1
        FROM bands.band_members bm
        WHERE bm.band_id = v_band_id
          AND bm.user_id = p_to_user_id
    ) THEN
        UPDATE bands.band_members
        SET status    = 'Activo',
            left_at   = NULL,
            joined_at = now(),
            role      = COALESCE(role, 'member'),
            description = COALESCE(NULLIF(trim(p_member_description), ''), description)
        WHERE band_id = v_band_id
          AND user_id = p_to_user_id;
    ELSE
        INSERT INTO bands.band_members (band_id, user_id, role, status, joined_at, description)
        VALUES (v_band_id, p_to_user_id, 'member', 'Activo', now(), NULLIF(trim(p_member_description), ''));
    END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_cancel_band_invite(IN p_invite_id uuid, IN p_actor_user_id uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_updated int;
BEGIN
    IF p_invite_id IS NULL OR p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'invite_id y actor_user_id son requeridos';
    END IF;

    UPDATE bands.band_invite bi
    SET status = 'Cancelada',
        responded_at = now()
    WHERE bi.invite_id = p_invite_id
      AND bi.status = 'Pendiente'
      AND (
            bi.from_user_id = p_actor_user_id
            OR EXISTS (
                SELECT 1
                FROM bands.bands b
                WHERE b.band_id = bi.band_id
                  AND b.owner_user_id = p_actor_user_id
            )
          );

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
        RAISE EXCEPTION 'No se pudo cancelar: invitación inexistente, no pendiente o sin permisos';
    END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_create_band(OUT o_band_id uuid, IN p_owner_user_id uuid, IN p_name text, IN p_description text DEFAULT NULL::text, IN p_place_id uuid DEFAULT NULL::uuid, IN p_genres_ids uuid[] DEFAULT NULL::uuid[], IN p_owner_role text DEFAULT 'owner'::text)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
  	RAISE EXCEPTION 'Se requiere nombre de banda';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.user_id = p_owner_user_id) THEN
  	RAISE EXCEPTION 'No existe propietario';
  END IF;

  IF p_place_id is not null and not exists (SELECT 1 FROM geo.places p where p.place_id = p_place_id) THEN
  	RAISE EXCEPTION 'No existe ubicación';
  END IF;

  INSERT INTO bands.bands (owner_user_id, name, description, place_id)
  VALUES (p_owner_user_id, p_name, p_description, p_place_id)
  RETURNING band_id INTO o_band_id;

  INSERT INTO bands.band_members (band_id, user_id, role, status, joined_at)
  VALUES (o_band_id, p_owner_user_id, p_owner_role, 'active', now())
  ON CONFLICT (band_id, user_id) DO NOTHING;

  IF p_genre_ids IS NOt NULL AND array_length(p_genre_ids,1) > 0 THEN 
  	INSERT INTO bands.band_genres(band_id, genre_id)
	  SELECT o_band_id, g
	  FROM unnest(p_genre_ids) AS g
	  ON CONFLICT (band_id, genre_id) DO NOTHING;
  END IF;

  END;
  $procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_create_band_invite(OUT o_invite_id uuid, IN p_band_id uuid, IN p_from_user_id uuid, IN p_to_user_id uuid, IN p_message text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    IF p_band_id IS NULL OR p_from_user_id IS NULL OR p_to_user_id IS NULL THEN
        RAISE EXCEPTION 'band_id, from_user_id y to_user_id son requeridos';
    END IF;

    IF p_from_user_id = p_to_user_id THEN
        RAISE EXCEPTION 'No puedes invitarte a ti mismo';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM bands.bands b WHERE b.band_id = p_band_id) THEN
        RAISE EXCEPTION 'No existe la banda (%)', p_band_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.user_id = p_from_user_id) THEN
        RAISE EXCEPTION 'No existe el usuario que invita (%)', p_from_user_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.user_id = p_to_user_id) THEN
        RAISE EXCEPTION 'No existe el usuario invitado (%)', p_to_user_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM bands.bands b
        WHERE b.band_id = p_band_id
          AND b.owner_user_id = p_from_user_id
    )
    AND NOT EXISTS (
        SELECT 1
        FROM bands.band_members bm
        WHERE bm.band_id = p_band_id
          AND bm.user_id = p_from_user_id
          AND bm.left_at IS NULL
    ) THEN
        RAISE EXCEPTION 'El usuario (%) no tiene permisos para invitar a esta banda', p_from_user_id;
    END IF;


    IF EXISTS (
        SELECT 1
        FROM bands.band_members bm
        WHERE bm.band_id = p_band_id
          AND bm.user_id = p_to_user_id
          AND bm.left_at IS NULL
    ) THEN
        RAISE EXCEPTION 'El usuario (%) ya es miembro activo de la banda', p_to_user_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM bands.band_invite bi
        WHERE bi.band_id = p_band_id
          AND bi.to_user_id = p_to_user_id
          AND bi.status = 'Pendiente'
    ) THEN
        RAISE EXCEPTION 'Ya existe una invitación pendiente para este usuario en la banda';
    END IF;

    INSERT INTO bands.band_invite (band_id, from_user_id, to_user_id, message, status)
    VALUES (p_band_id, p_from_user_id, p_to_user_id, NULLIF(trim(p_message), ''), 'Pendiente')
    RETURNING invite_id INTO o_invite_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_create_band_opening(OUT p_opening_id uuid, IN p_band_id uuid, IN p_instrument_id uuid, IN p_description text, IN p_place_id uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    IF p_band_id IS NULL THEN
        RAISE EXCEPTION 'band_id requerido';
    END IF;

    IF p_instrument_id IS NULL THEN
        RAISE EXCEPTION 'instrument_id requerido';
    END IF;

	IF NOT EXISTS (SELECT 1 FROM bands.bands b WHERE b.band_id = p_band_id) THEN
		RAISE EXCEPTION 'No existe banda.';
	END IF;

	IF NOT EXISTS (SELECT 1 FROM music.instrument i where i.instrument_id = p_instrument_id) THEN
		RAISE EXCEPTION 'No existe intrumento.';
	END IF;

	IF NOT EXISTS (SELECT 1 FROM geo.places p where p.place_id = p_place_id) THEN
		RAISE EXCEPTION 'No existe ubicación.';
	END IF;
	INSERT INTO band_openings (band_id, instrument_id, description, place_id, status)
	VALUES (p_band_id, p_instrument_id, p_description, p_place_id, 'Abierta')
	RETURNING opening_id INTO p_opening_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_create_opening_application(OUT o_application_id uuid, IN p_opening_id uuid, IN p_user_id uuid, IN p_message text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_band_id uuid;
    v_opening_status text;
BEGIN
    IF p_opening_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'opening_id y user_id son requeridos';
    END IF;

    -- Opening existe y está abierta
    SELECT bo.band_id, bo.status
      INTO v_band_id, v_opening_status
    FROM bands.band_openings bo
    WHERE bo.opening_id = p_opening_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la opening (%)', p_opening_id;
    END IF;

    IF v_opening_status <> 'Abierta' THEN
        RAISE EXCEPTION 'La opening no está abierta';
    END IF;

    -- Usuario existe
    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.user_id = p_user_id) THEN
        RAISE EXCEPTION 'No existe el usuario (%)', p_user_id;
    END IF;

    -- No permitir si ya es miembro activo
    IF EXISTS (
        SELECT 1
        FROM bands.band_members bm
        WHERE bm.band_id = v_band_id
          AND bm.user_id = p_user_id
          AND bm.left_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Ya sos miembro activo de la banda';
    END IF;

    -- Insert (o revive si estaba Retirada/Rechazada)
    INSERT INTO bands.opening_applications (opening_id, user_id, message, status, created_at, updated_at)
    VALUES (p_opening_id, p_user_id, NULLIF(trim(p_message), ''), 'Pendiente', now(), now())
    ON CONFLICT (opening_id, user_id) DO UPDATE
      SET message    = EXCLUDED.message,
          status     = 'Pendiente',
          updated_at = now()
      WHERE bands.opening_applications.status IN ('Retirada','Rechazada')
    RETURNING application_id INTO o_application_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ya existe una postulación activa (Pendiente/Aceptada) para esta opening';
    END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_deactivate_band(IN p_band_id uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
	IF NOT EXISTS (SELECt 1 FROM bands.bands b where b.band_id = p_band_id) THEN
	 RAISE EXCEPTION 'No se encontro banda %', p_name;
	 END IF;

  UPDATE bands.bands
  SET is_active = false,
      updated_at = now()
  WHERE band_id = p_band_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_leave_band(IN p_band_id uuid, IN p_user_id uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_updated int;
BEGIN
    IF p_band_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'band_id y user_id son requeridos';
    END IF;

    -- Si guardás owner en bands.bands
    IF EXISTS (
        SELECT 1
        FROM bands.bands b
        WHERE b.band_id = p_band_id
          AND b.owner_user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'El owner no puede salir de la banda. Primero transferí la propiedad.';
    END IF;

    UPDATE bands.band_members bm
    SET status  = 'Salió',
        left_at = now()
    WHERE bm.band_id = p_band_id
      AND bm.user_id = p_user_id
      AND bm.left_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RAISE EXCEPTION 'No se pudo salir: no sos miembro activo o ya saliste';
    END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_reject_band_invite(IN p_invite_id uuid, IN p_to_user_id uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_updated int;
BEGIN
    IF p_invite_id IS NULL OR p_to_user_id IS NULL THEN
        RAISE EXCEPTION 'invite_id y to_user_id son requeridos';
    END IF;

    UPDATE bands.band_invite bi
    SET status = 'Rechazada',
        responded_at = now()
    WHERE bi.invite_id = p_invite_id
      AND bi.to_user_id = p_to_user_id
      AND bi.status = 'Pendiente';

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
        RAISE EXCEPTION 'No se pudo rechazar: invitación inexistente, no pendiente o no corresponde al usuario';
    END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_remove_band_member(IN p_band_id uuid, IN p_actor_user_id uuid, IN p_target_user_id uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_updated int;
BEGIN
    IF p_band_id IS NULL OR p_actor_user_id IS NULL OR p_target_user_id IS NULL THEN
        RAISE EXCEPTION 'band_id, actor_user_id y target_user_id son requeridos';
    END IF;

    IF p_actor_user_id = p_target_user_id THEN
        RAISE EXCEPTION 'Para salir de la banda usá bands.sp_leave_band';
    END IF;

    -- Permiso: solo owner (desde bands.bands)
    IF NOT EXISTS (
        SELECT 1
        FROM bands.bands b
        WHERE b.band_id = p_band_id
          AND b.owner_user_id = p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'No tenés permisos para quitar miembros (solo owner)';
    END IF;

    -- No expulsar al owner
    IF EXISTS (
        SELECT 1
        FROM bands.bands b
        WHERE b.band_id = p_band_id
          AND b.owner_user_id = p_target_user_id
    ) THEN
        RAISE EXCEPTION 'No se puede expulsar al owner de la banda';
    END IF;

    UPDATE bands.band_members bm
    SET status  = 'Expulsado',
        left_at = now()
    WHERE bm.band_id = p_band_id
      AND bm.user_id = p_target_user_id
      AND bm.left_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RAISE EXCEPTION 'No se pudo quitar: el usuario no es miembro activo o ya fue removido';
    END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_review_opening_application(IN p_application_id uuid, IN p_actor_user_id uuid, IN p_new_status text, IN p_member_description text DEFAULT NULL::text, IN p_close_opening boolean DEFAULT true)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_opening_id uuid;
    v_applicant_id uuid;
    v_band_id uuid;
    v_opening_status text;
BEGIN
    IF p_application_id IS NULL OR p_actor_user_id IS NULL OR p_new_status IS NULL THEN
        RAISE EXCEPTION 'application_id, actor_user_id y new_status son requeridos';
    END IF;

    IF p_new_status NOT IN ('Aceptada','Rechazada') THEN
        RAISE EXCEPTION 'Estado inválido: %. Use Aceptada o Rechazada', p_new_status;
    END IF;

    -- Traer datos (y bloquear la fila de application)
    SELECT oa.opening_id, oa.user_id
      INTO v_opening_id, v_applicant_id
    FROM bands.opening_applications oa
    WHERE oa.application_id = p_application_id
      AND oa.status = 'Pendiente'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se puede resolver: no existe o no está Pendiente';
    END IF;

    -- Lock de la opening y obtener banda
    SELECT bo.band_id, bo.status
      INTO v_band_id, v_opening_status
    FROM bands.band_openings bo
    WHERE bo.opening_id = v_opening_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la opening asociada';
    END IF;

    -- Permiso: solo owner
    IF NOT EXISTS (
        SELECT 1
        FROM bands.bands b
        WHERE b.band_id = v_band_id
          AND b.owner_user_id = p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Sin permisos: solo el owner puede resolver postulaciones';
    END IF;

    -- Si acepta, la opening debe estar abierta
    IF p_new_status = 'Aceptada' AND v_opening_status <> 'Abierta' THEN
        RAISE EXCEPTION 'No se puede aceptar: la opening no está Abierta';
    END IF;

    -- Actualizar status de la postulación
    UPDATE bands.opening_applications
    SET status     = p_new_status,
        updated_at = now()
    WHERE application_id = p_application_id;

    -- Si rechaza, listo
    IF p_new_status = 'Rechazada' THEN
        RETURN;
    END IF;

    -- Si acepta: agregar/re-activar miembro
    IF EXISTS (
        SELECT 1
        FROM bands.band_members bm
        WHERE bm.band_id = v_band_id
          AND bm.user_id = v_applicant_id
          AND bm.left_at IS NULL
    ) THEN
        RAISE EXCEPTION 'El usuario ya es miembro activo de la banda';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM bands.band_members bm
        WHERE bm.band_id = v_band_id
          AND bm.user_id = v_applicant_id
    ) THEN
        UPDATE bands.band_members
        SET status     = 'Activo',
            left_at    = NULL,
            joined_at  = now(),
            role       = COALESCE(role, 'member'),
            description = COALESCE(NULLIF(trim(p_member_description), ''), description)
        WHERE band_id = v_band_id
          AND user_id = v_applicant_id;
    ELSE
        INSERT INTO bands.band_members (band_id, user_id, role, status, joined_at, description)
        VALUES (v_band_id, v_applicant_id, 'member', 'Activo', now(), NULLIF(trim(p_member_description), ''));
    END IF;

    -- Opcional: cerrar la opening al aceptar
    IF p_close_opening THEN
        UPDATE bands.band_openings
        SET status = 'Cerrada'
        WHERE opening_id = v_opening_id;
    END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_update_band(IN p_band_id uuid, IN p_name text DEFAULT NULL::text, IN p_description text DEFAULT NULL::text, IN p_place_id uuid DEFAULT NULL::uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
	IF NOT EXISTS (SELECt 1 FROM bands.bands b where b.band_id = p_band_id) THEN
	 RAISE EXCEPTION 'No se encontro banda %', p_name;
	 END IF;

	 UPDATE bands.bands
	 SET
	  name = COALESCE(p_name, name),
	  description = COALESCE(p_description, description),
	  place_id = COALESCE(p_place_id, place_id),
	  updated_at = now()
	  WHERE band_id = p_band_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_update_band_member_description(IN p_band_id uuid, IN p_actor_user_id uuid, IN p_target_user_id uuid, IN p_description text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_updated int;
BEGIN
    IF p_band_id IS NULL OR p_actor_user_id IS NULL OR p_target_user_id IS NULL THEN
        RAISE EXCEPTION 'band_id, actor_user_id y target_user_id son requeridos';
    END IF;

    -- Permiso: el mismo usuario o el owner
    IF p_actor_user_id <> p_target_user_id
       AND NOT EXISTS (
           SELECT 1 FROM bands.bands b
           WHERE b.band_id = p_band_id
             AND b.owner_user_id = p_actor_user_id
       )
    THEN
        RAISE EXCEPTION 'Sin permisos para modificar la descripción del miembro';
    END IF;

    UPDATE bands.band_members bm
    SET description = NULLIF(trim(p_description), '')
    WHERE bm.band_id = p_band_id
      AND bm.user_id = p_target_user_id
      AND bm.left_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RAISE EXCEPTION 'No se pudo actualizar: el usuario no es miembro activo';
    END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_update_band_opening(IN p_opening_id uuid, IN p_description text DEFAULT NULL::text, IN p_status text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    IF p_opening_id IS NULL THEN
        RAISE EXCEPTION 'opening_id requerido';
    END IF;

    IF p_description IS NULL AND p_status IS NULL THEN
        RAISE EXCEPTION 'Debe enviar p_description y/o p_status';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM bands.band_openings bo
        WHERE bo.opening_id = p_opening_id
    ) THEN
        RAISE EXCEPTION 'No existe la opening (%)', p_opening_id;
    END IF;

    -- Validación de estado (ajustá estos valores a tu sistema)
    IF p_status IS NOT NULL AND p_status NOT IN ('Abierta', 'Cerrada', 'Pausada') THEN
        RAISE EXCEPTION 'Estado inválido: %. Valores permitidos: Abierta, Cerrada, Pausada', p_status;
    END IF;

    UPDATE bands.band_openings
    SET
        description = COALESCE(NULLIF(trim(p_description), ''), description),
        status      = COALESCE(p_status, status)
    WHERE opening_id = p_opening_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_update_opening_application_message(IN p_application_id uuid, IN p_user_id uuid, IN p_message text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_updated int;
BEGIN
    IF p_application_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'application_id y user_id son requeridos';
    END IF;

    UPDATE bands.opening_applications oa
    SET message    = NULLIF(trim(p_message), ''),
        updated_at = now()
    WHERE oa.application_id = p_application_id
      AND oa.user_id = p_user_id
      AND oa.status = 'Pendiente';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RAISE EXCEPTION 'No se pudo actualizar: no existe, no es tuya o no está Pendiente';
    END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bands.sp_withdraw_opening_application(IN p_application_id uuid, IN p_user_id uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_updated int;
BEGIN
    IF p_application_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'application_id y user_id son requeridos';
    END IF;

    UPDATE bands.opening_applications oa
    SET status     = 'Retirada',
        updated_at = now()
    WHERE oa.application_id = p_application_id
      AND oa.user_id = p_user_id
      AND oa.status = 'Pendiente';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RAISE EXCEPTION 'No se pudo retirar: no existe, no es tuya o no está Pendiente';
    END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bookings.sp_cancel_booking(OUT o_cancelled boolean, IN p_booking_id uuid, IN p_actor_user_id uuid, IN p_reason text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_old_status text;
BEGIN
    o_cancelled := false;

    IF p_booking_id IS NULL THEN RAISE EXCEPTION 'booking_id requerido'; END IF;
    IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id requerido'; END IF;

    SELECT status
      INTO v_old_status
    FROM bookings.bookings
    WHERE booking_id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe booking_id=%', p_booking_id;
    END IF;

    IF COALESCE(v_old_status,'') IN ('cancelled','canceled') THEN
        -- idempotente
        o_cancelled := false;
        RETURN;
    END IF;

    UPDATE bookings.bookings
       SET status = 'cancelled',
           cancelled_at = now(),
           cancellation_reasons = p_reason,
           updated_at = now()
     WHERE booking_id = p_booking_id;

    INSERT INTO bookings.booking_status_history (
        booking_id, status, changed_at, changed_by, note
    )
    VALUES (
        p_booking_id, 'cancelled', now(), p_actor_user_id,
        COALESCE(p_reason, 'booking cancelled')
    );

    o_cancelled := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bookings.sp_confirm_booking(OUT o_confirmed boolean, IN p_booking_id uuid, IN p_actor_user_id uuid, IN p_payment_id uuid DEFAULT NULL::uuid, IN p_note text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_old_status text;
    v_payment payments.payments%ROWTYPE;
BEGIN
    o_confirmed := false;

    IF p_booking_id IS NULL THEN RAISE EXCEPTION 'booking_id requerido'; END IF;
    IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id requerido'; END IF;

    -- Lock booking
    SELECT status
      INTO v_old_status
    FROM bookings.bookings
    WHERE booking_id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe booking_id=%', p_booking_id;
    END IF;

    IF COALESCE(v_old_status,'') IN ('cancelled','canceled','deleted') THEN
        RAISE EXCEPTION 'No se puede confirmar una booking % con status=%', p_booking_id, v_old_status;
    END IF;

    IF v_old_status = 'confirmed' THEN
        -- idempotente
        o_confirmed := false;
        RETURN;
    END IF;

    -- Buscar payment approved
    IF p_payment_id IS NOT NULL THEN
        SELECT *
          INTO v_payment
        FROM payments.payments
        WHERE payment_id = p_payment_id
          AND booking_id = p_booking_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'No existe payment_id=% para booking_id=%', p_payment_id, p_booking_id;
        END IF;

        IF COALESCE(v_payment.status,'') <> 'approved' THEN
            RAISE EXCEPTION 'El pago no está approved (status=%)', v_payment.status;
        END IF;
    ELSE
        SELECT *
          INTO v_payment
        FROM payments.payments
        WHERE booking_id = p_booking_id
          AND status = 'approved'
        ORDER BY approved_at DESC NULLS LAST, updated_at DESC NULLS LAST
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'No hay pagos approved para booking_id=%', p_booking_id;
        END IF;
    END IF;

    -- Confirmar
    UPDATE bookings.bookings
       SET status = 'confirmed',
           total_amount = COALESCE(total_amount, v_payment.amount),
           updated_at = now()
     WHERE booking_id = p_booking_id;

    INSERT INTO bookings.booking_status_history (
        booking_id, status, changed_at, changed_by, note
    )
    VALUES (
        p_booking_id, 'confirmed', now(), p_actor_user_id,
        COALESCE(p_note, 'confirmed by approved payment')
    );

    o_confirmed := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bookings.sp_create_booking(OUT o_booking_id uuid, IN p_room_id uuid, IN p_user_id uuid, IN p_starts_at timestamp with time zone, IN p_ends_at timestamp with time zone, IN p_total_amount numeric DEFAULT NULL::numeric, IN p_notes text DEFAULT NULL::text, IN p_status text DEFAULT 'pending'::text, IN p_actor_user_id uuid DEFAULT NULL::uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_min_booking_minutes integer;
    v_actor uuid;
BEGIN
    IF p_room_id IS NULL THEN RAISE EXCEPTION 'room_id requerido'; END IF;
    IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id requerido'; END IF;
    IF p_starts_at IS NULL OR p_ends_at IS NULL THEN RAISE EXCEPTION 'starts_at y ends_at requeridos'; END IF;
    IF p_starts_at >= p_ends_at THEN RAISE EXCEPTION 'starts_at debe ser menor a ends_at'; END IF;

    IF p_total_amount IS NOT NULL AND p_total_amount < 0 THEN
        RAISE EXCEPTION 'total_amount no puede ser negativo';
    END IF;

    IF p_status NOT IN ('pending', 'confirmed', 'completed') THEN
        RAISE EXCEPTION 'status inválido: %, permitidos: pending/confirmed/completed (cancelled se hace con sp_cancel_booking)', p_status;
    END IF;

    -- Room existe + min_booking_minutes
    SELECT rr.min_booking_minutes
      INTO v_min_booking_minutes
    FROM studios.rehearsal_rooms rr
    WHERE rr.room_id = p_room_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe rehearsal_room con room_id=%', p_room_id;
    END IF;

    IF v_min_booking_minutes IS NOT NULL THEN
        IF EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 60.0 < v_min_booking_minutes THEN
            RAISE EXCEPTION 'La reserva debe ser de al menos % minutos', v_min_booking_minutes;
        END IF;
    END IF;

    -- Conflictos de agenda
    IF bookings.fn_booking_conflicts(p_room_id, p_starts_at, p_ends_at, NULL) THEN
        RAISE EXCEPTION 'La franja horaria está ocupada o bloqueada para este room_id=%', p_room_id;
    END IF;

    v_actor := COALESCE(p_actor_user_id, p_user_id);

    INSERT INTO bookings.bookings (
        room_id, user_id, starts_at, ends_at, status, total_amount, notes, created_at, updated_at
    )
    VALUES (
        p_room_id, p_user_id, p_starts_at, p_ends_at, p_status, p_total_amount, p_notes, now(), now()
    )
    RETURNING booking_id INTO o_booking_id;

    INSERT INTO bookings.booking_status_history (
        booking_id, status, changed_at, changed_by, note
    )
    VALUES (
        o_booking_id, p_status, now(), v_actor, 'booking created'
    );
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bookings.sp_create_receipt(OUT o_receipt_id uuid, IN p_booking_id uuid, IN p_pdf_url text, IN p_emailed_to_user_at timestamp with time zone DEFAULT NULL::timestamp with time zone, IN p_emailed_to_owner_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    IF p_booking_id IS NULL THEN RAISE EXCEPTION 'booking_id requerido'; END IF;
    IF p_pdf_url IS NULL OR length(trim(p_pdf_url)) = 0 THEN RAISE EXCEPTION 'pdf_url requerido'; END IF;

    IF NOT EXISTS (SELECT 1 FROM bookings.bookings b WHERE b.booking_id = p_booking_id) THEN
        RAISE EXCEPTION 'No existe booking_id=%', p_booking_id;
    END IF;

    INSERT INTO bookings.receipts AS r (booking_id, pdf_url, emailed_to_user_at, emailed_to_owner_at, created_at)
    VALUES (p_booking_id, p_pdf_url, p_emailed_to_user_at, p_emailed_to_owner_at, now())
    ON CONFLICT (booking_id) DO UPDATE
       SET pdf_url = EXCLUDED.pdf_url,
           emailed_to_user_at  = COALESCE(EXCLUDED.emailed_to_user_at, r.emailed_to_user_at),
           emailed_to_owner_at = COALESCE(EXCLUDED.emailed_to_owner_at, r.emailed_to_owner_at)
    RETURNING r.receipt_id INTO o_receipt_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bookings.sp_delete_booking(OUT o_deleted boolean, IN p_booking_id uuid, IN p_actor_user_id uuid, IN p_hard_delete boolean DEFAULT false, IN p_note text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    o_deleted := false;

    IF p_booking_id IS NULL THEN RAISE EXCEPTION 'booking_id requerido'; END IF;
    IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id requerido'; END IF;

    -- (Opcional) Evitar borrar reservas pagadas sin querer
    IF EXISTS (
        SELECT 1
        FROM payments.payments p
        WHERE p.booking_id = p_booking_id
          AND p.status = 'approved'
    ) AND p_hard_delete THEN
        RAISE EXCEPTION 'No se recomienda hard-delete de una booking con pago approved (refund primero).';
    END IF;

    IF p_hard_delete THEN
        DELETE FROM bookings.bookings
        WHERE booking_id = p_booking_id;

        IF FOUND THEN o_deleted := true; END IF;
        RETURN;
    END IF;

    -- Soft delete
    UPDATE bookings.bookings
       SET status = 'deleted',
           updated_at = now()
     WHERE booking_id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe booking_id=%', p_booking_id;
    END IF;

    INSERT INTO bookings.booking_status_history (
        booking_id, status, changed_at, changed_by, note
    )
    VALUES (
        p_booking_id, 'deleted', now(), p_actor_user_id,
        COALESCE(p_note, 'booking deleted (soft)')
    );

    o_deleted := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE bookings.sp_update_booking(OUT o_updated boolean, IN p_booking_id uuid, IN p_actor_user_id uuid, IN p_room_id uuid DEFAULT NULL::uuid, IN p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, IN p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, IN p_status text DEFAULT NULL::text, IN p_total_amount numeric DEFAULT NULL::numeric, IN p_notes text DEFAULT NULL::text, IN p_change_note text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_old bookings.bookings%ROWTYPE;
    v_new_room_id uuid;
    v_new_starts_at timestamptz;
    v_new_ends_at timestamptz;
    v_new_status text;
    v_status_changed boolean := false;
BEGIN
    o_updated := false;

    IF p_booking_id IS NULL THEN RAISE EXCEPTION 'booking_id requerido'; END IF;
    IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id requerido'; END IF;

    SELECT *
      INTO v_old
    FROM bookings.bookings
    WHERE booking_id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe booking_id=%', p_booking_id;
    END IF;

    -- Evitá que update haga de cancel (centralizalo en sp_cancel_booking)
    IF p_status IS NOT NULL AND p_status IN ('cancelled', 'canceled') THEN
        RAISE EXCEPTION 'Para cancelar usá bookings.sp_cancel_booking()';
    END IF;

    IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'confirmed', 'completed', 'deleted') THEN
        RAISE EXCEPTION 'status inválido: %', p_status;
    END IF;

    IF p_total_amount IS NOT NULL AND p_total_amount < 0 THEN
        RAISE EXCEPTION 'total_amount no puede ser negativo';
    END IF;

    v_new_room_id   := COALESCE(p_room_id, v_old.room_id);
    v_new_starts_at := COALESCE(p_starts_at, v_old.starts_at);
    v_new_ends_at   := COALESCE(p_ends_at, v_old.ends_at);
    v_new_status    := COALESCE(p_status, v_old.status);

    IF v_new_starts_at IS NULL OR v_new_ends_at IS NULL THEN
        RAISE EXCEPTION 'starts_at y ends_at no pueden quedar NULL';
    END IF;

    IF v_new_starts_at >= v_new_ends_at THEN
        RAISE EXCEPTION 'starts_at debe ser menor a ends_at';
    END IF;

    -- Re-chequeo conflictos si cambió room o fechas
    IF v_new_room_id <> v_old.room_id
       OR v_new_starts_at <> v_old.starts_at
       OR v_new_ends_at <> v_old.ends_at THEN

        IF bookings.fn_booking_conflicts(v_new_room_id, v_new_starts_at, v_new_ends_at, p_booking_id) THEN
            RAISE EXCEPTION 'La franja horaria está ocupada o bloqueada para room_id=%', v_new_room_id;
        END IF;
    END IF;

    v_status_changed := (p_status IS NOT NULL AND p_status IS DISTINCT FROM v_old.status);

    UPDATE bookings.bookings
       SET room_id       = v_new_room_id,
           starts_at     = v_new_starts_at,
           ends_at       = v_new_ends_at,
           status        = v_new_status,
           total_amount  = COALESCE(p_total_amount, total_amount),
           notes         = COALESCE(p_notes, notes),
           updated_at    = now()
     WHERE booking_id = p_booking_id;

    o_updated := true;

    IF v_status_changed THEN
        INSERT INTO bookings.booking_status_history (
            booking_id, status, changed_at, changed_by, note
        )
        VALUES (
            p_booking_id,
            v_new_status,
            now(),
            p_actor_user_id,
            COALESCE(p_change_note, 'booking status changed')
        );
    END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE geo.sp_create_place(OUT o_place_id uuid, IN p_name text, IN p_address_line1 text DEFAULT NULL::text, IN p_address_line2 text DEFAULT NULL::text, IN p_city text DEFAULT NULL::text, IN p_region text DEFAULT NULL::text, IN p_postal_code text DEFAULT NULL::text, IN p_country text DEFAULT NULL::text, IN p_lat double precision DEFAULT NULL::double precision, IN p_lng double precision DEFAULT NULL::double precision)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_geom geometry(Point, 4326);
BEGIN
    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'name requerido';
    END IF;

    IF (p_lat IS NULL) <> (p_lng IS NULL) THEN
        RAISE EXCEPTION 'Si enviás lat, tenés que enviar lng (y viceversa)';
    END IF;

    IF p_lat IS NOT NULL THEN
        v_geom := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
    ELSE
        v_geom := NULL;
    END IF;

    INSERT INTO geo.places (
        name, address_line1, address_line2, city, region, postal_code, country,
        lat, lng, geom, created_at, updated_at
    )
    VALUES (
        p_name, p_address_line1, p_address_line2, p_city, p_region, p_postal_code, p_country,
        p_lat, p_lng, v_geom, now(), now()
    )
    RETURNING place_id INTO o_place_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE geo.sp_update_place(OUT o_updated boolean, IN p_place_id uuid, IN p_name text DEFAULT NULL::text, IN p_address_line1 text DEFAULT NULL::text, IN p_address_line2 text DEFAULT NULL::text, IN p_city text DEFAULT NULL::text, IN p_region text DEFAULT NULL::text, IN p_postal_code text DEFAULT NULL::text, IN p_country text DEFAULT NULL::text, IN p_lat double precision DEFAULT NULL::double precision, IN p_lng double precision DEFAULT NULL::double precision)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_old geo.places%ROWTYPE;
    v_new_lat double precision;
    v_new_lng double precision;
    v_new_geom geometry(Point,4326);
BEGIN
    o_updated := false;

    IF p_place_id IS NULL THEN
        RAISE EXCEPTION 'place_id requerido';
    END IF;

    SELECT * INTO v_old
    FROM geo.places
    WHERE place_id = p_place_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe place_id=%', p_place_id;
    END IF;

    IF (p_lat IS NULL) <> (p_lng IS NULL) THEN
        RAISE EXCEPTION 'Si enviás lat, tenés que enviar lng (y viceversa)';
    END IF;

    v_new_lat := COALESCE(p_lat, v_old.lat);
    v_new_lng := COALESCE(p_lng, v_old.lng);

    IF v_new_lat IS NOT NULL AND v_new_lng IS NOT NULL THEN
        v_new_geom := ST_SetSRID(ST_MakePoint(v_new_lng, v_new_lat), 4326);
    ELSE
        v_new_geom := NULL;
    END IF;

    UPDATE geo.places
       SET name = COALESCE(p_name, name),
           address_line1 = COALESCE(p_address_line1, address_line1),
           address_line2 = COALESCE(p_address_line2, address_line2),
           city = COALESCE(p_city, city),
           region = COALESCE(p_region, region),
           postal_code = COALESCE(p_postal_code, postal_code),
           country = COALESCE(p_country, country),
           lat = v_new_lat,
           lng = v_new_lng,
           geom = v_new_geom,
           updated_at = now()
     WHERE place_id = p_place_id;

    o_updated := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE geo.sp_upsert_place_by_external_id(OUT o_place_id uuid, IN p_provider text, IN p_external_id text, IN p_name text, IN p_address_line1 text DEFAULT NULL::text, IN p_address_line2 text DEFAULT NULL::text, IN p_city text DEFAULT NULL::text, IN p_region text DEFAULT NULL::text, IN p_postal_code text DEFAULT NULL::text, IN p_country text DEFAULT NULL::text, IN p_lat double precision DEFAULT NULL::double precision, IN p_lng double precision DEFAULT NULL::double precision)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_geom geometry(Point,4326);
BEGIN
    IF p_provider IS NULL OR length(trim(p_provider)) = 0 THEN
        RAISE EXCEPTION 'provider requerido';
    END IF;
    IF p_external_id IS NULL OR length(trim(p_external_id)) = 0 THEN
        RAISE EXCEPTION 'external_id requerido';
    END IF;
    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'name requerido';
    END IF;

    IF (p_lat IS NULL) <> (p_lng IS NULL) THEN
        RAISE EXCEPTION 'Si enviás lat, tenés que enviar lng (y viceversa)';
    END IF;

    IF p_lat IS NOT NULL THEN
        v_geom := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
    ELSE
        v_geom := NULL;
    END IF;

    INSERT INTO geo.places AS pl (
        provider, external_id,
        name, address_line1, address_line2, city, region, postal_code, country,
        lat, lng, geom, created_at, updated_at
    )
    VALUES (
        p_provider, p_external_id,
        p_name, p_address_line1, p_address_line2, p_city, p_region, p_postal_code, p_country,
        p_lat, p_lng, v_geom, now(), now()
    )
    ON CONFLICT (provider, external_id)
    DO UPDATE SET
        name = EXCLUDED.name,
        address_line1 = COALESCE(EXCLUDED.address_line1, pl.address_line1),
        address_line2 = COALESCE(EXCLUDED.address_line2, pl.address_line2),
        city = COALESCE(EXCLUDED.city, pl.city),
        region = COALESCE(EXCLUDED.region, pl.region),
        postal_code = COALESCE(EXCLUDED.postal_code, pl.postal_code),
        country = COALESCE(EXCLUDED.country, pl.country),
        lat = COALESCE(EXCLUDED.lat, pl.lat),
        lng = COALESCE(EXCLUDED.lng, pl.lng),
        geom = COALESCE(EXCLUDED.geom, pl.geom),
        updated_at = now()
    RETURNING pl.place_id INTO o_place_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_add_musician_genre(OUT o_musician_genre_id uuid, IN p_user_id uuid, IN p_genre_id uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id requerido'; END IF;
  IF p_genre_id IS NULL THEN RAISE EXCEPTION 'genre_id requerido'; END IF;

  -- UPSERT inofensivo para poder RETURNING siempre
  INSERT INTO music.musician_genre (user_id, genre_id, created_at)
  VALUES (p_user_id, p_genre_id, now())
  ON CONFLICT (user_id, genre_id) DO UPDATE
     SET user_id = EXCLUDED.user_id
  RETURNING musician_genre_id INTO o_musician_genre_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_add_musician_instrument(OUT o_musician_instrument_id uuid, IN p_user_id uuid, IN p_instrument_id uuid, IN p_level text DEFAULT NULL::text, IN p_is_primary boolean DEFAULT false)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id requerido'; END IF;
  IF p_instrument_id IS NULL THEN RAISE EXCEPTION 'instrument_id requerido'; END IF;

  -- Validación suave de level (si querés podés ampliarla)
  IF p_level IS NOT NULL AND p_level NOT IN ('beginner','intermediate','advanced','pro') THEN
    RAISE EXCEPTION 'level inválido: %, valores: beginner/intermediate/advanced/pro', p_level;
  END IF;

  IF p_is_primary THEN
    UPDATE music.musician_instrument
       SET is_primary = false
     WHERE user_id = p_user_id;
  END IF;

  INSERT INTO music.musician_instrument (user_id, instrument_id, level, is_primary, created_at)
  VALUES (p_user_id, p_instrument_id, p_level, p_is_primary, now())
  ON CONFLICT (user_id, instrument_id) DO UPDATE
     SET level = COALESCE(EXCLUDED.level, music.musician_instrument.level),
         -- importante: no “des-primea” si lo vuelven a llamar con p_is_primary=false
         is_primary = CASE WHEN EXCLUDED.is_primary THEN true ELSE music.musician_instrument.is_primary END
  RETURNING musician_instrument_id INTO o_musician_instrument_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_create_genre(OUT o_genre_id uuid, IN p_name text, IN p_source text DEFAULT 'internal'::text, IN p_external_id uuid DEFAULT gen_random_uuid())
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_norm text;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name requerido';
  END IF;

  v_norm := music.fn_normalize_name(p_name);

  INSERT INTO music.genres (name, normalized_name, source, external_id, created_at)
  VALUES (p_name, v_norm, p_source, COALESCE(p_external_id, gen_random_uuid()), now())
  RETURNING genre_id INTO o_genre_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_create_instrument(OUT o_instrument_id uuid, IN p_name text, IN p_category text DEFAULT NULL::text, IN p_source text DEFAULT 'internal'::text, IN p_external_id uuid DEFAULT gen_random_uuid())
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_norm text;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name requerido';
  END IF;

  v_norm := music.fn_normalize_name(p_name);

  INSERT INTO music.instrument (name, normalized_name, category, source, external_id, created_at)
  VALUES (p_name, v_norm, p_category, p_source, COALESCE(p_external_id, gen_random_uuid()), now())
  RETURNING instrument_id INTO o_instrument_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_create_musician_profile(OUT o_musician_id uuid, IN p_user_id uuid, IN p_years_experience integer DEFAULT NULL::integer, IN p_skill_summary text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  IF EXISTS (SELECT 1 FROM music.musician_profile mp WHERE mp.user_id = p_user_id) THEN
    RAISE EXCEPTION 'Ya existe musician_profile para user_id=%', p_user_id;
  END IF;

  INSERT INTO music.musician_profile (user_id, years_experience, skill_summary, created_at, updated_at)
  VALUES (p_user_id, p_years_experience, p_skill_summary, now(), now())
  RETURNING musician_id INTO o_musician_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_delete_genre(OUT o_deleted boolean, IN p_genre_id uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  o_deleted := false;

  IF p_genre_id IS NULL THEN
    RAISE EXCEPTION 'genre_id requerido';
  END IF;

  DELETE FROM music.genres
   WHERE genre_id = p_genre_id;

  o_deleted := FOUND;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_delete_instrument(OUT o_deleted boolean, IN p_instrument_id uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  o_deleted := false;

  IF p_instrument_id IS NULL THEN
    RAISE EXCEPTION 'instrument_id requerido';
  END IF;

  DELETE FROM music.instrument
   WHERE instrument_id = p_instrument_id;

  o_deleted := FOUND;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_delete_musician_profile(OUT o_deleted boolean, IN p_user_id uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  o_deleted := false;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  DELETE FROM music.musician_profile
   WHERE user_id = p_user_id;

  o_deleted := FOUND;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_remove_musician_genre(OUT o_removed boolean, IN p_user_id uuid, IN p_genre_id uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  o_removed := false;

  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id requerido'; END IF;
  IF p_genre_id IS NULL THEN RAISE EXCEPTION 'genre_id requerido'; END IF;

  DELETE FROM music.musician_genre
   WHERE user_id = p_user_id
     AND genre_id = p_genre_id;

  o_removed := FOUND;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_remove_musician_instrument(OUT o_removed boolean, IN p_user_id uuid, IN p_instrument_id uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_was_primary boolean;
  v_next uuid;
BEGIN
  o_removed := false;

  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id requerido'; END IF;
  IF p_instrument_id IS NULL THEN RAISE EXCEPTION 'instrument_id requerido'; END IF;

  SELECT is_primary INTO v_was_primary
  FROM music.musician_instrument
  WHERE user_id = p_user_id AND instrument_id = p_instrument_id;

  IF NOT FOUND THEN
    o_removed := false;
    RETURN;
  END IF;

  DELETE FROM music.musician_instrument
   WHERE user_id = p_user_id
     AND instrument_id = p_instrument_id;

  o_removed := true;

  -- si borró el primary, elegimos otro como primary (si existe)
  IF v_was_primary THEN
    SELECT mi.instrument_id INTO v_next
    FROM music.musician_instrument mi
    WHERE mi.user_id = p_user_id
    ORDER BY mi.created_at ASC
    LIMIT 1;

    IF v_next IS NOT NULL THEN
      UPDATE music.musician_instrument
         SET is_primary = true
       WHERE user_id = p_user_id
         AND instrument_id = v_next;
    END IF;
  END IF;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_set_primary_instrument(OUT o_updated boolean, IN p_user_id uuid, IN p_instrument_id uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  o_updated := false;

  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id requerido'; END IF;
  IF p_instrument_id IS NULL THEN RAISE EXCEPTION 'instrument_id requerido'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM music.musician_instrument
    WHERE user_id = p_user_id AND instrument_id = p_instrument_id
  ) THEN
    RAISE EXCEPTION 'El usuario no tiene ese instrumento cargado';
  END IF;

  UPDATE music.musician_instrument
     SET is_primary = false
   WHERE user_id = p_user_id;

  UPDATE music.musician_instrument
     SET is_primary = true
   WHERE user_id = p_user_id
     AND instrument_id = p_instrument_id;

  o_updated := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_update_genre(OUT o_updated boolean, IN p_genre_id uuid, IN p_name text DEFAULT NULL::text, IN p_source text DEFAULT NULL::text, IN p_external_id uuid DEFAULT NULL::uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_norm text;
BEGIN
  o_updated := false;

  IF p_genre_id IS NULL THEN
    RAISE EXCEPTION 'genre_id requerido';
  END IF;

  IF p_name IS NOT NULL THEN
    v_norm := music.fn_normalize_name(p_name);
  END IF;

  UPDATE music.genres
     SET name = COALESCE(p_name, name),
         normalized_name = COALESCE(v_norm, normalized_name),
         source = COALESCE(p_source, source),
         external_id = COALESCE(p_external_id, external_id)
   WHERE genre_id = p_genre_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe genre_id=%', p_genre_id;
  END IF;

  o_updated := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_update_instrument(OUT o_updated boolean, IN p_instrument_id uuid, IN p_name text DEFAULT NULL::text, IN p_category text DEFAULT NULL::text, IN p_source text DEFAULT NULL::text, IN p_external_id uuid DEFAULT NULL::uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_norm text;
BEGIN
  o_updated := false;

  IF p_instrument_id IS NULL THEN
    RAISE EXCEPTION 'instrument_id requerido';
  END IF;

  IF p_name IS NOT NULL THEN
    v_norm := music.fn_normalize_name(p_name);
  END IF;

  UPDATE music.instrument
     SET name = COALESCE(p_name, name),
         normalized_name = COALESCE(v_norm, normalized_name),
         category = COALESCE(p_category, category),
         source = COALESCE(p_source, source),
         external_id = COALESCE(p_external_id, external_id)
   WHERE instrument_id = p_instrument_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe instrument_id=%', p_instrument_id;
  END IF;

  o_updated := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_update_musician_instrument(OUT o_updated boolean, IN p_user_id uuid, IN p_instrument_id uuid, IN p_level text DEFAULT NULL::text, IN p_is_primary boolean DEFAULT NULL::boolean)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  o_updated := false;

  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id requerido'; END IF;
  IF p_instrument_id IS NULL THEN RAISE EXCEPTION 'instrument_id requerido'; END IF;

  IF p_level IS NOT NULL AND p_level NOT IN ('beginner','intermediate','advanced','pro') THEN
    RAISE EXCEPTION 'level inválido: %, valores: beginner/intermediate/advanced/pro', p_level;
  END IF;

  IF p_is_primary IS TRUE THEN
    UPDATE music.musician_instrument
       SET is_primary = false
     WHERE user_id = p_user_id;
  END IF;

  UPDATE music.musician_instrument
     SET level = COALESCE(p_level, level),
         is_primary = COALESCE(p_is_primary, is_primary)
   WHERE user_id = p_user_id
     AND instrument_id = p_instrument_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe musician_instrument para user_id=% instrument_id=%', p_user_id, p_instrument_id;
  END IF;

  o_updated := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE music.sp_upsert_musician_profile(OUT o_musician_id uuid, IN p_user_id uuid, IN p_years_experience integer DEFAULT NULL::integer, IN p_skill_summary text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  INSERT INTO music.musician_profile (user_id, years_experience, skill_summary, created_at, updated_at)
  VALUES (p_user_id, p_years_experience, p_skill_summary, now(), now())
  ON CONFLICT (user_id) DO UPDATE
     SET years_experience = COALESCE(EXCLUDED.years_experience, music.musician_profile.years_experience),
         skill_summary    = COALESCE(EXCLUDED.skill_summary,  music.musician_profile.skill_summary),
         updated_at       = now()
  RETURNING musician_id INTO o_musician_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_add_room_equipment(OUT o_room_equipment_id uuid, IN p_room_id uuid, IN p_actor_user_id uuid, IN p_equipment_id uuid, IN p_quantity text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_studio_id uuid;
BEGIN
  IF p_room_id IS NULL THEN RAISE EXCEPTION 'room_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;
  IF p_equipment_id IS NULL THEN RAISE EXCEPTION 'equipment_id required'; END IF;

  v_studio_id := studios.fn_get_studio_id_by_room(p_room_id);
  IF v_studio_id IS NULL THEN RAISE EXCEPTION 'room not found'; END IF;

  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, v_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM studios.equipment e WHERE e.equipment_id = p_equipment_id) THEN
    RAISE EXCEPTION 'equipment not found';
  END IF;

  INSERT INTO studios.room_equipment AS re (room_id, equipment_id, quantity, created_at)
  VALUES (p_room_id, p_equipment_id, p_quantity, now())
  ON CONFLICT (room_id, equipment_id)
  DO UPDATE SET quantity = COALESCE(EXCLUDED.quantity, re.quantity)
  RETURNING re.room_equipment_id INTO o_room_equipment_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_create_equipment(OUT o_equipment_id uuid, IN p_actor_user_id uuid, IN p_name text, IN p_category text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;
  IF NOT studios.fn_is_admin(p_actor_user_id) THEN
    RAISE EXCEPTION 'admin role required to manage equipment catalog';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'name required'; END IF;

  INSERT INTO studios.equipment (name, category, created_at)
  VALUES (p_name, p_category, now())
  RETURNING equipment_id INTO o_equipment_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_create_room(OUT o_room_id uuid, IN p_studio_id uuid, IN p_actor_user_id uuid, IN p_name text, IN p_description text DEFAULT NULL::text, IN p_capacity integer DEFAULT NULL::integer, IN p_base_hourly_price numeric DEFAULT NULL::numeric, IN p_min_booking_minutes integer DEFAULT NULL::integer)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_studio_id IS NULL THEN RAISE EXCEPTION 'studio_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'name required'; END IF;

  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, p_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  IF p_capacity IS NOT NULL AND p_capacity < 0 THEN RAISE EXCEPTION 'capacity must be >= 0'; END IF;
  IF p_base_hourly_price IS NOT NULL AND p_base_hourly_price < 0 THEN RAISE EXCEPTION 'base_hourly_price must be >= 0'; END IF;
  IF p_min_booking_minutes IS NOT NULL AND p_min_booking_minutes < 0 THEN RAISE EXCEPTION 'min_booking_minutes must be >= 0'; END IF;

  INSERT INTO studios.rehearsal_rooms (
    studio_id, name, description, capacity, base_hourly_price, min_booking_minutes, created_at, updated_at
  )
  VALUES (
    p_studio_id, p_name, p_description, p_capacity, p_base_hourly_price, p_min_booking_minutes, now(), now()
  )
  RETURNING room_id INTO o_room_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_create_room_availability_rule(OUT o_rule_id uuid, IN p_room_id uuid, IN p_actor_user_id uuid, IN p_day_of_week smallint, IN p_start_time time without time zone, IN p_end_time time without time zone, IN p_timezone text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_studio_id uuid;
BEGIN
  IF p_room_id IS NULL THEN RAISE EXCEPTION 'room_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;

  v_studio_id := studios.fn_get_studio_id_by_room(p_room_id);
  IF v_studio_id IS NULL THEN RAISE EXCEPTION 'room not found'; END IF;

  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, v_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  IF p_timezone IS NULL OR length(trim(p_timezone)) = 0 THEN
    RAISE EXCEPTION 'timezone required';
  END IF;

  IF studios.fn_rule_conflicts(p_room_id, p_day_of_week, p_start_time, p_end_time, NULL) THEN
    RAISE EXCEPTION 'availability rule conflicts with an existing rule';
  END IF;

  INSERT INTO studios.room_availability_rules (
    room_id, day_of_week, start_time, end_time, timezone, created_at, updated_at
  )
  VALUES (
    p_room_id, p_day_of_week, p_start_time, p_end_time, p_timezone, now(), now()
  )
  RETURNING rule_id INTO o_rule_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_create_room_block(OUT o_block_id uuid, IN p_room_id uuid, IN p_actor_user_id uuid, IN p_starts_at timestamp with time zone, IN p_ends_at timestamp with time zone, IN p_reason text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_studio_id uuid;
BEGIN
  IF p_room_id IS NULL THEN RAISE EXCEPTION 'room_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;

  v_studio_id := studios.fn_get_studio_id_by_room(p_room_id);
  IF v_studio_id IS NULL THEN RAISE EXCEPTION 'room not found'; END IF;

  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, v_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  IF studios.fn_room_block_conflicts(p_room_id, p_starts_at, p_ends_at, NULL) THEN
    RAISE EXCEPTION 'block conflicts with existing blocks or active bookings';
  END IF;

  INSERT INTO studios.room_blocks (room_id, starts_at, ends_at, reason, created_by, created_at)
  VALUES (p_room_id, p_starts_at, p_ends_at, p_reason, p_actor_user_id, now())
  RETURNING block_id INTO o_block_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_create_studio(OUT o_studio_id uuid, IN p_owner_user_id uuid, IN p_name text, IN p_description text DEFAULT NULL::text, IN p_place_id uuid DEFAULT NULL::uuid, IN p_phone text DEFAULT NULL::text, IN p_is_active boolean DEFAULT true)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  IF p_owner_user_id IS NULL THEN RAISE EXCEPTION 'owner_user_id required'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'name required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.user_id = p_owner_user_id AND u.is_active = true) THEN
    RAISE EXCEPTION 'owner_user_id not found or inactive';
  END IF;

  IF p_place_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM geo.places p WHERE p.place_id = p_place_id) THEN
    RAISE EXCEPTION 'place_id not found';
  END IF;

  INSERT INTO studios.studios (owner_user_id, name, description, place_id, phone, is_active, created_at)
  VALUES (p_owner_user_id, p_name, p_description, p_place_id, p_phone, COALESCE(p_is_active,true), now())
  RETURNING studio_id INTO o_studio_id;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_delete_equipment(OUT o_deleted boolean, IN p_equipment_id uuid, IN p_actor_user_id uuid)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  o_deleted := false;

  IF p_equipment_id IS NULL THEN RAISE EXCEPTION 'equipment_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;
  IF NOT studios.fn_is_admin(p_actor_user_id) THEN
    RAISE EXCEPTION 'admin role required to manage equipment catalog';
  END IF;

  DELETE FROM studios.equipment WHERE equipment_id = p_equipment_id;
  o_deleted := FOUND;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_delete_room(OUT o_deleted boolean, IN p_room_id uuid, IN p_actor_user_id uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_studio_id uuid;
BEGIN
  o_deleted := false;

  IF p_room_id IS NULL THEN RAISE EXCEPTION 'room_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;

  v_studio_id := studios.fn_get_studio_id_by_room(p_room_id);
  IF v_studio_id IS NULL THEN
    o_deleted := false;
    RETURN;
  END IF;

  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, v_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  -- Si hay bookings, avisamos antes (FK también lo impediría)
  IF EXISTS (
    SELECT 1 FROM bookings.bookings b
    WHERE b.room_id = p_room_id
      AND COALESCE(b.status,'') NOT IN ('cancelled','canceled','deleted')
  ) THEN
    RAISE EXCEPTION 'cannot delete room with active bookings';
  END IF;

  DELETE FROM studios.rehearsal_rooms WHERE room_id = p_room_id;
  o_deleted := FOUND;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_delete_room_availability_rule(OUT o_deleted boolean, IN p_rule_id uuid, IN p_actor_user_id uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_room_id uuid;
  v_studio_id uuid;
BEGIN
  o_deleted := false;

  IF p_rule_id IS NULL THEN RAISE EXCEPTION 'rule_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;

  SELECT room_id INTO v_room_id
  FROM studios.room_availability_rules
  WHERE rule_id = p_rule_id;

  IF NOT FOUND THEN
    o_deleted := false;
    RETURN;
  END IF;

  v_studio_id := studios.fn_get_studio_id_by_room(v_room_id);
  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, v_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  DELETE FROM studios.room_availability_rules WHERE rule_id = p_rule_id;
  o_deleted := FOUND;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_delete_room_block(OUT o_deleted boolean, IN p_block_id uuid, IN p_actor_user_id uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_room_id uuid;
  v_studio_id uuid;
BEGIN
  o_deleted := false;

  IF p_block_id IS NULL THEN RAISE EXCEPTION 'block_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;

  SELECT room_id INTO v_room_id
  FROM studios.room_blocks
  WHERE block_id = p_block_id;

  IF NOT FOUND THEN
    o_deleted := false;
    RETURN;
  END IF;

  v_studio_id := studios.fn_get_studio_id_by_room(v_room_id);
  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, v_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  DELETE FROM studios.room_blocks WHERE block_id = p_block_id;
  o_deleted := FOUND;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_delete_studio(OUT o_deleted boolean, IN p_studio_id uuid, IN p_actor_user_id uuid, IN p_hard_delete boolean DEFAULT false)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  o_deleted := false;

  IF p_studio_id IS NULL THEN RAISE EXCEPTION 'studio_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;

  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, p_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  IF p_hard_delete THEN
    -- Si hay bookings, esto probablemente falle por FK (rooms -> bookings RESTRICT)
    DELETE FROM studios.studios WHERE studio_id = p_studio_id;
    o_deleted := FOUND;
    RETURN;
  END IF;

  UPDATE studios.studios
     SET is_active = false
   WHERE studio_id = p_studio_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'studio not found'; END IF;
  o_deleted := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_remove_room_equipment(OUT o_removed boolean, IN p_room_id uuid, IN p_actor_user_id uuid, IN p_equipment_id uuid)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_studio_id uuid;
BEGIN
  o_removed := false;

  IF p_room_id IS NULL THEN RAISE EXCEPTION 'room_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;
  IF p_equipment_id IS NULL THEN RAISE EXCEPTION 'equipment_id required'; END IF;

  v_studio_id := studios.fn_get_studio_id_by_room(p_room_id);
  IF v_studio_id IS NULL THEN RAISE EXCEPTION 'room not found'; END IF;

  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, v_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  DELETE FROM studios.room_equipment
   WHERE room_id = p_room_id
     AND equipment_id = p_equipment_id;

  o_removed := FOUND;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_set_studio_active(OUT o_updated boolean, IN p_studio_id uuid, IN p_actor_user_id uuid, IN p_is_active boolean)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  o_updated := false;

  IF p_studio_id IS NULL THEN RAISE EXCEPTION 'studio_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;

  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, p_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  UPDATE studios.studios
     SET is_active = p_is_active
   WHERE studio_id = p_studio_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'studio not found'; END IF;
  o_updated := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_update_equipment(OUT o_updated boolean, IN p_equipment_id uuid, IN p_actor_user_id uuid, IN p_name text DEFAULT NULL::text, IN p_category text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  o_updated := false;

  IF p_equipment_id IS NULL THEN RAISE EXCEPTION 'equipment_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;
  IF NOT studios.fn_is_admin(p_actor_user_id) THEN
    RAISE EXCEPTION 'admin role required to manage equipment catalog';
  END IF;

  UPDATE studios.equipment
     SET name = COALESCE(p_name, name),
         category = COALESCE(p_category, category)
   WHERE equipment_id = p_equipment_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'equipment not found'; END IF;
  o_updated := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_update_room(OUT o_updated boolean, IN p_room_id uuid, IN p_actor_user_id uuid, IN p_name text DEFAULT NULL::text, IN p_description text DEFAULT NULL::text, IN p_capacity integer DEFAULT NULL::integer, IN p_base_hourly_price numeric DEFAULT NULL::numeric, IN p_min_booking_minutes integer DEFAULT NULL::integer)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_studio_id uuid;
BEGIN
  o_updated := false;

  IF p_room_id IS NULL THEN RAISE EXCEPTION 'room_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;

  v_studio_id := studios.fn_get_studio_id_by_room(p_room_id);
  IF v_studio_id IS NULL THEN RAISE EXCEPTION 'room not found'; END IF;

  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, v_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  IF p_capacity IS NOT NULL AND p_capacity < 0 THEN RAISE EXCEPTION 'capacity must be >= 0'; END IF;
  IF p_base_hourly_price IS NOT NULL AND p_base_hourly_price < 0 THEN RAISE EXCEPTION 'base_hourly_price must be >= 0'; END IF;
  IF p_min_booking_minutes IS NOT NULL AND p_min_booking_minutes < 0 THEN RAISE EXCEPTION 'min_booking_minutes must be >= 0'; END IF;

  UPDATE studios.rehearsal_rooms
     SET name = COALESCE(p_name, name),
         description = COALESCE(p_description, description),
         capacity = COALESCE(p_capacity, capacity),
         base_hourly_price = COALESCE(p_base_hourly_price, base_hourly_price),
         min_booking_minutes = COALESCE(p_min_booking_minutes, min_booking_minutes),
         updated_at = now()
   WHERE room_id = p_room_id;

  o_updated := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_update_room_availability_rule(OUT o_updated boolean, IN p_rule_id uuid, IN p_actor_user_id uuid, IN p_day_of_week smallint DEFAULT NULL::smallint, IN p_start_time time without time zone DEFAULT NULL::time without time zone, IN p_end_time time without time zone DEFAULT NULL::time without time zone, IN p_timezone text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_rule studios.room_availability_rules%ROWTYPE;
  v_studio_id uuid;
  v_day smallint;
  v_start time;
  v_end time;
  v_tz text;
BEGIN
  o_updated := false;

  IF p_rule_id IS NULL THEN RAISE EXCEPTION 'rule_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;

  SELECT * INTO v_rule
  FROM studios.room_availability_rules
  WHERE rule_id = p_rule_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'rule not found'; END IF;

  v_studio_id := studios.fn_get_studio_id_by_room(v_rule.room_id);
  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, v_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  v_day := COALESCE(p_day_of_week, v_rule.day_of_week);
  v_start := COALESCE(p_start_time, v_rule.start_time);
  v_end := COALESCE(p_end_time, v_rule.end_time);
  v_tz := COALESCE(p_timezone, v_rule.timezone);

  IF v_tz IS NULL OR length(trim(v_tz)) = 0 THEN RAISE EXCEPTION 'timezone required'; END IF;

  IF studios.fn_rule_conflicts(v_rule.room_id, v_day, v_start, v_end, p_rule_id) THEN
    RAISE EXCEPTION 'availability rule conflicts with an existing rule';
  END IF;

  UPDATE studios.room_availability_rules
     SET day_of_week = v_day,
         start_time = v_start,
         end_time = v_end,
         timezone = v_tz,
         updated_at = now()
   WHERE rule_id = p_rule_id;

  o_updated := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_update_room_block(OUT o_updated boolean, IN p_block_id uuid, IN p_actor_user_id uuid, IN p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, IN p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, IN p_reason text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_block studios.room_blocks%ROWTYPE;
  v_studio_id uuid;
  v_starts timestamptz;
  v_ends timestamptz;
BEGIN
  o_updated := false;

  IF p_block_id IS NULL THEN RAISE EXCEPTION 'block_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;

  SELECT * INTO v_block
  FROM studios.room_blocks
  WHERE block_id = p_block_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'block not found'; END IF;

  v_studio_id := studios.fn_get_studio_id_by_room(v_block.room_id);
  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, v_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  v_starts := COALESCE(p_starts_at, v_block.starts_at);
  v_ends   := COALESCE(p_ends_at,   v_block.ends_at);

  IF studios.fn_room_block_conflicts(v_block.room_id, v_starts, v_ends, p_block_id) THEN
    RAISE EXCEPTION 'block conflicts with existing blocks or active bookings';
  END IF;

  UPDATE studios.room_blocks
     SET starts_at = v_starts,
         ends_at = v_ends,
         reason = COALESCE(p_reason, reason),
         created_by = COALESCE(created_by, p_actor_user_id)
   WHERE block_id = p_block_id;

  o_updated := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_update_room_equipment_quantity(OUT o_updated boolean, IN p_room_id uuid, IN p_actor_user_id uuid, IN p_equipment_id uuid, IN p_quantity text)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  v_studio_id uuid;
BEGIN
  o_updated := false;

  IF p_room_id IS NULL THEN RAISE EXCEPTION 'room_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;
  IF p_equipment_id IS NULL THEN RAISE EXCEPTION 'equipment_id required'; END IF;

  v_studio_id := studios.fn_get_studio_id_by_room(p_room_id);
  IF v_studio_id IS NULL THEN RAISE EXCEPTION 'room not found'; END IF;

  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, v_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  UPDATE studios.room_equipment
     SET quantity = p_quantity
   WHERE room_id = p_room_id
     AND equipment_id = p_equipment_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'room_equipment not found'; END IF;
  o_updated := true;
END;
$procedure$;



CREATE OR REPLACE PROCEDURE studios.sp_update_studio(OUT o_updated boolean, IN p_studio_id uuid, IN p_actor_user_id uuid, IN p_name text DEFAULT NULL::text, IN p_description text DEFAULT NULL::text, IN p_place_id uuid DEFAULT NULL::uuid, IN p_phone text DEFAULT NULL::text)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  o_updated := false;

  IF p_studio_id IS NULL THEN RAISE EXCEPTION 'studio_id required'; END IF;
  IF p_actor_user_id IS NULL THEN RAISE EXCEPTION 'actor_user_id required'; END IF;

  IF NOT studios.fn_user_can_manage_studio(p_actor_user_id, p_studio_id) THEN
    RAISE EXCEPTION 'not authorized to manage this studio';
  END IF;

  IF p_place_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM geo.places p WHERE p.place_id = p_place_id) THEN
    RAISE EXCEPTION 'place_id not found';
  END IF;

  UPDATE studios.studios
     SET name = COALESCE(p_name, name),
         description = COALESCE(p_description, description),
         place_id = COALESCE(p_place_id, place_id),
         phone = COALESCE(p_phone, phone)
   WHERE studio_id = p_studio_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'studio not found'; END IF;
  o_updated := true;
END;
$procedure$;



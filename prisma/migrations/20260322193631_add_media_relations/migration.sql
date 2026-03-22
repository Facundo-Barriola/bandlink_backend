-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "bands";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "bookings";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "chat";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "events";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "geo";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "media";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "music";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "notifications";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "payments";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "reviews";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "social";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "studios";

-- CreateTable
CREATE TABLE "auth"."email_verification_tokens" (
    "token_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMPTZ(6),
    "ip" INET,
    "user_agent" TEXT,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "auth"."oauth_accounts" (
    "oauth_account_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMPTZ(6),
    "scopes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("oauth_account_id")
);

-- CreateTable
CREATE TABLE "auth"."password_reset_tokens" (
    "token_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMPTZ(6),
    "ip" INET,
    "user_agent" TEXT,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "auth"."sessions" (
    "session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT,
    "user_agent" TEXT,
    "ip" INET,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "auth"."user_roles" (
    "user_role_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_role_id")
);

-- CreateTable
CREATE TABLE "auth"."users" (
    "user_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "username" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "bio" TEXT,
    "phone" TEXT,
    "birthdate" DATE,
    "place_id" UUID,
    "profile_visibility" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "bands"."band_genres" (
    "band_genre_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "band_id" UUID NOT NULL,
    "genre_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "band_genres_pkey" PRIMARY KEY ("band_genre_id")
);

-- CreateTable
CREATE TABLE "bands"."band_invite" (
    "invite_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "band_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "message" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),

    CONSTRAINT "band_invite_pkey" PRIMARY KEY ("invite_id")
);

-- CreateTable
CREATE TABLE "bands"."band_members" (
    "band_member_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "band_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT,
    "status" TEXT,
    "joined_at" TIMESTAMPTZ(6),
    "left_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,

    CONSTRAINT "band_members_pkey" PRIMARY KEY ("band_member_id")
);

-- CreateTable
CREATE TABLE "bands"."band_openings" (
    "opening_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "band_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "description" TEXT,
    "place_id" UUID,
    "status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "band_openings_pkey" PRIMARY KEY ("opening_id")
);

-- CreateTable
CREATE TABLE "bands"."bands" (
    "band_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "place_id" UUID,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bands_pkey" PRIMARY KEY ("band_id")
);

-- CreateTable
CREATE TABLE "bands"."opening_applications" (
    "application_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "opening_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "message" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_applications_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "bookings"."booking_status_history" (
    "history_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "status" TEXT,
    "changed_at" TIMESTAMPTZ(6),
    "changed_by" UUID,
    "note" TEXT,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("history_id")
);

-- CreateTable
CREATE TABLE "bookings"."bookings" (
    "booking_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT,
    "total_amount" DECIMAL(12,2),
    "notes" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reasons" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "bookings"."receipts" (
    "receipt_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "pdf_url" TEXT,
    "emailed_to_user_at" TIMESTAMPTZ(6),
    "emailed_to_owner_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("receipt_id")
);

-- CreateTable
CREATE TABLE "chat"."conversation_members" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT,
    "joined_at" TIMESTAMPTZ(6),
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "uq_conversation_members_conversation_id_user_id" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "chat"."conversations" (
    "conversation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_type" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateTable
CREATE TABLE "chat"."message_reads" (
    "message_read_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "message_reads_pkey" PRIMARY KEY ("message_read_id")
);

-- CreateTable
CREATE TABLE "chat"."messages" (
    "message_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "body" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "events"."event_attendees" (
    "event_attendee_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_attendees_pkey" PRIMARY KEY ("event_attendee_id")
);

-- CreateTable
CREATE TABLE "events"."event_band_attendance" (
    "event_id" UUID NOT NULL,
    "band_id" UUID NOT NULL,
    "status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_band_attendance_pkey" PRIMARY KEY ("event_id","band_id")
);

-- CreateTable
CREATE TABLE "events"."event_invites" (
    "invite_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),

    CONSTRAINT "event_invites_pkey" PRIMARY KEY ("invite_id")
);

-- CreateTable
CREATE TABLE "events"."events" (
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "host_user_id" UUID NOT NULL,
    "host_band_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "timezone" TEXT,
    "capacity" INTEGER,
    "visibility" TEXT,
    "place_id" UUID,
    "is_cancelled" BOOLEAN DEFAULT false,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "geo"."places" (
    "place_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geom" geometry,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT,
    "external_id" TEXT,

    CONSTRAINT "places_pkey" PRIMARY KEY ("place_id")
);

-- CreateTable
CREATE TABLE "media"."media" (
    "media_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "url" TEXT,
    "media_type" TEXT,
    "mime_type" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" INTEGER,
    "size_bytes" BIGINT,
    "provider" TEXT,
    "storage_key" TEXT,
    "original_filename" TEXT,
    "uploaded_by" UUID,
    "status" TEXT,
    "checksum_sha256" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("media_id")
);

-- CreateTable
CREATE TABLE "media"."message_attachments" (
    "message_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("message_id","media_id")
);

-- CreateTable
CREATE TABLE "media"."post_media" (
    "post_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "sort_order" INTEGER,

    CONSTRAINT "post_media_pkey" PRIMARY KEY ("post_id","media_id")
);

-- CreateTable
CREATE TABLE "media"."user_media" (
    "user_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "sort_order" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_media_pkey" PRIMARY KEY ("user_id","media_id","kind")
);

-- CreateTable
CREATE TABLE "music"."genres" (
    "genre_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "normalized_name" TEXT,
    "source" TEXT,
    "external_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("genre_id")
);

-- CreateTable
CREATE TABLE "music"."instrument" (
    "instrument_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "normalized_name" TEXT,
    "category" TEXT,
    "source" TEXT,
    "external_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instrument_pkey" PRIMARY KEY ("instrument_id")
);

-- CreateTable
CREATE TABLE "music"."musician_genre" (
    "musician_genre_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "genre_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "musician_genre_pkey" PRIMARY KEY ("musician_genre_id")
);

-- CreateTable
CREATE TABLE "music"."musician_instrument" (
    "musician_instrument_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "level" TEXT,
    "is_primary" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "musician_instrument_pkey" PRIMARY KEY ("musician_instrument_id")
);

-- CreateTable
CREATE TABLE "music"."musician_profile" (
    "musician_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "years_experience" INTEGER,
    "skill_summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "musician_profile_pkey" PRIMARY KEY ("musician_id")
);

-- CreateTable
CREATE TABLE "notifications"."email_outbox" (
    "email_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "to_email" CITEXT,
    "template" TEXT,
    "subject" TEXT,
    "payload" JSONB,
    "status" TEXT,
    "provider_message_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "error" TEXT,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("email_id")
);

-- CreateTable
CREATE TABLE "notifications"."notifications" (
    "notification_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "notification_type" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "notifications"."push_subscriptions" (
    "subscription_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "platform" TEXT,
    "token" TEXT,
    "device_id" UUID NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("subscription_id")
);

-- CreateTable
CREATE TABLE "payments"."payment_webhooks" (
    "payment_webhook_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "webhook_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "provider" TEXT,
    "event_type" TEXT,
    "payload" JSONB,
    "received_at" TIMESTAMPTZ(6),
    "processed_at" TIMESTAMPTZ(6),
    "processing_error" TEXT,

    CONSTRAINT "payment_webhooks_pkey" PRIMARY KEY ("payment_webhook_id")
);

-- CreateTable
CREATE TABLE "payments"."payments" (
    "payment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "provider" TEXT,
    "amount" DECIMAL(12,2),
    "currency" CHAR(3),
    "status" TEXT,
    "status_detail" TEXT,
    "mp_preference_id" UUID NOT NULL,
    "mp_payment_id" UUID NOT NULL,
    "mp_merchant_order_id" UUID NOT NULL,
    "external_reference" TEXT,
    "raw_last_response" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "payments"."refunds" (
    "refund_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "provider_refund_id" UUID NOT NULL,
    "amount" DECIMAL(12,2),
    "status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("refund_id")
);

-- CreateTable
CREATE TABLE "reviews"."reports" (
    "report_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_user_id" UUID NOT NULL,
    "target_type" TEXT,
    "target_id" UUID NOT NULL,
    "reason" TEXT,
    "details" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("report_id")
);

-- CreateTable
CREATE TABLE "reviews"."studio_reviews" (
    "studio_review_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studio_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" SMALLINT,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_reviews_pkey" PRIMARY KEY ("studio_review_id")
);

-- CreateTable
CREATE TABLE "reviews"."user_reviews" (
    "user_review_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_reviewed_id" UUID NOT NULL,
    "user_reviewer_id" UUID NOT NULL,
    "rating" SMALLINT,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reviews_pkey" PRIMARY KEY ("user_review_id")
);

-- CreateTable
CREATE TABLE "social"."blocks" (
    "block_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "blocker_user_id" UUID NOT NULL,
    "blocked_user_id" UUID NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("block_id")
);

-- CreateTable
CREATE TABLE "social"."follows" (
    "follower_user_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_user_id","target_type","target_id")
);

-- CreateTable
CREATE TABLE "social"."friend_requests" (
    "request_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "message" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),

    CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "social"."friendships" (
    "friendship_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id1" UUID NOT NULL,
    "user_id2" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("friendship_id")
);

-- CreateTable
CREATE TABLE "studios"."equipment" (
    "equipment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "category" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("equipment_id")
);

-- CreateTable
CREATE TABLE "studios"."rehearsal_rooms" (
    "room_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studio_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER,
    "base_hourly_price" DECIMAL(12,2),
    "min_booking_minutes" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rehearsal_rooms_pkey" PRIMARY KEY ("room_id")
);

-- CreateTable
CREATE TABLE "studios"."room_availability_rules" (
    "rule_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "day_of_week" SMALLINT,
    "start_time" TIME(6),
    "end_time" TIME(6),
    "timezone" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_availability_rules_pkey" PRIMARY KEY ("rule_id")
);

-- CreateTable
CREATE TABLE "studios"."room_blocks" (
    "block_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_blocks_pkey" PRIMARY KEY ("block_id")
);

-- CreateTable
CREATE TABLE "studios"."room_equipment" (
    "room_equipment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "quantity" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_equipment_pkey" PRIMARY KEY ("room_equipment_id")
);

-- CreateTable
CREATE TABLE "studios"."studios" (
    "studio_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "place_id" UUID,
    "phone" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studios_pkey" PRIMARY KEY ("studio_id")
);

-- CreateTable
CREATE TABLE "media"."room_media" (
    "room_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "sort_order" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_media_pkey" PRIMARY KEY ("room_id","media_id","kind")
);

-- CreateTable
CREATE TABLE "media"."studio_media" (
    "studio_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "sort_order" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_media_pkey" PRIMARY KEY ("studio_id","media_id","kind")
);

-- CreateTable
CREATE TABLE "media"."band_media" (
    "band_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "sort_order" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "band_media_pkey" PRIMARY KEY ("band_id","media_id","kind")
);

-- CreateTable
CREATE TABLE "media"."event_media" (
    "event_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "sort_order" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_media_pkey" PRIMARY KEY ("event_id","media_id","kind")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_verification_token_hash" ON "auth"."email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "ix_email_verif_tokens_consumed" ON "auth"."email_verification_tokens"("consumed_at");

-- CreateIndex
CREATE INDEX "ix_email_verif_tokens_expires" ON "auth"."email_verification_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "ix_email_verif_tokens_user_id" ON "auth"."email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "ix_oauth_accounts_user_id" ON "auth"."oauth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_user_id_provider_key" ON "auth"."oauth_accounts"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "uq_oauth_accounts_provider_provider_user_id" ON "auth"."oauth_accounts"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_oauth_accounts_user_id_provider" ON "auth"."oauth_accounts"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "uq_password_reset_token_hash" ON "auth"."password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "ix_pwreset_tokens_consumed" ON "auth"."password_reset_tokens"("consumed_at");

-- CreateIndex
CREATE INDEX "ix_pwreset_tokens_expires" ON "auth"."password_reset_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "ix_pwreset_tokens_user_id" ON "auth"."password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sessions_refresh_token_hash" ON "auth"."sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "ix_sessions_expires_at" ON "auth"."sessions"("expires_at");

-- CreateIndex
CREATE INDEX "ix_sessions_user_id" ON "auth"."sessions"("user_id");

-- CreateIndex
CREATE INDEX "ix_user_roles_role" ON "auth"."user_roles"("role");

-- CreateIndex
CREATE INDEX "ix_user_roles_user_id" ON "auth"."user_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_roles_user_id_role" ON "auth"."user_roles"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_key" ON "auth"."user_roles"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_email" ON "auth"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_username" ON "auth"."users"("username");

-- CreateIndex
CREATE INDEX "ix_users_place_id" ON "auth"."users"("place_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_band_genres_band_id_genre_id" ON "bands"."band_genres"("band_id", "genre_id");

-- CreateIndex
CREATE INDEX "ix_band_invite_band_id" ON "bands"."band_invite"("band_id");

-- CreateIndex
CREATE INDEX "ix_band_invite_to_user_id" ON "bands"."band_invite"("to_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_band_members_one_owner" ON "bands"."band_members"("band_id") WHERE ((role = 'owner'::text) AND (left_at IS NULL));

-- CreateIndex
CREATE INDEX "ix_band_members_band_id" ON "bands"."band_members"("band_id");

-- CreateIndex
CREATE INDEX "ix_band_members_status" ON "bands"."band_members"("status");

-- CreateIndex
CREATE INDEX "ix_band_members_user_id" ON "bands"."band_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_band_members_band_id_user_id" ON "bands"."band_members"("band_id", "user_id");

-- CreateIndex
CREATE INDEX "ix_band_openings_band_id" ON "bands"."band_openings"("band_id");

-- CreateIndex
CREATE INDEX "ix_band_openings_instrument_id" ON "bands"."band_openings"("instrument_id");

-- CreateIndex
CREATE INDEX "ix_band_openings_place_id" ON "bands"."band_openings"("place_id");

-- CreateIndex
CREATE INDEX "ix_bands_owner_user_id" ON "bands"."bands"("owner_user_id");

-- CreateIndex
CREATE INDEX "ix_bands_place_id" ON "bands"."bands"("place_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_opening_applications_one_accepted" ON "bands"."opening_applications"("opening_id") WHERE (status = 'Aceptada'::text);

-- CreateIndex
CREATE INDEX "ix_opening_applications_opening_id" ON "bands"."opening_applications"("opening_id");

-- CreateIndex
CREATE INDEX "ix_opening_applications_user_id" ON "bands"."opening_applications"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_opening_applications_opening_id_user_id" ON "bands"."opening_applications"("opening_id", "user_id");

-- CreateIndex
CREATE INDEX "ix_booking_status_history_booking_id_changed_at" ON "bookings"."booking_status_history"("booking_id", "changed_at");

-- CreateIndex
CREATE INDEX "ix_bookings_room_id_starts_at" ON "bookings"."bookings"("room_id", "starts_at");

-- CreateIndex
CREATE INDEX "ix_bookings_room_time" ON "bookings"."bookings"("room_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "ix_bookings_status" ON "bookings"."bookings"("status");

-- CreateIndex
CREATE INDEX "ix_bookings_user_id_starts_at" ON "bookings"."bookings"("user_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_receipts_booking_id" ON "bookings"."receipts"("booking_id");

-- CreateIndex
CREATE INDEX "ix_conversation_members_user_id" ON "chat"."conversation_members"("user_id");

-- CreateIndex
CREATE INDEX "ix_conversations_conversation_type_created_at" ON "chat"."conversations"("conversation_type", "created_at");

-- CreateIndex
CREATE INDEX "ix_message_reads_user_id_read_at" ON "chat"."message_reads"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_message_reads_message_id_user_id" ON "chat"."message_reads"("message_id", "user_id");

-- CreateIndex
CREATE INDEX "ix_messages_conversation_id_created_at" ON "chat"."messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_messages_sender_user_id_created_at" ON "chat"."messages"("sender_user_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_event_attendees_user_id" ON "events"."event_attendees"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_event_attendees_event_id_user_id" ON "events"."event_attendees"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "ix_event_band_attendance_band_id" ON "events"."event_band_attendance"("band_id");

-- CreateIndex
CREATE INDEX "ix_event_invites_to_user_id" ON "events"."event_invites"("to_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_event_invites_event_id_to_user_id" ON "events"."event_invites"("event_id", "to_user_id");

-- CreateIndex
CREATE INDEX "ix_events_host_band_id" ON "events"."events"("host_band_id");

-- CreateIndex
CREATE INDEX "ix_events_host_user_id" ON "events"."events"("host_user_id");

-- CreateIndex
CREATE INDEX "ix_events_place_id_starts_at" ON "events"."events"("place_id", "starts_at");

-- CreateIndex
CREATE INDEX "ix_places_city_region" ON "geo"."places"("city", "region");

-- CreateIndex
CREATE INDEX "ix_places_country" ON "geo"."places"("country");

-- CreateIndex
CREATE INDEX "ix_places_geom" ON "geo"."places" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "ix_places_geom_gist" ON "geo"."places" USING GIST ("geom");

-- CreateIndex
CREATE UNIQUE INDEX "uq_places_provider_external_id" ON "geo"."places"("provider", "external_id") WHERE ((provider IS NOT NULL) AND (external_id IS NOT NULL));

-- CreateIndex
CREATE INDEX "ix_message_attachments_message_id" ON "media"."message_attachments"("message_id");

-- CreateIndex
CREATE INDEX "ix_post_media_post_id" ON "media"."post_media"("post_id");

-- CreateIndex
CREATE INDEX "ix_user_media_media_id" ON "media"."user_media"("media_id");

-- CreateIndex
CREATE INDEX "ix_user_media_user_id" ON "media"."user_media"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_genres_normalized_name" ON "music"."genres"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_instrument_normalized_name" ON "music"."instrument"("normalized_name");

-- CreateIndex
CREATE INDEX "ix_instrument_category" ON "music"."instrument"("category");

-- CreateIndex
CREATE INDEX "ix_musician_genre_genre_id" ON "music"."musician_genre"("genre_id");

-- CreateIndex
CREATE INDEX "ix_musician_genre_user_id" ON "music"."musician_genre"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_musician_genre_user_id_genre_id" ON "music"."musician_genre"("user_id", "genre_id");

-- CreateIndex
CREATE INDEX "ix_musician_instrument_instrument_id" ON "music"."musician_instrument"("instrument_id");

-- CreateIndex
CREATE INDEX "ix_musician_instrument_user_id" ON "music"."musician_instrument"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_musician_instrument_user_id_instrument_id" ON "music"."musician_instrument"("user_id", "instrument_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_musician_profile_user_id" ON "music"."musician_profile"("user_id");

-- CreateIndex
CREATE INDEX "ix_email_outbox_status_created_at" ON "notifications"."email_outbox"("status", "created_at");

-- CreateIndex
CREATE INDEX "ix_email_outbox_to_email" ON "notifications"."email_outbox"("to_email");

-- CreateIndex
CREATE INDEX "ix_notifications_user_id" ON "notifications"."notifications"("user_id") WHERE (read_at IS NULL);

-- CreateIndex
CREATE INDEX "ix_notifications_user_id_created_at" ON "notifications"."notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_push_subscriptions_user_id" ON "notifications"."push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_push_subscriptions_platform_token" ON "notifications"."push_subscriptions"("platform", "token");

-- CreateIndex
CREATE INDEX "ix_payment_webhooks_payment_id_received_at" ON "payments"."payment_webhooks"("payment_id", "received_at");

-- CreateIndex
CREATE INDEX "ix_payments_booking_id" ON "payments"."payments"("booking_id");

-- CreateIndex
CREATE INDEX "ix_payments_provider" ON "payments"."payments"("provider");

-- CreateIndex
CREATE INDEX "ix_payments_status" ON "payments"."payments"("status");

-- CreateIndex
CREATE INDEX "ix_refunds_payment_id" ON "payments"."refunds"("payment_id");

-- CreateIndex
CREATE INDEX "ix_reports_status_created_at" ON "reviews"."reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "ix_reports_target_type_target_id" ON "reviews"."reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "ix_studio_reviews_studio_id" ON "reviews"."studio_reviews"("studio_id");

-- CreateIndex
CREATE INDEX "ix_studio_reviews_user_id" ON "reviews"."studio_reviews"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_studio_reviews_studio_id_user_id" ON "reviews"."studio_reviews"("studio_id", "user_id");

-- CreateIndex
CREATE INDEX "ix_user_reviews_user_reviewed_id" ON "reviews"."user_reviews"("user_reviewed_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_reviews_user_reviewed_id_user_reviewer_id" ON "reviews"."user_reviews"("user_reviewed_id", "user_reviewer_id");

-- CreateIndex
CREATE INDEX "ix_blocks_blocked_user_id" ON "social"."blocks"("blocked_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_blocks_blocker_user_id_blocked_user_id" ON "social"."blocks"("blocker_user_id", "blocked_user_id");

-- CreateIndex
CREATE INDEX "ix_follows_target_type_target_id" ON "social"."follows"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "ix_friend_requests_from_user_id" ON "social"."friend_requests"("from_user_id");

-- CreateIndex
CREATE INDEX "ix_friend_requests_to_user_id_status" ON "social"."friend_requests"("to_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_friend_requests_from_user_id_to_user_id" ON "social"."friend_requests"("from_user_id", "to_user_id");

-- CreateIndex
CREATE INDEX "ix_friendships_user_id1" ON "social"."friendships"("user_id1");

-- CreateIndex
CREATE INDEX "ix_friendships_user_id2" ON "social"."friendships"("user_id2");

-- CreateIndex
CREATE UNIQUE INDEX "uq_friendships_user_id1_user_id2" ON "social"."friendships"("user_id1", "user_id2");

-- CreateIndex
CREATE INDEX "ix_rehearsal_rooms_studio_id" ON "studios"."rehearsal_rooms"("studio_id");

-- CreateIndex
CREATE INDEX "ix_room_availability_rules_room_id_day_of_week" ON "studios"."room_availability_rules"("room_id", "day_of_week");

-- CreateIndex
CREATE INDEX "ix_room_blocks_room_id_starts_at" ON "studios"."room_blocks"("room_id", "starts_at");

-- CreateIndex
CREATE INDEX "ix_room_blocks_room_time" ON "studios"."room_blocks"("room_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "ix_room_equipment_room_id" ON "studios"."room_equipment"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_room_equipment_room_id_equipment_id" ON "studios"."room_equipment"("room_id", "equipment_id");

-- CreateIndex
CREATE INDEX "ix_studios_owner_user_id" ON "studios"."studios"("owner_user_id");

-- CreateIndex
CREATE INDEX "ix_studios_place_id" ON "studios"."studios"("place_id");

-- CreateIndex
CREATE INDEX "room_media_room_id_idx" ON "media"."room_media"("room_id");

-- CreateIndex
CREATE INDEX "room_media_media_id_idx" ON "media"."room_media"("media_id");

-- CreateIndex
CREATE INDEX "studio_media_studio_id_idx" ON "media"."studio_media"("studio_id");

-- CreateIndex
CREATE INDEX "studio_media_media_id_idx" ON "media"."studio_media"("media_id");

-- CreateIndex
CREATE INDEX "band_media_band_id_idx" ON "media"."band_media"("band_id");

-- CreateIndex
CREATE INDEX "band_media_media_id_idx" ON "media"."band_media"("media_id");

-- CreateIndex
CREATE INDEX "event_media_event_id_idx" ON "media"."event_media"("event_id");

-- CreateIndex
CREATE INDEX "event_media_media_id_idx" ON "media"."event_media"("media_id");

-- AddForeignKey
ALTER TABLE "auth"."email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."oauth_accounts" ADD CONSTRAINT "fk_oauth_accounts_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "fk_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."user_roles" ADD CONSTRAINT "fk_user_roles_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."users" ADD CONSTRAINT "fk_users_place_id" FOREIGN KEY ("place_id") REFERENCES "geo"."places"("place_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."band_genres" ADD CONSTRAINT "fk_band_genres_band_id" FOREIGN KEY ("band_id") REFERENCES "bands"."bands"("band_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."band_genres" ADD CONSTRAINT "fk_band_genres_genre_id" FOREIGN KEY ("genre_id") REFERENCES "music"."genres"("genre_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."band_invite" ADD CONSTRAINT "fk_band_invite_band_id" FOREIGN KEY ("band_id") REFERENCES "bands"."bands"("band_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."band_invite" ADD CONSTRAINT "fk_band_invite_from_user_id" FOREIGN KEY ("from_user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."band_invite" ADD CONSTRAINT "fk_band_invite_to_user_id" FOREIGN KEY ("to_user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."band_members" ADD CONSTRAINT "fk_band_members_band_id" FOREIGN KEY ("band_id") REFERENCES "bands"."bands"("band_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."band_members" ADD CONSTRAINT "fk_band_members_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."band_openings" ADD CONSTRAINT "fk_band_openings_band_id" FOREIGN KEY ("band_id") REFERENCES "bands"."bands"("band_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."band_openings" ADD CONSTRAINT "fk_band_openings_instrument_id" FOREIGN KEY ("instrument_id") REFERENCES "music"."instrument"("instrument_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."band_openings" ADD CONSTRAINT "fk_band_openings_place_id" FOREIGN KEY ("place_id") REFERENCES "geo"."places"("place_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."bands" ADD CONSTRAINT "fk_bands_owner_user_id" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("user_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."bands" ADD CONSTRAINT "fk_bands_place_id" FOREIGN KEY ("place_id") REFERENCES "geo"."places"("place_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."opening_applications" ADD CONSTRAINT "fk_opening_applications_opening_id" FOREIGN KEY ("opening_id") REFERENCES "bands"."band_openings"("opening_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bands"."opening_applications" ADD CONSTRAINT "fk_opening_applications_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings"."booking_status_history" ADD CONSTRAINT "fk_booking_status_history_booking_id" FOREIGN KEY ("booking_id") REFERENCES "bookings"."bookings"("booking_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings"."booking_status_history" ADD CONSTRAINT "fk_booking_status_history_changed_by" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings"."bookings" ADD CONSTRAINT "fk_bookings_room_id" FOREIGN KEY ("room_id") REFERENCES "studios"."rehearsal_rooms"("room_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings"."bookings" ADD CONSTRAINT "fk_bookings_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bookings"."receipts" ADD CONSTRAINT "fk_receipts_booking_id" FOREIGN KEY ("booking_id") REFERENCES "bookings"."bookings"("booking_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat"."conversation_members" ADD CONSTRAINT "fk_conversation_members_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "chat"."conversations"("conversation_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat"."conversation_members" ADD CONSTRAINT "fk_conversation_members_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat"."message_reads" ADD CONSTRAINT "fk_message_reads_message_id" FOREIGN KEY ("message_id") REFERENCES "chat"."messages"("message_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat"."message_reads" ADD CONSTRAINT "fk_message_reads_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat"."messages" ADD CONSTRAINT "fk_messages_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "chat"."conversations"("conversation_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat"."messages" ADD CONSTRAINT "fk_messages_sender_user_id" FOREIGN KEY ("sender_user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events"."event_attendees" ADD CONSTRAINT "fk_event_attendees_event_id" FOREIGN KEY ("event_id") REFERENCES "events"."events"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events"."event_attendees" ADD CONSTRAINT "fk_event_attendees_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events"."event_band_attendance" ADD CONSTRAINT "fk_event_band_attendance_band_id" FOREIGN KEY ("band_id") REFERENCES "bands"."bands"("band_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events"."event_band_attendance" ADD CONSTRAINT "fk_event_band_attendance_event_id" FOREIGN KEY ("event_id") REFERENCES "events"."events"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events"."event_invites" ADD CONSTRAINT "fk_event_invites_event_id" FOREIGN KEY ("event_id") REFERENCES "events"."events"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events"."event_invites" ADD CONSTRAINT "fk_event_invites_from_user_id" FOREIGN KEY ("from_user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events"."event_invites" ADD CONSTRAINT "fk_event_invites_to_user_id" FOREIGN KEY ("to_user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events"."events" ADD CONSTRAINT "fk_events_host_band_id" FOREIGN KEY ("host_band_id") REFERENCES "bands"."bands"("band_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events"."events" ADD CONSTRAINT "fk_events_host_user_id" FOREIGN KEY ("host_user_id") REFERENCES "auth"."users"("user_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "events"."events" ADD CONSTRAINT "fk_events_place_id" FOREIGN KEY ("place_id") REFERENCES "geo"."places"("place_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."message_attachments" ADD CONSTRAINT "fk_message_attachments_media_id" FOREIGN KEY ("media_id") REFERENCES "media"."media"("media_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."message_attachments" ADD CONSTRAINT "fk_message_attachments_message_id" FOREIGN KEY ("message_id") REFERENCES "chat"."messages"("message_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."post_media" ADD CONSTRAINT "fk_post_media_media_id" FOREIGN KEY ("media_id") REFERENCES "media"."media"("media_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."user_media" ADD CONSTRAINT "fk_user_media_media_id" FOREIGN KEY ("media_id") REFERENCES "media"."media"("media_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."user_media" ADD CONSTRAINT "fk_user_media_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "music"."musician_genre" ADD CONSTRAINT "fk_musician_genre_genre_id" FOREIGN KEY ("genre_id") REFERENCES "music"."genres"("genre_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "music"."musician_genre" ADD CONSTRAINT "fk_musician_genre_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "music"."musician_instrument" ADD CONSTRAINT "fk_musician_instrument_instrument_id" FOREIGN KEY ("instrument_id") REFERENCES "music"."instrument"("instrument_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "music"."musician_instrument" ADD CONSTRAINT "fk_musician_instrument_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "music"."musician_profile" ADD CONSTRAINT "fk_musician_profile_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications"."email_outbox" ADD CONSTRAINT "fk_email_outbox_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications"."notifications" ADD CONSTRAINT "fk_notifications_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications"."push_subscriptions" ADD CONSTRAINT "fk_push_subscriptions_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments"."payment_webhooks" ADD CONSTRAINT "fk_payment_webhooks_payment_id" FOREIGN KEY ("payment_id") REFERENCES "payments"."payments"("payment_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments"."payments" ADD CONSTRAINT "fk_payments_booking_id" FOREIGN KEY ("booking_id") REFERENCES "bookings"."bookings"("booking_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payments"."refunds" ADD CONSTRAINT "fk_refunds_payment_id" FOREIGN KEY ("payment_id") REFERENCES "payments"."payments"("payment_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews"."reports" ADD CONSTRAINT "fk_reports_reporter_user_id" FOREIGN KEY ("reporter_user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews"."reports" ADD CONSTRAINT "fk_reports_resolved_by" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews"."studio_reviews" ADD CONSTRAINT "fk_studio_reviews_studio_id" FOREIGN KEY ("studio_id") REFERENCES "studios"."studios"("studio_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews"."studio_reviews" ADD CONSTRAINT "fk_studio_reviews_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews"."user_reviews" ADD CONSTRAINT "fk_user_reviews_user_reviewed_id" FOREIGN KEY ("user_reviewed_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews"."user_reviews" ADD CONSTRAINT "fk_user_reviews_user_reviewer_id" FOREIGN KEY ("user_reviewer_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "social"."blocks" ADD CONSTRAINT "fk_blocks_blocked_user_id" FOREIGN KEY ("blocked_user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "social"."blocks" ADD CONSTRAINT "fk_blocks_blocker_user_id" FOREIGN KEY ("blocker_user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "social"."follows" ADD CONSTRAINT "fk_follows_follower_user_id" FOREIGN KEY ("follower_user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "social"."friend_requests" ADD CONSTRAINT "fk_friend_requests_from_user_id" FOREIGN KEY ("from_user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "social"."friend_requests" ADD CONSTRAINT "fk_friend_requests_to_user_id" FOREIGN KEY ("to_user_id") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "social"."friendships" ADD CONSTRAINT "fk_friendships_user_id1" FOREIGN KEY ("user_id1") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "social"."friendships" ADD CONSTRAINT "fk_friendships_user_id2" FOREIGN KEY ("user_id2") REFERENCES "auth"."users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "studios"."rehearsal_rooms" ADD CONSTRAINT "fk_rehearsal_rooms_studio_id" FOREIGN KEY ("studio_id") REFERENCES "studios"."studios"("studio_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "studios"."room_availability_rules" ADD CONSTRAINT "fk_room_availability_rules_room_id" FOREIGN KEY ("room_id") REFERENCES "studios"."rehearsal_rooms"("room_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "studios"."room_blocks" ADD CONSTRAINT "fk_room_blocks_created_by" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "studios"."room_blocks" ADD CONSTRAINT "fk_room_blocks_room_id" FOREIGN KEY ("room_id") REFERENCES "studios"."rehearsal_rooms"("room_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "studios"."room_equipment" ADD CONSTRAINT "fk_room_equipment_equipment_id" FOREIGN KEY ("equipment_id") REFERENCES "studios"."equipment"("equipment_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "studios"."room_equipment" ADD CONSTRAINT "fk_room_equipment_room_id" FOREIGN KEY ("room_id") REFERENCES "studios"."rehearsal_rooms"("room_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "studios"."studios" ADD CONSTRAINT "fk_studios_owner_user_id" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("user_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "studios"."studios" ADD CONSTRAINT "fk_studios_place_id" FOREIGN KEY ("place_id") REFERENCES "geo"."places"("place_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."room_media" ADD CONSTRAINT "room_media_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "studios"."rehearsal_rooms"("room_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."room_media" ADD CONSTRAINT "room_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"."media"("media_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."studio_media" ADD CONSTRAINT "studio_media_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studios"."studios"("studio_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."studio_media" ADD CONSTRAINT "studio_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"."media"("media_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."band_media" ADD CONSTRAINT "band_media_band_id_fkey" FOREIGN KEY ("band_id") REFERENCES "bands"."bands"("band_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."band_media" ADD CONSTRAINT "band_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"."media"("media_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."event_media" ADD CONSTRAINT "event_media_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"."events"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "media"."event_media" ADD CONSTRAINT "event_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"."media"("media_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- CreateEnum
CREATE TYPE "staff_token_purpose" AS ENUM ('setup', 'reset', 'mfa_challenge');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('in_app', 'email', 'sms');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('queued', 'sending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "stored_file_kind" AS ENUM ('media', 'report');

-- CreateEnum
CREATE TYPE "stored_file_status" AS ENUM ('committed', 'pending_deletion');

-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('photo', 'document', 'voice', 'tts_audio');

-- AlterTable
ALTER TABLE "report" ADD COLUMN     "report_file_id" UUID;

-- AlterTable
ALTER TABLE "staff_credential" ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "staff_token" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "purpose" "staff_token_purpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "staff_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_mfa" (
    "user_id" UUID NOT NULL,
    "secret_ciphertext" TEXT NOT NULL,
    "enabled_at" TIMESTAMPTZ(6),
    "last_used_step" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_mfa_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_key" TEXT NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "template_version" INTEGER NOT NULL DEFAULT 1,
    "recipient_user_id" UUID NOT NULL,
    "recipient_address" TEXT,
    "title" TEXT NOT NULL,
    "rendered_body" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "workspace_id" UUID,
    "dedupe_key" TEXT NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'queued',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),
    "provider_message_id" TEXT,
    "last_error_code" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_attempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "outcome" TEXT,
    "provider_response_code" TEXT,

    CONSTRAINT "notification_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_file" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "kind" "stored_file_kind" NOT NULL,
    "storage_backend" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "status" "stored_file_status" NOT NULL DEFAULT 'committed',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "media_type" "media_type" NOT NULL,
    "original_filename" TEXT,
    "uploaded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_token_token_hash_key" ON "staff_token"("token_hash");

-- CreateIndex
CREATE INDEX "staff_token_user_id_purpose_idx" ON "staff_token"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "staff_token_expires_at_idx" ON "staff_token"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_dedupe_key_key" ON "notification"("dedupe_key");

-- CreateIndex
CREATE INDEX "notification_recipient_user_id_channel_created_at_idx" ON "notification"("recipient_user_id", "channel", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_attempt_notification_id_attempt_no_key" ON "notification_attempt"("notification_id", "attempt_no");

-- CreateIndex
CREATE UNIQUE INDEX "stored_file_storage_key_key" ON "stored_file"("storage_key");

-- CreateIndex
CREATE INDEX "stored_file_workspace_id_kind_idx" ON "stored_file"("workspace_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "stored_file_id_workspace_id_key" ON "stored_file"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "media_item_workspace_id_created_at_idx" ON "media_item"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_item_id_workspace_id_key" ON "media_item"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_item_file_id_workspace_id_key" ON "media_item"("file_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_report_file_id_workspace_id_key" ON "report"("report_file_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_report_file_id_workspace_id_fkey" FOREIGN KEY ("report_file_id", "workspace_id") REFERENCES "stored_file"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_token" ADD CONSTRAINT "staff_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_mfa" ADD CONSTRAINT "staff_mfa_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_attempt" ADD CONSTRAINT "notification_attempt_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "family_workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_item" ADD CONSTRAINT "media_item_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "family_workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_item" ADD CONSTRAINT "media_item_file_id_workspace_id_fkey" FOREIGN KEY ("file_id", "workspace_id") REFERENCES "stored_file"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Guards Prisma's schema language cannot express (TASK-10).
-- ---------------------------------------------------------------------------------------------

-- Staff tokens: at most one unused token per user and purpose; issuing a new one marks the old
-- one used in the same transaction.
CREATE UNIQUE INDEX "staff_token_one_open_per_purpose" ON "staff_token"("user_id", "purpose") WHERE "used_at" IS NULL;
ALTER TABLE "staff_token"
    ADD CONSTRAINT "staff_token_attempt_count_check" CHECK ("attempt_count" >= 0),
    ADD CONSTRAINT "staff_token_expiry_check" CHECK ("expires_at" > "created_at"),
    ADD CONSTRAINT "staff_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "staff_mfa"
    ADD CONSTRAINT "staff_mfa_secret_check" CHECK ("secret_ciphertext" LIKE 'v1:%' AND char_length("secret_ciphertext") <= 400);

-- Notifications: in-app records carry no address and are the only ones that can be read; the
-- lease is set exactly while a record is being sent (DM §9.3, §10.3).
ALTER TABLE "notification"
    ADD CONSTRAINT "notification_title_check" CHECK (btrim("title") <> '' AND char_length("title") <= 200),
    ADD CONSTRAINT "notification_body_check" CHECK (char_length("rendered_body") <= 2000),
    ADD CONSTRAINT "notification_event_key_check" CHECK ("event_key" ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
    ADD CONSTRAINT "notification_address_check" CHECK (("channel" = 'in_app') = ("recipient_address" IS NULL)),
    ADD CONSTRAINT "notification_read_check" CHECK ("read_at" IS NULL OR "channel" = 'in_app'),
    ADD CONSTRAINT "notification_lease_check" CHECK (
        ("status" = 'sending') = ("lease_token" IS NOT NULL) AND ("lease_token" IS NULL) = ("lease_expires_at" IS NULL)),
    ADD CONSTRAINT "notification_attempt_count_check" CHECK ("attempt_count" >= 0);
CREATE INDEX "notification_unread_in_app" ON "notification"("recipient_user_id", "created_at") WHERE "channel" = 'in_app' AND "read_at" IS NULL;
CREATE INDEX "notification_due_for_dispatch" ON "notification"("next_attempt_at") WHERE "status" = 'queued' AND "channel" <> 'in_app';
CREATE INDEX "notification_lease_expiry" ON "notification"("lease_expires_at") WHERE "status" = 'sending';

-- Files: sizes and checksums are always real; names are display-only and bounded.
ALTER TABLE "stored_file"
    ADD CONSTRAINT "stored_file_size_check" CHECK ("byte_size" > 0),
    ADD CONSTRAINT "stored_file_checksum_check" CHECK ("checksum_sha256" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "stored_file_key_check" CHECK ("storage_key" ~ '^[a-z0-9/_-]{8,200}$'),
    ADD CONSTRAINT "stored_file_backend_check" CHECK ("storage_backend" ~ '^[a-z][a-z0-9_]{1,30}$'),
    ADD CONSTRAINT "stored_file_content_type_check" CHECK ("content_type" ~ '^[a-z]+/[a-z0-9.+-]+$');
CREATE INDEX "stored_file_pending_deletion" ON "stored_file"("updated_at") WHERE "status" = 'pending_deletion';
ALTER TABLE "media_item"
    ADD CONSTRAINT "media_item_filename_check" CHECK ("original_filename" IS NULL OR char_length("original_filename") <= 255);

-- Member search (F-FAM-04) is a case-insensitive substring match within one workspace. A trigram
-- index keeps it fast as families grow. pg_trgm is a trusted extension (PostgreSQL 13+), so the
-- database owner can create it without superuser rights.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "member_display_name_trgm" ON "member" USING gin ("display_name" gin_trgm_ops);

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('customer', 'genealogist', 'admin');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'deactivated');

-- CreateEnum
CREATE TYPE "session_revoke_reason" AS ENUM ('logout', 'expired', 'deactivated', 'admin_action');

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "user_role" NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "status_changed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profile" (
    "user_id" UUID NOT NULL,
    "mobile_number" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" "session_revoke_reason",

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mobile_number" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(6),
    "invalidated_at" TIMESTAMPTZ(6),

    CONSTRAINT "otp_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "bucket_key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("bucket_key")
);

-- CreateTable
CREATE TABLE "auth_lockout" (
    "subject_key" TEXT NOT NULL,
    "locked_until" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_lockout_pkey" PRIMARY KEY ("subject_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_profile_mobile_number_key" ON "customer_profile"("mobile_number");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE INDEX "otp_challenge_mobile_number_created_at_idx" ON "otp_challenge"("mobile_number", "created_at");

-- CreateIndex
CREATE INDEX "otp_challenge_expires_at_idx" ON "otp_challenge"("expires_at");

-- CreateIndex
CREATE INDEX "rate_limit_bucket_expires_at_idx" ON "rate_limit_bucket"("expires_at");

-- AddForeignKey
ALTER TABLE "customer_profile" ADD CONSTRAINT "customer_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level guards that Prisma's schema language cannot express (DM §4.2, §5.4, §5.5).

-- At most one open challenge per number. A new request invalidates the old one first, in the
-- same transaction; two concurrent requests collide here and the loser is told to retry.
CREATE UNIQUE INDEX "otp_challenge_one_open_per_number" ON "otp_challenge"("mobile_number")
    WHERE "consumed_at" IS NULL AND "invalidated_at" IS NULL;

ALTER TABLE "otp_challenge"
    ADD CONSTRAINT "otp_challenge_attempt_count_check" CHECK ("attempt_count" >= 0),
    ADD CONSTRAINT "otp_challenge_expiry_check" CHECK ("expires_at" > "created_at"),
    ADD CONSTRAINT "otp_challenge_mobile_number_check" CHECK ("mobile_number" ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE "customer_profile"
    ADD CONSTRAINT "customer_profile_mobile_number_check" CHECK ("mobile_number" ~ '^\+[1-9][0-9]{6,14}$');

-- A revoked session always records why, and an unrevoked one has no reason.
ALTER TABLE "session"
    ADD CONSTRAINT "session_expiry_check" CHECK ("expires_at" > "created_at"),
    ADD CONSTRAINT "session_revocation_check" CHECK (("revoked_at" IS NULL) = ("revoke_reason" IS NULL));

ALTER TABLE "rate_limit_bucket"
    ADD CONSTRAINT "rate_limit_bucket_count_check" CHECK ("count" >= 1),
    ADD CONSTRAINT "rate_limit_bucket_window_check" CHECK ("expires_at" > "window_start");

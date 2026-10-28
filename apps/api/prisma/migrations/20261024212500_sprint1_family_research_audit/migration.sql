-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('draft', 'submitted', 'returned', 'released');

-- CreateEnum
CREATE TYPE "audit_outcome" AS ENUM ('success', 'failure');

-- AlterTable
ALTER TABLE "customer_profile" ADD COLUMN     "display_name" TEXT;

-- CreateTable
CREATE TABLE "staff_profile" (
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_profile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "staff_credential" (
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_credential_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "family_workspace" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "member_a_id" UUID NOT NULL,
    "member_b_id" UUID NOT NULL,
    "relationship_type" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "genealogist_user_id" UUID NOT NULL,
    "assigned_by_user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(6),
    "removed_by_user_id" UUID,

    CONSTRAINT "assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "status" "report_status" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMPTZ(6),
    "returned_at" TIMESTAMPTZ(6),
    "returned_by_user_id" UUID,
    "return_reason" TEXT,
    "released_at" TIMESTAMPTZ(6),
    "released_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "actor_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "workspace_id" UUID,
    "outcome" "audit_outcome" NOT NULL,
    "details" JSONB,
    "request_id" TEXT,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_credential_email_key" ON "staff_credential"("email");

-- CreateIndex
CREATE UNIQUE INDEX "family_workspace_owner_user_id_key" ON "family_workspace"("owner_user_id");

-- CreateIndex
CREATE INDEX "member_workspace_id_display_name_idx" ON "member"("workspace_id", "display_name");

-- CreateIndex
CREATE UNIQUE INDEX "member_id_workspace_id_key" ON "member"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "relationship_workspace_id_member_b_id_idx" ON "relationship"("workspace_id", "member_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "relationship_workspace_id_member_a_id_member_b_id_relations_key" ON "relationship"("workspace_id", "member_a_id", "member_b_id", "relationship_type");

-- CreateIndex
CREATE INDEX "assignment_workspace_id_idx" ON "assignment"("workspace_id");

-- CreateIndex
CREATE INDEX "research_record_workspace_id_created_at_idx" ON "research_record"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "research_record_id_workspace_id_key" ON "research_record"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "report_workspace_id_status_idx" ON "report"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "report_status_submitted_at_idx" ON "report"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "audit_event_occurred_at_idx" ON "audit_event"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_event_action_occurred_at_idx" ON "audit_event"("action", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_event_actor_user_id_occurred_at_idx" ON "audit_event"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "auth_lockout_locked_until_idx" ON "auth_lockout"("locked_until");

-- AddForeignKey
ALTER TABLE "staff_profile" ADD CONSTRAINT "staff_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_credential" ADD CONSTRAINT "staff_credential_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_workspace" ADD CONSTRAINT "family_workspace_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "family_workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "family_workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_member_a_id_workspace_id_fkey" FOREIGN KEY ("member_a_id", "workspace_id") REFERENCES "member"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_member_b_id_workspace_id_fkey" FOREIGN KEY ("member_b_id", "workspace_id") REFERENCES "member"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "family_workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_genealogist_user_id_fkey" FOREIGN KEY ("genealogist_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_record" ADD CONSTRAINT "research_record_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "family_workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "family_workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Database-level guards that Prisma's schema language cannot express. Limits match the API's
-- validation. Text limits are provisional until the field decisions (R8, R17, R31) are made.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "customer_profile"
    ADD CONSTRAINT "customer_profile_display_name_check"
    CHECK ("display_name" IS NULL OR (btrim("display_name") <> '' AND char_length("display_name") <= 80));

ALTER TABLE "staff_profile"
    ADD CONSTRAINT "staff_profile_display_name_check" CHECK (btrim("display_name") <> '' AND char_length("display_name") <= 120);

-- Emails are stored lower-case so the unique index is case-insensitive in practice.
ALTER TABLE "staff_credential"
    ADD CONSTRAINT "staff_credential_email_check"
        CHECK ("email" = lower("email") AND char_length("email") <= 254 AND "email" ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
    ADD CONSTRAINT "staff_credential_password_hash_check" CHECK ("password_hash" LIKE 'scrypt$%');

ALTER TABLE "family_workspace"
    ADD CONSTRAINT "family_workspace_name_check" CHECK (btrim("name") <> '' AND char_length("name") <= 120);

ALTER TABLE "member"
    ADD CONSTRAINT "member_display_name_check" CHECK (btrim("display_name") <> '' AND char_length("display_name") <= 120),
    ADD CONSTRAINT "member_version_check" CHECK ("version" >= 1);

-- No self-relationships; only the provisional types; symmetric types in canonical order, so a
-- duplicate in the other direction hits the unique index.
ALTER TABLE "relationship"
    ADD CONSTRAINT "relationship_not_self_check" CHECK ("member_a_id" <> "member_b_id"),
    ADD CONSTRAINT "relationship_type_check" CHECK ("relationship_type" IN ('parent_of', 'spouse_of')),
    ADD CONSTRAINT "relationship_symmetric_order_check" CHECK ("relationship_type" <> 'spouse_of' OR "member_a_id" < "member_b_id");

-- R29 default: one active genealogist per family. Dropping this index later is non-destructive.
CREATE UNIQUE INDEX "assignment_one_active_per_workspace" ON "assignment"("workspace_id") WHERE "removed_at" IS NULL;
CREATE INDEX "assignment_active_by_genealogist" ON "assignment"("genealogist_user_id", "assigned_at") WHERE "removed_at" IS NULL;
ALTER TABLE "assignment"
    ADD CONSTRAINT "assignment_removal_check" CHECK (("removed_at" IS NULL) = ("removed_by_user_id" IS NULL));

ALTER TABLE "research_record"
    ADD CONSTRAINT "research_record_kind_check" CHECK ("kind" IN ('note', 'source')),
    ADD CONSTRAINT "research_record_body_check" CHECK (btrim("body") <> '' AND char_length("body") <= 5000),
    ADD CONSTRAINT "research_record_version_check" CHECK ("version" >= 1);

ALTER TABLE "report"
    ADD CONSTRAINT "report_title_check" CHECK (btrim("title") <> '' AND char_length("title") <= 200),
    ADD CONSTRAINT "report_body_check" CHECK (char_length("body") <= 20000),
    ADD CONSTRAINT "report_version_check" CHECK ("version" >= 1),
    -- DM §8.4: released_at is set if and only if the report is released.
    ADD CONSTRAINT "report_released_check"
        CHECK (("status" = 'released') = ("released_at" IS NOT NULL AND "released_by_user_id" IS NOT NULL)),
    ADD CONSTRAINT "report_submitted_check" CHECK ("status" NOT IN ('submitted', 'released') OR "submitted_at" IS NOT NULL),
    ADD CONSTRAINT "report_returned_check"
        CHECK ("status" <> 'returned' OR ("returned_at" IS NOT NULL AND "returned_by_user_id" IS NOT NULL AND "return_reason" IS NOT NULL));

ALTER TABLE "audit_event"
    ADD CONSTRAINT "audit_event_action_check" CHECK ("action" ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$' AND char_length("action") <= 80),
    ADD CONSTRAINT "audit_event_target_check" CHECK (char_length("target_type") <= 40 AND char_length("target_id") <= 80),
    ADD CONSTRAINT "audit_event_actor_role_check" CHECK ("actor_role" IN ('customer', 'genealogist', 'admin', 'system', 'anonymous'));

-- Cleanup of revoked sessions (TASK-09 maintenance command) uses this index.
CREATE INDEX "session_revoked_at_idx" ON "session"("revoked_at") WHERE "revoked_at" IS NOT NULL;

-- Append-only audit (DM §9.4, §9.7). Default privileges grant DML on new tables to the runtime
-- role, so its UPDATE, DELETE and TRUNCATE rights are explicitly revoked here. The role name is
-- the local one (scripts/local-db.mjs); deployment must apply the same revoke to its runtime role.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kulvriksh_app') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_event" FROM kulvriksh_app;
    END IF;
END
$$;

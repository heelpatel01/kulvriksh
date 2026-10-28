-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('created', 'pending', 'paid', 'failed');

-- CreateEnum
CREATE TYPE "order_attention_reason" AS ENUM ('amount_mismatch', 'unreconciled');

-- CreateEnum
CREATE TYPE "payment_attempt_status" AS ENUM ('authorised', 'captured', 'failed');

-- CreateEnum
CREATE TYPE "payment_seen_via" AS ENUM ('verify', 'webhook', 'reconciliation');

-- CreateEnum
CREATE TYPE "webhook_event_status" AS ENUM ('processed', 'ignored', 'needs_attention');

-- CreateEnum
CREATE TYPE "grant_status" AS ENUM ('pending', 'granted', 'failed');

-- CreateEnum
CREATE TYPE "export_job_status" AS ENUM ('queued', 'running', 'ready', 'failed');

-- AlterEnum
ALTER TYPE "stored_file_kind" ADD VALUE 'export_pdf';

-- CreateTable
CREATE TABLE "plan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_id" UUID NOT NULL,
    "status" "plan_status" NOT NULL DEFAULT 'inactive',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_entitlement" (
    "plan_id" UUID NOT NULL,
    "entitlement_key" TEXT NOT NULL,

    CONSTRAINT "plan_entitlement_pkey" PRIMARY KEY ("plan_id","entitlement_key")
);

-- CreateTable
CREATE TABLE "customer_order" (
    "id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_order_id" TEXT NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'created',
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "plan_snapshot" JSONB NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "attention_reason" "order_attention_reason",
    "reconcile_last_checked_at" TIMESTAMPTZ(6),
    "reconcile_check_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "provider_payment_id" TEXT NOT NULL,
    "status" "payment_attempt_status" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "captured_at" TIMESTAMPTZ(6),
    "failure_code" TEXT,
    "first_seen_via" "payment_seen_via" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" "webhook_event_status" NOT NULL,
    "attention_reason" TEXT,
    "related_order_id" UUID,
    "related_payment_ref" TEXT,
    "payload_excerpt" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_grant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "status" "grant_status" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "lease_owner" TEXT,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),
    "granted_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grant_id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "entitlement_key" TEXT NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_task_state" (
    "task_name" TEXT NOT NULL,
    "lease_owner" TEXT,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),
    "last_run_started_at" TIMESTAMPTZ(6),
    "last_run_finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "background_task_state_pkey" PRIMARY KEY ("task_name")
);

-- CreateTable
CREATE TABLE "export_job" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "status" "export_job_status" NOT NULL DEFAULT 'queued',
    "options" JSONB NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "lease_owner" TEXT,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),
    "file_id" UUID,
    "expires_at" TIMESTAMPTZ(6),
    "error_code" TEXT,
    "page_count" INTEGER,
    "member_count" INTEGER,
    "warnings" JSONB,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_service_id_status_idx" ON "plan"("service_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_order_provider_order_id_key" ON "customer_order"("provider_order_id");

-- CreateIndex
CREATE INDEX "customer_order_customer_user_id_created_at_idx" ON "customer_order"("customer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_order_status_reconcile_last_checked_at_idx" ON "customer_order"("status", "reconcile_last_checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_order_customer_user_id_idempotency_key_key" ON "customer_order"("customer_user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempt_provider_payment_id_key" ON "payment_attempt"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payment_attempt_order_id_idx" ON "payment_attempt"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_provider_event_id_key" ON "webhook_event"("provider_event_id");

-- CreateIndex
CREATE INDEX "webhook_event_status_received_at_idx" ON "webhook_event"("status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_grant_order_id_key" ON "entitlement_grant"("order_id");

-- CreateIndex
CREATE INDEX "entitlement_grant_status_next_attempt_at_idx" ON "entitlement_grant"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "entitlement_customer_user_id_entitlement_key_idx" ON "entitlement"("customer_user_id", "entitlement_key");

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_grant_id_entitlement_key_key" ON "entitlement"("grant_id", "entitlement_key");

-- CreateIndex
CREATE INDEX "export_job_workspace_id_requested_by_user_id_created_at_idx" ON "export_job"("workspace_id", "requested_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "export_job_status_lease_expires_at_idx" ON "export_job"("status", "lease_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "export_job_file_id_workspace_id_key" ON "export_job"("file_id", "workspace_id");

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_entitlement" ADD CONSTRAINT "plan_entitlement_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_order" ADD CONSTRAINT "customer_order_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_order" ADD CONSTRAINT "customer_order_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempt" ADD CONSTRAINT "payment_attempt_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "customer_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_event" ADD CONSTRAINT "webhook_event_related_order_id_fkey" FOREIGN KEY ("related_order_id") REFERENCES "customer_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_grant" ADD CONSTRAINT "entitlement_grant_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "customer_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "entitlement_grant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "family_workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_file_id_workspace_id_fkey" FOREIGN KEY ("file_id", "workspace_id") REFERENCES "stored_file"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Hand-written guards (DM §6, §7.6). Amounts are positive integers in minor units; currencies are
-- ISO 4217 codes; order ids are generated by the API; states that carry a lease have one exactly
-- while they are being worked on.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "plan"
    ADD CONSTRAINT "plan_price_check" CHECK ("price_minor" > 0 AND "price_minor" <= 100000000000),
    ADD CONSTRAINT "plan_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "plan_name_check" CHECK (btrim("name") <> '' AND char_length("name") <= 120),
    ADD CONSTRAINT "plan_description_check" CHECK (char_length("description") <= 2000);
ALTER TABLE "plan_entitlement"
    ADD CONSTRAINT "plan_entitlement_key_check" CHECK ("entitlement_key" ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)*$' AND char_length("entitlement_key") <= 80);

ALTER TABLE "customer_order"
    ADD CONSTRAINT "customer_order_amount_check" CHECK ("amount_minor" > 0),
    ADD CONSTRAINT "customer_order_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "customer_order_idempotency_key_check" CHECK ("idempotency_key" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    ADD CONSTRAINT "customer_order_provider_check" CHECK ("provider" ~ '^[a-z][a-z0-9_]{1,30}$'),
    ADD CONSTRAINT "customer_order_provider_order_id_check" CHECK (char_length("provider_order_id") BETWEEN 1 AND 100),
    ADD CONSTRAINT "customer_order_paid_check" CHECK (("status" = 'paid') = ("paid_at" IS NOT NULL)),
    ADD CONSTRAINT "customer_order_reconcile_count_check" CHECK ("reconcile_check_count" >= 0);
-- Reconciliation picks unpaid orders, oldest check first (F-ORD-06).
CREATE INDEX "customer_order_open_for_reconciliation" ON "customer_order"("reconcile_last_checked_at", "created_at") WHERE "status" IN ('created', 'pending');
CREATE INDEX "customer_order_needs_attention" ON "customer_order"("updated_at") WHERE "attention_reason" IS NOT NULL;

ALTER TABLE "payment_attempt"
    ADD CONSTRAINT "payment_attempt_amount_check" CHECK ("amount_minor" > 0),
    ADD CONSTRAINT "payment_attempt_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT "payment_attempt_provider_payment_id_check" CHECK (char_length("provider_payment_id") BETWEEN 1 AND 100),
    ADD CONSTRAINT "payment_attempt_captured_check" CHECK (("status" = 'captured') = ("captured_at" IS NOT NULL)),
    ADD CONSTRAINT "payment_attempt_failure_code_check" CHECK ("failure_code" IS NULL OR char_length("failure_code") <= 100);

ALTER TABLE "webhook_event"
    ADD CONSTRAINT "webhook_event_id_check" CHECK (char_length("provider_event_id") BETWEEN 1 AND 200),
    ADD CONSTRAINT "webhook_event_type_check" CHECK ("event_type" ~ '^[a-z][a-z0-9_.]{0,79}$'),
    ADD CONSTRAINT "webhook_event_attention_check" CHECK (("status" = 'needs_attention') = ("attention_reason" IS NOT NULL));

ALTER TABLE "entitlement_grant"
    ADD CONSTRAINT "entitlement_grant_attempt_count_check" CHECK ("attempt_count" >= 0),
    ADD CONSTRAINT "entitlement_grant_lease_check" CHECK (
        ("lease_token" IS NULL) = ("lease_expires_at" IS NULL) AND ("lease_token" IS NULL) = ("lease_owner" IS NULL)
        AND ("lease_token" IS NULL OR "status" = 'pending')),
    ADD CONSTRAINT "entitlement_grant_granted_check" CHECK (("status" = 'granted') = ("granted_at" IS NOT NULL)),
    ADD CONSTRAINT "entitlement_grant_failed_check" CHECK (("status" = 'failed') = ("failed_at" IS NOT NULL));
CREATE INDEX "entitlement_grant_due" ON "entitlement_grant"("next_attempt_at") WHERE "status" = 'pending';

ALTER TABLE "entitlement"
    ADD CONSTRAINT "entitlement_key_check" CHECK ("entitlement_key" ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)*$' AND char_length("entitlement_key") <= 80),
    ADD CONSTRAINT "entitlement_validity_check" CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from");

ALTER TABLE "background_task_state"
    ADD CONSTRAINT "background_task_state_name_check" CHECK ("task_name" ~ '^[a-z][a-z0-9_.]{1,60}$'),
    ADD CONSTRAINT "background_task_state_lease_check" CHECK (
        ("lease_token" IS NULL) = ("lease_expires_at" IS NULL) AND ("lease_token" IS NULL) = ("lease_owner" IS NULL));

-- Exports: one open job per workspace and requester, so repeated clicks reuse it (F-FAM-05). A
-- running job holds a lease; a ready job has its file and expiry; a failed job has an error code.
ALTER TABLE "export_job"
    ADD CONSTRAINT "export_job_progress_check" CHECK ("progress" BETWEEN 0 AND 100),
    ADD CONSTRAINT "export_job_lease_check" CHECK (
        ("status" = 'running') = ("lease_token" IS NOT NULL)
        AND ("lease_token" IS NULL) = ("lease_expires_at" IS NULL) AND ("lease_token" IS NULL) = ("lease_owner" IS NULL)),
    ADD CONSTRAINT "export_job_finished_check" CHECK (("status" IN ('ready', 'failed')) = ("finished_at" IS NOT NULL)),
    ADD CONSTRAINT "export_job_file_check" CHECK ("file_id" IS NULL OR "status" = 'ready'),
    ADD CONSTRAINT "export_job_ready_file_check" CHECK ("status" <> 'ready' OR ("expires_at" IS NOT NULL)),
    ADD CONSTRAINT "export_job_failed_check" CHECK (("status" = 'failed') = ("error_code" IS NOT NULL)),
    ADD CONSTRAINT "export_job_error_code_check" CHECK ("error_code" IS NULL OR "error_code" ~ '^[a-z][a-z_]{1,60}$'),
    ADD CONSTRAINT "export_job_counts_check" CHECK (("page_count" IS NULL OR "page_count" > 0) AND ("member_count" IS NULL OR "member_count" >= 0));
CREATE UNIQUE INDEX "export_job_one_open_per_requester" ON "export_job"("workspace_id", "requested_by_user_id") WHERE "status" IN ('queued', 'running');
CREATE INDEX "export_job_queued" ON "export_job"("created_at") WHERE "status" = 'queued';
CREATE INDEX "export_job_ready_expiry" ON "export_job"("expires_at") WHERE "status" = 'ready';

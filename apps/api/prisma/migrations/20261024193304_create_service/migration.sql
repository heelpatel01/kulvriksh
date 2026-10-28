-- CreateEnum
CREATE TYPE "service_status" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "service" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "service_status" NOT NULL DEFAULT 'inactive',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_status_idx" ON "service"("status");

-- Database-level guards matching the API's validation (provisional limits until R12 defines the fields).
ALTER TABLE "service"
    ADD CONSTRAINT "service_name_check" CHECK (btrim("name") <> '' AND char_length("name") <= 120),
    ADD CONSTRAINT "service_description_check" CHECK (btrim("description") <> '' AND char_length("description") <= 2000);

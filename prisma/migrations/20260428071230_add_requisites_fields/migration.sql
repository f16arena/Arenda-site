-- AlterTable
ALTER TABLE "Building" ADD COLUMN "email" TEXT;
ALTER TABLE "Building" ADD COLUMN "phone" TEXT;
ALTER TABLE "Building" ADD COLUMN "responsible" TEXT;
ALTER TABLE "Building" ADD COLUMN "totalArea" REAL;

-- AlterTable
ALTER TABLE "Floor" ADD COLUMN "totalArea" REAL;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "bik" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "iik" TEXT;

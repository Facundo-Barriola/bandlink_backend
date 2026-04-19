-- AlterTable
ALTER TABLE "payments"."payment_webhooks" ALTER COLUMN "webhook_id" DROP NOT NULL,
ALTER COLUMN "webhook_id" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "payments"."payments" ALTER COLUMN "mp_preference_id" DROP NOT NULL,
ALTER COLUMN "mp_preference_id" SET DATA TYPE TEXT,
ALTER COLUMN "mp_payment_id" DROP NOT NULL,
ALTER COLUMN "mp_payment_id" SET DATA TYPE TEXT,
ALTER COLUMN "mp_merchant_order_id" DROP NOT NULL,
ALTER COLUMN "mp_merchant_order_id" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "payments"."refunds" ALTER COLUMN "provider_refund_id" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "studios"."rehearsal_rooms" ADD COLUMN     "is_active" BOOLEAN;

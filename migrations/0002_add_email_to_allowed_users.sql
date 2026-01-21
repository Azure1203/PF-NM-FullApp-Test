-- Add email column to allowed_users table
-- Make username nullable (was NOT NULL before)
ALTER TABLE "allowed_users" ALTER COLUMN "username" DROP NOT NULL;

-- Add email column
ALTER TABLE "allowed_users" ADD COLUMN IF NOT EXISTS "email" text UNIQUE;

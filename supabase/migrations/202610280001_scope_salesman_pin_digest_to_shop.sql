-- Migration: Allow same salesman PIN across different shops
-- Drops the global unique index on (pin_digest) and replaces with a composite index on (pin_digest, shop_id).

DROP INDEX IF EXISTS profiles_salesman_pin_digest_unique;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_salesman_pin_digest_shop_unique
ON profiles (pin_digest, shop_id)
WHERE role = 'salesman' AND active = true;

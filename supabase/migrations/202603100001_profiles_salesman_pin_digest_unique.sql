CREATE UNIQUE INDEX IF NOT EXISTS profiles_salesman_pin_digest_unique
ON profiles (pin_digest)
WHERE role = 'salesman' AND active = true;

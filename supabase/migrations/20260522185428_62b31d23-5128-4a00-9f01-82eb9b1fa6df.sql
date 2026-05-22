UPDATE auth.users
SET 
  encrypted_password = crypt('200531Be@', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  updated_at = now()
WHERE email = 'salesdesouzamatheus@gmail.com';
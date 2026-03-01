-- ============================================================
-- TOLLEN ADMIN SETUP
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add is_admin flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. Helper function (SECURITY DEFINER bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 3. Orders — admins can read & update all
CREATE POLICY "Admins can read all orders"
  ON orders FOR SELECT USING (is_admin());

CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE USING (is_admin());

-- 4. Profiles — admins can read all
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT USING (is_admin());

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE USING (is_admin());

-- 5. Order items — admins can read all
CREATE POLICY "Admins can read all order items"
  ON order_items FOR SELECT USING (is_admin());

-- 6. Wallet transactions — admins can read all
CREATE POLICY "Admins can read all wallet transactions"
  ON wallet_transactions FOR SELECT USING (is_admin());

-- 7. Items — admins can manage
CREATE POLICY "Admins can update items"
  ON items FOR UPDATE USING (is_admin());

CREATE POLICY "Admins can insert items"
  ON items FOR INSERT WITH CHECK (is_admin());

-- 8. Categories — admins can manage
CREATE POLICY "Admins can update categories"
  ON categories FOR UPDATE USING (is_admin());

-- 9. Bundles — admins can manage
CREATE POLICY "Admins can update bundles"
  ON bundles FOR UPDATE USING (is_admin());

CREATE POLICY "Admins can insert bundles"
  ON bundles FOR INSERT WITH CHECK (is_admin());

-- 10. Subscriptions — admins can read all
CREATE POLICY "Admins can read all subscriptions"
  ON subscriptions FOR SELECT USING (is_admin());

-- ============================================================
-- AFTER RUNNING ABOVE: Create your admin account
-- 1. Go to Supabase → Authentication → Users → Add user
--    Enter your email + password, click "Create user"
-- 2. Copy the user's UUID shown in the users list
-- 3. Run this (replace the UUID):
-- ============================================================
-- UPDATE profiles SET is_admin = true WHERE id = 'PASTE-YOUR-UUID-HERE';

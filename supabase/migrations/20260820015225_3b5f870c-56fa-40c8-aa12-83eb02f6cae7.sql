
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  real_name text NOT NULL DEFAULT '',
  phone_number text NOT NULL DEFAULT '',
  public_handle text NOT NULL,
  home_state text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  is_online boolean NOT NULL DEFAULT true,
  is_banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own profile readable" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.app_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commission_pct numeric NOT NULL DEFAULT 12
);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins set commission" ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.app_settings (id, commission_pct) VALUES (1, 12);

CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_type text NOT NULL,
  breeder_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  breeder_handle text NOT NULL,
  custom_bird_name text NOT NULL,
  breed_type text NOT NULL,
  gender text NOT NULL,
  price_ngn bigint NOT NULL,
  images text[] NOT NULL DEFAULT '{}',
  pedigree_json jsonb,
  vaccinated boolean NOT NULL DEFAULT false,
  state text NOT NULL,
  description text NOT NULL DEFAULT '',
  batch_quantity integer NOT NULL DEFAULT 1,
  commission_override numeric,
  is_active boolean NOT NULL DEFAULT true,
  creation_timestamp timestamptz NOT NULL DEFAULT now(),
  expiry_date timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
GRANT SELECT ON public.listings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings public read" ON public.listings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "breeders create own listings" ON public.listings FOR INSERT TO authenticated
  WITH CHECK (breeder_id = auth.uid());
CREATE POLICY "breeders or admins update listings" ON public.listings FOR UPDATE TO authenticated
  USING (breeder_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (breeder_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "breeders or admins delete listings" ON public.listings FOR DELETE TO authenticated
  USING (breeder_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  listing_name text NOT NULL,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  breeder_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount_naira bigint NOT NULL,
  calculated_commission bigint NOT NULL DEFAULT 0,
  delivery_marked_at timestamptz NOT NULL DEFAULT now(),
  auto_release_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  driver_phone text,
  waybill_image_url text,
  proof_file_name text,
  dispute_status text NOT NULL DEFAULT 'None',
  status text NOT NULL DEFAULT 'Escrow Funded',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties read own transactions" ON public.transactions FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR breeder_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "buyers create transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "parties update own transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (buyer_id = auth.uid() OR breeder_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (buyer_id = auth.uid() OR breeder_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.transaction_passcodes (
  transaction_id uuid PRIMARY KEY REFERENCES public.transactions(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  passcode text NOT NULL
);
GRANT SELECT, INSERT ON public.transaction_passcodes TO authenticated;
GRANT ALL ON public.transaction_passcodes TO service_role;
ALTER TABLE public.transaction_passcodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "buyer or admin reads passcode" ON public.transaction_passcodes FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "buyer creates passcode" ON public.transaction_passcodes FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid());

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.listings(id) ON DELETE CASCADE,
  from_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants read messages" ON public.messages FOR SELECT TO authenticated
  USING (from_id = auth.uid() OR to_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "senders create messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (from_id = auth.uid());

INSERT INTO public.listings
  (category_type, breeder_handle, custom_bird_name, breed_type, gender, price_ngn, pedigree_json, vaccinated, state, description, batch_quantity)
VALUES
  ('Pigeon','Verified Breeder #481203','Musa Line Champion','Racing Homer','Pair',45000,NULL,true,'Abia','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',3),
  ('Pigeon','Verified Breeder #772910','Red Checker King','Pakistani High-Flyer','Female',72500,NULL,true,'Anambra','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',2),
  ('Pigeon','Verified Breeder #310884','Kano Sky Sultan','Tipler High-Flyer','Male',100000,NULL,true,'Benue','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',3),
  ('Pigeon','Verified Breeder #481203','Aba Blue Bar Ace','Fantail (Ornamental)','Pair',127500,NULL,true,'Delta','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',4),
  ('Pigeon','Verified Breeder #772910','Sokoto Silver Wing','Jacobin (Ornamental)','Male',155000,NULL,true,'Edo','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',1),
  ('Pigeon','Verified Breeder #310884','Ilorin Night Flyer','Pouter (Ornamental)','Female',182500,NULL,true,'Enugu','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',2),
  ('Pigeon','Verified Breeder #481203','Jos Plateau Racer','Tumbler','Pair',210000,NULL,true,'Imo','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',3),
  ('Pigeon','Verified Breeder #772910','Ibadan Dark Velvet','Local Cross / Mixed Breed','Male',45000,NULL,true,'Kaduna','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',1),
  ('Pigeon','Verified Breeder #310884','Zaria Grizzle Prince','Racing Homer','Female',72500,NULL,true,'Katsina','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',2),
  ('Pigeon','Verified Breeder #481203','Enugu White Crest','Pakistani High-Flyer','Pair',100000,NULL,true,'Kwara','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',3),
  ('Pigeon','Verified Breeder #772910','Benue Storm Homer','Tipler High-Flyer','Male',127500,NULL,true,'Nasarawa','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',4),
  ('Pigeon','Verified Breeder #310884','Lagos Coastal Ace','Fantail (Ornamental)','Female',155000,NULL,true,'Ogun','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',1),
  ('Pigeon','Verified Breeder #481203','Kaduna Golden Eye','Jacobin (Ornamental)','Pair',182500,NULL,true,'Osun','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',2),
  ('Pigeon','Verified Breeder #772910','Owerri Pearl Fantail','Pouter (Ornamental)','Male',210000,NULL,true,'Plateau','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',3),
  ('Pigeon','Verified Breeder #310884','Yola Desert Tumbler','Tumbler','Female',45000,NULL,true,'Sokoto','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',4),
  ('Pigeon','Verified Breeder #481203','Abuja Royal Pouter','Local Cross / Mixed Breed','Pair',72500,NULL,true,'Yobe','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',1),
  ('Pigeon','Verified Breeder #772910','Onitsha Mealy Hen','Racing Homer','Male',100000,NULL,true,'Adamawa','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',2),
  ('Pigeon','Verified Breeder #310884','Katsina Iron Beak','Pakistani High-Flyer','Female',127500,NULL,true,'Bauchi','Loft-raised, flight tested. Escrow protected with 2FA pickup passcode verification.',3),
  ('Chicken','Verified Breeder #481203','Noiler Layer Batch A','Noiler','Male',9500,NULL,false,'Abia','Healthy stock, escrow protected.',5),
  ('Chicken','Verified Breeder #772910','Yoruba Native Hen','Local Yoruba Chicken','Female',14000,NULL,false,'Bauchi','Healthy stock, escrow protected.',6),
  ('Chicken','Verified Breeder #310884','Frizzle Show Cock','Frizzle','Male',21000,NULL,false,'Cross River','Healthy stock, escrow protected.',2),
  ('Dog','Verified Breeder #481203','Boerboel Guard Male','Boerboel','Female',480000,NULL,true,'Ekiti','Vaccinated and dewormed. Escrow protected.',1),
  ('Dog','Verified Breeder #772910','Caucasian Shepherd Pup','Caucasian Shepherd','Male',950000,NULL,true,'Gombe','Vaccinated and dewormed. Escrow protected.',2),
  ('Dog','Verified Breeder #310884','Alsatian Trained Male','German Shepherd (Alsatian)','Female',610000,NULL,true,'Jigawa','Vaccinated and dewormed. Escrow protected.',1),
  ('Horse','Verified Breeder #481203','Northern Pony Gelding','Local Northern Pony','Male',1450000,NULL,false,'Kano','Strong and well fed. Escrow protected.',1),
  ('Horse','Verified Breeder #772910','Sudanour Stallion','Sudanese Sudanour','Female',3200000,NULL,false,'Kebbi','Strong and well fed. Escrow protected.',1);

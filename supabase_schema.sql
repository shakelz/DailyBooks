-- ==============================================================================
-- DailyBooks ERP - Supabase PostgreSQL Schema Migration
-- ==============================================================================

-- 1. Create INVENTORY (Products) Table
CREATE TABLE public.inventory (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "purchasePrice" NUMERIC DEFAULT 0,
    "sellingPrice" NUMERIC DEFAULT 0,
    stock INTEGER DEFAULT 0,
    category TEXT,
    barcode TEXT,
    "productUrl" TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    "attributes" JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS for Inventory
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable Read/Write for Authenticated Users on Inventory" 
    ON public.inventory FOR ALL 
    USING (auth.role() = 'anon' OR auth.role() = 'authenticated') 
    WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');


-- 2. Create REPAIRS Table
CREATE TABLE public.repairs (
    id TEXT PRIMARY KEY,
    "refId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    phone TEXT,
    "deviceModel" TEXT,
    imei TEXT,
    problem TEXT,
    status TEXT DEFAULT 'pending', -- 'pending' | 'in_progress' | 'completed'
    "estimatedCost" NUMERIC DEFAULT 0,
    "finalAmount" NUMERIC DEFAULT 0,
    "partsCost" NUMERIC DEFAULT 0,
    "deliveryDate" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "completedAt" TIMESTAMPTZ,
    "partsUsed" JSONB DEFAULT '[]'::jsonb
);

-- Enable RLS for Repairs
ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable Read/Write for Authenticated Users on Repairs" 
    ON public.repairs FOR ALL 
    USING (auth.role() = 'anon' OR auth.role() = 'authenticated') 
    WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');


-- 3. Create TRANSACTIONS Table
-- Kept flat to maintain compatibility with InsightsTab, but added order_id for grouping cart items.
CREATE TABLE public.transactions (
    id TEXT PRIMARY KEY,
    "order_id" TEXT, -- Used to group multiple items bought in a single checkout
    "desc" TEXT,
    amount NUMERIC DEFAULT 0,
    type TEXT, -- 'income' or 'expense'
    category TEXT,
    notes TEXT,
    source TEXT, -- 'shop', 'repair', etc.
    quantity INTEGER DEFAULT 1,
    date TEXT,
    time TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    "isFixedExpense" BOOLEAN DEFAULT false,
    
    -- Foreign Keys for Data Integrity (Baigan Prevention) 🍆🚫
    "productId" TEXT REFERENCES public.inventory(id) ON DELETE SET NULL,
    "workerId" TEXT,
    "salesmanName" TEXT
);

-- Enable RLS for Transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable Read/Write for Authenticated Users on Transactions" 
    ON public.transactions FOR ALL 
    USING (auth.role() = 'anon' OR auth.role() = 'authenticated') 
    WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');


-- 4. Create ATTENDANCE Table
CREATE TABLE public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workerId" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    type TEXT NOT NULL, -- 'IN' or 'OUT'
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    note TEXT
);

-- Enable RLS for Attendance
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable Read/Write for Authenticated Users on Attendance" 
    ON public.attendance FOR ALL 
    USING (auth.role() = 'anon' OR auth.role() = 'authenticated') 
    WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

-- ==============================================================================

-- 5. Create CATEGORIES Table
CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    parent TEXT, -- Null if L1, populated with L1 name if L2
    image TEXT, -- Base64 or URL
    level INTEGER NOT NULL, -- 1 or 2
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for Categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable Read/Write for Authenticated Users on Categories" 
    ON public.categories FOR ALL 
    USING (auth.role() = 'anon' OR auth.role() = 'authenticated') 
    WITH CHECK (auth.role() = 'anon' OR auth.role() = 'authenticated');

-- ==============================================================================
-- SCHEMA MIGRATION COMPLETE! 🚀
-- ==============================================================================

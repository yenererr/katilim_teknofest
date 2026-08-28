-- KatılımFinans — şartname 5.3/5.4 alanlarının sütunlaştırılması
-- Çalıştırma: psql "$DATABASE_URL" -f migrations/002_sartname_alanlari.sql
--
-- Neden gerekli:
--   1. `updated_at` sütunu hiç oluşturulmamıştı; store.ts'teki çöp/süresi
--      dolmuş kampanya pasifleştirme sorgusu her açılışta bu yüzden hata
--      verip atlanıyordu. Yani temizlik hiç çalışmadı.
--   2. Şartname alanları yalnızca `payload` JSONB içinde tutuluyordu; SQL
--      tarafında filtrelenemiyor ve indekslenemiyordu.
--   3. `campaign_end` sütunu payload'daki değerden beslenmiyordu, bu yüzden
--      süresi dolmuş kampanya filtresi çalışsa bile boş sütun üzerinden
--      karar verecekti.
--
-- Betik tekrar çalıştırılabilir (idempotent).

BEGIN;

-- 1) Eksik zaman damgaları -------------------------------------------------

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE products  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2) Şartname 5.4 kampanya türü ve 5.3 alanları ----------------------------

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_type TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS fee_status TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_segments TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reward_points NUMERIC;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reward_point_unit TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS discount_rate NUMERIC;

ALTER TABLE products ADD COLUMN IF NOT EXISTS campaign_type TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS fee_status TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS target_segments TEXT[] NOT NULL DEFAULT '{}';

-- 3) Mevcut kayıtları payload'dan doldur -----------------------------------
-- Yeniden tarama beklemeden, daha önce çıkarılmış değerler sütunlara taşınır.

UPDATE campaigns SET
  campaign_type     = COALESCE(campaign_type, payload->>'campaignType'),
  fee_status        = COALESCE(fee_status, payload->>'feeStatus'),
  reward_points     = COALESCE(reward_points, NULLIF(payload->>'rewardPoints', '')::numeric),
  reward_point_unit = COALESCE(reward_point_unit, payload->>'rewardPointUnit'),
  discount_rate     = COALESCE(discount_rate, NULLIF(payload->>'discountRate', '')::numeric)
WHERE payload ?| ARRAY['campaignType','feeStatus','rewardPoints','rewardPointUnit','discountRate'];

UPDATE campaigns SET target_segments = ARRAY(
  SELECT jsonb_array_elements_text(payload->'targetSegments')
)
WHERE jsonb_typeof(payload->'targetSegments') = 'array'
  AND cardinality(target_segments) = 0;

UPDATE products SET
  campaign_type = COALESCE(campaign_type, payload->>'campaignType'),
  fee_status    = COALESCE(fee_status, payload->>'feeStatus')
WHERE payload ?| ARRAY['campaignType','feeStatus'];

UPDATE products SET target_segments = ARRAY(
  SELECT jsonb_array_elements_text(payload->'targetSegments')
)
WHERE jsonb_typeof(payload->'targetSegments') = 'array'
  AND cardinality(target_segments) = 0;

-- 4) Tarih sütunlarını payload'dan doldur ----------------------------------
-- Payload'daki değer ISO tarih değilse (boş metin, "Belirtilmemiş" vb.)
-- satır atlanır; bozuk veri sütuna yazılmaz.

UPDATE campaigns SET campaign_end = (payload->>'campaignEnd')::date
WHERE campaign_end IS NULL
  AND payload->>'campaignEnd' ~ '^\d{4}-\d{2}-\d{2}';

UPDATE campaigns SET campaign_start = (payload->>'campaignStart')::date
WHERE campaign_start IS NULL
  AND payload->>'campaignStart' ~ '^\d{4}-\d{2}-\d{2}';

-- 5) İndeksler --------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(campaign_type)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_campaigns_end ON campaigns(campaign_end)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_campaigns_segments ON campaigns USING GIN (target_segments);

COMMIT;

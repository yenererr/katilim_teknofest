-- KatılımFinans PostgreSQL şeması
-- Çalıştırma: psql $DATABASE_URL -f migrations/001_katilim_finans.sql

CREATE TABLE IF NOT EXISTS banks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES banks(id),
  url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_checked_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_changed_at TIMESTAMPTZ,
  raw_hash TEXT,
  normalized_hash TEXT,
  http_status INT,
  final_url TEXT,
  error_code TEXT,
  parser_status TEXT,
  UNIQUE (bank_id, url)
);

CREATE TABLE IF NOT EXISTS source_snapshots (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  raw_hash TEXT NOT NULL,
  normalized_hash TEXT NOT NULL,
  cleaned_text TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  http_status INT,
  final_url TEXT
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  bank_filter TEXT[],
  force_refresh BOOLEAN DEFAULT FALSE,
  stats JSONB DEFAULT '{}'::jsonb,
  error TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES banks(id),
  source_id TEXT REFERENCES sources(id),
  product_name TEXT,
  product_type TEXT,
  category TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  source_url TEXT NOT NULL,
  source_checked_at TIMESTAMPTZ,
  content_hash TEXT,
  extraction_method TEXT,
  model_alias TEXT,
  manual_review_required BOOLEAN DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL REFERENCES banks(id),
  source_id TEXT REFERENCES sources(id),
  title TEXT,
  category TEXT NOT NULL,
  campaign_status TEXT NOT NULL DEFAULT 'unknown',
  campaign_start DATE,
  campaign_end DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  source_url TEXT NOT NULL,
  source_checked_at TIMESTAMPTZ,
  content_hash TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_terms (
  id BIGSERIAL PRIMARY KEY,
  record_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  profit_rate NUMERIC,
  rate_period TEXT,
  min_amount_tl NUMERIC,
  max_amount_tl NUMERIC,
  min_term_months INT,
  max_term_months INT,
  installment_count INT,
  allocation_fee_value NUMERIC,
  allocation_fee_type TEXT,
  reward_amount_tl NUMERIC,
  reward_type TEXT,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_items (
  id BIGSERIAL PRIMARY KEY,
  record_id TEXT NOT NULL,
  field TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  confidence NUMERIC,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extraction_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id),
  model_alias TEXT,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  record_count INT DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS change_events (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  bank_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manual_reviews (
  id BIGSERIAL PRIMARY KEY,
  extraction_id TEXT,
  record_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_products_bank_active ON products(bank_id, is_active);
CREATE INDEX IF NOT EXISTS idx_campaigns_bank_status ON campaigns(bank_id, campaign_status, is_active);
CREATE INDEX IF NOT EXISTS idx_sources_bank ON sources(bank_id);
CREATE INDEX IF NOT EXISTS idx_financial_terms_record ON financial_terms(record_id);

-- ============================================================================
-- Images Table Setup (Minimal MVP Schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS images (
  -- Primary identifiers
  id UUID PRIMARY KEY,
  
  -- Timestamps
  taken_on TIMESTAMP NOT NULL,
  stored_on TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- File information
  file_name TEXT NOT NULL,
  local_file_name TEXT,
  image_size INTEGER,
  
  -- URLs
  image_url TEXT NOT NULL,
  download_url TEXT NOT NULL,
  enhanced_image_url TEXT,
  
  -- Camera information
  camera_id INTEGER,
  camera_name TEXT,
  modem_meid TEXT,
  
  -- Location data
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Media type
  is_video BOOLEAN DEFAULT FALSE,
  video_url TEXT,
  
  -- User metadata
  user_id INTEGER,
  is_favorite BOOLEAN DEFAULT FALSE,
  
  -- Additional metadata (optional)
  temperature TEXT,
  moon_phase TEXT,
  tags TEXT[]
);

-- ============================================================================
-- Indexes for common queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_taken_on ON images (taken_on DESC);
CREATE INDEX IF NOT EXISTS idx_camera_id ON images (camera_id);
CREATE INDEX IF NOT EXISTS idx_user_id ON images (user_id);

-- ============================================================================
-- Enable Row Level Security (optional but recommended for Supabase)
-- ============================================================================

-- ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- Example policy (adjust based on your auth needs):
-- CREATE POLICY "Users can view their own images"
--   ON images FOR SELECT
--   USING (auth.uid()::text = user_id::text);


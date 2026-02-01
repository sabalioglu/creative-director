-- Create image_generation_tasks table for real-time updates
CREATE TABLE IF NOT EXISTS image_generation_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL,
  task_type TEXT NOT NULL, -- 'hero_shot' | 'hero_plus_start' | 'hero_plus_end'
  status TEXT NOT NULL, -- 'pending' | 'processing' | 'success' | 'failed'
  kie_task_id TEXT,
  image_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE image_generation_tasks ENABLE ROW LEVEL SECURITY;

-- Allow all operations (can be refined later with user authentication)
CREATE POLICY "Allow all operations" ON image_generation_tasks FOR ALL USING (true);

-- Create index for faster lookups
CREATE INDEX idx_image_generation_tasks_session_id ON image_generation_tasks(session_id);
CREATE INDEX idx_image_generation_tasks_status ON image_generation_tasks(status);

-- Migration: Room Blocks RLS policies only

-- Enable RLS on room_blocks
aLTER TABLE room_blocks ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read for all authenticated users
CREATE POLICY "Allow read room_blocks for all" ON room_blocks
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Allow insert for all authenticated users
CREATE POLICY "Allow insert room_blocks for all" ON room_blocks
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: Allow update for all authenticated users
CREATE POLICY "Allow update room_blocks for all" ON room_blocks
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Policy: Allow delete for all authenticated users
CREATE POLICY "Allow delete room_blocks for all" ON room_blocks
  FOR DELETE
  USING (auth.role() = 'authenticated');

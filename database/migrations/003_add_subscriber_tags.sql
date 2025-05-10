-- Migration: Add Subscriber Tags
-- Timestamp: 2025-05-08

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create subscriber_tags join table for many-to-many relationship
CREATE TABLE IF NOT EXISTS subscriber_tags (
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (subscriber_id, tag_id)
);

-- Create index for faster tag lookups
CREATE INDEX IF NOT EXISTS idx_subscriber_tags_tag_id ON subscriber_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_subscriber_tags_subscriber_id ON subscriber_tags(subscriber_id);

-- Add tag management permissions
INSERT INTO permissions (resource, action, description)
VALUES
  ('tags', 'read', 'Can view tags and tagged subscribers'),
  ('tags', 'create', 'Can create new tags'),
  ('tags', 'update', 'Can update tag information'),
  ('tags', 'delete', 'Can delete tags'),
  ('tags', 'assign', 'Can assign tags to subscribers'),
  ('tags', 'unassign', 'Can remove tags from subscribers')
ON CONFLICT (resource, action) DO NOTHING;

-- Assign all tag permissions to admin role
DO $$
DECLARE
    admin_role_id INTEGER;
BEGIN
    SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
    
    IF admin_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_role_id, p.id
        FROM permissions p 
        WHERE p.resource = 'tags'
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Admin role not found, skipping permission assignment.';
    END IF;
END $$;

-- Assign read permission to editor role
DO $$
DECLARE
    editor_role_id INTEGER;
    read_permission_id INTEGER;
BEGIN
    SELECT id INTO editor_role_id FROM roles WHERE name = 'editor';
    SELECT id INTO read_permission_id FROM permissions WHERE resource = 'tags' AND action = 'read';
    
    IF editor_role_id IS NOT NULL AND read_permission_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (editor_role_id, read_permission_id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Editor role or tags:read permission not found, skipping permission assignment.';
    END IF;
END $$;
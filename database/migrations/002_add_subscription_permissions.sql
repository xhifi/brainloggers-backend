-- Migration: Add Subscription Permissions
-- Timestamp: 2025-05-05

-- Add subscription permissions to the permissions table
INSERT INTO permissions (resource, action, description)
VALUES
  ('subscriptions', 'read', 'Can view subscription lists and details'),
  ('subscriptions', 'create', 'Can add new subscribers'),
  ('subscriptions', 'update', 'Can update subscriber information'),
  ('subscriptions', 'delete', 'Can delete subscribers'),
  ('subscriptions', 'import', 'Can import subscribers from CSV files or content'),
  ('subscriptions', 'export', 'Can export subscribers to CSV')
ON CONFLICT (resource, action) DO NOTHING;

-- Assign all subscription permissions to admin role
DO $$
DECLARE
    admin_role_id INTEGER;
BEGIN
    SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
    
    IF admin_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_role_id, p.id
        FROM permissions p 
        WHERE p.resource = 'subscriptions'
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
    SELECT id INTO read_permission_id FROM permissions WHERE resource = 'subscriptions' AND action = 'read';
    
    IF editor_role_id IS NOT NULL AND read_permission_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (editor_role_id, read_permission_id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Editor role or subscription:read permission not found, skipping permission assignment.';
    END IF;
END $$;
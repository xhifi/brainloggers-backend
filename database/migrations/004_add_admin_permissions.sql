-- Migration: Add Admin Permissions for Mailing Lists, Templates, and Campaigns
-- Timestamp: 2025-05-09

-- Add mailing list permissions
INSERT INTO permissions (resource, action, description)
VALUES
  ('mailing-lists', 'create', 'Can create new mailing lists'),
  ('mailing-lists', 'read', 'Can view mailing lists and their details'),
  ('mailing-lists', 'update', 'Can update mailing list information'),
  ('mailing-lists', 'delete', 'Can delete mailing lists'),
  ('mailing-lists', 'manage-recipients', 'Can add/remove recipients from mailing lists')
ON CONFLICT (resource, action) DO NOTHING;

-- Add template permissions
INSERT INTO permissions (resource, action, description)
VALUES
  ('templates', 'create', 'Can create new email templates'),
  ('templates', 'read', 'Can view email templates'),
  ('templates', 'update', 'Can update email templates'),
  ('templates', 'delete', 'Can delete email templates'),
  ('templates', 'preview', 'Can preview email templates'),
  ('templates', 'duplicate', 'Can duplicate existing templates')
ON CONFLICT (resource, action) DO NOTHING;

-- Add campaign permissions
INSERT INTO permissions (resource, action, description)
VALUES
  ('campaigns', 'create', 'Can create new email campaigns'),
  ('campaigns', 'read', 'Can view email campaigns'),
  ('campaigns', 'update', 'Can update campaign details'),
  ('campaigns', 'delete', 'Can delete campaigns'),
  ('campaigns', 'schedule', 'Can schedule campaigns for sending'),
  ('campaigns', 'send', 'Can send campaigns immediately'),
  ('campaigns', 'cancel', 'Can cancel scheduled campaigns'),
  ('campaigns', 'analytics', 'Can view campaign analytics')
ON CONFLICT (resource, action) DO NOTHING;

-- Assign all mailing list permissions to admin role
DO $$
DECLARE
    admin_role_id INTEGER;
BEGIN
    SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
    
    IF admin_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_role_id, p.id
        FROM permissions p 
        WHERE p.resource = 'mailing-lists'
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Admin role not found, skipping mailing list permission assignment.';
    END IF;
END $$;

-- Assign all template permissions to admin role
DO $$
DECLARE
    admin_role_id INTEGER;
BEGIN
    SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
    
    IF admin_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_role_id, p.id
        FROM permissions p 
        WHERE p.resource = 'templates'
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Admin role not found, skipping template permission assignment.';
    END IF;
END $$;

-- Assign all campaign permissions to admin role
DO $$
DECLARE
    admin_role_id INTEGER;
BEGIN
    SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
    
    IF admin_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_role_id, p.id
        FROM permissions p 
        WHERE p.resource = 'campaigns'
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Admin role not found, skipping campaign permission assignment.';
    END IF;
END $$;
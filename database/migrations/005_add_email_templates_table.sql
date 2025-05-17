-- Email templates table for storing email templates
CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  subject VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'General',
  mjml_s3_key VARCHAR(255) NOT NULL,
  html_s3_key VARCHAR(255) NOT NULL,
  has_attachments BOOLEAN DEFAULT FALSE,
  extracted_variables JSONB DEFAULT '[]',
  metadata JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add permissions for email templates
INSERT INTO permissions (name, description) VALUES 
  ('email_templates:create', 'Create email templates'),
  ('email_templates:read', 'Read email templates'),
  ('email_templates:update', 'Update email templates'),
  ('email_templates:delete', 'Delete email templates');

-- Add these permissions to admin role if it exists
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Admin' AND p.name LIKE 'email_templates:%';

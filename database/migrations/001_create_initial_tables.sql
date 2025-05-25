-- Migration: Create Initial Tables (RBAC v2)
-- Timestamp: Add timestamp based on your migration tool or manually

-- Enable UUID generation functionality if using UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop all tables in correct dependency order
-- First drop tables that depend on other tables
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS otp_codes;
DROP TABLE IF EXISTS subscriber_tags;
DROP TABLE IF EXISTS campaign_mailing_lists;
DROP TABLE IF EXISTS email_analytics;
DROP TABLE IF EXISTS mailing_list_recipients;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS email_campaigns;
DROP TABLE IF EXISTS email_templates;
DROP TABLE IF EXISTS mailing_lists;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS subscriber_variables;
DROP TABLE IF EXISTS subscribers;
DROP TABLE IF EXISTS permissions;
-- Finally drop the base tables
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;

-- =====================================================
-- USER MANAGEMENT TABLES
-- =====================================================

-- Create Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(20),
    phone_number VARCHAR(20),
    address TEXT,
    profile_picture_url TEXT,
    is_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255), -- Consider indexing if queried often
    password_reset_token VARCHAR(255), -- Consider indexing
    password_reset_expires TIMESTAMPTZ, -- Use TIMESTAMPTZ for timezones
    deleted_at TIMESTAMPTZ, -- Soft delete
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Roles Table
CREATE TABLE roles (
    id SERIAL PRIMARY KEY, -- Using SERIAL for simplicity, could be UUID
    name VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'admin', 'editor', 'viewer'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- *** UPDATED: Create Permissions Table with resource and action ***
CREATE TABLE permissions (
    id SERIAL PRIMARY KEY, -- Using SERIAL for simplicity
    resource VARCHAR(100) NOT NULL,     -- e.g., 'users', 'posts', 'settings'
    action VARCHAR(100) NOT NULL,       -- e.g., 'create', 'read_all', 'read_own', 'update_any', 'delete'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (resource, action)          -- Ensure unique combination of resource and action
);

-- Create User-Roles Join Table (Many-to-Many)
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE, -- Match role id type (SERIAL)
    PRIMARY KEY (user_id, role_id) -- Composite primary key prevents duplicates
);

-- Create Role-Permissions Join Table (Many-to-Many)
CREATE TABLE role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE, -- Match role id type (SERIAL)
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE, -- Match permission id type (SERIAL)
    PRIMARY KEY (role_id, permission_id) -- Composite primary key
);

-- Create OTP codes table for email verification and password reset
CREATE TABLE otp_codes (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255),
  code VARCHAR(10) NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'EMAIL_VERIFICATION', 'PASSWORD_RESET', etc.
  is_used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Audit Log Table
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Nullable if action not by a user
    action VARCHAR(255) NOT NULL, -- e.g., 'USER_CREATED', 'ROLE_ASSIGNED'
    target_table VARCHAR(255) NOT NULL, -- Table affected
    target_id UUID NOT NULL, -- ID of the affected row
    changes JSONB, -- Store changes as JSON
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- MAILING SYSTEM TABLES - Updated with newer schema
-- =====================================================

-- Email Templates
CREATE TABLE email_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  category VARCHAR(100),
  has_attachments BOOLEAN DEFAULT FALSE,
  s3_assets_path VARCHAR(255),
  mjml_s3_key VARCHAR(255),
  html_s3_key VARCHAR(255),
  template_variables JSONB,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Subscribers
CREATE TABLE subscribers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  date_of_birth DATE,
  metadata JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Subscriber Variables Table (Simplified - stores only variable definitions)
CREATE TABLE subscriber_variables (
    variable_name VARCHAR(255) PRIMARY KEY,
    data_type VARCHAR(50) NOT NULL DEFAULT 'string' 
        CHECK (data_type IN ('string', 'number', 'boolean', 'date', 'email', 'url', 'json'))
);

-- Mailing Lists
CREATE TABLE mailing_lists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source_type VARCHAR(50) NOT NULL DEFAULT 'subscribers', -- subscribers, users, mixed
  filter_criteria JSONB,
  tag_filter JSONB,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Mailing List Recipients
CREATE TABLE mailing_list_recipients (
  id SERIAL PRIMARY KEY,
  mailing_list_id INTEGER NOT NULL REFERENCES mailing_lists(id) ON DELETE CASCADE,
  recipient_type VARCHAR(50) NOT NULL, -- 'subscriber' or 'user'
  recipient_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mailing_list_id, recipient_type, recipient_id)
);

-- Email Campaigns
CREATE TABLE email_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_id INTEGER REFERENCES email_templates(id),
  from_email VARCHAR(255) NOT NULL,
  reply_to VARCHAR(255),
  subject VARCHAR(255) NOT NULL,
  template_variables JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, scheduled, published, completed, cancelled
  scheduled_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  published_by UUID REFERENCES users(id),
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Campaign Mailing Lists
CREATE TABLE campaign_mailing_lists (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  mailing_list_id INTEGER NOT NULL REFERENCES mailing_lists(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, mailing_list_id)
);

-- Email Analytics
CREATE TABLE email_analytics (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- sent, opened, clicked, bounced, complained, unsubscribed
  event_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  link_clicked TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- =====================================================
-- TAGGING SYSTEM TABLES
-- =====================================================

-- Tags table for both users and subscribers
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(20), -- For UI display purposes (hex code or name)
  created_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name)
);

-- Subscriber Tags relationship table
CREATE TABLE subscriber_tags (
  id SERIAL PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subscriber_id, tag_id)
);

-- =====================================================
-- BLOGGING SYSTEM TABLES
-- =====================================================

-- Create blog posts table
CREATE TABLE IF NOT EXISTS blog_posts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  content_key VARCHAR(255) NOT NULL, -- S3 key for the markdown file
  layout VARCHAR(100) NOT NULL DEFAULT 'default', -- Layout template to use for rendering
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, published, archived
  published_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Create blog post authors (many-to-many relationship)
CREATE TABLE IF NOT EXISTS blog_post_authors (
  post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contribution_type VARCHAR(50) DEFAULT 'editor', -- editor, reviewer, etc.
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id)
);

-- Create tags for blog posts
CREATE TABLE IF NOT EXISTS blog_post_tags (
  post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, tag_id)
);

-- Create comments table for blog posts
CREATE TABLE IF NOT EXISTS blog_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  parent_id INTEGER REFERENCES blog_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Add blog post slug redirects table
-- This allows handling redirects when a post's slug changes

CREATE TABLE IF NOT EXISTS blog_post_slug_redirects (
    id SERIAL PRIMARY KEY,
    old_slug VARCHAR(255) NOT NULL UNIQUE,
    new_slug VARCHAR(255) NOT NULL,
    post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- --- Indexes for Performance ---
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_verification_token ON users(verification_token);
CREATE INDEX idx_users_password_reset_token ON users(password_reset_token);

CREATE INDEX idx_permissions_resource_action ON permissions(resource, action); -- Index on new structure

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);

CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);


-- Create indexes for mailing system tables
CREATE INDEX idx_email_templates_is_active ON email_templates(is_active);
CREATE INDEX idx_email_templates_is_deleted ON email_templates(is_deleted);
CREATE INDEX idx_email_templates_created_by ON email_templates(created_by);
CREATE INDEX idx_email_templates_name ON email_templates(name);

CREATE INDEX idx_subscribers_email ON subscribers(email);
CREATE INDEX idx_subscribers_is_active ON subscribers(is_active);

CREATE INDEX idx_mailing_lists_is_active ON mailing_lists(is_active);
CREATE INDEX idx_mailing_lists_is_deleted ON mailing_lists(is_deleted);
CREATE INDEX idx_mailing_lists_source_type ON mailing_lists(source_type);
CREATE INDEX idx_mailing_lists_created_by ON mailing_lists(created_by);

CREATE INDEX idx_mailing_list_recipients_mailing_list_id ON mailing_list_recipients(mailing_list_id);
CREATE INDEX idx_mailing_list_recipients_recipient_type_id ON mailing_list_recipients(recipient_type, recipient_id);

CREATE INDEX idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX idx_email_campaigns_is_deleted ON email_campaigns(is_deleted);
CREATE INDEX idx_email_campaigns_scheduled_at ON email_campaigns(scheduled_at);
CREATE INDEX idx_email_campaigns_template_id ON email_campaigns(template_id);
CREATE INDEX idx_email_campaigns_created_by ON email_campaigns(created_by);

CREATE INDEX idx_campaign_mailing_lists_campaign_id ON campaign_mailing_lists(campaign_id);
CREATE INDEX idx_campaign_mailing_lists_mailing_list_id ON campaign_mailing_lists(mailing_list_id);


CREATE INDEX idx_email_analytics_campaign_id ON email_analytics(campaign_id);
CREATE INDEX idx_email_analytics_recipient_email ON email_analytics(recipient_email);
CREATE INDEX idx_email_analytics_event_type ON email_analytics(event_type);
CREATE INDEX idx_email_analytics_event_time ON email_analytics(event_time);

-- Create indexes for tagging system
CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_subscriber_tags_subscriber_id ON subscriber_tags(subscriber_id);
CREATE INDEX idx_subscriber_tags_tag_id ON subscriber_tags(tag_id);

-- Create index for blog_post_slug_redirects
CREATE INDEX IF NOT EXISTS idx_blog_post_slug_redirects_old_slug ON blog_post_slug_redirects(old_slug);
CREATE INDEX IF NOT EXISTS idx_blog_post_slug_redirects_post_id ON blog_post_slug_redirects(post_id);

-- Create index for subscriber variables
CREATE INDEX idx_subscriber_variables_data_type ON subscriber_variables(data_type);

-- --- Trigger function to automatically update 'updated_at' column ---
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   -- Check if NEW object exists (happens on INSERT and UPDATE)
   IF TG_OP = 'UPDATE' AND NEW IS NOT NULL THEN
      NEW.updated_at = NOW();
   END IF;
   -- For INSERT, updated_at should default to NOW() via column definition
   RETURN NEW; -- Return the modified row (or original row for INSERT)
END;
$$ language 'plpgsql';

-- Apply the trigger to tables with 'updated_at' for UPDATE operations
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blog_comments_updated_at BEFORE UPDATE ON blog_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blog_post_slug_redirects_updated_at BEFORE UPDATE ON blog_post_slug_redirects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscribers_updated_at BEFORE UPDATE ON subscribers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mailing_lists_updated_at BEFORE UPDATE ON mailing_lists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_campaigns_updated_at BEFORE UPDATE ON email_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SUBSCRIBER VARIABLES SYSTEM
-- =====================================================

-- Function to extract variable definitions from subscriber records
-- This function analyzes subscriber data and ensures variable definitions exist
CREATE OR REPLACE FUNCTION extract_subscriber_variable_definitions(subscriber_row subscribers)
RETURNS VOID AS $$
DECLARE
    metadata_key TEXT;
    metadata_value TEXT;
    inferred_type TEXT;
BEGIN
    -- Insert standard field variable definitions (ensure they exist)
    INSERT INTO subscriber_variables (variable_name, data_type) VALUES
        ('id', 'number'),
        ('email', 'email'),
        ('name', 'string'),
        ('date_of_birth', 'date'),
        ('subscribed_at', 'date'),
        ('unsubscribed_at', 'date'),
        ('created_at', 'date'),
        ('updated_at', 'date'),
        ('is_active', 'boolean')
    ON CONFLICT (variable_name) DO NOTHING;
    
    -- Extract metadata variable definitions (if metadata exists and is valid JSON)
    IF subscriber_row.metadata IS NOT NULL AND subscriber_row.metadata != '{}' THEN
        -- Loop through each key-value pair in the metadata JSON to define variables
        FOR metadata_key, metadata_value IN 
            SELECT key, value::TEXT 
            FROM jsonb_each_text(subscriber_row.metadata::jsonb)
        LOOP
            -- Infer data type based on value
            inferred_type := 'string'; -- default
            
            -- Check if it's a number
            IF metadata_value ~ '^[+-]?[0-9]+\.?[0-9]*$' THEN
                inferred_type := 'number';
            -- Check if it's a boolean
            ELSIF LOWER(metadata_value) IN ('true', 'false') THEN
                inferred_type := 'boolean';
            -- Check if it's a date (basic ISO format check)
            ELSIF metadata_value ~ '^\d{4}-\d{2}-\d{2}' THEN
                inferred_type := 'date';
            -- Check if it's an email
            ELSIF metadata_value ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
                inferred_type := 'email';
            -- Check if it's a URL
            ELSIF metadata_value ~ '^https?://' THEN
                inferred_type := 'url';
            -- Check if it's JSON (starts with { or [)
            ELSIF metadata_value ~ '^[\{\[]' THEN
                inferred_type := 'json';
            END IF;
            
            -- Insert the metadata variable definition (prefix with 'metadata.')
            INSERT INTO subscriber_variables (variable_name, data_type)
            VALUES ('metadata.' || metadata_key, inferred_type)
            ON CONFLICT (variable_name) 
            DO UPDATE SET 
                data_type = CASE 
                    -- If current type is more specific, keep it
                    WHEN subscriber_variables.data_type != 'string' THEN subscriber_variables.data_type
                    -- Otherwise update with the inferred type
                    ELSE EXCLUDED.data_type
                END;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for INSERT/UPDATE on subscribers
-- This ensures new variable types are captured when subscribers are added/updated
CREATE OR REPLACE FUNCTION trigger_extract_subscriber_variable_definitions()
RETURNS TRIGGER AS $$
BEGIN
    -- Call the extraction function with the new row to update variable definitions
    PERFORM extract_subscriber_variable_definitions(NEW);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically capture new variable definitions
CREATE TRIGGER trigger_subscriber_variable_definitions_insert
    AFTER INSERT ON subscribers
    FOR EACH ROW
    EXECUTE FUNCTION trigger_extract_subscriber_variable_definitions();

CREATE TRIGGER trigger_subscriber_variable_definitions_update
    AFTER UPDATE ON subscribers
    FOR EACH ROW
    EXECUTE FUNCTION trigger_extract_subscriber_variable_definitions();

-- Add comments to document the subscriber variables table purpose
COMMENT ON TABLE subscriber_variables IS 'Defines available template variables and their data types for email templates';
COMMENT ON COLUMN subscriber_variables.variable_name IS 'Unique variable name used in email templates (e.g., "email", "metadata.last_ordered")';
COMMENT ON COLUMN subscriber_variables.data_type IS 'Data type of the variable for validation and formatting';


-- --- Optional: Seed initial data (uncomment and modify if needed) ---
-- Insert Roles
INSERT INTO roles (name, description) VALUES
  ('admin', 'Administrator with full access'),
  ('editor', 'Can manage content'),
  ('viewer', 'Can view content')
ON CONFLICT (name) DO NOTHING;

-- *** UPDATED: Insert Permissions with resource and action ***
INSERT INTO permissions (resource, action, description) VALUES
    ('users', 'create', 'Can create new users'),
    ('users', 'read_all', 'Can read list of all users'),
    ('users', 'read_any', 'Can read profile of any specific user'),
    ('users', 'read_own', 'Can read own user profile'),
    ('users', 'update_any', 'Can update profile of any user (subject to same-role rule)'),
    ('users', 'update_own', 'Can update own user profile'),
    ('users', 'delete_any', 'Can delete any user'),
    ('roles', 'manage', 'Can manage roles and assign permissions'),
    ('permissions', 'manage', 'Can manage permissions definitions'),
    -- S3 Storage permissions
    ('storage', 'read', 'Can read files from S3 storage'),
    ('storage', 'write', 'Can upload and update files in S3 storage'),
    ('storage', 'delete', 'Can delete files and folders in S3 storage'),
    ('storage', 'list', 'Can list files and folders in S3 storage'),
    ('storage', 'admin', 'Has full control over S3 storage operations'),
    -- subscription permissions
    ('subscriptions', 'read', 'Can view subscription lists and details'),
    ('subscriptions', 'create', 'Can add new subscribers'),
    ('subscriptions', 'update', 'Can update subscriber information'),
    ('subscriptions', 'delete', 'Can delete subscribers'),
    ('subscriptions', 'import', 'Can import subscribers from CSV files or content'),
    ('subscriptions', 'export', 'Can export subscribers to CSV'),
    -- tag management permissions
    ('tags', 'read', 'Can view tags and tagged subscribers'),
    ('tags', 'create', 'Can create new tags'),
    ('tags', 'update', 'Can update tag information'),
    ('tags', 'delete', 'Can delete tags'),
    ('tags', 'assign', 'Can assign tags to subscribers'),
    ('tags', 'unassign', 'Can remove tags from subscribers'),
    -- Add mailing list permissions
    ('mailing-lists', 'create', 'Can create new mailing lists'),
    ('mailing-lists', 'read', 'Can view mailing lists and their details'),
    ('mailing-lists', 'update', 'Can update mailing list information'),
    ('mailing-lists', 'delete', 'Can delete mailing lists'),
    ('mailing-lists', 'manage-recipients', 'Can add/remove recipients from mailing lists'),
    -- Add template permissions
    ('templates', 'create', 'Can create new email templates'),
    ('templates', 'read', 'Can view email templates'),
    ('templates', 'update', 'Can update email templates'),
    ('templates', 'delete', 'Can delete email templates'),
    ('templates', 'preview', 'Can preview email templates'),
    ('templates', 'duplicate', 'Can duplicate existing templates'),
    -- Add campaign permissions
    ('campaigns', 'create', 'Can create new email campaigns'),
    ('campaigns', 'read', 'Can view email campaigns'),
    ('campaigns', 'update', 'Can update campaign details'),
    ('campaigns', 'delete', 'Can delete campaigns'),
    ('campaigns', 'schedule', 'Can schedule campaigns for sending'),
    ('campaigns', 'send', 'Can send campaigns immediately'),
    ('campaigns', 'cancel', 'Can cancel scheduled campaigns'),
    ('campaigns', 'analytics', 'Can view campaign analytics'),
    -- Add blog permissions
    ('blog', 'create', 'Create blog post drafts'),
    ('blog', 'read', 'Read blog posts'),
    ('blog', 'update', 'Update blog posts'),
    ('blog', 'delete', 'Delete blog posts'),
    ('blog', 'publish', 'Publish blog posts'),
    ('blog', 'comment', 'Comment on blog posts'),
    ('blog', 'comment_moderate', 'Moderate blog comments')
  -- Add permissions for other resources like posts, settings etc.
  -- ('posts', 'create', 'Can create posts'),
  -- ('posts', 'publish', 'Can publish posts')
ON CONFLICT (resource, action) DO NOTHING; -- Use new unique constraint

-- Ensure standard variables are included
INSERT INTO subscriber_variables (variable_name, data_type) VALUES
    ('id', 'number'),
    ('email', 'email'),
    ('name', 'string'),
    ('date_of_birth', 'date'),
    ('subscribed_at', 'date'),
    ('unsubscribed_at', 'date'),
    ('created_at', 'date'),
    ('updated_at', 'date'),
    ('is_active', 'boolean')
ON CONFLICT (variable_name) DO NOTHING;

-- Assign permissions to roles (Example: Admin gets all defined permissions)
-- Note: This assumes permissions and roles exist. Run this after inserting them.
DO $$
DECLARE
    admin_role_id int;
BEGIN
    SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
    IF admin_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_role_id, p.id
        FROM permissions p
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Admin role not found, skipping admin permission seeding.';
    END IF;
END $$;

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
-- Assign all blog permissions to admin role
DO $$
DECLARE
    admin_role_id INTEGER;
BEGIN
    SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
    
    IF admin_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT admin_role_id, p.id
        FROM permissions p 
        WHERE p.resource = 'blog'
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Admin role not found, skipping campaign permission assignment.';
    END IF;
END $$;
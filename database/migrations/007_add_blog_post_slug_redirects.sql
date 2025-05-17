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

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_blog_post_slug_redirects_old_slug ON blog_post_slug_redirects(old_slug);
CREATE INDEX IF NOT EXISTS idx_blog_post_slug_redirects_post_id ON blog_post_slug_redirects(post_id);

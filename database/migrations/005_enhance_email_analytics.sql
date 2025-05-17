-- Add recipient_id column to email_analytics table
ALTER TABLE email_analytics ADD COLUMN recipient_id INTEGER REFERENCES subscribers(id) ON DELETE SET NULL;

-- Create index on recipient_id for performance
CREATE INDEX idx_email_analytics_recipient_id ON email_analytics(recipient_id);

-- Add additional_data column for storing JSON data about events
ALTER TABLE email_analytics ADD COLUMN additional_data JSONB DEFAULT '{}'::jsonb;

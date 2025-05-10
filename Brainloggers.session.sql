SELECT * FROM user_roles J LEFT JOIN users U ON J.user_id = U.id
WHERE U.email = 'shifa.newversion@gmail.com'

SELECT * FROM roles WHERE id = 1;

SELECT * FROM permissions;
SELECT * FROM subscribers;
ALTER TABLE subscribers DROP COLUMN first_name;
ALTER TABLE subscribers DROP COLUMN last_name;
ALTER TABLE subscribers ADD COLUMN name VARCHAR(255);

SELECT * FROM subscribers;
SELECT * FROM subscriber_tags;
ALTER TABLE TAGS DROP COLUMN type;
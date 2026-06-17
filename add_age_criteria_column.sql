-- Add Age_criteria column to tournaments table
-- This column stores age restrictions for tournaments
-- Examples: ">40", "<18", ">=35", "18-40", "Open"

ALTER TABLE tournaments 
ADD COLUMN Age_criteria VARCHAR(20) DEFAULT 'Open';

-- You can update existing tournaments with specific criteria:
-- UPDATE tournaments SET Age_criteria = '>40' WHERE id = 1;
-- UPDATE tournaments SET Age_criteria = '18-40' WHERE id = 2;
-- UPDATE tournaments SET Age_criteria = '<18' WHERE id = 3;

-- Given a tournament name, get the event name for the ladder event
SELECT e.event_name
FROM tournaments t
JOIN Team_Design td ON td.tournament_id = t.id
JOIN events e ON e.team_id = td.id
WHERE t.name = ? AND e.event_name IS NOT NULL
LIMIT 1;
-- SQL for monthly player performance report
-- Input: month (1-12), year (YYYY)
-- Output: Player name, result of all matches, total win, total loss, ordered by total win desc

SELECT
  u.username AS player_name,
  GROUP_CONCAT(
    CONCAT('vs ',
      CASE WHEN md.player1 = u.username THEN md.player2 ELSE md.player1 END,
      ': ',
      CASE WHEN md.winner = u.username THEN 'Win' ELSE 'Loss' END,
      ' (', IFNULL(md.match_score, ''), ')'
    )
    ORDER BY md.match_date
    SEPARATOR '; '
  ) AS match_results,
  SUM(md.winner = u.username) AS total_win,
  SUM(md.winner != u.username AND (md.player1 = u.username OR md.player2 = u.username)) AS total_loss
FROM match_draws md
JOIN tournaments t ON md.tournament_id = t.id
JOIN users u ON (md.player1 = u.username OR md.player2 = u.username)
WHERE MONTH(t.date) = ? AND YEAR(t.date) = ?
  AND md.match_status = 'completed'
GROUP BY u.username
ORDER BY total_win DESC, total_loss ASC, u.username;
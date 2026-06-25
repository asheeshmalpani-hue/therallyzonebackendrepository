require('dotenv').config();
console.log("SUPABASE_URL =", process.env.SUPABASE_URL);
console.log("SUPABASE_SERVICE_ROLE_KEY exists =", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const bcrypt = require('bcrypt');

// Supabase client (server-side/service role key)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PORT = process.env.PORT || 5000;

const cors = require('cors');
const express = require('express');
const app = express();


// Apply CORS middleware before any routes
app.use(cors());
app.use(express.json());
// ...existing code...

// PUT /api/match-draw/:matchId
app.put('/api/match-draw/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    let { player1, player2, match_date, court, time_slot } = req.body;
    if (typeof match_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(match_date)) match_date = null;

    const { data, error } = await supabase
      .from('match_draws')
      .update({
        player1,
        player2,
        match_date,
        court,
        time_slot
      })
      .eq('id', matchId);

    if (error) throw error;
    res.json({ message: 'Match updated successfully' });
  } catch (error) {
    console.error('Error updating match:', error.message || error);
    res.status(500).json({ message: 'Error updating match in the database.' });
  }
});

// PUT /api/attendance/:id
app.put('/api/attendance/:id', async (req, res) => {
  const { id } = req.params;
  let { in_user, in_partner, out_user, out_partner, tournamentName, draw_id } = req.body;
  if ((!in_user && !in_partner) && (!out_user && !out_partner)) {
    return res.status(400).json({ message: 'Missing required fields: must provide in_user/in_partner or out_user/out_partner' });
  }
  if (!draw_id) {
    return res.status(400).json({ message: 'Missing required field: draw_id' });
  }
  try {
    const { data: rows, error: selectErr } = await supabase
      .from('attendance')
      .select('in_user, in_partner')
      .eq('id', id)
      .single();
    if (selectErr) throw selectErr;
    if (!rows) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }
    const current = rows;

    if (req.body.status === 'out') {
      const user = req.body.out_user || req.body.out_partner;
      if (user !== current.in_user && user !== current.in_partner) {
        return res.status(400).json({ message: 'You are not entered. If you want to enter, click on In button.' });
      }
    }

    if (!in_user && current.in_user && out_user && current.in_partner) {
      out_partner = current.in_user;
      in_user = current.in_partner;
      in_partner = null;
      out_user = null;
    } else if (!in_partner && current.in_partner && out_partner) {
      in_partner = null;
    } else if (!in_user && current.in_user && out_partner && !current.in_partner) {
      in_user = null;
      in_partner = null;
      out_user = null;
    }

    const { error: updateErr } = await supabase
      .from('attendance')
      .update({
        in_user: in_user || null,
        in_partner: in_partner || null,
        out_user: out_user || null,
        out_partner: out_partner || null,
        tournament_name: tournamentName,
        draw_id
      })
      .eq('id', id);

    if (updateErr) throw updateErr;
    res.json({ message: 'Attendance updated successfully' });
  } catch (error) {
    console.error('Error updating attendance:', error.message || error);
    res.status(500).json({ message: 'Error updating attendance in the database.' });
  }
});
// New endpoint: fetch only closed tournaments
// New endpoint: fetch only closed tournaments
//app.get('/api/tournaments/closed', async (req, res) => {
//  try {
//    const [rows] = await pool.execute("SELECT id, name, category, Age_criteria, location, status, date, fee FROM tournaments WHERE status = 'Closed'");
//    res.json(rows);
//  } catch (error) {
//    console.error('Error fetching closed tournaments:', error.message);
//    res.status(500).json({ message: 'Error fetching closed tournaments from the database.' });
//  }
//});

app.get('/api/tournaments/closed', async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('tournaments')
      .select('id, name, category, Age_criteria, location, status, date, fee')
      .eq('status', 'Closed')
      .eq('category', 'Ladder');
    if (error) throw error;

    const results = [];
    for (const t of (rows || [])) {
      const { data: drawRows, error: drawErr } = await supabase
        .from('Team_design')
        .select('id')
        .eq('tournament_id', t.id)
        .limit(1);
      if (drawErr) throw drawErr;

      let draws = [];
      if (drawRows && drawRows.length > 0) {
        const teamId = drawRows[0].id;
        const { data: eventRows, error: eventErr } = await supabase
          .from('events')
          .select('id')
          .eq('team_id', teamId);
        if (eventErr) throw eventErr;

        for (const eventRow of (eventRows || [])) {
          const { data: drawsData, error: drawsErr } = await supabase
            .from('draws')
            .select('id, draw_name')
            .eq('event_id', eventRow.id);
          if (drawsErr) throw drawsErr;
          draws = draws.concat(drawsData || []);
        }
      }

      results.push({
        ...t,
        draws
      });
    }
    res.json(results);
  } catch (error) {
    console.error('Error fetching closed tournaments:', error.message || error);
    res.status(500).json({ message: 'Error fetching closed tournaments from the database.' });
  }
});

// GET /api/reports/monthly-player-performance?month=3&year=2026
app.get('/api/reports/monthly-player-performance', async (req, res) => {
  try {
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);
    if (!month || !year) {
      return res.status(400).json({ message: 'Month and year are required as query parameters.' });
    }

    const { data: matches, error: matchErr } = await supabase
      .from('match_draws')
      .select('id, draw_id, player1, player2, winner, match_score, match_status, match_date')
      .eq('match_status', 'completed');
    if (matchErr) throw matchErr;

    const drawIds = [...new Set((matches || []).map(match => match.draw_id).filter(Boolean))];
    const { data: draws, error: drawErr } = await supabase
      .from('draws')
      .select('id, draw_name, event_id')
      .in('id', drawIds);
    if (drawErr) throw drawErr;

    const eventIds = [...new Set((draws || []).map(draw => draw.event_id).filter(Boolean))];
    const { data: events, error: eventErr } = await supabase
      .from('events')
      .select('id, team_id')
      .in('id', eventIds);
    if (eventErr) throw eventErr;

    const teamIds = [...new Set((events || []).map(event => event.team_id).filter(Boolean))];
    const { data: teams, error: teamErr } = await supabase
      .from('Team_design')
      .select('id, tournament_id')
      .in('id', teamIds);
    if (teamErr) throw teamErr;

    const tournamentIds = [...new Set((teams || []).map(team => team.tournament_id).filter(Boolean))];
    const { data: tournaments, error: tournamentErr } = await supabase
      .from('tournaments')
      .select('id, date')
      .in('id', tournamentIds);
    if (tournamentErr) throw tournamentErr;

    const validTournamentIds = new Set(
      (tournaments || [])
        .filter(t => t.date)
        .filter(t => {
          const parsed = new Date(t.date);
          return parsed.getUTCMonth() + 1 === month && parsed.getUTCFullYear() === year;
        })
        .map(t => t.id)
    );

    const validTeamIds = new Set(
      (teams || [])
        .filter(team => validTournamentIds.has(team.tournament_id))
        .map(team => team.id)
    );

    const validEventIds = new Set(
      (events || [])
        .filter(event => validTeamIds.has(event.team_id))
        .map(event => event.id)
    );

    const validDrawIds = new Set(
      (draws || [])
        .filter(draw => validEventIds.has(draw.event_id))
        .map(draw => draw.id)
    );

    const filteredMatches = (matches || []).filter(match => validDrawIds.has(match.draw_id));
    const usernameSet = new Set();
    filteredMatches.forEach(match => {
      if (match.player1) usernameSet.add(match.player1);
      if (match.player2) usernameSet.add(match.player2);
    });

    const userNames = Array.from(usernameSet);
    const { data: users, error: userErr } = await supabase
      .from('users')
      .select('username')
      .in('username', userNames);
    if (userErr) throw userErr;

    const userSet = new Set((users || []).map(user => user.username));

    const drawNameById = new Map((draws || []).map(draw => [draw.id, draw.draw_name]));

    const reportMap = new Map();

    filteredMatches.forEach(match => {
      const players = [match.player1, match.player2].filter(Boolean);
      players.forEach(player => {
        if (!userSet.has(player)) return;
        const key = `${drawNameById.get(match.draw_id) || ''}|||${player}`;
        const entry = reportMap.get(key) || {
          draw_name: drawNameById.get(match.draw_id) || '',
          player_name: player,
          match_results: [],
          total_win: 0,
          total_loss: 0
        };

        const opponent = player === match.player1 ? match.player2 : match.player1;
        const result = match.winner === player ? 'Win' : 'Loss';
        const score = match.match_score || '';
        entry.match_results.push(`vs ${opponent}: ${result} (${score})`);
        if (result === 'Win') entry.total_win += 1;
        else entry.total_loss += 1;
        reportMap.set(key, entry);
      });
    });

    const report = Array.from(reportMap.values()).map(entry => ({
      ...entry,
      match_results: entry.match_results.join('; ')
    }));

    report.sort((a, b) => {
      if (a.draw_name < b.draw_name) return -1;
      if (a.draw_name > b.draw_name) return 1;
      if (b.total_win !== a.total_win) return b.total_win - a.total_win;
      if (a.total_loss !== b.total_loss) return a.total_loss - b.total_loss;
      return a.player_name.localeCompare(b.player_name);
    });

    res.json(report);
  } catch (error) {
    console.error('Error generating monthly player performance report:', error.message || error);
    res.status(500).json({ message: 'Error generating report.' });
  }
});

// ...existing code...

// Admin: Add tournament with events and draws
app.post('/api/admin/add-tournament-with-events-draws', async (req, res) => {
  const { tournament, teams } = req.body;
  if (!tournament || !Array.isArray(teams) || teams.length === 0) {
    return res.status(400).json({ message: 'Missing tournament or teams data' });
  }
  try {
    const { data: tournamentRow, error: tourErr } = await supabase
      .from('tournaments')
      .insert([
        {
          name: tournament.name,
          date: tournament.date,
          category: tournament.category,
          fee: tournament.fee,
          status: tournament.status,
          location: tournament.location,
          Age_criteria: tournament.Age_criteria
        }
      ])
      .select('id')
      .single();
    if (tourErr) throw tourErr;

    const tournamentId = tournamentRow.id;

    for (const team of teams) {
      const { data: teamRow, error: teamErr } = await supabase
        .from('Team_design')
        .insert([{ tournament_id: tournamentId, team_name: team.team_name }])
        .select('id')
        .single();
      if (teamErr) throw teamErr;
      const teamId = teamRow.id;

      for (const event of team.events) {
        const { data: eventRow, error: eventErr } = await supabase
          .from('events')
          .insert([{ team_id: teamId, event_name: event.event_type }])
          .select('id')
          .single();
        if (eventErr) throw eventErr;
        const eventId = eventRow.id;

        if (Array.isArray(event.draws)) {
          for (const draw of event.draws) {
            const { error: drawErr } = await supabase
              .from('draws')
              .insert([
                {
                  event_id: eventId,
                  draw_name: typeof draw.draw_name !== 'undefined' ? draw.draw_name : null,
                  draw_size: typeof draw.draw_size !== 'undefined' ? draw.draw_size : null,
                  winner: typeof draw.winner !== 'undefined' ? draw.winner : null,
                  runnersup: typeof draw.runnersup !== 'undefined' ? draw.runnersup : null,
                  prize_money:
                    draw.prize_money === undefined || draw.prize_money === null || draw.prize_money === ''
                      ? 0
                      : draw.prize_money
                }
              ]);
            if (drawErr) throw drawErr;
          }
        }
      }
    }

    res.json({ success: true, tournamentId });
  } catch (error) {
    console.error('Error adding tournament with teams, events, and draws:', error.message || error);
    res.status(500).json({ message: 'Error adding tournament with teams, events, and draws.' });
  }
});

// Test Supabase connection
(async () => {
  try {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    if (error) throw error;
    console.log('Supabase connection successful');
  } catch (err) {
    console.error('Supabase connection failed:', err.message || err);
  }
})();

// GET /api/user-matches/:userName
// Returns all matches for a user, with tournament category and updated_at
//app.get('/api/user-matches/:userName', async (req, res) => {
//  try {
//    const { userName } = req.params;
//    // Find matches where user is player1 or player2
//    const [rows] = await pool.execute(
//      `SELECT md.id, md.tournament_id, md.tournament_name, t.category as tournament_category, md.player1, md.player2, md.court, md.time_slot, DATE_FORMAT(md.match_date, '%Y-%m-%d') AS match_date, md.winner, md.match_score, md.match_status, md.created_at, md.updated_at
//       FROM match_draws md
//       JOIN tournaments t ON md.tournament_id = t.id
//       WHERE md.player1 = ? OR md.player2 = ?`,
//      [userName, userName]
//    );
//    res.json(rows);
//  } catch (error) {
//    console.error('Error fetching user matches:', error.message);
//    res.status(500).json({ message: 'Internal server error while fetching user matches.' });
//  }
//});
app.get('/api/user-matches/:userName', async (req, res) => {
  try {
    const { userName } = req.params;

    const { data: rows, error: matchesErr } = await supabase
      .from('match_draws')
      .select('id, draw_id, player1, player2, player1_p, player2_p, winner, match_score, match_status, court, time_slot, match_date, created_at, updated_at')
      .or(`player1.eq.${userName},player2.eq.${userName},player1_p.eq.${userName},player2_p.eq.${userName}`)
      .order('match_date', { ascending: false });
    if (matchesErr) throw matchesErr;

    const drawIds = [...new Set((rows || []).map(match => match.draw_id).filter(Boolean))];
    const { data: draws, error: drawsErr } = await supabase
      .from('draws')
      .select('id, draw_name, event_id')
      .in('id', drawIds);
    if (drawsErr) throw drawsErr;

    const eventIds = [...new Set((draws || []).map(draw => draw.event_id).filter(Boolean))];
    const { data: events, error: eventsErr } = await supabase
      .from('events')
      .select('id, event_name, team_id')
      .in('id', eventIds);
    if (eventsErr) throw eventsErr;

    const teamIds = [...new Set((events || []).map(event => event.team_id).filter(Boolean))];
    const { data: teams, error: teamsErr } = await supabase
      .from('Team_design')
      .select('id, team_name, tournament_id')
      .in('id', teamIds);
    if (teamsErr) throw teamsErr;

    const tournamentIds = [...new Set((teams || []).map(team => team.tournament_id).filter(Boolean))];
    const { data: tournaments, error: tournamentsErr } = await supabase
      .from('tournaments')
      .select('id, name, category, location')
      .in('id', tournamentIds);
    if (tournamentsErr) throw tournamentsErr;

    const drawMap = new Map((draws || []).map(draw => [draw.id, draw]));
    const eventMap = new Map((events || []).map(event => [event.id, event]));
    const teamMap = new Map((teams || []).map(team => [team.id, team]));
    const tournamentMap = new Map((tournaments || []).map(t => [t.id, t]));

    const enriched = (rows || []).map(match => {
      const draw = drawMap.get(match.draw_id) || {};
      const event = eventMap.get(draw.event_id) || {};
      const team = teamMap.get(event.team_id) || {};
      const tournament = tournamentMap.get(team.tournament_id) || {};

      return {
        ...match,
        match_date: match.match_date ? new Date(match.match_date).toISOString().slice(0, 10) : null,
        tournament_name: tournament.name || null,
        tournament_category: tournament.category || null,
        tournament_location: tournament.location || null,
        team_name: team.team_name || null,
        event_name: event.event_name || null,
        draw_name: draw.draw_name || null
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Error fetching user matches:', error.message || error);
    res.status(500).json({ message: 'Internal server error while fetching user matches.' });
  }
});

// GET /api/tournaments
// GET /api/tournaments
app.get('/api/tournaments', async (req, res) => {
  try {
    const { data: tournaments, error } = await supabase
      .from('tournaments')
      .select('id, name, category, Age_criteria, location, status, date, fee')
      .in('status', ['Open', 'Started']);

    if (error) throw error;

    const results = [];

    for (const t of tournaments) {
      // Find a single draw for this tournament by traversing team_design -> events -> draws
      let draw_id = null;
      let draw_name = null;

      const { data: teamDesigns, error: tdErr } = await supabase.from('Team_design').select('id').eq('tournament_id', t.id).limit(1);
      if (tdErr) throw tdErr;
      if (teamDesigns && teamDesigns.length > 0) {
        const teamId = teamDesigns[0].id;
        const { data: events, error: evErr } = await supabase.from('events').select('id').eq('team_id', teamId).limit(1);
        if (evErr) throw evErr;
        if (events && events.length > 0) {
          const eventId = events[0].id;
          const { data: draws, error: drErr } = await supabase.from('draws').select('id, draw_name').eq('event_id', eventId).limit(1);
          if (drErr) throw drErr;
          if (draws && draws.length > 0) {
            draw_id = draws[0].id;
            draw_name = draws[0].draw_name;
          }
        }
      }

      results.push({ ...t, draw_id, draw_name });
    }

    res.json(results);
  } catch (error) {
    console.error('Error fetching tournaments:', error.message || error);
    res.status(500).json({ message: 'Error fetching tournaments from the database.' });
  }
});

// GET /api/attendance
// GET /api/attendance
app.get('/api/attendance', async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('attendance')
      .select('id, tournament_name, in_user, in_partner, out_user, out_partner, draw_id')
      .order('id', { ascending: false });
    if (error) throw error;

    const result = (rows || []).map(row => ({
      ...row,
      pair: row.in_partner ? `${row.in_user} & ${row.in_partner}` : row.in_user
    }));
    res.json(result);
  } catch (error) {
    console.error('Error fetching attendance:', error.message || error);
    res.status(500).json({ message: 'Error fetching attendance from the database.' });
  }
});

// GET /api/eligible-partners?draw_id=123
app.get('/api/eligible-partners', async (req, res) => {
  const { draw_id } = req.query;
  if (!draw_id) {
    return res.status(400).json({ message: 'draw_id is required' });
  }
  try {
    const { data: users, error: usersErr } = await supabase.from('users').select('username');
    if (usersErr) throw usersErr;

    const { data: attendance, error: attendanceErr } = await supabase
      .from('attendance')
      .select('in_user, in_partner')
      .eq('draw_id', draw_id);
    if (attendanceErr) throw attendanceErr;

    const paired = new Set();
    (attendance || []).forEach(row => {
      if (row.in_partner) {
        paired.add(row.in_user);
        paired.add(row.in_partner);
      }
    });

    const eligible = (users || [])
      .map(u => u.username)
      .filter(username => !paired.has(username));
    res.json(eligible);
  } catch (error) {
    console.error('Error fetching eligible partners:', error.message || error);
    res.status(500).json({ message: 'Error fetching eligible partners' });
  }
});

// POST /api/attendance
app.post('/api/attendance', async (req, res) => {
  const { tournamentName, in_user, in_partner, out_user, out_partner, draw_id } = req.body;
  if (!tournamentName || !in_user || !draw_id) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  try {
    // Prevent duplicate In attendance
    // changed for supabase in this line .or(`(in_user.eq.${in_user},in_partner.eq.${in_user})`) to remove exra bracket
    const { data: existingRows, error: existErr } = await supabase
      .from('attendance')
      .select('*')
      .or(`in_user.eq.${in_user},in_partner.eq.${in_user}`)
      .eq('tournament_name', tournamentName)
      .eq('draw_id', draw_id);
    if (existErr) throw existErr;
    if (existingRows && existingRows.length > 0) {
      return res.status(400).json({ message: 'You are already entered. If you want to exit, click on Out button.' });
    }

    // If a partner is selected, remove any solo entry for that partner for this draw
    if (in_partner) {
      const { error: delErrNull } = await supabase
        .from('attendance')
        .delete()
        .match({ in_user: in_partner, draw_id, in_partner: null });
      if (delErrNull) throw delErrNull;

      const { error: delErrEmpty } = await supabase
        .from('attendance')
        .delete()
        .match({ in_user: in_partner, draw_id, in_partner: '' });
      if (delErrEmpty) throw delErrEmpty;
    }

    const { error: insertErr } = await supabase.from('attendance').insert([
      {
        tournament_name: tournamentName,
        in_user: in_user,
        in_partner: in_partner || null,
        out_user: out_user || null,
        out_partner: out_partner || null,
        draw_id
      }
    ]);
    if (insertErr) throw insertErr;
    res.json({ message: 'Attendance recorded successfully' });
  } catch (error) {
    console.error('Error saving attendance:', error.message || error);
    res.status(500).json({ message: 'Error saving attendance to the database.' });
  }
});

// POST /api/login
// POST /api/register
// ...existing code...
app.post('/api/register', async (req, res) => {
  const { username, password, full_name, date_of_birth } = req.body;
  if (!username || !password || !full_name) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  try {
    const { data: existing, error: existErr } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .limit(1);
    if (existErr) throw existErr;
    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Username already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const { error: insertErr } = await supabase.from('users').insert([
      { username, password_hash, full_name, date_of_birth: date_of_birth || null, is_admin: false }
    ]);
    if (insertErr) throw insertErr;

    res.json({ success: true, message: 'Registration successful' });
  } catch (error) {
    console.error('Registration error:', error.message || error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { data: rows, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .limit(1);
    if (error) throw error;
    if (!rows || rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (match) {
      const userObj = { ...user, isAdmin: !!user.is_admin };
      res.json({ success: true, user: userObj });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error.message || error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/user-rankings
// POST /api/user-rankings
app.post('/api/user-rankings', async (req, res) => {
  const { user_id, ranking, tournament_category, initial_ranking, Location } = req.body;
  if (!user_id || typeof ranking === 'undefined' || !tournament_category || typeof initial_ranking === 'undefined' || !Location) {
    return res.status(400).json({ message: 'Missing required fields for ranking insertion' });
  }
  try {
    // Insert new ranking record
    const { error } = await supabase.from('user_rankings').insert([
      {
        user_id,
        ranking,
        tournament_category,
        initial_ranking,
        Location
      }
    ]);
    if (error) throw error;
    res.json({ success: true, message: 'Ranking inserted successfully' });
  } catch (error) {
    console.error('Error inserting ranking:', error.message);
    res.status(500).json({ message: 'Error inserting ranking into the database.' });
  }
});
app.get('/api/user-rankings', async (req, res) => {
  try {
    // Join user_rankings with users to get username (requires FK relationship)
    const { data, error } = await supabase.from('user_rankings').select('*, users(username)');
    if (error) throw error;
    // Normalize shape: move users.username to username
    const rows = (data || []).map(r => ({ ...r, username: r.users ? r.users.username : undefined }));
    res.json(rows);
  } catch (error) {
    console.error('Error fetching rankings:', error.message);
    res.status(500).json({ message: 'Error fetching rankings from the database.' });
  }
});

// GET /api/users
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('id, username, full_name');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching users:', error.message);
    res.status(500).json({ message: 'Error fetching users from the database.' });
  }
});

// GET /api/match-draw/:tournamentId
app.get('/api/match-draw/:draw_id', async (req, res) => {
  try {
    const { draw_id } = req.params;
    const { data: matches, error: matchesErr } = await supabase
      .from('match_draws')
      .select('id, draw_id, player1, player1_p, player2, player2_p, court, time_slot, match_date, winner, match_score, match_status, created_at, updated_at')
      .eq('draw_id', draw_id);
    if (matchesErr) throw matchesErr;

    const { data: drawInfo, error: drawErr } = await supabase
      .from('draws')
      .select('draw_name')
      .eq('id', draw_id)
      .single();
    if (drawErr && drawErr.code !== 'PGRST116') throw drawErr;

    const result = (matches || []).map(match => ({
      ...match,
      draw_name: drawInfo ? drawInfo.draw_name : null,
      match_date: match.match_date ? new Date(match.match_date).toISOString().slice(0, 10) : null
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching match draw:', error.message || error);
    res.status(500).json({ message: 'Error fetching match draw from the database.' });
  }
});

// POST /api/match-draw
app.post('/api/match-draw', async (req, res) => {
  try {
    const { draw_id, tournamentId, matches } = req.body;

    if (!draw_id || !tournamentId || !Array.isArray(matches)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const { error: deleteErr } = await supabase
      .from('match_draws')
      .delete()
      .eq('draw_id', draw_id);
    if (deleteErr) throw deleteErr;

    for (const match of matches) {
      const {
        player1,
        player2,
        court,
        time_slot,
        winner,
        match_score,
        match_status,
        date
      } = match;
      const [player1_main, player1_partner] = (player1 || '').split('::');
      const [player2_main, player2_partner] = (player2 || '').split('::');
      const match_date = (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : null;

      const { error: insertErr } = await supabase.from('match_draws').insert([
        {
          draw_id,
          player1: player1_main || '',
          player1_p: player1_partner || null,
          player2: player2_main || '',
          player2_p: player2_partner || null,
          court: court || '',
          time_slot: time_slot || '',
          match_date,
          winner: winner || '',
          match_score: match_score || '',
          match_status: match_status || 'scheduled'
        }
      ]);
      if (insertErr) throw insertErr;
    }

    const { error: updateErr } = await supabase
      .from('tournaments')
      .update({ status: 'Started' })
      .eq('id', tournamentId);
    if (updateErr) throw updateErr;

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving match draw:', error.message || error);
    res.status(500).json({ message: 'Error saving match draw to database.' });
  }
});


// PUT /api/tournaments/:tournamentId/status
app.put('/api/tournaments/:tournamentId/status', async (req, res) => {
  const { tournamentId } = req.params;
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ message: 'Missing status field' });
  }
  try {
    const { data, error } = await supabase
  .from('tournaments')
  .update({ status })
  .eq('id', tournamentId)
  .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Tournament not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating tournament status:', error.message || error);
    res.status(500).json({ message: 'Error updating tournament status in the database.' });
  }
});
// PUT /api/match-draw/:matchId/result
//added code(select();) for supabse compatibility by asheesh on 25june2026
app.put('/api/match-draw/:matchId/result', async (req, res) => {
  try {
    const { matchId } = req.params;
    const { winner, winner_p, match_score, player1Ranking, player2Ranking, tournamentCategory, tournamentLocation } = req.body;
    if (!winner) {
      return res.status(400).json({ message: 'Winner is required' });
    }

    const { data: updatedMatch, error: updateErr } = await supabase
  .from('match_draws')
  .update({
    winner,
    winner_p: winner_p || '',
    match_score: match_score || '',
    match_status: 'completed',
    updated_at: new Date().toISOString()
  })
  .eq('id', matchId)
  .select();
    if (updateErr) throw updateErr;
    if (!updatedMatch || updatedMatch.length === 0) {
      return res.status(404).json({ message: 'Match not found' });
    }

    const { data: matchRows, error: matchErr } = await supabase
      .from('match_draws')
      .select('player1, player1_p, player2, player2_p, winner, winner_p, draw_id')
      .eq('id', matchId)
      .single();
    if (matchErr) throw matchErr;

    const { player1, player1_p, player2, player2_p } = matchRows;
    let loser = '';
    if (winner === player1 && (winner_p || '') === (player1_p || '')) {
      loser = player2;
    } else {
      loser = player1;
    }

    const usernames = [player1, player1_p, player2, player2_p, winner, winner_p].filter(Boolean);
    const { data: userRows, error: userErr } = await supabase
      .from('users')
      .select('id, username')
      .in('username', usernames);
    if (userErr) throw userErr;

    const getUserId = uname => {
      const u = (userRows || []).find(row => row.username === uname);
      return u ? u.id : null;
    };
    const player1Id = getUserId(player1);
    const player1_pId = getUserId(player1_p);
    const player2Id = getUserId(player2);
    const player2_pId = getUserId(player2_p);

    const { data: drawInfo, error: drawErr } = await supabase
      .from('draws')
      .select('draw_name')
      .eq('id', matchRows.draw_id)
      .single();
    if (drawErr && drawErr.code !== 'PGRST116') throw drawErr;
    const drawName = drawInfo ? drawInfo.draw_name : '';

    const updateOrInsertRanking = async (userId, rankingValue) => {
      if (!userId || typeof rankingValue === 'undefined') return;
      const { data: existingRank, error: existingErr } = await supabase
        .from('user_rankings')
        .select('ranking')
        .match({ user_id: userId, tournament_category: tournamentCategory || '', draw_name: drawName, Location: tournamentLocation || '' })
        .limit(1);
      if (existingErr) throw existingErr;

      if (existingRank && existingRank.length > 0) {
        const currentRanking = existingRank[0].ranking;
        const { error: rankUpdateErr } = await supabase
          .from('user_rankings')
          .update({ initial_ranking: currentRanking, ranking: rankingValue })
          .match({ user_id: userId, tournament_category: tournamentCategory || '', draw_name: drawName, Location: tournamentLocation || '' });
        if (rankUpdateErr) throw rankUpdateErr;
      } else {
        const { error: insertRankErr } = await supabase.from('user_rankings').insert([
          {
            user_id: userId,
            ranking: rankingValue,
            tournament_category: tournamentCategory || '',
            draw_name: drawName,
            initial_ranking: rankingValue,
            total_points: 0,
            Location: tournamentLocation || ''
          }
        ]);
        if (insertRankErr) throw insertRankErr;
      }
    };

    await updateOrInsertRanking(player1Id, player1Ranking);
    await updateOrInsertRanking(player2Id, player2Ranking);
    await updateOrInsertRanking(player1_pId, player1Ranking);
    await updateOrInsertRanking(player2_pId, player2Ranking);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating match result:', error.message || error);
    res.status(500).json({ message: 'Error updating match result.' });
  }
});

app.get('/api/tournament-event-name/:tournamentId', async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { data: teamRows, error: teamErr } = await supabase
      .from('Team_design')
      .select('id')
      .eq('tournament_id', tournamentId)
      .limit(1);
    if (teamErr) throw teamErr;

    if (!teamRows || teamRows.length === 0) {
      return res.json({ event_name: null });
    }

    const teamId = teamRows[0].id;
    const { data: eventRows, error: eventErr } = await supabase
      .from('events')
      .select('event_name')
      .eq('team_id', teamId)
      .neq('event_name', '')
      .limit(1);
    if (eventErr) throw eventErr;

    if (eventRows && eventRows.length > 0) {
      res.json({ event_name: eventRows[0].event_name });
    } else {
      res.json({ event_name: null });
    }
  } catch (error) {
    console.error('Error fetching event name:', error.message || error);
    res.status(500).json({ message: 'Error fetching event name.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


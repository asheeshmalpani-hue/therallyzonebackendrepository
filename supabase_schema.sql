-- Supabase Database Schema for Tennis Tournament Portal
-- PostgreSQL syntax for Supabase
-- Tables organized by logical dependencies

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  date_of_birth DATE,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_is_admin ON users(is_admin);

-- ============================================
-- 2. TOURNAMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tournaments (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  date DATE NOT NULL,
  category VARCHAR(50),
  fee DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'Open',
  location VARCHAR(150),
  Age_criteria VARCHAR(20) DEFAULT 'Open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tournament_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournament_category ON tournaments(category);
CREATE INDEX IF NOT EXISTS idx_tournament_date ON tournaments(date);

-- ============================================
-- 3. TEAM_DESIGN TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS Team_Design (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tournament_id, team_name)
);

CREATE INDEX IF NOT EXISTS idx_team_design_tournament_id ON Team_Design(tournament_id);

-- ============================================
-- 4. EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES Team_Design(id) ON DELETE CASCADE,
  event_name VARCHAR(150),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_team_id ON events(team_id);

-- ============================================
-- 5. DRAWS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS draws (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  draw_name VARCHAR(150),
  draw_size INT,
  winner VARCHAR(150),
  runnersup VARCHAR(150),
  prize_money DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_draws_event_id ON draws(event_id);
CREATE INDEX IF NOT EXISTS idx_draws_draw_name ON draws(draw_name);

-- ============================================
-- 6. ATTENDANCE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  tournament_name VARCHAR(200),
  draw_id BIGINT REFERENCES draws(id) ON DELETE SET NULL,
  in_user VARCHAR(100),
  in_partner VARCHAR(100),
  out_user VARCHAR(100),
  out_partner VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_tournament_name ON attendance(tournament_name);
CREATE INDEX IF NOT EXISTS idx_attendance_draw_id ON attendance(draw_id);
CREATE INDEX IF NOT EXISTS idx_attendance_in_user ON attendance(in_user);
CREATE INDEX IF NOT EXISTS idx_attendance_out_user ON attendance(out_user);

-- ============================================
-- 7. MATCH_DRAWS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS match_draws (
  id BIGSERIAL PRIMARY KEY,
  draw_id BIGINT NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
  player1 VARCHAR(100),
  player1_p VARCHAR(100),
  player2 VARCHAR(100),
  player2_p VARCHAR(100),
  winner VARCHAR(100),
  winner_p VARCHAR(100),
  match_score VARCHAR(50),
  match_status VARCHAR(50) DEFAULT 'pending',
  court VARCHAR(50),
  time_slot VARCHAR(50),
  match_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_match_draws_draw_id ON match_draws(draw_id);
CREATE INDEX IF NOT EXISTS idx_match_draws_player1 ON match_draws(player1);
CREATE INDEX IF NOT EXISTS idx_match_draws_player2 ON match_draws(player2);
CREATE INDEX IF NOT EXISTS idx_match_draws_winner ON match_draws(winner);
CREATE INDEX IF NOT EXISTS idx_match_draws_match_status ON match_draws(match_status);
CREATE INDEX IF NOT EXISTS idx_match_draws_match_date ON match_draws(match_date);

-- ============================================
-- 8. USER_RANKINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_rankings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ranking INT,
  initial_ranking INT,
  tournament_category VARCHAR(50),
  draw_name VARCHAR(150),
  total_points INT DEFAULT 0,
  Location VARCHAR(150),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, tournament_category, draw_name, Location)
);

CREATE INDEX IF NOT EXISTS idx_user_rankings_user_id ON user_rankings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_rankings_tournament_category ON user_rankings(tournament_category);
CREATE INDEX IF NOT EXISTS idx_user_rankings_draw_name ON user_rankings(draw_name);
CREATE INDEX IF NOT EXISTS idx_user_rankings_location ON user_rankings(Location);

-- ============================================
-- INDEXES FOR COMMON QUERIES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_match_draws_date ON match_draws(match_date);
CREATE INDEX IF NOT EXISTS idx_match_draws_status_completed ON match_draws(match_status) WHERE match_status = 'completed';
CREATE INDEX IF NOT EXISTS idx_tournaments_category_status ON tournaments(category, status);
CREATE INDEX IF NOT EXISTS idx_tournaments_date_desc ON tournaments(date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_draw_inuser ON attendance(draw_id, in_user) WHERE in_user IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_draw_outuser ON attendance(draw_id, out_user) WHERE out_user IS NOT NULL;

-- ============================================
-- HELPFUL QUERIES
-- ============================================
-- Get all tournaments for a given category and status:
-- SELECT * FROM tournaments WHERE category = 'Ladder' AND status = 'Open';

-- Get all matches for a specific draw:
-- SELECT * FROM match_draws WHERE draw_id = $1 ORDER BY match_date;

-- Get player attendance for a draw:
-- SELECT * FROM attendance WHERE draw_id = $1 ORDER BY created_at DESC;

-- Get player rankings for a tournament category:
-- SELECT * FROM user_rankings WHERE tournament_category = 'Ladder' AND Location = 'Jaipur' ORDER BY ranking ASC;

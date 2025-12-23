-- New Player Additions for Production Database
-- Run this SQL in the Production Database via the Database Pane > SQL Console
-- Added: December 2024

-- ========================================
-- NBA ADDITIONS (30 players)
-- ========================================

-- NBA Guards (12)
INSERT INTO player_registry (sport, player_name, career_stage, role_tier, position_group) VALUES
('NBA', 'Stephon Castle', 'ROOKIE', 'EMERGING_STARTER', 'GUARD'),
('NBA', 'Reed Sheppard', 'ROOKIE', 'EMERGING_STARTER', 'GUARD'),
('NBA', 'Jared McCain', 'ROOKIE', 'EMERGING_STARTER', 'GUARD'),
('NBA', 'Dalton Knecht', 'ROOKIE', 'EMERGING_STARTER', 'GUARD'),
('NBA', 'Darius Garland', 'PRIME', 'FRANCHISE_CORE', 'GUARD'),
('NBA', 'Jalen Williams', 'RISING', 'FRANCHISE_CORE', 'GUARD'),
('NBA', 'Austin Reaves', 'PRIME', 'SOLID_STARTER', 'GUARD'),
('NBA', 'Coby White', 'PRIME', 'SOLID_STARTER', 'GUARD'),
('NBA', 'Desmond Bane', 'PRIME', 'SOLID_STARTER', 'GUARD'),
('NBA', 'Keyonte George', 'RISING', 'EMERGING_STARTER', 'GUARD'),
('NBA', 'Gradey Dick', 'RISING', 'EMERGING_STARTER', 'GUARD'),
('NBA', 'Jalen Green', 'RISING', 'SOLID_STARTER', 'GUARD')
ON CONFLICT (sport, player_name) DO NOTHING;

-- NBA Forwards (12)
INSERT INTO player_registry (sport, player_name, career_stage, role_tier, position_group) VALUES
('NBA', 'Zaccharie Risacher', 'ROOKIE', 'EMERGING_STARTER', 'FORWARD'),
('NBA', 'Alexandre Sarr', 'ROOKIE', 'EMERGING_STARTER', 'FORWARD'),
('NBA', 'Scottie Barnes', 'RISING', 'FRANCHISE_CORE', 'FORWARD'),
('NBA', 'Jaime Jaquez Jr.', 'RISING', 'SOLID_STARTER', 'FORWARD'),
('NBA', 'Keegan Murray', 'RISING', 'SOLID_STARTER', 'FORWARD'),
('NBA', 'Jalen Duren', 'RISING', 'EMERGING_STARTER', 'FORWARD'),
('NBA', 'Jonathan Kuminga', 'RISING', 'SOLID_STARTER', 'FORWARD'),
('NBA', 'Herb Jones', 'PRIME', 'SOLID_STARTER', 'FORWARD'),
('NBA', 'Tari Eason', 'RISING', 'EMERGING_STARTER', 'FORWARD'),
('NBA', 'Keldon Johnson', 'PRIME', 'SOLID_STARTER', 'FORWARD'),
('NBA', 'Jalen Suggs', 'RISING', 'SOLID_STARTER', 'FORWARD'),
('NBA', 'Dyson Daniels', 'RISING', 'EMERGING_STARTER', 'FORWARD')
ON CONFLICT (sport, player_name) DO NOTHING;

-- NBA Centers (6)
INSERT INTO player_registry (sport, player_name, career_stage, role_tier, position_group) VALUES
('NBA', 'Donovan Clingan', 'ROOKIE', 'EMERGING_STARTER', 'CENTER'),
('NBA', 'Zach Edey', 'ROOKIE', 'EMERGING_STARTER', 'CENTER'),
('NBA', 'Walker Kessler', 'RISING', 'SOLID_STARTER', 'CENTER'),
('NBA', 'Onyeka Okongwu', 'RISING', 'SOLID_STARTER', 'CENTER'),
('NBA', 'Mark Williams', 'RISING', 'EMERGING_STARTER', 'CENTER'),
('NBA', 'Dereck Lively II', 'RISING', 'EMERGING_STARTER', 'CENTER')
ON CONFLICT (sport, player_name) DO NOTHING;

-- ========================================
-- NFL ADDITIONS (49 players)
-- ========================================

-- NFL Edge Rushers (14)
INSERT INTO player_registry (sport, player_name, career_stage, role_tier, position_group) VALUES
('NFL', 'Myles Garrett', 'PRIME', 'FRANCHISE_CORE', 'EDGE'),
('NFL', 'T.J. Watt', 'PRIME', 'FRANCHISE_CORE', 'EDGE'),
('NFL', 'Micah Parsons', 'RISING', 'FRANCHISE_CORE', 'EDGE'),
('NFL', 'Nick Bosa', 'PRIME', 'FRANCHISE_CORE', 'EDGE'),
('NFL', 'Trey Hendrickson', 'PRIME', 'FRANCHISE_CORE', 'EDGE'),
('NFL', 'Jared Verse', 'ROOKIE', 'EMERGING_STARTER', 'EDGE'),
('NFL', 'Will Anderson Jr.', 'RISING', 'FRANCHISE_CORE', 'EDGE'),
('NFL', 'Aidan Hutchinson', 'RISING', 'FRANCHISE_CORE', 'EDGE'),
('NFL', 'Khalil Mack', 'VETERAN', 'SOLID_STARTER', 'EDGE'),
('NFL', 'Maxx Crosby', 'PRIME', 'FRANCHISE_CORE', 'EDGE'),
('NFL', 'Danielle Hunter', 'PRIME', 'SOLID_STARTER', 'EDGE'),
('NFL', 'Za''Darius Smith', 'VETERAN', 'SOLID_STARTER', 'EDGE'),
('NFL', 'Von Miller', 'VETERAN', 'SOLID_STARTER', 'EDGE'),
('NFL', 'Joey Bosa', 'PRIME', 'SOLID_STARTER', 'EDGE')
ON CONFLICT (sport, player_name) DO NOTHING;

-- NFL Cornerbacks (15)
INSERT INTO player_registry (sport, player_name, career_stage, role_tier, position_group) VALUES
('NFL', 'Sauce Gardner', 'RISING', 'FRANCHISE_CORE', 'CB'),
('NFL', 'Pat Surtain II', 'RISING', 'FRANCHISE_CORE', 'CB'),
('NFL', 'Trent McDuffie', 'RISING', 'FRANCHISE_CORE', 'CB'),
('NFL', 'Denzel Ward', 'PRIME', 'FRANCHISE_CORE', 'CB'),
('NFL', 'DaRon Bland', 'RISING', 'FRANCHISE_CORE', 'CB'),
('NFL', 'Devon Witherspoon', 'RISING', 'FRANCHISE_CORE', 'CB'),
('NFL', 'Jalen Ramsey', 'PRIME', 'FRANCHISE_CORE', 'CB'),
('NFL', 'Derek Stingley Jr.', 'RISING', 'FRANCHISE_CORE', 'CB'),
('NFL', 'Jaylon Johnson', 'PRIME', 'SOLID_STARTER', 'CB'),
('NFL', 'Cooper DeJean', 'ROOKIE', 'EMERGING_STARTER', 'CB'),
('NFL', 'Quinyon Mitchell', 'ROOKIE', 'EMERGING_STARTER', 'CB'),
('NFL', 'Terrion Arnold', 'ROOKIE', 'EMERGING_STARTER', 'CB'),
('NFL', 'Marshon Lattimore', 'PRIME', 'SOLID_STARTER', 'CB'),
('NFL', 'Marlon Humphrey', 'PRIME', 'SOLID_STARTER', 'CB'),
('NFL', 'Christian Gonzalez', 'RISING', 'FRANCHISE_CORE', 'CB')
ON CONFLICT (sport, player_name) DO NOTHING;

-- NFL Linebackers (10)
INSERT INTO player_registry (sport, player_name, career_stage, role_tier, position_group) VALUES
('NFL', 'Fred Warner', 'PRIME', 'FRANCHISE_CORE', 'LB'),
('NFL', 'Roquan Smith', 'PRIME', 'FRANCHISE_CORE', 'LB'),
('NFL', 'Bobby Wagner', 'VETERAN', 'FRANCHISE_CORE', 'LB'),
('NFL', 'Zack Baun', 'PRIME', 'FRANCHISE_CORE', 'LB'),
('NFL', 'Patrick Queen', 'PRIME', 'SOLID_STARTER', 'LB'),
('NFL', 'Devin White', 'PRIME', 'SOLID_STARTER', 'LB'),
('NFL', 'Dre Greenlaw', 'PRIME', 'SOLID_STARTER', 'LB'),
('NFL', 'Lavonte David', 'VETERAN', 'SOLID_STARTER', 'LB'),
('NFL', 'Demario Davis', 'VETERAN', 'SOLID_STARTER', 'LB'),
('NFL', 'Tremaine Edmunds', 'PRIME', 'SOLID_STARTER', 'LB')
ON CONFLICT (sport, player_name) DO NOTHING;

-- NFL Safeties (10)
INSERT INTO player_registry (sport, player_name, career_stage, role_tier, position_group) VALUES
('NFL', 'Kyle Hamilton', 'RISING', 'FRANCHISE_CORE', 'S'),
('NFL', 'Derwin James Jr.', 'PRIME', 'FRANCHISE_CORE', 'S'),
('NFL', 'Jessie Bates III', 'PRIME', 'FRANCHISE_CORE', 'S'),
('NFL', 'Minkah Fitzpatrick', 'PRIME', 'FRANCHISE_CORE', 'S'),
('NFL', 'Xavier McKinney', 'PRIME', 'FRANCHISE_CORE', 'S'),
('NFL', 'Kerby Joseph', 'RISING', 'FRANCHISE_CORE', 'S'),
('NFL', 'Jevon Holland', 'RISING', 'SOLID_STARTER', 'S'),
('NFL', 'Antoine Winfield Jr.', 'PRIME', 'FRANCHISE_CORE', 'S'),
('NFL', 'Talanoa Hufanga', 'RISING', 'SOLID_STARTER', 'S'),
('NFL', 'Justin Simmons', 'VETERAN', 'SOLID_STARTER', 'S')
ON CONFLICT (sport, player_name) DO NOTHING;

-- ========================================
-- VERIFICATION QUERY (run after inserts)
-- ========================================
-- SELECT sport, COUNT(*) as total FROM player_registry GROUP BY sport ORDER BY sport;

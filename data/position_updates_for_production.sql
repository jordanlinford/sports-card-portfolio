-- Position Updates for Production Database
-- Run this SQL in the Production Database via the Database Pane

-- ========================================
-- NBA PLAYERS (120 total)
-- ========================================

-- NBA Guards (52)
UPDATE player_registry SET position_group = 'GUARD' WHERE sport = 'NBA' AND player_name IN (
  'Alex Caruso', 'Allen Iverson', 'Anfernee Simons', 'Bogdan Bogdanovic', 'Bradley Beal',
  'Buddy Hield', 'Cade Cunningham', 'Cam Thomas', 'Chris Paul', 'De''Aaron Fox',
  'DeMar DeRozan', 'Dejounte Murray', 'Derrick White', 'Devin Booker', 'Donovan Mitchell',
  'Dwyane Wade', 'Fred VanVleet', 'Immanuel Quickley', 'Ja Morant', 'Jaden Ivey',
  'Jalen Brunson', 'Jamal Murray', 'James Harden', 'Jordan Poole', 'Josh Giddey',
  'Jrue Holiday', 'Kyrie Irving', 'LaMelo Ball', 'Lonzo Ball', 'Luka Doncic',
  'Magic Johnson', 'Malcolm Brogdon', 'Malik Monk', 'Marcus Morris', 'Marcus Smart',
  'Michael Jordan', 'Norman Powell', 'Scoot Henderson', 'Shai Gilgeous-Alexander',
  'Spencer Dinwiddie', 'Stephen Curry', 'Trae Young', 'Tyrese Haliburton', 'Tyrese Maxey',
  'Victor Oladipo', 'Zach LaVine', 'Larry Bird', 'Kobe Bryant', 'Klay Thompson',
  'Ben Simmons', 'Amen Thompson', 'Kentavious Caldwell-Pope', 'Damian Lillard'
);

-- NBA Forwards (43)
UPDATE player_registry SET position_group = 'FORWARD' WHERE sport = 'NBA' AND player_name IN (
  'Aaron Gordon', 'Anthony Davis', 'Anthony Edwards', 'Bam Adebayo', 'Brandon Ingram',
  'Brandon Miller', 'Chet Holmgren', 'Evan Mobley', 'Franz Wagner', 'Giannis Antetokounmpo',
  'Grant Williams', 'Harrison Barnes', 'Jabari Smith Jr.', 'Jaylen Brown', 'Jayson Tatum',
  'Jerami Grant', 'John Collins', 'Karl-Anthony Towns', 'Kristaps Porzingis', 'Kyle Kuzma',
  'Paolo Banchero', 'Pascal Siakam', 'Paul George', 'RJ Barrett', 'Zion Williamson',
  'OG Anunoby', 'PJ Washington', 'Mikal Bridges', 'Kevin Durant', 'Kevin Garnett',
  'Tim Duncan', 'Charles Barkley', 'Dirk Nowitzki', 'LeBron James', 'Kawhi Leonard',
  'Andrew Wiggins', 'Julius Randle', 'Jaren Jackson Jr.', 'Paul Pierce', 'Tobias Harris',
  'Ausar Thompson', 'Cooper Flagg', 'Jimmy Butler'
);

-- NBA Centers (23)
UPDATE player_registry SET position_group = 'CENTER' WHERE sport = 'NBA' AND player_name IN (
  'Alperen Sengun', 'Anthony Bennett', 'Brook Lopez', 'Deandre Ayton', 'Chris Bosh',
  'Clint Capela', 'Darko Milicic', 'Greg Oden', 'Hakeem Olajuwon', 'Hasheem Thabeet',
  'Jarrett Allen', 'Joel Embiid', 'Kelly Olynyk', 'Shaquille O''Neal', 'Steven Adams',
  'Nikola Jokic', 'Nikola Vucevic', 'Mitchell Robinson', 'Robert Williams', 'Rudy Gobert',
  'Mason Plumlee', 'Victor Wembanyama', 'Domantas Sabonis', 'James Wiseman'
);

-- ========================================
-- NFL PLAYERS (169 total)
-- ========================================

-- NFL Quarterbacks (48)
UPDATE player_registry SET position_group = 'QB' WHERE sport = 'NFL' AND player_name IN (
  'Aaron Rodgers', 'Andy Dalton', 'Anthony Richardson', 'Baker Mayfield', 'Bo Nix',
  'Bryce Young', 'Caleb Williams', 'Drake Maye', 'Derek Carr', 'Gardner Minshew',
  'Geno Smith', 'Justin Fields', 'Joe Flacco', 'Kirk Cousins', 'Matthew Stafford',
  'Michael Penix Jr.', 'Russell Wilson', 'Jayden Daniels', 'Arch Manning', 'Brock Purdy',
  'C.J. Stroud', 'Dak Prescott', 'Daniel Jones', 'Desmond Ridder', 'Drew Brees',
  'JaMarcus Russell', 'Jameis Winston', 'Jimmy Garoppolo', 'Joe Burrow', 'Joe Montana',
  'Johnny Manziel', 'Jordan Love', 'Josh Allen', 'Josh Rosen', 'Justin Herbert',
  'Kenny Pickett', 'Lamar Jackson', 'Mac Jones', 'Patrick Mahomes', 'Peyton Manning',
  'Ryan Leaf', 'Sam Darnold', 'Sam Howell', 'Tom Brady', 'Trevor Lawrence', 'Trey Lance',
  'Tua Tagovailoa'
);

-- NFL Running Backs (41)
UPDATE player_registry SET position_group = 'RB' WHERE sport = 'NFL' AND player_name IN (
  'AJ Dillon', 'Aaron Jones', 'Alvin Kamara', 'Brian Robinson Jr.', 'Chase Brown',
  'Clyde Edwards-Helaire', 'Dalvin Cook', 'Ezekiel Elliott', 'James Cook', 'Jaylen Warren',
  'Joe Mixon', 'Josh Jacobs', 'Kendre Miller', 'Latavius Murray', 'Leonard Fournette',
  'Najee Harris', 'Roschon Johnson', 'Tony Pollard', 'Tyjae Spears', 'Tyler Allgeier',
  'Kareem Hunt', 'Zach Charbonnet', 'Antonio Gibson', 'David Montgomery', 'Jaleel McLaughlin',
  'Alexander Mattison', 'Rachaad White', 'Bijan Robinson', 'Breece Hall', 'Christian McCaffrey',
  'De''Von Achane', 'Derrick Henry', 'Isiah Pacheco', 'Jahmyr Gibbs', 'Jonathan Taylor',
  'Kenneth Walker', 'Kyren Williams', 'LaDainian Tomlinson', 'Rhamondre Stevenson',
  'Saquon Barkley', 'Travis Etienne'
);

-- NFL Wide Receivers (60)
UPDATE player_registry SET position_group = 'WR' WHERE sport = 'NFL' AND player_name IN (
  'Adam Thielen', 'Allen Lazard', 'Amari Cooper', 'Brandin Cooks', 'Brandon Aiyuk',
  'Calvin Ridley', 'Chris Godwin', 'Chris Olave', 'Courtland Sutton', 'Curtis Samuel',
  'Darnell Mooney', 'DeAndre Hopkins', 'Deebo Samuel', 'Diontae Johnson', 'Elijah Moore',
  'George Pickens', 'Jakobi Meyers', 'Jaxon Smith-Njigba', 'JuJu Smith-Schuster', 'Keenan Allen',
  'Malik Nabers', 'Marvin Harrison Jr.', 'Michael Pittman Jr.', 'Michael Wilson', 'Mike Evans',
  'Mike Williams', 'Nico Collins', 'Odell Beckham Jr.', 'Quentin Johnston', 'Rashee Rice',
  'Rome Odunze', 'Tee Higgins', 'Terry McLaurin', 'Tyler Boyd', 'Tyler Lockett',
  'Wan''Dale Robinson', 'Zay Flowers', 'Jameson Williams', 'Jordan Addison', 'Tank Dell',
  'A.J. Brown', 'Amon-Ra St. Brown', 'Calvin Johnson', 'CeeDee Lamb', 'Cooper Kupp',
  'DK Metcalf', 'Davante Adams', 'DeVonta Smith', 'Drake London', 'Garrett Wilson',
  'Ja''Marr Chase', 'Jaylen Waddle', 'Jerry Rice', 'Justin Jefferson', 'Puka Nacua',
  'Randy Moss', 'Stefon Diggs', 'Terrell Owens'
);

-- NFL Tight Ends (20)
UPDATE player_registry SET position_group = 'TE' WHERE sport = 'NFL' AND player_name IN (
  'Brock Bowers', 'Cole Kmet', 'Dallas Goedert', 'Dalton Kincaid', 'Evan Engram',
  'Gerald Everett', 'Hunter Henry', 'Isaiah Likely', 'Kyle Pitts', 'Noah Fant',
  'Pat Freiermuth', 'Tyler Higbee', 'Zach Ertz', 'George Kittle', 'Mark Andrews',
  'Rob Gronkowski', 'Sam LaPorta', 'T.J. Hockenson', 'Tony Gonzalez', 'Travis Kelce'
);

-- ========================================
-- MLB PLAYERS (206 total)
-- ========================================

-- MLB Pitchers (59)
UPDATE player_registry SET position_group = 'PITCHER' WHERE sport = 'MLB' AND player_name IN (
  'Aaron Nola', 'Aroldis Chapman', 'Blake Snell', 'Blake Treinen', 'Bryce Miller',
  'Camilo Doval', 'Carlos Rodón', 'Chris Sale', 'Clayton Kershaw', 'Dylan Cease',
  'Edwin Diaz', 'Edwin Díaz', 'Emmanuel Clase', 'Framber Valdez', 'Gavin Williams',
  'George Kirby', 'Gerrit Cole', 'Grayson Rodriguez', 'Hunter Greene', 'Jack Flaherty',
  'Jacob deGrom', 'Joe Ryan', 'Jordan Montgomery', 'Jose Alvarado', 'Justin Verlander',
  'Kevin Gausman', 'Kodai Senga', 'Kyle Bradish', 'Kyle Harrison', 'Logan Gilbert',
  'Logan Webb', 'Luis Castillo', 'Mariano Rivera', 'Masahiro Tanaka', 'Max Fried',
  'Max Scherzer', 'Nolan Ryan', 'Pablo Lopez', 'Pablo López', 'Paul Skenes',
  'Reid Detmers', 'Roki Sasaki', 'Ryan Helsley', 'Sandy Alcantara', 'Sandy Koufax',
  'Shane Bieber', 'Shota Imanaga', 'Sonny Gray', 'Spencer Strider', 'Tanner Bibee',
  'Tarik Skubal', 'Tyler Glasnow', 'Walker Buehler', 'Yoshinobu Yamamoto', 'Yu Darvish',
  'Zac Gallen', 'Zack Wheeler'
);

-- MLB Catchers (2)
UPDATE player_registry SET position_group = 'CATCHER' WHERE sport = 'MLB' AND player_name IN (
  'Gabe Moreno', 'Mike Piazza'
);

-- MLB Infielders (19)
UPDATE player_registry SET position_group = 'INFIELD' WHERE sport = 'MLB' AND player_name IN (
  'Albert Pujols', 'Babe Ruth', 'Cal Ripken Jr.', 'Colt Keith', 'Derek Jeter',
  'Elly De La Cruz', 'Gunnar Henderson', 'Jackson Holliday', 'Junior Caminero',
  'Lou Gehrig', 'Marcelo Mayer', 'Masyn Winn', 'Matt McLain', 'Noelvi Marte',
  'Oneil Cruz', 'Royce Lewis', 'Stan Musial', 'Ted Williams', 'Ty Cobb'
);

-- MLB Outfielders (21)
UPDATE player_registry SET position_group = 'OUTFIELD' WHERE sport = 'MLB' AND player_name IN (
  'Barry Bonds', 'Ceddanne Rafaela', 'Evan Carter', 'Heston Kjerstad', 'Ichiro Suzuki',
  'Jackie Robinson', 'Jackson Chourio', 'James Wood', 'Jasson Dominguez', 'Jasson Domínguez',
  'Jordan Lawlar', 'Ken Griffey Jr.', 'Lawrence Butler', 'Michael Busch', 'Mickey Mantle',
  'Pete Crow-Armstrong', 'Roberto Clemente', 'Sal Frelick', 'Willie Mays', 'Wyatt Langford',
  'Hank Aaron'
);

-- ========================================
-- NHL PLAYERS (187 total)
-- ========================================

-- NHL Goalies (24)
UPDATE player_registry SET position_group = 'GOALIE' WHERE sport = 'NHL' AND player_name IN (
  'Andrei Vasilevskiy', 'Carey Price', 'Connor Hellebuyck', 'Dominik Hasek',
  'Henrik Lundqvist', 'Igor Shesterkin', 'Ilya Sorokin', 'Jake Oettinger',
  'Jeremy Swayman', 'Linus Ullmark', 'Marc-Andre Fleury', 'Martin Brodeur',
  'Patrick Roy', 'Sergei Bobrovsky', 'Tuukka Rask', 'Cam Talbot', 'Carter Hart',
  'Frederik Andersen', 'Jacob Markstrom', 'Jordan Binnington', 'Petr Mrazek',
  'Juuse Saros', 'Thatcher Demko', 'Roberto Luongo'
);

-- NHL Defensemen (42)
UPDATE player_registry SET position_group = 'DEFENSE' WHERE sport = 'NHL' AND player_name IN (
  'Adam Fox', 'Alex Pietrangelo', 'Bobby Orr', 'Brent Burns', 'Brian Leetch',
  'Cale Makar', 'Charlie McAvoy', 'Chris Chelios', 'David Jiricek', 'Dougie Hamilton',
  'Drew Doughty', 'Duncan Keith', 'Erik Johnson', 'Erik Karlsson', 'Jake Sanderson',
  'John Carlson', 'John Klingberg', 'Kevin Shattenkirk', 'Kris Letang', 'Luke Hughes',
  'Miro Heiskanen', 'Moritz Seider', 'Nicklas Lidstrom', 'Owen Power', 'Paul Coffey',
  'Quinn Hughes', 'Rasmus Dahlin', 'Ray Bourque', 'Roman Josi', 'Ryan Ellis',
  'Scott Stevens', 'Shea Weber', 'Simon Nemec', 'Thomas Chabot', 'Torey Krug',
  'Tyson Barrie', 'Victor Hedman', 'Zdeno Chara', 'Al MacInnis', 'Phil Esposito'
);

-- NHL Forwards (121)
UPDATE player_registry SET position_group = 'FORWARD' WHERE sport = 'NHL' AND player_name IN (
  'Adam Fantilli', 'Aleksander Barkov', 'Aleksander Ovechkin', 'Alex DeBrincat', 'Alex Ovechkin',
  'Alexis Lafreniere', 'Anze Kopitar', 'Artemi Panarin', 'Auston Matthews', 'Bo Horvat',
  'Brad Marchand', 'Brady Tkachuk', 'Brayden Point', 'Brett Hull', 'Brock Boeser',
  'Chandler Stephenson', 'Chris Kreider', 'Claude Giroux', 'Cole Caufield', 'Cole Sillinger',
  'Connor Bedard', 'Connor Garland', 'Connor McDavid', 'Corey Perry', 'Daniel Sedin',
  'David', 'David Krejci', 'David Pastrnak', 'David Perron', 'Dylan Cozens',
  'Elias Pettersson', 'Evander Kane', 'Evgeni Malkin', 'Evgeny Kuznetsov', 'Filip Forsberg',
  'Franz Wagner', 'Gordie Howe', 'Guy Lafleur', 'Henrik Sedin', 'J.T. Miller',
  'Jack Eichel', 'Jack Hughes', 'Jake Guentzel', 'Jamie Benn', 'Jarome Iginla',
  'Jaromir Jagr', 'Jason Robertson', 'Jean Beliveau', 'Jesper Bratt', 'Jesper Kotkaniemi',
  'Jesperi Kotkaniemi', 'Joe Sakic', 'Joe Thornton', 'John Tavares', 'Johnny Gaudreau',
  'Jonathan Huberdeau', 'Jonathan Toews', 'Jordan Kyrou', 'Jordan Staal', 'Juraj Slafkovsky',
  'Kaapo Kakko', 'Kevin Fiala', 'Kirill Kaprizov', 'Kyle Connor', 'Leo Carlsson',
  'Leon Draisaitl', 'Logan Cooley', 'Luc Robitaille', 'Lucas Raymond', 'Macklin Celebrini',
  'Mario Lemieux', 'Mark Messier', 'Mark Scheifele', 'Mark Stone', 'Matthew Barzal',
  'Matthew Tkachuk', 'Matty Beniers', 'Matvei Michkov', 'Maurice Richard', 'Mika Zibanejad',
  'Mikko Rantanen', 'Mitch Marner', 'Nathan MacKinnon', 'Nazem Kadri', 'Nick Suzuki',
  'Nikita Kucherov', 'Oskar Lindblom', 'Patrice Bergeron', 'Patrick Kane', 'Patrick Laine',
  'Patrik Laine', 'Pavel Datsyuk', 'Peter Forsberg', 'Phil Kessel', 'Pierre-Luc Dubois',
  'Rick Nash', 'Robert Thomas', 'Roope Hintz', 'Ryan Getzlaf', 'Ryan Kesler',
  'Ryan Nugent-Hopkins', 'Ryan Strome', 'Sam Reinhart', 'Sebastian Aho', 'Shane Wright',
  'Sidney Crosby', 'Steven', 'Steven Stamkos', 'T.J. Oshie', 'Tage Thompson',
  'Teemu Selanne', 'Tim Stutzle', 'Tim Stützle', 'Timo', 'Timo Meier',
  'Tom Wilson', 'Trevor Zegras', 'Tyler Seguin', 'Victor Olofsson', 'Vladimir Tarasenko',
  'Wayne Gretzky', 'William Nylander', 'Wyatt Johnston'
);

-- ========================================
-- VERIFICATION QUERY (run after updates)
-- ========================================
-- SELECT sport, position_group, COUNT(*) as count
-- FROM player_registry 
-- GROUP BY sport, position_group
-- ORDER BY sport, position_group;

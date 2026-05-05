import os

HOME = os.environ['HOME']
path = HOME + '/workspace/server/portfolioIntelligenceService.ts'

with open(path, 'r') as f:
    lines = f.readlines()

total = len(lines)
print(f'File has {total} lines')

# ── Verify all pre-patch anchors against original line numbers ───────────────
def check(lineno, needle, label):
    line = lines[lineno - 1]
    assert needle in line, f'ANCHOR FAIL [{label}] line {lineno}: expected "{needle}", got: {line.rstrip()}'
    print(f'  OK [{label}] line {lineno}')

check(308, 'const playerTeamCache', 'playerTeamCache decl')
check(310, 'async function lookupPlayerTeam(playerName: string)', 'lookupPlayerTeam sig')
check(320, '// Check cache', 'cache comment')
check(321, 'const cachedTeam = playerTeamCache', 'cachedTeam')
check(343, '}', 'lookupPlayerTeam closing brace')
check(517, 'const uniquePlayersToLookup', 'uniquePlayersToLookup')
check(518, '.sort(([, a], [, b]) => b - a)', 'sort call')
check(520, 'for (const [playerName, totalValue] of uniquePlayersToLookup)', 'for loop')
check(521, 'const team = await lookupPlayerTeam(playerName)', 'lookup call site')
print('All anchors OK.')

# Build list of individual line strings for the helper (each ends with \n)
HELPER_LINES = [l + '\n' for l in [
  '// Pre-fetch team data for a batch of player names in a single IN-clause query.',
  '// Returns a Map<normalizedName, canonicalTeam> and also seeds playerTeamCache',
  '// so that any subsequent single lookups within the same request are already warm.',
  'async function prefetchPlayerTeams(playerNames: string[]): Promise<Map<string, string>> {',
  '  if (playerNames.length === 0) return new Map();',
  '',
  '  const t0 = Date.now();',
  '  const result = new Map<string, string>();',
  '',
  '  try {',
  '    const normalizedNames = playerNames.map(n => n.toLowerCase().trim());',
  '',
  '    // Single IN-clause query replaces N serial lookups',
  '    const gems = await db',
  '      .select({ playerName: hiddenGems.playerName, team: hiddenGems.team })',
  '      .from(hiddenGems)',
  '      .where(sql`LOWER(${hiddenGems.playerName}) = ANY(ARRAY[${sql.join(',
  '        normalizedNames.map(n => sql`${n}`),',
  '        sql`, `',
  '      )}])`);',
  '',
  '    for (const gem of gems) {',
  '      if (!gem.team) continue;',
  '      const canonicalTeam = TEAM_CANONICAL_NAMES[gem.team] || gem.team;',
  '      const normalizedName = gem.playerName.toLowerCase().trim();',
  '      result.set(normalizedName, canonicalTeam);',
  '      // Warm the runtime cache so cold-start penalty only occurs once per player',
  '      playerTeamCache[normalizedName] = canonicalTeam;',
  '    }',
  '',
  '    const elapsed = Date.now() - t0;',
  '    console.info(',
  '      `[PortfolioIntelligence] Prefetched team data for ${playerNames.length} players` +',
  '      ` (${gems.length} found) in ${elapsed}ms`',
  '    );',
  '  } catch (error) {',
  '    // Non-fatal: fall back to per-player DB lookups in the loop',
  "    console.warn('[PortfolioIntelligence] prefetchPlayerTeams failed, falling back to serial lookups:', error);",
  '  }',
  '',
  '  return result;',
  '}',
  '',
]]

offset_A = len(HELPER_LINES)
print(f'Part A: helper is {offset_A} lines')

# Insert helper before line 308 (index 307)
lines = lines[:307] + HELPER_LINES + lines[307:]
print(f'  Inserted. File now {len(lines)} lines.')

# All subsequent old line N is now at index (N - 1 + offset_A)
def idx(old_lineno):
    return old_lineno - 1 + offset_A

# ── Part B-1: update signature ────────────────────────────────────────────────
i = idx(310)
assert 'async function lookupPlayerTeam(playerName: string)' in lines[i], \
    f'B-1 fail at {i+1}: {lines[i].rstrip()}'
lines[i] = lines[i].replace(
    'async function lookupPlayerTeam(playerName: string)',
    'async function lookupPlayerTeam(playerName: string, prefetched?: Map<string, string>)'
)
print(f'  Part B-1 OK: signature updated at line {i+1}')

# ── Part B-2: insert prefetch check after "// Check cache" comment ────────────
i_cache = idx(320)
assert '// Check cache' in lines[i_cache], \
    f'B-2 fail at {i_cache+1}: {lines[i_cache].rstrip()}'

PREFETCH_CHECK_LINES = [
    '  // Check prefetched batch result (fast path for batch generation)\n',
    '  if (prefetched?.has(normalizedName)) return prefetched.get(normalizedName)!;\n',
    '\n',
]
lines = lines[:i_cache + 1] + PREFETCH_CHECK_LINES + lines[i_cache + 1:]
offset_B = len(PREFETCH_CHECK_LINES)
print(f'  Part B-2 OK: prefetch check inserted after line {i_cache+1}. Offset now +{offset_B}')

# All subsequent old line N is now at: idx(N) + offset_B
def idx2(old_lineno):
    return idx(old_lineno) + offset_B

# ── Part C-1: insert prefetch call after sort line ────────────────────────────
i_sort = idx2(518)
assert '.sort(([, a], [, b]) => b - a)' in lines[i_sort], \
    f'C-1 fail at {i_sort+1}: {lines[i_sort].rstrip()}'

PREFETCH_CALL_LINES = [
    '\n',
    '  // Batch-prefetch team data: replace N serial DB queries with 1 IN-clause query.\n',
    '  // Filter out players already in PLAYER_TEAM_MAP (zero DB cost for those).\n',
    '  const namesToPrefetch = uniquePlayersToLookup\n',
    '    .map(([name]) => name)\n',
    '    .filter(name => !PLAYER_TEAM_MAP[name.toLowerCase().trim()]);\n',
    '  const prefetchedTeams = await prefetchPlayerTeams(namesToPrefetch);\n',
    '\n',
]
lines = lines[:i_sort + 1] + PREFETCH_CALL_LINES + lines[i_sort + 1:]
offset_C = len(PREFETCH_CALL_LINES)
print(f'  Part C-1 OK: prefetch call inserted after line {i_sort+1}. Offset now +{offset_C}')

# All subsequent old line N is now at: idx2(N) + offset_C
def idx3(old_lineno):
    return idx2(old_lineno) + offset_C

# ── Part C-2: update call site ────────────────────────────────────────────────
i_call = idx3(521)
assert 'const team = await lookupPlayerTeam(playerName)' in lines[i_call], \
    f'C-2 fail at {i_call+1}: {lines[i_call].rstrip()}'
lines[i_call] = lines[i_call].replace(
    'await lookupPlayerTeam(playerName)',
    'await lookupPlayerTeam(playerName, prefetchedTeams)'
)
print(f'  Part C-2 OK: call site updated at line {i_call+1}')

# ── Write ─────────────────────────────────────────────────────────────────────
with open(path, 'w') as f:
    f.writelines(lines)

print(f'Done. File now has {len(lines)} lines (was {total}, delta +{len(lines)-total})')

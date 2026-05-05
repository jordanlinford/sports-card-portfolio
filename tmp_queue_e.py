import os, sys

HOME = os.environ['HOME']
path = HOME + '/workspace/server/portfolioIntelligenceService.ts'

with open(path, 'r') as f:
    lines = f.readlines()

total = len(lines)
print(f'File has {total} lines')

# ── Verify anchors ────────────────────────────────────────────────────────────
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
check(519, '', 'blank line after sort')
check(520, 'for (const [playerName, totalValue] of uniquePlayersToLookup)', 'for loop')
check(521, 'const team = await lookupPlayerTeam(playerName)', 'lookup call site')

print('All anchors verified. Applying patches...')

# ── Part A: insert prefetchPlayerTeams helper before line 308 ─────────────────
PREFETCH_HELPER = '''\
// Pre-fetch team data for a batch of player names in a single IN-clause query.
// Returns a Map<normalizedName, canonicalTeam> and also seeds playerTeamCache
// so that any subsequent single lookups within the same request are already warm.
async function prefetchPlayerTeams(playerNames: string[]): Promise<Map<string, string>> {
  if (playerNames.length === 0) return new Map();

  const t0 = Date.now();
  const result = new Map<string, string>();

  try {
    const normalizedNames = playerNames.map(n => n.toLowerCase().trim());

    // Single IN-clause query replaces N serial lookups
    const gems = await db
      .select({ playerName: hiddenGems.playerName, team: hiddenGems.team })
      .from(hiddenGems)
      .where(sql`LOWER(${hiddenGems.playerName}) = ANY(ARRAY[${sql.join(
        normalizedNames.map(n => sql`${n}`),
        sql`, `
      )}])`);

    for (const gem of gems) {
      if (!gem.team) continue;
      const canonicalTeam = TEAM_CANONICAL_NAMES[gem.team] || gem.team;
      const normalizedName = gem.playerName.toLowerCase().trim();
      result.set(normalizedName, canonicalTeam);
      // Warm the runtime cache so cold-start penalty only occurs once per player
      playerTeamCache[normalizedName] = canonicalTeam;
    }

    const elapsed = Date.now() - t0;
    console.info(
      `[PortfolioIntelligence] Prefetched team data for ${playerNames.length} players` +
      ` (${gems.length} found) in ${elapsed}ms`
    );
  } catch (error) {
    // Non-fatal: fall back to per-player DB lookups in the loop
    console.warn('[PortfolioIntelligence] prefetchPlayerTeams failed, falling back to serial lookups:', error);
  }

  return result;
}

'''

insert_before_308 = PREFETCH_HELPER
lines = lines[:307] + [insert_before_308] + lines[307:]
print(f'  Part A inserted ({len(PREFETCH_HELPER.splitlines())} lines before old line 308)')

# Recalculate line numbers after insertion
offset = len(PREFETCH_HELPER.splitlines()) + 1  # +1 for the trailing newline
print(f'  Offset for subsequent patches: +{offset} lines')

# New line numbers after Part A insertion:
# old 310 -> new 310+offset
# old 320 -> new 320+offset
# old 321 -> new 321+offset
# old 517 -> new 517+offset
# old 518 -> new 518+offset
# old 519 -> new 519+offset
# old 520 -> new 520+offset
# old 521 -> new 521+offset

def new_ln(old):
    return old + offset

# ── Part B-1: update lookupPlayerTeam signature (now at new_ln(310)) ──────────
sig_lineno = new_ln(310) - 1  # 0-indexed
old_sig = lines[sig_lineno]
assert 'async function lookupPlayerTeam(playerName: string)' in old_sig, \
    f'SIG not found at adjusted line {new_ln(310)}: {old_sig.rstrip()}'
lines[sig_lineno] = old_sig.replace(
    'async function lookupPlayerTeam(playerName: string)',
    'async function lookupPlayerTeam(playerName: string, prefetched?: Map<string, string>)'
)
print(f'  Part B-1: updated lookupPlayerTeam signature at line {new_ln(310)}')

# ── Part B-2: insert prefetched map check before cache check (old line 320/321) ─
# Insert after "// Check cache" comment line (old 320, now new_ln(320))
# We insert between old 320 and old 321 (the cachedTeam line)
cache_comment_lineno = new_ln(320) - 1  # 0-indexed
assert '// Check cache' in lines[cache_comment_lineno], \
    f'Cache comment not found at {new_ln(320)}: {lines[cache_comment_lineno].rstrip()}'

PREFETCH_CHECK = (
    '  // Check prefetched batch result (fast path for batch generation)\n'
    '  if (prefetched?.has(normalizedName)) return prefetched.get(normalizedName)!;\n'
    '\n'
)
lines = lines[:cache_comment_lineno + 1] + [PREFETCH_CHECK] + lines[cache_comment_lineno + 1:]
print(f'  Part B-2: inserted prefetch check after line {new_ln(320)}')

# Additional offset from B-2 insertion
offset2 = 3  # 3 new lines inserted

# ── Part C: insert prefetch call + update loop call site ────────────────────
# Old line 518 (sort call) is now at new_ln(518) + offset2
# Old line 519 (blank) is now at new_ln(519) + offset2  
# Old line 521 (lookup call) is now at new_ln(521) + offset2

sort_lineno = new_ln(518) + offset2 - 1  # 0-indexed
assert '.sort(([, a], [, b]) => b - a)' in lines[sort_lineno], \
    f'Sort line not found at {new_ln(518)+offset2}: {lines[sort_lineno].rstrip()}'

PREFETCH_CALL = (
    '\n'
    '  // Batch-prefetch team data: replace N serial DB queries with 1 IN-clause query.\n'
    '  // Filter out players already resolved via PLAYER_TEAM_MAP (no DB cost for those).\n'
    '  const namesToPrefetch = uniquePlayersToLookup\n'
    '    .map(([name]) => name)\n'
    '    .filter(name => !PLAYER_TEAM_MAP[name.toLowerCase().trim()]);\n'
    '  const prefetchedTeams = await prefetchPlayerTeams(namesToPrefetch);\n'
    '\n'
)
lines = lines[:sort_lineno + 1] + [PREFETCH_CALL] + lines[sort_lineno + 1:]
print(f'  Part C-1: inserted prefetch call block after sort at line {new_ln(518)+offset2}')

# Additional offset from C-1 insertion
offset3 = len(PREFETCH_CALL.splitlines())

# Now update the loop call site: old 521 -> new_ln(521) + offset2 + offset3
call_lineno = new_ln(521) + offset2 + offset3 - 1  # 0-indexed
old_call = lines[call_lineno]
assert 'const team = await lookupPlayerTeam(playerName)' in old_call, \
    f'Call site not found at adjusted line: {old_call.rstrip()}'
lines[call_lineno] = old_call.replace(
    'await lookupPlayerTeam(playerName)',
    'await lookupPlayerTeam(playerName, prefetchedTeams)'
)
print(f'  Part C-2: updated call site to pass prefetchedTeams')

# ── Write output ─────────────────────────────────────────────────────────────
with open(path, 'w') as f:
    f.writelines(lines)

print(f'Done. File now has {len(lines)} lines (was {total})')

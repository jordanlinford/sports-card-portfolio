import { db } from "../server/db";
import { blogPosts } from "../shared/schema";
import { eq } from "drizzle-orm";

const ADMIN_USER_ID = "49339926";
const YEAR = new Date().getFullYear();

type SeedPost = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
};

const posts: SeedPost[] = [
  {
    slug: "how-to-tell-if-sports-card-is-worth-money",
    title: `How to Tell If a Sports Card Is Worth Money in ${YEAR}`,
    excerpt:
      "A simple, no-jargon framework for figuring out whether your sports card is actually worth something — using real eBay sold data, not asking prices.",
    content: `
<p>You found a stack of cards in the closet. Some look shiny. Some have the player's autograph. A couple are numbered. The big question: <strong>are any of them actually worth money?</strong></p>

<p>Most of the "card valuation" content online either tries to sell you a price guide or quotes ridiculous asking prices. Here is the framework that actually works in ${YEAR}.</p>

<h2>1. Identify the card precisely (set, year, parallel, number)</h2>
<p>A card's value is driven by exact identity, not the name on the front. A 2018 Patrick Mahomes Donruss base card is worth a few dollars. A 2017 Panini Prizm Mahomes Silver Rookie can be worth thousands. They look almost identical to a beginner.</p>
<p>Look for these on the back or front:</p>
<ul>
  <li><strong>Set name and year</strong> (Topps Chrome, Panini Prizm, Bowman Chrome, Donruss Optic, Upper Deck Young Guns, etc.)</li>
  <li><strong>Card number</strong> (e.g. "RC-12" or "#249")</li>
  <li><strong>Parallel name</strong> (Refractor, Silver, Gold, Pink Ice, Cracked Ice, Mosaic Reactive, etc.)</li>
  <li><strong>Numbering</strong> (e.g. "/99" means 99 made, "/10" means 10 made, "1/1" means one of one)</li>
  <li><strong>Auto or patch indicators</strong> (signature on front, jersey window)</li>
</ul>

<h2>2. Look up real eBay <em>sold</em> comps — never asking prices</h2>
<p>This is where 90% of beginners go wrong. You search the card on eBay, see listings at $500, and think you have $500. Those are <em>asking</em> prices. They mean nothing.</p>
<p>What matters: <strong>recent sold prices</strong>. On eBay, filter by "Sold Items" and "Completed Items." Ignore the highest and lowest outliers. Look at the median of the last 10–20 sales. That is what your card is actually worth on the open market today.</p>
<p>If you don't want to do this manually, our <a href="https://sportscardportfolio.io">Sports Card Portfolio</a> tool pulls real eBay sold comps for any card automatically and shows you the median, the high, the low, and the trend.</p>

<h2>3. Check the condition honestly</h2>
<p>Condition matters more than collectors realize. A "raw" (ungraded) card in PSA 10 condition is worth a fraction of what a graded PSA 10 is worth. The same card in beat-up condition is often worth 10–20% of mint.</p>
<p>Quick condition check:</p>
<ul>
  <li><strong>Corners</strong> — Sharp or fuzzy/dinged?</li>
  <li><strong>Edges</strong> — White chipping along the borders?</li>
  <li><strong>Surface</strong> — Scratches, print lines, or clean?</li>
  <li><strong>Centering</strong> — Is the image roughly centered? Off-center kills value.</li>
</ul>
<p>If all four look perfect under bright light, you may have a grading candidate. If anything is off, assume it grades a 7 or 8 and price accordingly.</p>

<h2>4. Should you grade it? Run the math.</h2>
<p>Grading costs $17–$75+ per card depending on tier and turnaround. To break even, your card needs to be worth significantly more in PSA 10 than raw. Use a probabilistic EV model: P(PSA 10) × PSA 10 net + P(PSA 9) × PSA 9 net + P(lower) × low value, minus the grading fee and eBay fees.</p>
<p>Our <a href="https://sportscardportfolio.io">Graded Value Matrix</a> does this math automatically for any card and tells you whether grading is +EV or a money loser.</p>

<h2>5. Get an AI-powered Buy/Hold/Sell verdict</h2>
<p>The hard part of card investing isn't valuation — it's <strong>timing</strong>. Is this player on the way up or coming back to earth? Is the market overheated? Is supply about to flood?</p>
<p>Our <a href="https://sportscardportfolio.io">Player Outlook</a> engine analyzes 6 weighted signals (demand, momentum, liquidity, supply pressure, hype, volatility) plus confidence and gives you a deterministic Buy / Hold / Trade-the-Hype / Sell / Avoid verdict for any player.</p>

<h2>The 30-second valuation checklist</h2>
<ol>
  <li>Identify the exact set, year, number, parallel, and serial.</li>
  <li>Look up median eBay sold price over the last 30–60 days.</li>
  <li>Inspect condition under bright light.</li>
  <li>Run the grading EV math if it's a high-end candidate.</li>
  <li>Check the player's market verdict before listing or holding.</li>
</ol>

<p>Want it all done in one click? <a href="https://sportscardportfolio.io">Try Sports Card Portfolio free</a> — scan a card with your phone and get the verdict in seconds.</p>
`.trim(),
  },
  {
    slug: "should-you-grade-your-sports-card-psa-cost-vs-value",
    title: `Should You Grade Your Sports Card? PSA Cost vs. Value Guide (${YEAR})`,
    excerpt:
      "How to decide if grading a card is +EV using probability math, current PSA fees, and real eBay sold comps for graded vs. raw.",
    content: `
<p>Grading a sports card is a bet, not a guarantee. You pay $17–$75 to PSA, wait weeks, and hope the card comes back a 10. If it doesn't, you may have just lit money on fire.</p>

<p>Here is a clean, math-backed framework for deciding whether to grade — and why "it just looks clean" is the wrong reason.</p>

<h2>Current PSA grading fees (${YEAR})</h2>
<ul>
  <li><strong>Economy:</strong> ~$17 per card (slowest turnaround, low max declared value)</li>
  <li><strong>Regular:</strong> ~$25 per card (mid turnaround)</li>
  <li><strong>Express:</strong> ~$75 per card (faster, higher max value)</li>
  <li><strong>Walk-through and bulk tiers</strong> exist but are situational</li>
</ul>
<p>Always verify the latest fees at <a href="https://www.psacard.com/services" rel="nofollow noopener">psacard.com</a> — PSA changes pricing periodically.</p>

<h2>The real cost is fees + eBay friction</h2>
<p>If you sell a graded card on eBay, you lose roughly <strong>13% to fees</strong> plus shipping. That comes off the top.</p>
<p>So a card that sells for $100 graded nets you about $85 minus shipping. If you paid $25 to grade, your net is $60. The raw card you started with had to be worth less than $60 for grading to be +EV.</p>

<h2>The probability math nobody talks about</h2>
<p>You don't get a guaranteed PSA 10. You get a probability distribution. A typical "looks clean" raw card might come back:</p>
<ul>
  <li>~35% PSA 10</li>
  <li>~45% PSA 9</li>
  <li>~20% PSA 8 or lower</li>
</ul>
<p>That is the default we use in our <a href="https://sportscardportfolio.io">Graded Value Matrix</a>. The expected value of grading is:</p>
<pre>EV = P(PSA10) × Net(PSA10) + P(PSA9) × Net(PSA9) + P(lower) × Net(lower) − Grading Fee</pre>
<p>Plug in real eBay sold comps for each grade. If EV is meaningfully higher than your raw value, grade it. If not, sell raw.</p>

<h2>When grading is almost always worth it</h2>
<ul>
  <li>The PSA 10 sells for <strong>3x or more</strong> the raw value</li>
  <li>The card is a key rookie or low-pop parallel with active demand</li>
  <li>You can credibly self-grade it as a 9.5+ (corners sharp, no print lines, well-centered)</li>
  <li>You're using economy tier and the card is liquid in graded form</li>
</ul>

<h2>When grading is a bad bet</h2>
<ul>
  <li>The raw-to-PSA-10 spread is less than 2x</li>
  <li>The card has obvious centering or edge issues</li>
  <li>The player's market is in a Sell or Avoid phase (timing risk)</li>
  <li>The card has fewer than 50 PSA 10 comps in the last year (illiquid)</li>
  <li>You're paying express tier on a sub-$100 card</li>
</ul>

<h2>Don't ignore the timing signal</h2>
<p>By the time your card comes back from PSA, the market may have moved. If a player is in a TRADE-THE-HYPE phase, your PSA 10 might be worth 30% less in 8 weeks. Always check the <a href="https://sportscardportfolio.io">Player Outlook verdict</a> before submitting.</p>

<h2>Quick decision tree</h2>
<ol>
  <li>Pull median PSA 10, PSA 9, and raw sold comps from the last 60 days.</li>
  <li>Run the EV formula above with realistic probabilities.</li>
  <li>If EV − raw value &gt; $20, grade it. If not, sell raw.</li>
  <li>Cross-check the player's market verdict — only grade if the trend is Hold or Buy.</li>
</ol>

<p>Want it automated? <a href="https://sportscardportfolio.io">Sports Card Portfolio</a> runs all this math automatically with live eBay comps and player verdicts. Free to start.</p>
`.trim(),
  },
  {
    slug: "how-to-read-ebay-sold-comps-sports-cards",
    title: "How to Read eBay Sold Comps for Sports Cards (Beginner's Guide)",
    excerpt:
      "Asking prices lie. Sold comps tell the truth. Here's how to read them like a card investor — and the traps that fool beginners every day.",
    content: `
<p>The single most important skill in sports card investing is reading <strong>eBay sold comps</strong>. Every other tool — price guides, AI valuations, dealer quotes — is downstream of what cards are actually selling for.</p>

<p>Here is the no-fluff guide to reading comps correctly.</p>

<h2>Step 1: Always filter "Sold Items" + "Completed"</h2>
<p>On eBay, an active listing means nothing. Anyone can list a card for $5,000. The question is what it actually sold for. On eBay's left sidebar, scroll down and check both "Sold Items" and "Completed Items." This restricts the view to transactions that closed.</p>

<h2>Step 2: Sort by Recently Ended</h2>
<p>Card markets move fast. A comp from 18 months ago is irrelevant for a hot rookie. Sort by "Recently Ended" and only weight the last 30–60 days for momentum-driven players. For stable veterans, 90 days is fine.</p>

<h2>Step 3: Match the exact card precisely</h2>
<p>This is where most people get burned. The comps you pull have to match:</p>
<ul>
  <li><strong>Year and set</strong> exactly (2020 Prizm ≠ 2020 Mosaic ≠ 2020 Select)</li>
  <li><strong>Parallel</strong> (Silver Prizm ≠ Red Prizm ≠ Gold Prizm — wildly different values)</li>
  <li><strong>Serial number</strong> if applicable (/99 vs /25 vs /10)</li>
  <li><strong>Grade</strong> (PSA 10 vs PSA 9 vs raw vs BGS 9.5 vs SGC 10)</li>
  <li><strong>Auto or no auto</strong></li>
</ul>
<p>If you mix in the wrong parallels, your "comp average" will be garbage.</p>

<h2>Step 4: Throw out the outliers</h2>
<p>Look at the distribution. If 9 sales are between $80–$100 and one is $250, that $250 is probably either a fake auction, a private deal listed retroactively, or a bid war between two collectors. Throw it out. Use the median, not the mean.</p>

<h2>Step 5: Watch for "Best Offer" prices</h2>
<p>The price shown on a "Best Offer accepted" listing is the <em>asking</em> price, not what the buyer paid. If you can, click into the listing and look for the "sold for" badge or the offer indicator. If you can't see the actual price, exclude it.</p>

<h2>Step 6: Volume tells you liquidity</h2>
<p>Median price is half the story. The other half is <strong>how often the card sells</strong>. A card with 30 sales in 30 days is liquid — you can sell it tomorrow at the median. A card with 1 sale in 90 days might take months to move and the next sale could be 30% lower.</p>
<p>Our <a href="https://sportscardportfolio.io">liquidity scoring</a> automatically blends sell-through rate with absolute velocity to give you a single 0-100 score.</p>

<h2>Common comp-reading traps</h2>
<ul>
  <li><strong>The "1 of 1" trap</strong> — Comparing a numbered /99 to base prices. They are different markets.</li>
  <li><strong>The grade trap</strong> — Comparing PSA 10 to BGS 9.5. Different brands, different premiums.</li>
  <li><strong>The "rookie card" trap</strong> — Some sets have 4 different "rookie cards" of the same player. Topps Chrome RC ≠ Bowman Chrome RC ≠ Bowman Draft RC.</li>
  <li><strong>The shipping trap</strong> — Some sales include $4 shipping, some include $20. Always normalize.</li>
  <li><strong>The fake-comp trap</strong> — A seller buys their own card with a fake account to inflate comps. Look for repeat buyers/sellers.</li>
</ul>

<h2>The shortcut</h2>
<p>If you want all of this done automatically — exact card matching, outlier rejection, median calculation, liquidity scoring, trend direction — that is exactly what <a href="https://sportscardportfolio.io">Sports Card Portfolio</a> does. Snap a photo, get the verdict.</p>

<p>But even if you use a tool, knowing how to read comps yourself keeps you honest. Trust the data, not the asking prices.</p>
`.trim(),
  },
  {
    slug: `best-rookie-cards-to-watch-${YEAR}`,
    title: `Best Rookie Cards to Watch in ${YEAR}: NFL, NBA & MLB Investment Guide`,
    excerpt: `A framework for spotting the rookie cards most likely to appreciate in ${YEAR} — and the traps that cost investors money every season.`,
    content: `
<p>Every year, a handful of rookie cards explode in value and a much larger pile collapses. Picking the right ones isn't luck — it's a repeatable process.</p>

<p>Here is the framework we use to surface the best rookie cards to watch in ${YEAR}, plus what to avoid.</p>

<h2>What makes a rookie card go up?</h2>
<p>It's not just talent. The cards that win combine <strong>five</strong> ingredients:</p>
<ol>
  <li><strong>On-field/on-court production</strong> — Stats people can point to.</li>
  <li><strong>Big-market or "narrative" team</strong> — Cowboys, Yankees, Lakers, Knicks, etc. drive demand.</li>
  <li><strong>A flagship rookie set</strong> — Topps Chrome, Panini Prizm, Bowman Chrome, Upper Deck Young Guns. Off-brand rookies rarely 10x.</li>
  <li><strong>Liquidity</strong> — Cards that sell often. Low-pop /5 parallels look cool but trade once a month.</li>
  <li><strong>Reasonable supply</strong> — A flagship base rookie with 50,000 PSA 10s won't 10x. A short-print or numbered parallel might.</li>
</ol>

<h2>NFL rookies to watch in ${YEAR}</h2>
<p>The NFL rookie market is the most liquid in the hobby. The classes from the last 2–3 seasons dominate trading volume. Use our <a href="https://sportscardportfolio.io/outlook/football">Football Player Outlook</a> page to filter by current verdict — focus on rookies with ACCUMULATE or HOLD-CORE labels and high conviction.</p>

<h2>NBA rookies to watch in ${YEAR}</h2>
<p>NBA cards have wild volatility but the biggest 10x potential when a player breaks out. Look for second-year players in their first All-Star window — that's when Prizm Silver and Mosaic /25 parallels typically rip. The <a href="https://sportscardportfolio.io/outlook/basketball">Basketball Outlook</a> tool flags these.</p>

<h2>MLB rookies to watch in ${YEAR}</h2>
<p>Baseball rookies are a slower, more patient market. The flagship is <strong>Bowman Chrome</strong> — specifically the 1st Bowman Chrome Auto. International prospects out of Cuba, Venezuela, and Japan often spike before MLB debut. <a href="https://sportscardportfolio.io/outlook/baseball">Baseball Outlook</a> tracks both pre-debut prospects and active MLB rookies.</p>

<h2>The traps that cost investors money</h2>
<ul>
  <li><strong>Buying at peak hype</strong> — When a rookie's card is on the front page of every break stream, you're late. Wait for the drawdown.</li>
  <li><strong>Confusing rookie cards</strong> — A player might have a "Topps Now" card before their flagship Prizm RC. The Prizm is the long-term hold.</li>
  <li><strong>Loading up on base</strong> — Base rookies almost always lose value over time as supply expands. Numbered parallels hold value better.</li>
  <li><strong>Ignoring the schedule</strong> — A rookie facing a soft schedule will look better than they are. A rookie facing the Chiefs/Eagles defense in their first 4 games will look worse. Card prices follow narrative, not stats.</li>
</ul>

<h2>How to actually pick winners</h2>
<p>Don't pick your own. Use a system:</p>
<ol>
  <li>Filter the <a href="https://sportscardportfolio.io">Player Outlook leaderboard</a> by sport and verdict.</li>
  <li>Look for ACCUMULATE rookies with conviction &gt; 60.</li>
  <li>Cross-check the player's news for any injury or role-change red flags.</li>
  <li>Pull the eBay sold comps for the flagship rookie + a low-pop parallel.</li>
  <li>Run the <a href="https://sportscardportfolio.io">Graded Value Matrix</a> to decide raw vs. graded.</li>
  <li>Set a price alert and wait for a dip.</li>
</ol>

<p>Try the leaderboard free at <a href="https://sportscardportfolio.io">Sports Card Portfolio</a>.</p>
`.trim(),
  },
  {
    slug: "hobby-box-roi-sealed-product-break-even-math",
    title: "Hobby Box Break-Even Math: How to Calculate Sealed Product ROI",
    excerpt:
      "Most sealed hobby boxes are negative EV after fees. Here's the math that tells you which products are actually worth ripping — and which ones to skip.",
    content: `
<p>Buying sealed hobby boxes feels like investing. Most of the time, it isn't. After eBay fees, shipping, illiquid commons, and the occasional empty pack, the average sealed product is a money-loser.</p>

<p>Here is the actual math that separates +EV products from -EV ones.</p>

<h2>Why "average pull value" is a lie</h2>
<p>Card companies and break sites love to show "average pull value" charts. They are almost always inflated by:</p>
<ul>
  <li><strong>Asking prices, not sold prices</strong> — Same issue as eBay listing prices.</li>
  <li><strong>Survivor bias</strong> — Only the case hits get tweeted. The 200 commons don't.</li>
  <li><strong>Ignoring transaction friction</strong> — A $3 common can't be sold profitably; eBay fees alone eat $1.40.</li>
  <li><strong>Ignoring illiquidity haircuts</strong> — A "$80 hit" with 2 sold comps in the last year is not actually $80.</li>
</ul>

<h2>The realistic EV formula</h2>
<p>To honestly value a sealed box, you need to compute expected value <strong>per hit type</strong>, with corrections:</p>
<pre>
For each hit type:
  median_sold_price = median of last 90 days of sold comps
  net_value = median_sold_price × 0.87 − $1.50 shipping
  if net_value &lt; $5: net_value = 0  (transaction friction)
  if sold_comps_count &lt; 3: net_value × 0.5  (illiquidity haircut)
  if hit_is_case_hit (perBox &lt; 0.2): exclude from base EV (only show as ceiling)
  EV_contribution = net_value × hits_per_box

Box EV = sum of all EV_contributions across hit types
ROI = Box EV / Box Price
</pre>

<h2>The thresholds that matter</h2>
<ul>
  <li><strong>ROI &lt; 0.95x</strong> = Negative EV. Don't rip; flip the box.</li>
  <li><strong>ROI 0.95x – 1.25x</strong> = Speculative. You're paying for entertainment, not investment.</li>
  <li><strong>ROI &gt; 1.25x</strong> = Positive EV. Rare. Usually a pricing error or a release-window opportunity.</li>
</ul>

<h2>Why new releases are usually -EV</h2>
<p>When a product first releases, hit prices are inflated. Within 3–6 months, those prices typically drop 20–40% as supply hits the secondary market. Apply a <strong>30% additional haircut</strong> to any product within 60 days of release before deciding to rip.</p>

<h2>Comparing two products head-to-head</h2>
<p>The hobby is full of "should I rip this or that?" questions. The answer is always: compute realistic EV for both, then pick the one with the higher ROI <em>and</em> better hit ceiling.</p>
<p>Our <a href="https://sportscardportfolio.io/market/sealed-roi">Sealed Product ROI Calculator</a> does exactly this — head-to-head comparison, realistic EV with all corrections applied, and a Buy / Speculative / Don't-Rip verdict.</p>

<h2>The 5 questions to ask before opening any box</h2>
<ol>
  <li>What is the realistic EV after fees, shipping, illiquidity, and friction?</li>
  <li>How does it compare to the box price right now?</li>
  <li>Is this a new release? If yes, apply the 30% haircut.</li>
  <li>Who are the chase rookies? Are they trending up or down?</li>
  <li>Could you make more by holding the sealed box and flipping it later?</li>
</ol>

<p>Run the math at <a href="https://sportscardportfolio.io/market/sealed-roi">Sports Card Portfolio's Sealed ROI tool</a> before your next box purchase.</p>
`.trim(),
  },
];

async function main() {
  let inserted = 0;
  let skipped = 0;
  for (const post of posts) {
    const existing = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.slug, post.slug))
      .limit(1);
    if (existing.length > 0) {
      console.log(`[skip] ${post.slug} already exists`);
      skipped++;
      continue;
    }
    await db.insert(blogPosts).values({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      contentFormat: "html",
      heroImageUrl: null,
      videoEmbeds: [],
      isPublished: false,
      publishedAt: null,
      authorId: ADMIN_USER_ID,
    });
    console.log(`[insert] ${post.slug}`);
    inserted++;
  }
  console.log(`\nDone. inserted=${inserted} skipped=${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

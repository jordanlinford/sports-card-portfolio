import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

const APP_URL =
  process.env.APP_URL ||
  `https://${process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost:5000"}`;

const genAI = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "",
  httpOptions: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
    ? { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL }
    : undefined,
});

type Persona = "whale" | "skeptic" | "hobbyist";

const PERSONAS: Record<Persona, string> = {
  whale: `You are a "Whale" collector — a professional investor with $50K+ in sports cards.
    You are impatient, detail-oriented, and look for high-ROI opportunities.
    You care about: Hidden Gems, portfolio risk signals, 1-of-1 valuations, and supply alerts.
    You expect polished UI, fast load times, and accurate data.`,

  skeptic: `You are a "Skeptical Investor" — cautious, data-driven, and distrustful of hype.
    You scrutinize every number, question AI recommendations, and look for contradictions.
    You care about: S&P 500/Bitcoin comparisons, graded value accuracy, liquidity scores, and risk warnings.
    You will try to find flaws in the analysis and test edge cases.`,

  hobbyist: `You are a casual "Hobbyist" collector — you collect for fun, not profit.
    You are less technical, sometimes confused by investment jargon.
    You care about: easy card scanning, display cases that look good, and finding cool cards.
    You may struggle with complex features and need clear UI guidance.`,
};

const FEATURE_ROUTES: Record<string, { path: string; requiresAuth: boolean; description: string }> = {
  "hidden-gems":    { path: "/hidden-gems",    requiresAuth: false, description: "Hidden Gems discovery page — undervalued players identified by AI" },
  "leaderboards":   { path: "/leaderboards",   requiresAuth: false, description: "Leaderboards showing top display cases" },
  "explore":        { path: "/explore",         requiresAuth: false, description: "Explore public portfolios and display cases" },
  "home":           { path: "/",                requiresAuth: false, description: "Landing page with pricing and features" },
  "dashboard":      { path: "/dashboard",       requiresAuth: true,  description: "User dashboard with portfolio overview" },
  "agent-mode":     { path: "/dashboard",       requiresAuth: true,  description: "Agent Mode sidebar (⌘+K) — AI portfolio auditor" },
  "display-cases":  { path: "/dashboard",       requiresAuth: true,  description: "Display case management and card organization" },
  "upgrade":        { path: "/upgrade",         requiresAuth: true,  description: "Pro upgrade page with subscription options" },
};

const RESULTS_DIR = "agent-test-results";

interface TestResult {
  feature: string;
  persona: Persona;
  status: "pass" | "fail" | "warning";
  bugs: string[];
  observations: string[];
  timestamp: string;
}

async function testEndpoint(url: string, method = "GET"): Promise<{ status: number; ok: boolean; body: string }> {
  try {
    const resp = await fetch(url, {
      method,
      headers: { "Accept": "text/html,application/json" },
      redirect: "follow",
    });
    const body = await resp.text();
    return { status: resp.status, ok: resp.ok, body: body.slice(0, 5000) };
  } catch (err) {
    return { status: 0, ok: false, body: String(err) };
  }
}

async function runFeatureAudit(
  featureName: string,
  persona: Persona = "whale"
): Promise<TestResult> {
  const feature = FEATURE_ROUTES[featureName];
  if (!feature) {
    return {
      feature: featureName,
      persona,
      status: "fail",
      bugs: [`Unknown feature: ${featureName}`],
      observations: [],
      timestamp: new Date().toISOString(),
    };
  }

  console.log(`\n🔍 Auditing: ${featureName} (${persona} persona)`);
  console.log(`   Route: ${feature.path} | Auth required: ${feature.requiresAuth}`);

  const url = `${APP_URL}${feature.path}`;
  const response = await testEndpoint(url);

  console.log(`   HTTP ${response.status} | Body length: ${response.body.length}`);

  const prompt = `
    ${PERSONAS[persona]}

    You are auditing the "${featureName}" feature of Sports Card Portfolio (${APP_URL}).
    Feature description: ${feature.description}
    Route: ${feature.path}
    Auth required: ${feature.requiresAuth}

    Here is the HTML response from ${url} (HTTP ${response.status}):
    
    \`\`\`html
    ${response.body.slice(0, 4000)}
    \`\`\`

    As a QA auditor with the ${persona} persona, analyze:

    1. Does the response look correct for this feature?
    2. Are there any signs of errors (500 pages, error messages, missing content)?
    3. If auth is required and user isn't logged in, is there a proper redirect or auth wall?
    4. Check for any exposed API keys, debug info, or security issues in the HTML.
    5. Are the expected meta tags, SEO elements present?
    6. Any data-testid attributes present for testability?

    Return ONLY valid JSON (no markdown):
    {
      "status": "pass" | "fail" | "warning",
      "bugs": ["list of bugs found"],
      "observations": ["list of notable observations"],
      "seoCheck": { "hasTitle": true/false, "hasDescription": true/false, "hasOgTags": true/false },
      "accessibilityNotes": "any a11y concerns"
    }
  `;

  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        feature: featureName,
        persona,
        status: "warning",
        bugs: [],
        observations: ["Could not parse AI response"],
        timestamp: new Date().toISOString(),
      };
    }

    const analysis = JSON.parse(jsonMatch[0]);
    return {
      feature: featureName,
      persona,
      status: analysis.status,
      bugs: analysis.bugs || [],
      observations: analysis.observations || [],
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      feature: featureName,
      persona,
      status: "fail",
      bugs: [`AI analysis failed: ${err instanceof Error ? err.message : String(err)}`],
      observations: [],
      timestamp: new Date().toISOString(),
    };
  }
}

async function testApiEndpoints(): Promise<TestResult> {
  console.log("\n🔌 Testing API Endpoints...");
  const endpoints = [
    { path: "/api/hidden-gems",        name: "Hidden Gems API",      expectAuth: false },
    { path: "/api/leaderboard",        name: "Leaderboard API",      expectAuth: false },
    { path: "/api/agent/stream?q=test", name: "Agent Stream API",    expectAuth: true  },
    { path: "/api/user",               name: "User API",             expectAuth: true  },
  ];

  const bugs: string[] = [];
  const observations: string[] = [];

  for (const ep of endpoints) {
    const response = await testEndpoint(`${APP_URL}${ep.path}`);
    const statusOk = ep.expectAuth
      ? response.status === 401 || response.status === 403 || response.status === 302
      : response.ok;

    if (!statusOk && response.status !== 0) {
      bugs.push(`${ep.name} (${ep.path}): Unexpected status ${response.status}`);
    } else {
      observations.push(`${ep.name}: HTTP ${response.status} ✓`);
    }
    console.log(`   ${ep.name}: HTTP ${response.status} ${statusOk ? "✓" : "✗"}`);
  }

  return {
    feature: "api-endpoints",
    persona: "whale",
    status: bugs.length > 0 ? "fail" : "pass",
    bugs,
    observations,
    timestamp: new Date().toISOString(),
  };
}

async function runFullAudit(persona: Persona = "whale") {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Sports Card Portfolio — AI QA Audit`);
  console.log(`  Persona: ${persona} | Time: ${new Date().toLocaleString()}`);
  console.log(`  App: ${APP_URL}`);
  console.log(`${"=".repeat(60)}`);

  const publicFeatures = Object.entries(FEATURE_ROUTES)
    .filter(([_, f]) => !f.requiresAuth)
    .map(([name]) => name);

  const results: TestResult[] = [];

  results.push(await testApiEndpoints());

  for (const feature of publicFeatures) {
    const result = await runFeatureAudit(feature, persona);
    results.push(result);
    console.log(`   Result: ${result.status.toUpperCase()} | Bugs: ${result.bugs.length}`);

    await new Promise((r) => setTimeout(r, 1000));
  }

  const summary = {
    runId: `audit-${persona}-${timestamp}`,
    persona,
    appUrl: APP_URL,
    totalFeatures: results.length,
    passed: results.filter((r) => r.status === "pass").length,
    warnings: results.filter((r) => r.status === "warning").length,
    failed: results.filter((r) => r.status === "fail").length,
    allBugs: results.flatMap((r) => r.bugs.map((b) => `[${r.feature}] ${b}`)),
    results,
    completedAt: new Date().toISOString(),
  };

  const reportPath = path.join(RESULTS_DIR, `${summary.runId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  AUDIT COMPLETE`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  ✅ Passed:   ${summary.passed}`);
  console.log(`  ⚠️  Warnings: ${summary.warnings}`);
  console.log(`  ❌ Failed:   ${summary.failed}`);

  if (summary.allBugs.length > 0) {
    console.log(`\n  Bugs Found:`);
    summary.allBugs.forEach((b, i) => console.log(`    ${i + 1}. ${b}`));
  }

  console.log(`\n  Report: ${reportPath}`);
  return summary;
}

const persona = (process.argv[2] as Persona) || "whale";
const singleFeature = process.argv[3];

if (singleFeature) {
  runFeatureAudit(singleFeature, persona).then((r) => {
    console.log(JSON.stringify(r, null, 2));
  });
} else {
  runFullAudit(persona).catch(console.error);
}

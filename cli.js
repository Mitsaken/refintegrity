#!/usr/bin/env node
/**
 * RefIntegrity CLI — Scholarly Citation & Retraction Auditor
 * Zero dependencies, Node >= 18 native fetch, shared engine with Web UI.
 * Usage:
 *   node cli.js check paper.bib [--format md|json|csv|html] [--out report.md] [--mailto you@uni.edu] [--cache .refcache.json] [--fail-on retracted,notfound]
 *   node cli.js --selftest
 */

const fs = require("fs");
const path = require("path");
const { RefIntegrityEngine } = require("./engine.js");

function formatHTML(engine, results) {
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const stats = engine.computeStats(results);
  const rows = results.map((r, i) => `
    <tr>
      <td>#${i + 1}</td>
      <td><strong>${esc(r.status.toUpperCase())}</strong></td>
      <td>${esc(r.title)}${r.retractionDetails ? `<div><small>${esc(r.retractionDetails)}</small></div>` : ""}</td>
      <td>${esc(r.journal)} (${esc(r.year || "N/A")})</td>
      <td>${esc(r.doi)} (${esc(r.source)})</td>
    </tr>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>RefIntegrity Report</title>
<style>body{font-family:sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#141A21;}table{width:100%;border-collapse:collapse;margin-top:16px;}th,td{border:1px solid #D6D3CB;padding:8px;text-align:left;font-size:13px;}th{background:#F4F1EA;}</style>
</head>
<body>
  <h1>RefIntegrity Citation Audit Report</h1>
  <p>Score: <strong>${stats.score}/100</strong> | Total: ${stats.total} | Verified: ${stats.verified} | Retracted: ${stats.retracted} | Not Found: ${stats.notFound}</p>
  <table><thead><tr><th>#</th><th>Status</th><th>Work</th><th>Venue</th><th>DOI / Registry</th></tr></thead><tbody>${rows}</tbody></table>
</body>
</html>`;
}

function runSelftest() {
  const engine = new RefIntegrityEngine();

  // 1. DOI extraction: standard, SICI, DataCite, URL, balanced parens & BibTeX/Markdown delimiters
  const sample = "See (10.1016/S0140-6736(97)11096-0), https://doi.org/10.1145/3065386, 10.1002/(SICI)1097-0142(19960815)78:4<837::AID-CNCR22>3.0.CO;2-O, and doi: 10.5281/zenodo.1234567.";
  const parsed = engine.extractDOIs(sample);
  if (parsed.length !== 4 || !parsed.includes("10.1016/S0140-6736(97)11096-0") || !parsed.includes("10.1002/(SICI)1097-0142(19960815)78:4<837::AID-CNCR22>3.0.CO;2-O")) {
    console.error("Selftest failed (DOIs):", parsed);
    process.exit(1);
  }
  const wrappedParsed = engine.extractDOIs("doi = {10.1016/S0140-6736(97)11096-0}, [10.1145/3065386].");
  if (wrappedParsed.length !== 2 || wrappedParsed[0] !== "10.1016/S0140-6736(97)11096-0" || wrappedParsed[1] !== "10.1145/3065386") {
    console.error("Selftest failed (BibTeX/bracket wrapped DOIs):", wrappedParsed);
    process.exit(1);
  }

  // 2. Non-DOI bibliographic ref extraction (raw line + BibTeX without DOI)
  const mixed = `
@article{smith2024,
  title = {Autonomous Reasoners in High-Dimensional Logic},
  author = {Smith, John and Doe, Jane},
  year = {2024}
}
[1] Vaswani, A. Attention Is All You Need. Advances in Neural Information Processing Systems (2017).
See (10.1016/S0140-6736(97)11096-0) already covered.
`;
  const bibRefs = engine.extractBibliographicRefs(mixed);
  if (bibRefs.length !== 2) {
    console.error("Selftest failed (non-DOI bibliographic extraction):", bibRefs);
    process.exit(1);
  }

  // 3. OWASP CSV Formula Injection Guard (=, +, -, @, Tab, CR) + UTF-8 BOM
  for (const payload of ["=cmd|'/C calc'!A0", "+SUM(1,2)", "-1+1", "@SUM(1)", "\t=1+1", "\r=1+1"]) {
    const safe = engine._sanitizeCSV(payload);
    if (!safe.startsWith("'")) {
      console.error("Selftest failed (CSV formula guard missed payload):", JSON.stringify(payload), safe);
      process.exit(1);
    }
  }
  const csvOut = engine.generateCSV([{ doi: "10.1000/test", status: "verified", title: "\t=HYPERLINK(\"http://evil\")", authors: ["A. Author"], journal: "Nature", year: 2024, citationCount: 1, source: "Crossref", retractionDetails: "" }]);
  if (!csvOut.startsWith("\uFEFF") || !csvOut.includes("'\t=HYPERLINK")) {
    console.error("Selftest failed (CSV BOM / escaped payload)");
    process.exit(1);
  }

  // 4. JATS tag stripping
  const jatsClean = engine._sanitizeJATS("<jats:title>Study on <jats:italic>A &amp; B</jats:italic></jats:title>");
  if (jatsClean !== "Study on A & B") {
    console.error("Selftest failed (JATS sanitization):", jatsClean);
    process.exit(1);
  }

  // 5. Invisible Unicode sanitization + rarest-first weighted shingle bibliographic scoring
  const obfuscatedDois = engine.extractDOIs("Zero-width spoof: 10.1145\u200b/3065386 and BiDi \u202E10.1038/nature14539");
  if (obfuscatedDois.length !== 2 || !obfuscatedDois.includes("10.1145/3065386")) {
    console.error("Selftest failed (invisible Unicode DOI extraction):", obfuscatedDois);
    process.exit(1);
  }
  const highMatch = engine._scoreBibliographicMatch(
    { query: "Vaswani et al. (2017) Attention Is All You Need", year: "2017" },
    { title: ["Attention Is All You Need"], issued: { "date-parts": [[2017]] }, author: [{ family: "Vaswani" }] }
  );
  const genericFalse = engine._scoreBibliographicMatch(
    { query: "Smith (2024) Deep neural model methods system study", year: "2024" },
    { title: ["Quantum computing hardware system methods"], issued: { "date-parts": [[2021]] }, author: [{ family: "Kovacs" }] }
  );
  if (highMatch < 0.85 || genericFalse >= 0.35) {
    console.error("Selftest failed (bibliographic weighted scoring):", { highMatch, genericFalse });
    process.exit(1);
  }

  console.log("RefIntegrity CLI selftest PASS (4/4 DOIs w/ SICI, non-DOI refs, OWASP CSV Tab/CR guard, JATS strip, Unicode + MMDS scoring).");
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) return { selftest: true };
  const opts = { file: null, format: "md", out: null, mailto: "researcher@example.org", cache: null, failOn: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "check" && args[i + 1]) opts.file = args[++i];
    else if (args[i] === "--format" && args[i + 1]) opts.format = args[++i].toLowerCase();
    else if (args[i] === "--out" && args[i + 1]) opts.out = args[++i];
    else if (args[i] === "--mailto" && args[i + 1]) opts.mailto = args[++i];
    else if (args[i] === "--cache" && args[i + 1]) opts.cache = args[++i];
    else if (args[i] === "--fail-on" && args[i + 1]) opts.failOn = args[++i].split(",").map((s) => s.trim().toLowerCase());
    else if (!opts.file && !args[i].startsWith("--")) opts.file = args[i];
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  if (opts.selftest) {
    runSelftest();
    process.exit(0);
  }
  if (!opts.file) {
    console.error("Usage: node cli.js check <file.bib|ris|txt|md> [--format md|json|csv|html] [--out report.md] [--fail-on retracted,notfound]");
    process.exit(2);
  }

  let content;
  try {
    content = fs.readFileSync(path.resolve(opts.file), "utf8");
  } catch (err) {
    console.error(`Error reading input file: ${err.message}`);
    process.exit(2);
  }

  const engine = new RefIntegrityEngine();
  engine.politeEmail = opts.mailto;

  if (opts.cache && fs.existsSync(opts.cache)) {
    try {
      const disk = JSON.parse(fs.readFileSync(opts.cache, "utf8"));
      Object.entries(disk).forEach(([k, v]) => engine.cache.set(k, v));
    } catch {
      // ignore corrupted cache
    }
  }

  const dois = engine.extractDOIs(content);
  const refs = engine.extractBibliographicRefs(content);
  const batch = [...dois, ...refs];
  if (batch.length === 0) {
    console.error("No DOIs or bibliographic citations detected in input file.");
    process.exit(0);
  }

  const results = await engine.runBatchAudit(batch);

  if (opts.cache) {
    const outCache = {};
    engine.cache.forEach((v, k) => { outCache[k] = v; });
    fs.writeFileSync(opts.cache, JSON.stringify(outCache, null, 2), "utf8");
  }

  let output;
  if (opts.format === "json") output = engine.generateJSON(results);
  else if (opts.format === "csv") output = engine.generateCSV(results);
  else if (opts.format === "html") output = formatHTML(engine, results);
  else output = engine.generateMarkdownReport(results);

  if (opts.out) fs.writeFileSync(opts.out, output, "utf8");
  else console.log(output);

  const hasFail = results.some((r) =>
    (opts.failOn.includes("retracted") && r.status === "retracted") ||
    (opts.failOn.includes("notfound") && r.status === "not_found")
  );
  if (hasFail) process.exit(1);
}

main();

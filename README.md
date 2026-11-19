# RefIntegrity — Academic & Technical Citation Verification Suite

> **Zero-Marginal-Cost Academic Verification Engine:** Real-time client-side auditing of scientific papers, bibliographies, and technical references against official registries (Crossref, DataCite & OpenAlex). Instantly detect retracted papers, fraudulent citations, and AI hallucinations with 0€ API token costs.

[![Live Demo](https://img.shields.io/badge/Live_Demo-RefIntegrity-1B3B6F?style=for-the-badge&logo=github)](https://mitsaken.github.io/refintegrity/)
![Status](https://img.shields.io/badge/Status-Production%20Ready-success?style=flat-square)
![Registries](https://img.shields.io/badge/Registries-Crossref%20%7C%20DataCite%20%7C%20OpenAlex-blue?style=flat-square)
![Privacy](https://img.shields.io/badge/Privacy-Browser--Side%20(Public%20DOI%20APIs)-emerald?style=flat-square)
![Hosting Cost](https://img.shields.io/badge/Hosting-0%E2%82%AC%20(GitHub%20Pages)-emerald?style=flat-square)

---

## 🌟 Why RefIntegrity?

The explosion of Large Language Models (LLMs) in academic research has caused a catastrophic rise in:
1. **Fabricated Citations (AI Hallucinations):** Syntactically plausible DOIs that lead to 404s or non-existent authors.
2. **Zombie Citations (Retracted Papers):** Citing flawed or fraudulent research (e.g., Wakefield MMR vaccine autism hoax, Surgisphere COVID hydroxychloroquine paper) that was formally retracted by publishers.
3. **Ghost Metadata:** Discrepant author lists and scrambled journal venues.

**RefIntegrity** runs 100% in the user's browser, connects to the official **Crossref REST API (Polite Pool)** and **OpenAlex API**, verifies every citation against live registry records, and flags retractions instantly.

---

## 🚀 Key Features

- **🔴 Retraction Alert System:** Cross-checks Crossmark update records, publisher title modifications, and OpenAlex `is_retracted` flags.
- **🔎 Bibliographic Fallback & RA Resolution:** Verifies non-DOI plain-text bibliographic entries via fuzzy title/author/year lookup, plus `doi.org/doiRA/` Registration Agency checks before flagging misses.
- **⚡ Batch Queue (Up to 100 Citations) & Presets:** Concurrent 2-worker verification queue with `Retry-After` backoff and pre-loaded test suites for Retracted Papers, Seminal Benchmarks, and AI Hallucination traps.
- **🛡️ Browser-Side Manuscript Privacy:** Your full manuscript stays in local browser memory with zero backend upload; extracted DOIs and individual citation queries are sent directly to public Crossref, DataCite, OpenAlex, and `doi.org` APIs, with sanitized JATS XML abstracts.
- **📊 Citation Integrity Health Score:** Computed metric (0–100) assessing the reliability of the reference list.
- **📑 Hardened Multi-Format Export:** 1-Click export to Markdown audit reports, OWASP-sanitized CSV spreadsheets (Tab/CR + UTF-8 BOM formula guard), HTML reports, and clean verified BibTeX.
- **🖨️ Executive Print / PDF Ready:** Clean print stylesheet designed for university grant proposals and journal submission packets.

---

## 🛠️ Architecture & Tech Stack

- **Frontend:** Zero-CDN Vanilla CSS (Archival Paper & Archival Navy palette), self-hosted SIL-OFL WOFF2 fonts (`IBM Plex Sans`, `Source Serif 4`, `JetBrains Mono`), Vanilla ES6+ JavaScript, and strict `<meta>` CSP.
- **Registries:**
  - **Crossref REST API:** `https://api.crossref.org/works/{doi}` (and fuzzy `/works?query.bibliographic=`) via Polite Pool.
  - **DataCite REST API:** `https://api.datacite.org/dois/{doi}` fallback for dataset/preprint DOIs.
  - **OpenAlex REST API:** `https://api.openalex.org/works/https://doi.org/{doi}` fallback & retraction cross-check.
  - **DOI Registration Agency Lookup:** `https://doi.org/doiRA/{doi}` fallback verification before flagging `NOT FOUND`.
- **Rate-Limiting:** 2-worker concurrent browser queue (up to 100 citations per batch), polite concurrency delays, and `Retry-After` retry backoff.
- **CLI (Node >= 18, zero dependencies):**
  ```bash
  node cli.js check paper.bib --format md --out report.md --cache .refcache.json --fail-on retracted,notfound
  node cli.js check refs.txt --format csv --out report.csv
  node cli.js check refs.txt --format html --out report.html
  node cli.js --selftest
  ```
- **Hosting:** 0€ Static Hosting on GitHub Pages.

---

## ⏸️ Early Access Roadmap & Open-Source vs Pro Boundaries (0€ Validation Mode)

- **Open-Source Web & CLI Workbench (Validation Phase):** Free browser-side DOI & bibliographic reference verification (up to 100 citations per batch), `.bib/.ris/.txt/.md` uploads, OWASP-safe CSV/Markdown/HTML/BibTeX exports, print PDF report, and single-file Node CLI (`cli.js`).
- **Planned RefIntegrity Pro Toolkit (`Planned launch price: 19 € one-time, VAT incl.` · currently `0 € today — Priority Waitlist`):**
  - High-volume Node batch runner (`batch-runner.js`) auditing 1,000+ `.bib`/`.ris`/`.txt`/`.md` references with persistent JSON disk caching and polite backoff.
  - Verified BibTeX cleaner/rebuilder, SHA-256 tamper-evident audit manifest (`audit-manifest.sha256.json`), and standalone batch HTML/Markdown/CSV exports.
  - Ready-to-drop GitHub Actions PR gate workflow (`--fail-on retracted,notfound`) to block retracted or fabricated DOIs before merge.
- 👉 Checkout is paused during `0€ Validation Mode` (`CHECKOUT_ENABLED = false`). Join the in-app **Priority Waitlist** (explicit GDPR consent, see [`privacy.html`](privacy.html)) for launch updates.

---

## 📄 License

MIT License — see [`LICENSE`](LICENSE) (`Copyright (c) 2026 Conversionlogic`).

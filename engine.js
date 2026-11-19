/**
 * RefIntegrity - Academic & Technical Citation Verification Engine v1.0
 * Multi-Registry Bridge: Crossref (Polite Pool) + DataCite (Zenodo/arXiv) + OpenAlex
 * Zero Marginal Cost & 100% Client-Side Private Processing
 */

// Sample Datasets for 1-Click Verification
const SAMPLE_DATASETS = {
  retracted: {
    name: "Retracted Papers Test Set (High Risk Alerts)",
    description: "Seminal biomedical papers formally retracted due to falsified data, ethical breaches, or fraudulent methodology.",
    dois: [
      "10.1016/S0140-6736(97)11096-0", // Wakefield et al. (MMR vaccine autism fraud - The Lancet Retracted)
      "10.1016/S0140-6736(20)31180-6", // Mehra et al. Surgisphere (Hydroxychloroquine COVID - Retracted)
      "10.1038/nature04969",          // Jan Hendrik Schön (Semiconductor superconductivity fraud - Retracted)
      "10.1126/science.1105459"        // Woo Suk Hwang (Cloned human stem cells fraud - Retracted)
    ],
    rawText: `@article{wakefield1998,
  title = {RETRACTED: Ileal-lymphoid-nodular hyperplasia, non-specific colitis, and pervasive developmental disorder in children},
  author = {Wakefield, AJ and Murch, SH and Anthony, A and others},
  journal = {The Lancet},
  doi = {10.1016/S0140-6736(97)11096-0},
  year = {1998}
}

@article{surgisphere2020,
  title = {RETRACTED: Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19},
  author = {Mehra, Mandeep R and Desai, Sapan S and Ruschitzka, Frank and Patel, Amit N},
  journal = {The Lancet},
  doi = {10.1016/S0140-6736(20)31180-6},
  year = {2020}
}`
  },

  benchmarks: {
    name: "Verified Foundational Papers & Datasets (Multi-Registry)",
    description: "Seminal papers across Crossref, DataCite (Zenodo/arXiv), and physics registries.",
    dois: [
      "10.1145/3065386",             // Attention Is All You Need (ACM / Crossref)
      "10.1038/nature14539",          // Deep learning (LeCun, Bengio, Hinton - Nature)
      "10.1016/0004-3702(86)90076-2", // Russell & Norvig / AI Foundations
      "10.5281/zenodo.1234567"        // DataCite / Zenodo Open Dataset
    ],
    rawText: `10.1145/3065386
10.1038/nature14539
10.1016/0004-3702(86)90076-2
10.5281/zenodo.1234567`
  },

  hallucinations: {
    name: "AI Hallucination Traps (Fabricated Sources)",
    description: "Simulated citations commonly hallucinated by LLMs: non-existent DOIs, fake journals, and 404 traps.",
    dois: [
      "10.1016/j.ai.2024.999999",     // Fabricated Elsevier DOI
      "10.1109/TPAMI.2023.0000000",   // Fake IEEE DOI
      "10.1038/s41586-024-99999-x"    // Non-existent Nature article
    ],
    rawText: `Smith, J., & Doe, A. (2024). Autonomous Reasoners in High-Dimensional Logic. Journal of Artificial Intelligence, 45(2), 112-128. doi: 10.1016/j.ai.2024.999999
Kovacs, P. (2023). Quantum Optimization via Neural Diffusion. IEEE TPAMI. doi: 10.1109/TPAMI.2023.0000000`
  }
};

class RefIntegrityEngine {
  constructor() {
    this.cache = new Map();
    this.isPro = false;
    this.politeEmail = "researcher@refintegrity.org";
    this.results = [];
    this.isAuditing = false;
  }

  /**
   * Strip zero-width, soft hyphen & BiDi control overrides + normalize NFKC (Boucher et al.)
   */
  _sanitizeUnicode(input) {
    if (!input || typeof input !== "string") return "";
    return input
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/g, "")
      .normalize("NFKC");
  }

  /**
   * Robust DOI Extraction with Balanced Parentheses & SICI Support
   * Handles:
   * - Standard DOIs: 10.1016/S0140-6736(97)11096-0
   * - SICI DOIs: 10.1002/(SICI)1097-0142(19960815)78:4<837::AID-CNCR22>3.0.CO;2-O
   * - DataCite / Zenodo DOIs: 10.5281/zenodo.1234567
   * - URLs: https://doi.org/10.1145/3065386 or http://dx.doi.org/...
   * - Context-aware parenthesis balancing (strips trailing ')' only if unbalanced)
   */
  extractDOIs(input) {
    if (!input || typeof input !== "string") return [];

    // Normalize Unicode invisibles & URL prefixes
    let text = this._sanitizeUnicode(input).replace(/https?:\/\/(?:dx\.)?doi\.org\//gi, " ");
    text = text.replace(/\bdoi:\s*/gi, " ");

    // Broad DOI pattern capturing valid characters including <, >, %, +, #, &, ;
    const broadDoiRegex = /\b(10\.\d{4,9}\/[^\s"'\s]+)/gi;
    const matches = text.match(broadDoiRegex) || [];
    const extracted = [];

    for (let raw of matches) {
      let cleaned = raw.trim();

      // Iteratively strip trailing punctuation and unbalanced enclosing delimiters (), <>, {}, []
      for (let pass = 0; pass < 5; pass++) {
        const before = cleaned;
        cleaned = cleaned.replace(/[.,;:]+$/, "");

        const openParens = (cleaned.match(/\(/g) || []).length;
        const closeParens = (cleaned.match(/\)/g) || []).length;
        if (closeParens > openParens && cleaned.endsWith(")")) cleaned = cleaned.slice(0, -1);

        const openAngles = (cleaned.match(/</g) || []).length;
        const closeAngles = (cleaned.match(/>/g) || []).length;
        if (closeAngles > openAngles && cleaned.endsWith(">")) cleaned = cleaned.slice(0, -1);

        const openBraces = (cleaned.match(/\{/g) || []).length;
        const closeBraces = (cleaned.match(/\}/g) || []).length;
        if (closeBraces > openBraces && cleaned.endsWith("}")) cleaned = cleaned.slice(0, -1);

        const openBrackets = (cleaned.match(/\[/g) || []).length;
        const closeBrackets = (cleaned.match(/\]/g) || []).length;
        if (closeBrackets > openBrackets && cleaned.endsWith("]")) cleaned = cleaned.slice(0, -1);

        if (cleaned === before) break;
      }

      // Final sanity check on DOI prefix
      if (/^10\.\d{4,9}\/.+/i.test(cleaned)) {
        extracted.push(cleaned);
      }
    }

    return Array.from(new Set(extracted));
  }

  /**
   * BibTeX Parser with Brace-Depth Counting (Handles nested braces & multi-line fields)
   */
  parseBibTeX(bibText) {
    const entries = [];
    if (!bibText || typeof bibText !== "string") return entries;

    let pos = 0;
    const len = bibText.length;

    while (pos < len) {
      const atIdx = bibText.indexOf("@", pos);
      if (atIdx === -1) break;

      const openBrace = bibText.indexOf("{", atIdx);
      if (openBrace === -1) {
        pos = atIdx + 1;
        continue;
      }

      const type = bibText.slice(atIdx + 1, openBrace).trim().toLowerCase();
      // Skip comments or non-entry directives
      if (type === "comment" || type === "preamble") {
        pos = openBrace + 1;
        continue;
      }

      // Find balanced closing brace
      let depth = 1;
      let cur = openBrace + 1;
      let inQuote = false;

      while (cur < len && depth > 0) {
        const char = bibText[cur];
        if (char === '"' && bibText[cur - 1] !== "\\") {
          inQuote = !inQuote;
        } else if (!inQuote) {
          if (char === "{") depth++;
          else if (char === "}") depth--;
        }
        cur++;
      }

      if (depth === 0) {
        const entryBody = bibText.slice(openBrace + 1, cur - 1);
        const firstComma = entryBody.indexOf(",");
        const citeKey = firstComma !== -1 ? entryBody.slice(0, firstComma).trim() : "ref";
        const fieldsText = firstComma !== -1 ? entryBody.slice(firstComma + 1) : entryBody;

        const entry = { type, citeKey, raw: bibText.slice(atIdx, cur) };

        // Parse key-value fields with brace depth awareness
        const fields = this._parseBibFields(fieldsText);
        Object.assign(entry, fields);

        // Try extracting DOI from field or raw text
        if (!entry.doi) {
          const found = this.extractDOIs(entry.raw);
          if (found.length > 0) entry.doi = found[0];
        }

        entries.push(entry);
        pos = cur;
      } else {
        pos = openBrace + 1;
      }
    }

    return entries;
  }

  /**
   * Helper to parse BibTeX key-value fields preserving nested braces
   */
  _parseBibFields(fieldsText) {
    const fields = {};
    let i = 0;
    const len = fieldsText.length;

    while (i < len) {
      while (i < len && /[\s,]/.test(fieldsText[i])) i++;
      if (i >= len) break;

      const keyStart = i;
      while (i < len && /[a-zA-Z0-9_\-]/.test(fieldsText[i])) i++;
      const key = fieldsText.slice(keyStart, i).toLowerCase();

      while (i < len && /\s/.test(fieldsText[i])) i++;
      if (fieldsText[i] !== '=') {
        i++;
        continue;
      }
      i++; // skip '='
      while (i < len && /\s/.test(fieldsText[i])) i++;

      let val = "";
      if (fieldsText[i] === '{') {
        let depth = 1;
        i++;
        const valStart = i;
        while (i < len && depth > 0) {
          if (fieldsText[i] === '{') depth++;
          else if (fieldsText[i] === '}') depth--;
          i++;
        }
        val = fieldsText.slice(valStart, i - 1);
      } else if (fieldsText[i] === '"') {
        i++;
        const valStart = i;
        while (i < len && !(fieldsText[i] === '"' && fieldsText[i - 1] !== '\\')) {
          i++;
        }
        val = fieldsText.slice(valStart, i);
        i++;
      } else {
        const valStart = i;
        while (i < len && !/[,\s\n\r]/.test(fieldsText[i])) i++;
        val = fieldsText.slice(valStart, i);
      }

      if (key) {
        fields[key] = val.trim();
      }
    }
    return fields;
  }

  /**
   * Extract non-DOI bibliographic citations (BibTeX without DOI + raw reference lines)
   */
  extractBibliographicRefs(input) {
    if (!input || typeof input !== "string") return [];
    const seen = new Set();
    const refs = [];

    // 1. BibTeX entries without a DOI
    const bibEntries = this.parseBibTeX(input);
    for (const entry of bibEntries) {
      if (entry.doi) continue;
      const rawTitle = (entry.title || "").replace(/[{}]/g, "").trim();
      const author = (entry.author || "").replace(/[{}]/g, "").trim();
      const year = (entry.year || "").replace(/[^0-9]/g, "").slice(0, 4) || null;
      if (!rawTitle && !author) continue;
      const query = [rawTitle, author, year].filter(Boolean).join(" ").trim();
      const key = query.toLowerCase();
      if (query.length >= 10 && !seen.has(key)) {
        seen.add(key);
        refs.push({
          kind: "bibref",
          rawTitle: rawTitle || query,
          authors: author ? author.split(/\s+and\s+/i).map((a) => a.trim()).filter(Boolean) : [],
          year,
          query,
          displayLabel: rawTitle || query.slice(0, 72)
        });
      }
    }

    // Strip parsed BibTeX blocks so raw line scanner does not double-count fields
    let remaining = input;
    for (const entry of bibEntries) {
      remaining = remaining.replace(entry.raw, "\n");
    }

    // 2. Raw reference lines without DOIs
    const lines = remaining.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (this.extractDOIs(line).length > 0) continue;
      const cleaned = line
        .replace(/^\[\d+\]\s*/, "")
        .replace(/^\d+[.)]\s+/, "")
        .replace(/^[-*]\s+/, "")
        .trim();
      if (cleaned.length < 24 || /^(@comment|@preamble|doi:|https?:\/\/)/i.test(cleaned)) continue;
      const yearM = cleaned.match(/\b(19\d{2}|20[0-2]\d)\b/);
      const year = yearM ? yearM[1] : null;
      const normKey = cleaned.toLowerCase();
      if (!seen.has(normKey)) {
        seen.add(normKey);
        refs.push({
          kind: "bibref",
          rawTitle: cleaned,
          authors: [],
          year,
          query: cleaned,
          displayLabel: cleaned.slice(0, 72)
        });
      }
    }
    return refs;
  }

  _tokenizeOrdered(str) {
    if (!str) return [];
    const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "using", "based", "via", "study", "analysis", "journal", "proceedings", "vol", "pp", "method", "methods", "system", "systems", "model", "models", "effect", "effects", "approach", "review", "paper"]);
    return this._sanitizeUnicode(str)
      .toLowerCase()
      .replace(/<[^>]+>/g, " ")
      .replace(/[^a-z0-9\u0370-\u03ff]+/gi, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !stop.has(t));
  }

  _tokenizeForMatch(str) {
    return new Set(this._tokenizeOrdered(str));
  }

  _tokenWeight(tok) {
    // Rarest-first token weight proxy (MMDS p. 142): longer & technical tokens carry higher discriminating weight
    const base = Math.log(1 + tok.length);
    return /\d/.test(tok) ? base * 1.25 : base;
  }

  _scoreBibliographicMatch(refObj, crItem) {
    const candTitle = Array.isArray(crItem.title) && crItem.title[0] ? this._sanitizeJATS(crItem.title[0]) : "";
    if (!candTitle) return 0;

    const queryList = this._tokenizeOrdered(refObj.query || refObj.rawTitle);
    const titleList = this._tokenizeOrdered(candTitle);
    const queryTokens = new Set(queryList);
    const titleTokens = new Set(titleList);
    if (titleTokens.size === 0 || queryTokens.size === 0) return 0;

    let hitWeight = 0;
    let titleTotalWeight = 0;
    for (const t of titleTokens) {
      const w = this._tokenWeight(t);
      titleTotalWeight += w;
      if (queryTokens.has(t)) hitWeight += w;
    }
    const unionTokens = new Set([...queryTokens, ...titleTokens]);
    let unionWeight = 0;
    for (const t of unionTokens) unionWeight += this._tokenWeight(t);

    const weightedRecall = titleTotalWeight > 0 ? hitWeight / titleTotalWeight : 0;
    const weightedJaccard = unionWeight > 0 ? hitWeight / unionWeight : 0;

    // 2-shingle (word bigram) containment check (MMDS Ch. 3) to suppress bag-of-words collisions
    let bigramScore = weightedRecall;
    if (titleList.length >= 2 && queryList.length >= 2) {
      const qBigrams = new Set();
      for (let i = 0; i < queryList.length - 1; i++) qBigrams.add(`${queryList[i]} ${queryList[i + 1]}`);
      let biHits = 0;
      const tBiTotal = titleList.length - 1;
      for (let i = 0; i < tBiTotal; i++) {
        if (qBigrams.has(`${titleList[i]} ${titleList[i + 1]}`)) biHits++;
      }
      bigramScore = tBiTotal > 0 ? biHits / tBiTotal : weightedRecall;
    }

    let bonus = 0;
    const candYear = crItem.issued?.["date-parts"]?.[0]?.[0];
    if (refObj.year && candYear && String(candYear) === String(refObj.year)) {
      bonus += 0.08;
    }
    const qLower = this._sanitizeUnicode(refObj.query || "").toLowerCase();
    const families = (crItem.author || []).map((a) => this._sanitizeUnicode(a.family || "").toLowerCase()).filter((f) => f.length >= 3);
    if (families.some((fam) => qLower.includes(fam))) {
      bonus += 0.08;
    }

    return Math.min(1, (weightedRecall * 0.56) + (weightedJaccard * 0.14) + (bigramScore * 0.14) + bonus);
  }

  /**
   * Helper fetch with explicit timeout & AbortSignal
   */
  async _fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  /**
   * Retry fetch on 429/503 with Retry-After support and exponential backoff
   */
  async _fetchWithRetry(url, options = {}, timeoutMs = 8000, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const resp = await this._fetchWithTimeout(url, options, timeoutMs);
        if ((resp.status === 429 || resp.status === 503 || resp.status >= 500) && attempt < retries) {
          let delayMs = 450 * Math.pow(2, attempt);
          const ra = resp.headers?.get?.("Retry-After");
          if (ra && /^\d+$/.test(ra.trim())) {
            delayMs = Math.min(5000, Math.max(delayMs, Number(ra.trim()) * 1000));
          }
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        return resp;
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, 450 * Math.pow(2, attempt)));
      }
    }
  }

  /**
   * Lookup non-Crossref DOI Registration Agency (mEDRA, JaLC, ISTIC, OP, etc.)
   */
  async _lookupRegistrationAgency(doi) {
    try {
      const resp = await this._fetchWithRetry(`https://doi.org/doiRA/${encodeURIComponent(doi)}`, {
        headers: { "Accept": "application/json" }
      }, 6000, 1);
      if (!resp.ok) return null;
      const arr = await resp.json();
      const first = Array.isArray(arr) ? arr[0] : arr;
      const ra = first && typeof first.RA === "string" ? first.RA.trim() : "";
      if (!ra || /invalid|unknown/i.test(ra)) return null;
      return ra;
    } catch {
      return null;
    }
  }

  /**
   * Fuzzy bibliographic verification for non-DOI citations via Crossref query.bibliographic
   */
  async verifyBibliographicRef(refObj) {
    const cacheKey = `bib:${(refObj.query || refObj.rawTitle || "").toLowerCase()}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(refObj.query)}&rows=3&mailto=${encodeURIComponent(this.politeEmail)}`;
      const resp = await this._fetchWithRetry(url, { headers: { "Accept": "application/json" } }, 9000, 2);
      if (!resp.ok) {
        throw new Error(`Crossref bibliographic search returned HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const items = data?.message?.items || [];

      let bestItem = null;
      let bestScore = 0;
      for (const item of items) {
        const sc = this._scoreBibliographicMatch(refObj, item);
        if (sc > bestScore) {
          bestScore = sc;
          bestItem = item;
        }
      }

      if (bestItem && bestItem.DOI && bestScore >= 0.75) {
        const full = await this.verifyDOI(bestItem.DOI);
        const cloned = {
          ...full,
          discrepancies: [
            `Matched via Bibliographic Search (confidence ${Math.round(bestScore * 100)}%)`,
            ...(full.discrepancies || [])
          ]
        };
        this.cache.set(cacheKey, cloned);
        return cloned;
      }

      const miss = {
        doi: "N/A (No DOI)",
        status: "not_found",
        title: refObj.rawTitle || refObj.displayLabel || "Unmatched Reference",
        authors: refObj.authors || [],
        journal: "No matching Crossref record",
        year: refObj.year || null,
        citationCount: 0,
        isRetracted: false,
        retractionDetails: null,
        source: "Crossref Bibliographic",
        crossrefUrl: "",
        isOpenAccess: false,
        discrepancies: ["No matching title/author record in Crossref bibliographic index (possible hallucinated reference)"]
      };
      this.cache.set(cacheKey, miss);
      return miss;
    } catch (err) {
      return {
        doi: "N/A (No DOI)",
        status: "network_error",
        title: refObj.rawTitle || refObj.displayLabel || "Bibliographic Lookup Error",
        authors: refObj.authors || [],
        journal: "Registry Timeout",
        year: refObj.year || null,
        citationCount: 0,
        isRetracted: false,
        retractionDetails: null,
        source: "Crossref Bibliographic",
        crossrefUrl: "",
        isOpenAccess: false,
        discrepancies: [`Bibliographic lookup error: ${err.message}`]
      };
    }
  }

  /**
   * Verify a Single DOI against Multi-Registry Architecture:
   * 1. Crossref REST API (Polite Pool)
   * 2. DataCite REST API (Zenodo, arXiv, Figshare datasets)
   * 3. OpenAlex REST API (Fallback & Retraction Cross-Check)
   */
  async verifyDOI(doi) {
    const cleanDoi = doi.trim();
    if (this.cache.has(cleanDoi)) {
      return this.cache.get(cleanDoi);
    }

    const auditResult = {
      doi: cleanDoi,
      status: "unresolved", // "verified" | "retracted" | "possible_retraction" | "not_found" | "network_error"
      title: "Unknown Title",
      authors: [],
      journal: "Unknown Venue",
      year: null,
      citationCount: 0,
      isRetracted: false,
      retractionDetails: null,
      source: "Pending",
      crossrefUrl: `https://doi.org/${encodeURIComponent(cleanDoi)}`,
      isOpenAccess: false,
      discrepancies: []
    };

    let crossref404 = false;
    let datacite404 = false;
    let openalex404 = false;

    // STEP 1: Crossref Primary Resolution
    try {
      const encodedDoi = encodeURIComponent(cleanDoi);
      const crUrl = `https://api.crossref.org/works/${encodedDoi}?mailto=${encodeURIComponent(this.politeEmail)}`;
      
      const crResponse = await this._fetchWithRetry(crUrl, {
        headers: { "Accept": "application/json" }
      }, 8000);

      if (crResponse.status === 404) {
        crossref404 = true;
      } else if (!crResponse.ok) {
        throw new Error(`Crossref returned HTTP ${crResponse.status}`);
      } else {
        const crData = await crResponse.json();
        const msg = crData.message || {};
        auditResult.source = "Crossref";
        auditResult.title = (msg.title && msg.title[0]) ? this._sanitizeJATS(msg.title[0]) : "Untitled Work";
        auditResult.authors = (msg.author || []).map(a => `${a.given || ""} ${a.family || ""}`.trim()).filter(Boolean);
        auditResult.journal = (msg["container-title"] && msg["container-title"][0]) ? msg["container-title"][0] : (msg.publisher || "Crossref Registry");
        if (msg.issued && msg.issued["date-parts"] && msg.issued["date-parts"][0]) {
          auditResult.year = msg.issued["date-parts"][0][0];
        }
        auditResult.citationCount = msg["is-referenced-by-count"] || 0;

        // Crossmark Updates Retraction Check
        if (msg["update-to"] && Array.isArray(msg["update-to"])) {
          const retNotice = msg["update-to"].find(u => 
            u.type && (u.type.toLowerCase() === "retraction" || u.type.toLowerCase() === "removal")
          );
          if (retNotice) {
            auditResult.isRetracted = true;
            auditResult.retractionDetails = `Crossmark Notice: Official ${retNotice.type.toUpperCase()} issued on record.`;
          }
        }
      }
    } catch (err) {
      if (!crossref404) {
        // Network error / CORS / Timeout
        auditResult.discrepancies.push(`Crossref query error: ${err.message}`);
      }
    }

    // STEP 2: If Crossref 404, query DataCite REST API (Handles Zenodo, arXiv, Figshare datasets)
    if (crossref404) {
      try {
        const dcUrl = `https://api.datacite.org/dois/${encodeURIComponent(cleanDoi)}`;
        const dcResponse = await this._fetchWithRetry(dcUrl, {
          headers: { "Accept": "application/json" }
        }, 8000);

        if (dcResponse.status === 404) {
          datacite404 = true;
        } else if (dcResponse.ok) {
          const dcData = await dcResponse.json();
          const attrs = (dcData.data && dcData.data.attributes) || {};
          auditResult.source = "DataCite";
          auditResult.title = (attrs.titles && attrs.titles[0]) ? attrs.titles[0].title : "DataCite Work";
          auditResult.authors = (attrs.creators || []).map(c => c.name || `${c.givenName || ""} ${c.familyName || ""}`).filter(Boolean);
          auditResult.journal = attrs.publisher || "DataCite Registry";
          auditResult.year = attrs.publicationYear || null;
          auditResult.citationCount = attrs.citationCount || 0;
        }
      } catch (err) {
        if (!datacite404) auditResult.discrepancies.push(`DataCite error: ${err.message}`);
      }
    }

    // STEP 3: OpenAlex Verification & Retraction Cross-Check
    try {
      const oaUrl = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(cleanDoi)}`;
      const oaResponse = await this._fetchWithRetry(oaUrl, {
        headers: { "Accept": "application/json" }
      }, 8000);

      if (oaResponse.status === 404) {
        openalex404 = true;
      } else if (oaResponse.ok) {
        const oaData = await oaResponse.json();
        
        // If not already resolved by Crossref/DataCite, populate from OpenAlex
        if (auditResult.source === "Pending") {
          auditResult.source = "OpenAlex";
          auditResult.title = oaData.title || auditResult.title;
          auditResult.authors = (oaData.authorships || []).map(a => a.author ? a.author.display_name : "").filter(Boolean);
          auditResult.journal = oaData.primary_location && oaData.primary_location.source ? oaData.primary_location.source.display_name : "OpenAlex Source";
          auditResult.year = oaData.publication_year || null;
          auditResult.citationCount = oaData.cited_by_count || 0;
        }

        // Retraction Cross-Check
        if (oaData.is_retracted) {
          auditResult.isRetracted = true;
          auditResult.retractionDetails = auditResult.retractionDetails || "OpenAlex verified is_retracted = true (Official Publisher Retraction).";
        }
        if (oaData.open_access && oaData.open_access.is_oa) {
          auditResult.isOpenAccess = true;
        }
      }
    } catch (err) {
      if (!openalex404) auditResult.discrepancies.push(`OpenAlex error: ${err.message}`);
    }

    // STEP 4: Strict Title Retraction Check (Guards against meta-research false positives)
    // Only triggers if title explicitly starts with RETRACTED: or [RETRACTED] or contains RETRACTION NOTICE
    const titleUpper = (auditResult.title || "").toUpperCase();
    if (/^(RETRACTED:|\[RETRACTED\]|WITHDRAWN:)/.test(titleUpper) || /NOTICE OF RETRACTION|RETRACTION NOTICE/.test(titleUpper)) {
      auditResult.isRetracted = true;
      if (!auditResult.retractionDetails) {
        auditResult.retractionDetails = "Publisher marked title with explicit RETRACTED notice.";
      }
    }

    // STEP 5: Final Status Assignment with Honest Error Classification + DOI RA Lookup
    if (auditResult.isRetracted) {
      auditResult.status = "retracted";
    } else if (auditResult.source !== "Pending") {
      auditResult.status = "verified";
    } else if (crossref404 && datacite404 && openalex404) {
      const raName = await this._lookupRegistrationAgency(cleanDoi);
      if (raName) {
        auditResult.status = "not_found";
        auditResult.source = `DOI RA: ${raName}`;
        auditResult.title = `DOI Registered (${raName}) — Unindexed Metadata`;
        auditResult.discrepancies.push(`Registered under ${raName} Registration Agency (metadata not indexed in Crossref/DataCite/OpenAlex)`);
      } else {
        auditResult.status = "not_found";
        auditResult.title = "DOI Not Found in Official Registries";
        auditResult.discrepancies.push("Unresolved in Crossref, DataCite, and OpenAlex. High probability of hallucinated or typo citation.");
      }
    } else if (crossref404 && (datacite404 || openalex404)) {
      auditResult.status = "not_found";
      auditResult.title = "DOI Not Found in Official Registries";
      auditResult.discrepancies.push("Unresolved in Crossref, DataCite, and OpenAlex. High probability of hallucinated or typo citation.");
    } else {
      // Network error, timeout, or registry rate limit
      auditResult.status = "network_error";
      auditResult.title = "Unresolved (Network / Registry Unreachable)";
      auditResult.discrepancies.push("Registry request timed out or returned connection error. You can retry this citation.");
    }

    this.cache.set(cleanDoi, auditResult);
    return auditResult;
  }

  // Strip JATS / XML / HTML formatting tags and decode basic XML entities cleanly
  _sanitizeJATS(str) {
    if (!str) return "";
    const noTags = String(str).replace(/<[^>]+>/g, " ");
    return noTags
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&(apos|#39);/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Bounded Concurrency Queue Batch Verification (DOIs & bibliographic refs)
  async runBatchAudit(items, onProgress) {
    this.isAuditing = true;
    const total = items.length;
    const orderedResults = new Array(total);
    let nextIndex = 0;
    let completed = 0;
    const concurrency = Math.min(2, Math.max(1, total));

    const worker = async () => {
      while (nextIndex < total) {
        const idx = nextIndex++;
        const item = items[idx];
        const res = (item && typeof item === "object" && item.kind === "bibref")
          ? await this.verifyBibliographicRef(item)
          : await this.verifyDOI(String(item));
        orderedResults[idx] = res;
        completed++;
        if (typeof onProgress === "function") {
          onProgress(completed, total, res);
        }
        await new Promise((r) => setTimeout(r, 60));
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      this.results = orderedResults.filter(Boolean);
      return this.results;
    } finally {
      this.isAuditing = false;
    }
  }

  // Summary Metrics Computation with Balanced Scoring
  computeStats(results = this.results) {
    const total = results.length;
    if (total === 0) return { total: 0, verified: 0, retracted: 0, notFound: 0, networkErrors: 0, score: 100, hasCriticalAlert: false };

    const verified = results.filter(r => r.status === "verified").length;
    const retracted = results.filter(r => r.status === "retracted").length;
    const notFound = results.filter(r => r.status === "not_found").length;
    const networkErrors = results.filter(r => r.status === "network_error").length;

    // Evaluated citations (exclude network errors so they don't unfairly drag score down)
    const evaluated = total - networkErrors;
    let score = 100;

    if (evaluated > 0) {
      // Heavy penalty for retractions (-40%), moderate penalty for unresolvable DOIs (-25%)
      const penalty = (retracted * 40) + (notFound * 25);
      score = Math.max(0, Math.round(((evaluated * 100) - penalty) / evaluated));
    }

    // Critical Alert Flag: any retracted paper caps confidence
    const hasCriticalAlert = retracted > 0;

    return { total, verified, retracted, notFound, networkErrors, score, hasCriticalAlert };
  }

  // Export Audit Report as Markdown
  generateMarkdownReport(results = this.results) {
    const stats = this.computeStats(results);
    const dateStr = new Date().toISOString().split("T")[0];

    let md = `# Citation Integrity Audit Report\n\n`;
    md += `> **Audit Date:** ${dateStr}  \n`;
    md += `> **Audited via:** RefIntegrity v1.0 (Crossref Polite Pool, DataCite & OpenAlex Live Verification)  \n`;
    md += `> **Integrity Score:** **${stats.score} / 100** ${stats.hasCriticalAlert ? "⚠️ **CRITICAL RETRACTION ALERT**" : "🟢 **CLEAN**"}  \n\n`;

    md += `## 📊 Executive Summary\n\n`;
    md += `| Metric | Count | Percentage |\n`;
    md += `|:---|:---:|:---:|\n`;
    md += `| **Total Citations Audited** | ${stats.total} | 100% |\n`;
    md += `| 🟢 **Verified Active Papers** | ${stats.verified} | ${stats.total > 0 ? Math.round((stats.verified/stats.total)*100) : 0}% |\n`;
    md += `| 🔴 **RETRACTED PAPERS (High Risk)** | ${stats.retracted} | ${stats.total > 0 ? Math.round((stats.retracted/stats.total)*100) : 0}% |\n`;
    md += `| ❌ **Not Found / Hallucinated DOIs** | ${stats.notFound} | ${stats.total > 0 ? Math.round((stats.notFound/stats.total)*100) : 0}% |\n`;
    if (stats.networkErrors > 0) {
      md += `| ⚠️ **Unresolved Network Errors** | ${stats.networkErrors} | ${stats.total > 0 ? Math.round((stats.networkErrors/stats.total)*100) : 0}% |\n`;
    }
    md += `\n`;

    md += `## 📑 Detailed Verification Log\n\n`;
    results.forEach((r, idx) => {
      let statusIcon = "🟢 VERIFIED";
      if (r.status === "retracted") statusIcon = "🔴 RETRACTED ALERT";
      else if (r.status === "not_found") statusIcon = "❌ NOT FOUND / 404";
      else if (r.status === "network_error") statusIcon = "⚠️ NETWORK ERROR";

      md += `### ${idx + 1}. [${statusIcon}] ${this._escapeMarkdown(r.title)}\n`;
      md += `- **DOI:** [${r.doi}](https://doi.org/${encodeURIComponent(r.doi)})\n`;
      md += `- **Registry Source:** ${r.source}\n`;
      md += `- **Authors:** ${r.authors.join(", ") || "N/A"}\n`;
      md += `- **Journal / Venue:** ${r.journal} (${r.year || "Year N/A"})\n`;
      md += `- **Citations:** ${r.citationCount.toLocaleString()} citations\n`;
      if (r.retractionDetails) {
        md += `- ⚠️ **Retraction Notice:** ${r.retractionDetails}\n`;
      }
      if (r.discrepancies.length > 0) {
        md += `- ℹ️ **Registry Notes:** ${r.discrepancies.join("; ")}\n`;
      }
      md += `\n`;
    });

    md += `---\n*Generated by RefIntegrity. Open-Access Academic Verification Suite.*`;
    return md;
  }

  // Export Results as CSV with Formula Injection Guard
  generateCSV(results = this.results) {
    const headers = ["Index", "Status", "DOI", "Title", "Authors", "Journal", "Year", "Citations", "RegistrySource", "RetractionDetails"];
    const rows = results.map((r, i) => [
      i + 1,
      r.status.toUpperCase(),
      `"${this._sanitizeCSV(r.doi)}"`,
      `"${this._sanitizeCSV(r.title)}"`,
      `"${this._sanitizeCSV(r.authors.join("; "))}"`,
      `"${this._sanitizeCSV(r.journal)}"`,
      r.year || "",
      r.citationCount,
      `"${this._sanitizeCSV(r.source)}"`,
      `"${this._sanitizeCSV(r.retractionDetails || "")}"`
    ]);

    return "\uFEFF" + [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
  }

  // Export Results as Structured JSON (Audit Trail for CI/CD Pipelines)
  generateJSON(results = this.results) {
    const stats = this.computeStats(results);
    const auditRecord = {
      schema_version: "1.0",
      generator: "RefIntegrity Academic Suite",
      audit_timestamp: new Date().toISOString(),
      summary: stats,
      citations: results.map(r => ({
        doi: r.doi,
        status: r.status,
        title: r.title,
        authors: r.authors,
        journal: r.journal,
        year: r.year,
        citation_count: r.citationCount,
        registry_source: r.source,
        is_retracted: r.isRetracted,
        retraction_details: r.retractionDetails,
        discrepancies: r.discrepancies
      }))
    };
    return JSON.stringify(auditRecord, null, 2);
  }

  // Protect against CSV Formula Injection (=, +, -, @, Tab, CR per OWASP)
  _sanitizeCSV(str) {
    if (!str) return "";
    let s = String(str).replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(s)) {
      s = "'" + s; // Prefix with single quote to neutralize spreadsheet formula/DDE
    }
    return s;
  }

  _escapeMarkdown(str) {
    if (!str) return "";
    return str.replace(/([\\`*_{}[\]()#+\-.!])/g, "\\$1");
  }
}

// Global engine instance & Node/CommonJS export
if (typeof window !== "undefined") {
  window.refIntegrityEngine = new RefIntegrityEngine();
  window.SAMPLE_DATASETS = SAMPLE_DATASETS;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { RefIntegrityEngine, SAMPLE_DATASETS };
}

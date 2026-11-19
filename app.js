/**
 * RefIntegrity UI Controller
 * 100% Client-Side, Externalized CSP-Safe JS, 0-EUR Validation Waitlist Mode
 */

const CHECKOUT_ENABLED = false;
const WAITLIST_ENDPOINT = "https://conversionlogic-waitlist.conversionlogic.workers.dev";

let currentTab = "dois";
let currentFilter = "all";
let auditedResults = [];
let isSampleMode = false;

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  updateDetectedCount();
});

function setupEventListeners() {
  document.getElementById("btn-header-print")?.addEventListener("click", () => window.print());
  document.getElementById("btn-print")?.addEventListener("click", () => window.print());

  document.querySelectorAll(".mode-tab[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchInputTab(btn.dataset.tab));
  });

  document.querySelectorAll("[data-sample]").forEach((btn) => {
    btn.addEventListener("click", () => loadSampleDataset(btn.dataset.sample));
  });

  document.getElementById("bibFileInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("File exceeds 5MB limit.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target.result || "");
      isSampleMode = false;
      if (file.name.toLowerCase().endsWith(".bib")) {
        switchInputTab("bibtex");
      } else {
        switchInputTab("text");
      }
      document.getElementById("citationInput").value = text;
      updateDetectedCount();
    };
    reader.readAsText(file);
  });

  const input = document.getElementById("citationInput");
  input?.addEventListener("input", () => {
    isSampleMode = false;
    updateDetectedCount();
  });

  document.getElementById("runAuditBtn")?.addEventListener("click", executeAudit);
  document.getElementById("clearInputBtn")?.addEventListener("click", clearInput);
  document.getElementById("btn-view-retractions")?.addEventListener("click", () => filterTable("retracted"));

  document.querySelectorAll(".filter-btn[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => filterTable(btn.dataset.filter));
  });

  document.getElementById("btn-dl-md")?.addEventListener("click", downloadMarkdown);
  document.getElementById("btn-dl-csv")?.addEventListener("click", downloadCSV);
  document.getElementById("btn-dl-json")?.addEventListener("click", downloadJSON);
  document.getElementById("btn-copy-bib")?.addEventListener("click", copyCleanBibTeX);
  document.getElementById("btn-close-dialog")?.addEventListener("click", closeModal);

  setupWaitlistForm();
}

function switchInputTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".mode-tab[data-tab]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });

  const input = document.getElementById("citationInput");
  const label = document.getElementById("inputLabel");
  if (tab === "dois") {
    label.textContent = "Paste DOIs (one per line, handles SICI & DataCite):";
    input.placeholder = "10.1016/S0140-6736(97)11096-0\n10.1145/3065386\n10.5281/zenodo.1234567\n10.1016/j.ai.2024.999999";
  } else if (tab === "text") {
    label.textContent = "Paste raw paper text, references, or bibliography (auto-extracts DOIs):";
    input.placeholder = "Paste references or manuscript text containing DOIs.";
  } else {
    label.textContent = "Paste BibTeX entries (nested braces supported):";
    input.placeholder = "@article{author2024,\n  title = {Paper Title},\n  doi = {10.1016/...},\n  year = {2024}\n}";
  }
  updateDetectedCount();
}

function updateDetectedCount() {
  const text = document.getElementById("citationInput").value;
  const dois = window.refIntegrityEngine.extractDOIs(text);
  const refs = window.refIntegrityEngine.extractBibliographicRefs(text);
  const label = refs.length > 0
    ? `${dois.length} DOI${dois.length === 1 ? "" : "s"} + ${refs.length} non-DOI ref${refs.length === 1 ? "" : "s"} detected`
    : `${dois.length} DOI${dois.length === 1 ? "" : "s"} detected`;
  document.getElementById("detectedCount").textContent = label;
}

function loadSampleDataset(type) {
  const samplesObj = typeof SAMPLE_DATASETS !== "undefined" ? SAMPLE_DATASETS : window.SAMPLE_DATASETS;
  const dataset = samplesObj && samplesObj[type];
  if (!dataset) return;
  const input = document.getElementById("citationInput");
  if (type === "retracted") {
    switchInputTab("bibtex");
    input.value = dataset.rawText;
  } else {
    switchInputTab("dois");
    input.value = dataset.dois.join("\n");
  }
  isSampleMode = true;
  updateDetectedCount();
}

function clearInput() {
  document.getElementById("citationInput").value = "";
  isSampleMode = false;
  updateDetectedCount();
  document.getElementById("resultsSection").hidden = true;
  document.getElementById("emptyProtocol").hidden = false;
}

async function executeAudit() {
  const text = document.getElementById("citationInput").value;
  const dois = window.refIntegrityEngine.extractDOIs(text);
  const bibRefs = window.refIntegrityEngine.extractBibliographicRefs(text);
  let batch = [...dois, ...bibRefs];

  if (batch.length === 0) {
    alert("Please paste at least one valid DOI, BibTeX entry, or bibliographic reference before auditing.");
    return;
  }

  if (batch.length > 100) {
    alert(`Browser batch cap: ${batch.length} citations found. Auditing the first 100 citations.`);
    batch = batch.slice(0, 100);
  }

  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");
  const progressStatus = document.getElementById("progressStatus");
  const progressPercent = document.getElementById("progressPercent");
  const runBtn = document.getElementById("runAuditBtn");

  progressContainer.hidden = false;
  runBtn.disabled = true;

  try {
    auditedResults = await window.refIntegrityEngine.runBatchAudit(batch, (completed, total, currentResult) => {
      const pct = Math.round((completed / total) * 100);
      progressBar.style.width = `${pct}%`;
      progressPercent.textContent = `${pct}%`;
      const label = currentResult.doi && /^10\./.test(currentResult.doi) ? currentResult.doi : (currentResult.title || "Reference").slice(0, 42);
      progressStatus.textContent = `Checking ${completed}/${total}: ${label} (${currentResult.status})`;
    });
    renderResults(auditedResults);
  } finally {
    progressContainer.hidden = true;
    runBtn.disabled = false;
  }
}

function renderResults(results) {
  const stats = window.refIntegrityEngine.computeStats(results);

  document.getElementById("emptyProtocol").hidden = true;
  const resultsSection = document.getElementById("resultsSection");
  resultsSection.hidden = false;

  document.getElementById("sampleDemoBanner").hidden = !isSampleMode;
  document.getElementById("criticalRetractionAlert").hidden = !stats.hasCriticalAlert;

  document.getElementById("scoreValue").textContent = stats.score;
  document.getElementById("statTotal").textContent = stats.total;
  document.getElementById("statVerified").textContent = stats.verified;
  document.getElementById("statRetracted").textContent = stats.retracted;
  document.getElementById("statNotFound").textContent = stats.notFound;
  document.getElementById("statNotFoundLabel").textContent = "Across 3 registries";
  document.getElementById("statVerifiedPercent").textContent = `${stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0}% of batch`;
  document.getElementById("statRetractedLabel").textContent = stats.retracted > 0 ? `${stats.retracted} Retraction notice(s)` : "0 notices";

  const scoreEl = document.getElementById("scoreValue");
  const scoreLabel = document.getElementById("scoreLabel");
  if (stats.score >= 90 && !stats.hasCriticalAlert) {
    scoreEl.className = "metric-num is-pass";
    scoreLabel.textContent = "Clean record";
  } else if (stats.score >= 70 && !stats.hasCriticalAlert) {
    scoreEl.className = "metric-num is-warn";
    scoreLabel.textContent = "Review suggested";
  } else {
    scoreEl.className = "metric-num is-fail";
    scoreLabel.textContent = "Retraction / 404 risk";
  }

  document.getElementById("count-all").textContent = stats.total;
  document.getElementById("count-verified").textContent = stats.verified;
  document.getElementById("count-retracted").textContent = stats.retracted;
  document.getElementById("count-not_found").textContent = stats.notFound;

  const netBtn = document.getElementById("filter-network_error");
  netBtn.hidden = stats.networkErrors === 0;
  document.getElementById("count-network_error").textContent = stats.networkErrors;

  renderTableRows(results);
}

function renderTableRows(results) {
  const tbody = document.getElementById("auditTableBody");
  tbody.innerHTML = "";

  const filtered = results.filter((r) => currentFilter === "all" || r.status === currentFilter);
  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="7" class="empty-cell">No citations match the selected filter.</td>`;
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach((r, idx) => {
    const tr = document.createElement("tr");
    const statusMap = {
      verified: "Verified",
      retracted: "Retracted",
      not_found: "Not Found",
      network_error: "Network Error"
    };
    const authorsStr = r.authors && r.authors.length ? r.authors.slice(0, 3).join(", ") + (r.authors.length > 3 ? " et al." : "") : "Authors unavailable";

    const hasDoiLink = r.doi && /^10\.\d{4,9}\/.+/i.test(r.doi);
    const doiCellHtml = hasDoiLink
      ? `<a href="https://doi.org/${encodeURIComponent(r.doi)}" target="_blank" rel="noopener noreferrer" class="doi-link">${escapeHtml(r.doi)}</a>`
      : `<span class="mono muted-xs">${escapeHtml(r.doi || "No DOI")}</span>`;
    const discrepancyNote = !r.retractionDetails && r.discrepancies && r.discrepancies.length
      ? `<div class="muted-xs mt-1">${escapeHtml(r.discrepancies[0])}</div>`
      : "";

    tr.innerHTML = `
      <td class="tnum mono" data-label="Entry">#${idx + 1}</td>
      <td data-label="Status"><span class="status-label ${escapeHtml(r.status)}">${statusMap[r.status] || r.status}</span></td>
      <td data-label="Work & Authors">
        <div class="work-title">${escapeHtml(r.title)}</div>
        <div class="work-authors">${escapeHtml(authorsStr)}</div>
        ${r.retractionDetails ? `<div class="retract-reason"><strong>Notice:</strong> ${escapeHtml(r.retractionDetails)}</div>` : ""}
        ${discrepancyNote}
      </td>
      <td data-label="Venue & Year">
        <div>${escapeHtml(r.journal || "Venue N/A")}</div>
        <div class="tnum muted-xs">${escapeHtml(r.year || "")}</div>
      </td>
      <td class="tnum" data-label="Citations">${Number(r.citationCount || 0).toLocaleString()}</td>
      <td data-label="DOI & Registry">
        ${doiCellHtml}
        <div class="meta-sub">${escapeHtml(r.source)}</div>
      </td>
      <td class="no-print"></td>
    `;

    const actionCell = tr.lastElementChild;
    const inspectBtn = document.createElement("button");
    inspectBtn.type = "button";
    inspectBtn.className = "btn btn-secondary btn-sm";
    inspectBtn.textContent = "Inspect";
    inspectBtn.addEventListener("click", () => openModal(r));
    actionCell.appendChild(inspectBtn);

    tbody.appendChild(tr);
  });
}

function filterTable(filter) {
  currentFilter = filter;
  document.querySelectorAll(".filter-btn[data-filter]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.filter === filter);
  });
  renderTableRows(auditedResults);
}

function openModal(item) {
  const dlg = document.getElementById("detailDialog");
  const badge = document.getElementById("modalStatusBadge");
  document.getElementById("modalTitle").textContent = item.title;
  document.getElementById("modalAuthors").textContent = (item.authors || []).join(", ") || "N/A";
  document.getElementById("modalJournal").textContent = item.journal || "N/A";
  document.getElementById("modalYear").textContent = item.year || "N/A";
  document.getElementById("modalCitations").textContent = `${Number(item.citationCount || 0).toLocaleString()} citations`;

  const doiLink = document.getElementById("modalDoiLink");
  doiLink.textContent = item.doi || "N/A";
  if (item.doi && /^10\.\d{4,9}\/.+/i.test(item.doi)) {
    doiLink.href = `https://doi.org/${encodeURIComponent(item.doi)}`;
  } else {
    doiLink.removeAttribute("href");
  }

  const alertBox = document.getElementById("modalRetractionAlertBox");
  const statusLabels = { verified: "Verified", retracted: "Retracted Alert", not_found: "Not Found / 404", network_error: "Network Error" };
  badge.className = `status-label ${item.status}`;
  badge.textContent = statusLabels[item.status] || item.status;

  if (item.status === "retracted") {
    alertBox.hidden = false;
    document.getElementById("modalRetractionText").textContent = item.retractionDetails || "Publisher or Crossmark flagged this work as retracted.";
  } else {
    alertBox.hidden = true;
  }

  dlg.showModal();
}

function closeModal() {
  document.getElementById("detailDialog")?.close();
}

function downloadMarkdown() {
  if (!auditedResults.length) return;
  downloadBlob(window.refIntegrityEngine.generateMarkdownReport(auditedResults), "refintegrity-audit-report.md", "text/markdown");
}

function downloadCSV() {
  if (!auditedResults.length) return;
  downloadBlob(window.refIntegrityEngine.generateCSV(auditedResults), "refintegrity-citations.csv", "text/csv");
}

function downloadJSON() {
  if (!auditedResults.length) return;
  downloadBlob(window.refIntegrityEngine.generateJSON(auditedResults), "refintegrity-audit-record.json", "application/json");
}

function copyCleanBibTeX() {
  if (!auditedResults.length) return;
  const verified = auditedResults.filter((r) => r.status === "verified");
  if (!verified.length) {
    alert("No verified citations available to copy.");
    return;
  }
  const cleanField = (v) => String(v || "").replace(/[{}]/g, "");
  const bibText = verified.map((r, i) => `@article{ref_${i + 1},\n  title = {${cleanField(r.title)}},\n  author = {${cleanField((r.authors || []).join(" and "))}},\n  journal = {${cleanField(r.journal)}},\n  year = {${r.year || 2024}},\n  doi = {${cleanField(r.doi)}}\n}`).join("\n\n");
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(bibText)
      .then(() => {
        const btn = document.getElementById("btn-copy-bib");
        if (!btn) return;
        btn.textContent = `Copied (${verified.length})`;
        setTimeout(() => { btn.textContent = "Copy BibTeX"; }, 1800);
      })
      .catch(() => downloadBlob(bibText, "verified-references.bib", "text/plain"));
  } else {
    downloadBlob(bibText, "verified-references.bib", "text/plain");
  }
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function setupWaitlistForm() {
  const form = document.getElementById("proWaitlistForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (CHECKOUT_ENABLED) return;

    const emailEl = document.getElementById("proWaitlistEmail");
    const consentEl = document.getElementById("proWaitlistConsent");
    const adviceEl = document.getElementById("proWaitlistAdvice");
    const msgEl = document.getElementById("proWaitlistMsg");
    const btn = document.getElementById("proWaitlistSubmit");

    const email = (emailEl.value || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      msgEl.className = "waitlist-msg is-err";
      msgEl.textContent = "Please enter a valid email address.";
      emailEl.focus();
      return;
    }
    if (!consentEl.checked) {
      msgEl.className = "waitlist-msg is-err";
      msgEl.textContent = "Explicit GDPR consent is required before submitting.";
      consentEl.focus();
      return;
    }

    const adviceFocus = (adviceEl && adviceEl.value ? adviceEl.value : "").trim();
    const consentText = (consentEl.closest("label")?.textContent || "Explicit GDPR consent for one-time launch notification.").replace(/\s+/g, " ").trim().slice(0, 500);
    const consentTs = new Date().toISOString();

    btn.disabled = true;
    msgEl.className = "waitlist-msg";
    msgEl.textContent = "Registering...";

    try {
      const resp = await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          email,
          project: form.dataset.project || "refintegrity",
          advice_focus: adviceFocus,
          consent: true,
          consent_text: consentText,
          consent_ts: consentTs
        })
      });
      const data = await resp.json();
      if (resp.ok && data.ok) {
        msgEl.className = "waitlist-msg is-ok";
        msgEl.textContent = "Registered on the Priority Waitlist (0 EUR today).";
        form.reset();
      } else {
        throw new Error(data.error || "Registration failed");
      }
    } catch (err) {
      msgEl.className = "waitlist-msg is-err";
      msgEl.textContent = `Connection error: ${err.message}. Please retry.`;
    } finally {
      btn.disabled = false;
    }
  });
}

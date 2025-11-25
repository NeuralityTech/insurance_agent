// ----- Utilities for age/BMI -----
const yearsFromDob = (dobStr) => {
    if (!dobStr) return "—";
    const d = new Date(dobStr); if (isNaN(d)) return "—";
    const now = new Date(); let y = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
    return Math.max(0, y);
};
const bmi = (kg, cm) => {
    if (!kg || !cm) return "—";
    const val = kg / Math.pow(cm / 100, 2);
    return isFinite(val) ? val.toFixed(1) : "—";
};

// ----- Personal Info rendering -----
function renderPersonalInfo(client) {
    const el = document.getElementById('personalInfo');
    if (!el) return;
    const lines = [];
    const p = client?.primaryContact || {};
    const h = client?.healthHistory || {};
    const age = h["self-dob"] ? yearsFromDob(h["self-dob"]) : (h["self-age"] || "—");
    const b = bmi(Number(h["self-weight"]), Number(h["self-height"]));
    const g = (h["self-gender"] || p.gender || p.applicant_gender || "—");
    lines.push(`<li>Name : <strong>${p.applicant_name || "—"}</strong> - Age : ${age} - BMI : ${b} - Gender : ${g}</li>`);
    (client?.members || []).forEach(m => {
        const ageM = yearsFromDob(m.dob);
        const bM = bmi(Number(m.weight_kg || m.weight), Number(m.height_cm || m.height));
        const gM = (m.gender || m.sex || "—");
        lines.push(`<li>Name : ${m.name || "—"} - Age : ${ageM} - BMI : ${bM} - Gender : ${gM}</li>`);
    });
    el.innerHTML = `<h2>Personal Information</h2><ul class="people">${lines.join("")}</ul>`;
}

// ----- Supervisor comments rendering -----
function renderSupervisorComments(text) {
    const block = document.getElementById('supervisor-comments-block');
    const para = document.getElementById('supervisor-comments-text');
    if (!block || !para) return;
    const t = (text || '').toString().trim();
    if (t) {
        para.textContent = t;
        block.classList.remove('is-hidden');
    } else {
        para.textContent = '';
        block.classList.add('is-hidden');
    }
}

// ----- Justification-based summaries (strictly from JSON) -----
function getClientIdFromPath() {
    try {
        // Expected path: /proposed_plans/<clientId>
        const parts = (location.pathname || '').split('/').filter(Boolean);
        return parts[1] || parts[parts.length - 1] || '';
    } catch { return ''; }
}

async function loadJustificationMap(clientId) {
    const map = {};
    if (!clientId) return map;
    try {
        const bases = [
            `/justification_reports/${encodeURIComponent(clientId)}.json`,
            `/static/justification_reports/${encodeURIComponent(clientId)}.json`,
            `/reports/justification/${encodeURIComponent(clientId)}.json`
        ];
        let data = null;
        let usedUrl = null;
        for (const url of bases) {
            try {
                const res = await fetch(url);
                if (res.ok) { data = await res.json(); usedUrl = url; break; }
            } catch {}
        }
        if (!data) return map;
        const arr = Array.isArray(data.detailed_justification) ? data.detailed_justification : [];
        const norm = s => String(s || '').toLowerCase().replace(/\s+/g,' ').trim();
        // cache names and source for debugging/partial match
        try {
            window.__justificationNames = arr.map(x => String(x.plan_name || '')).filter(Boolean);
            window.__justificationSource = usedUrl;
            console.info('[analysis_dashboard] Loaded justifications:', { url: usedUrl, count: arr.length });
        } catch {}
        arr.forEach(item => {
            const name = item.plan_name;
            const reason = item.ai_reasoning || item.reason_for_proposal || '';
            if (name && reason) {
                map[name] = reason;                // exact key
                map[`__norm__${norm(name)}`] = reason; // normalized key
            }
        });
    } catch {}
    return map;
}

async function applySummariesFromJustification(plans) {
    try {
        const clientId = getClientIdFromPath();
        const jmap = await loadJustificationMap(clientId);
        const norm = s => String(s || '').toLowerCase().replace(/\s+/g,' ').trim();
        plans.forEach((p, index) => {
            const planName = p['Plan Name'];
            const summaryId = `summary-${index}-${String(planName).replace(/[^a-zA-Z0-9]/g, '_')}`;
            const ta = document.getElementById(summaryId);
            if (ta) {
                let val = jmap[planName] || jmap[`__norm__${norm(planName)}`] || '';
                // Unique partial-match fallback (one-way or reverse) when no exact/normalized hit
                if (!val && Array.isArray(window.__justificationNames) && window.__justificationNames.length) {
                    const names = window.__justificationNames;
                    const pn = norm(planName);
                    const candidates = names.filter(n => {
                        const nn = norm(n);
                        return nn.includes(pn) || pn.includes(nn);
                    });
                    if (candidates.length === 1) {
                        const only = candidates[0];
                        val = jmap[only] || jmap[`__norm__${norm(only)}`] || '';
                        try { console.debug('[analysis_dashboard] Using partial match:', { plan: planName, matched: only }); } catch {}
                    } else if (candidates.length > 1) {
                        try { console.debug('[analysis_dashboard] Multiple partial matches, skipping:', { plan: planName, matches: candidates }); } catch {}
                    }
                }
                ta.value = val;
                if (!val) {
                    try { console.debug('[analysis_dashboard] No justification found for plan:', planName); } catch {}
                }
            }
        });
    } catch {}
}

// ----- Plan Rendering Logic -----
function createPlanCard(p, index) {
    const memberScores = Object.keys(p)
        .filter(key => key.startsWith('Score_') && key !== 'Score_MemberAware')
        .map(key => {
            const memberName = key.replace('Score_', '');
            const score = Number(p[key]).toFixed(2);
            return `<div class="k">${memberName} Score</div><div class="v">${score}</div>`;
        }).join('');

    const planId = `plan-${index}-${p['Plan Name'].replace(/[^a-zA-Z0-9]/g, '_')}`;
    const summaryId = `summary-${index}-${p['Plan Name'].replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    return `
    <article class="plan-card" aria-label="${p['Plan Name']}">
      <div>
        <div class="plan-card-header">
          <input type="checkbox" id="${planId}" name="${planId}" class="plan-checkbox" data-plan-name="${p['Plan Name']}" aria-label="Select ${p['Plan Name']}">
        </div>
        <h3><span class="rank-pill">#${index + 1}</span>${p['Plan Name']}</h3>
        <div class="kv">
          <div class="k">Category</div><div class="v">${p.Category}</div>
          ${memberScores}
          <div class="k">Summary</div>
          <div class="v">
            <textarea id="${summaryId}" name="${summaryId}" class="plan-summary" placeholder="Add summary..."></textarea>
          </div>
        </div>
      </div>
    </article>`;
}

function renderFloaterPlans(plans, container) {
    if (!container || !plans || plans.length === 0) {
        container.innerHTML = '<p>No suitable family floater plans found.</p>';
        return;
    }
    container.innerHTML = plans.map((p, i) => createPlanCard(p, i)).join('');
    // Auto-fill summaries strictly from justification JSON
    try { applySummariesFromJustification(plans); } catch {}
}

function renderCombinationPackages(combos, container) {
    if (!container) return;
    // For matrix layout we don't need the card container classes
    try { container.classList.remove('cards-container', 'vertical'); } catch {}

    const asNumber = (v, d = 0) => {
        const n = Number(v);
        return isFinite(n) ? n : d;
    };

    const fmt2 = (v) => asNumber(v, 0).toFixed(2);

    // Build a matrix view: rows = member names, columns = packages
    function buildMatrix(packages) {
        // 1) Collect all unique member names present in any package
        const memberSet = new Set();
        packages.forEach(pkg => {
            const plans = Array.isArray(pkg?.plans) ? pkg.plans : [];
            plans.forEach(p => {
                if (Array.isArray(p?.members)) p.members.forEach(m => m && memberSet.add(String(m)));
                else if (Array.isArray(p?.covered_members)) p.covered_members.forEach(m => m && memberSet.add(String(m)));
                else if (p?.member) memberSet.add(String(p.member));
            });
        });
        const members = Array.from(memberSet);

        // 2) Build header
        const headerCols = packages.map((pkg, idx) => {
            const score = fmt2(pkg?.total_score ?? pkg?.score ?? pkg?.package_score ?? 0);
            return `<th>Package #${idx + 1}<br><small>Total ${score}</small></th>`;
        }).join('');

        // 3) Build body rows: for each member, find plan in each package
        const bodyRows = members.map(memberName => {
            const cells = packages.map(pkg => {
                const plans = Array.isArray(pkg?.plans) ? pkg.plans : [];
                // Find a plan that applies to this member
                const plan = plans.find(p => {
                    if (Array.isArray(p?.members) && p.members.includes(memberName)) return true;
                    if (Array.isArray(p?.covered_members) && p.covered_members.includes(memberName)) return true;
                    if (p?.member && String(p.member) === memberName) return true;
                    return false;
                });
                if (!plan) return '<td></td>';
                const planName = (plan.plan || plan.plan_name || '').replace(/\"/g,'&quot;');
                const comboId = `combo-${memberName.replace(/[^a-zA-Z0-9]/g, '_')}-${planName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                return `<td>
                    <label for="${comboId}" style="display:flex; align-items:center; gap:6px;">
                        <input type="checkbox" id="${comboId}" name="${comboId}" class="plan-checkbox" data-plan-name="${planName}" aria-label="Select ${planName}">
                        <span>${planName || '—'}</span>
                    </label>
                </td>`;
            }).join('');
            return `<tr><th style="text-align:left;">${memberName}</th>${cells}</tr>`;
        }).join('');

        return `<div style="overflow-x:auto;">
            <table class="plans-table" style="width:100%; border-collapse: collapse;">
                <thead>
                    <tr><th>Members</th>${headerCols}</tr>
                </thead>
                <tbody>
                    ${bodyRows}
                </tbody>
            </table>
        </div>`;
    }

    // Gather packages from preferred/legacy shapes
    const packages = [];
    if (combos && Array.isArray(combos.ranked_packages) && combos.ranked_packages.length) {
        combos.ranked_packages.forEach(pkg => { if (Array.isArray(pkg?.plans) && pkg.plans.length) packages.push(pkg); });
    }
    if (!packages.length && combos && combos.best_individual_combo && Array.isArray(combos.best_individual_combo.plans) && combos.best_individual_combo.plans.length) {
        packages.push(combos.best_individual_combo);
    }
    if (!packages.length && combos && Array.isArray(combos.hybrid_combos) && combos.hybrid_combos.length) {
        combos.hybrid_combos.forEach(hybrid => { const plans = Array.isArray(hybrid?.package) ? hybrid.package : []; if (plans.length) packages.push({ plans, total_score: hybrid.total_score || hybrid.score || 0 }); });
    }

    container.innerHTML = packages.length ? buildMatrix(packages) : '<p>No combination packages could be generated.</p>';
}


// ----- Tab Navigation -----
function initTabs() {
    const tabContainer = document.querySelector('.tabs');
    if (!tabContainer) return;

    tabContainer.addEventListener('click', (e) => {
        if (e.target.matches('.tab-link')) {
            const tabId = e.target.dataset.tab;
            
            document.querySelectorAll('.tab-link').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            e.target.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        }
    });
}

// ----- Boot -----
document.addEventListener('DOMContentLoaded', () => {
    // --- Data Initialization ---
    const clientData = JSON.parse(document.getElementById('client-data-json').textContent);
    const analysisData = JSON.parse(document.getElementById('analysis-data-json').textContent);
    const supervisorStatus = JSON.parse(document.getElementById('supervisor-status-json').textContent);
    const supervisorComments = JSON.parse(document.getElementById('supervisor-comments-json').textContent);
    const proceedBtn = document.getElementById('proceedBtn');
    const modal = document.getElementById('confirmationModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const selectedPlansList = document.getElementById('selectedPlansList');

    let currentSupervisorStatus = (typeof supervisorStatus !== 'undefined' && supervisorStatus != null)
        ? String(supervisorStatus).trim().toLowerCase()
        : null;
    let plansChanged = false;

    const getUniqueId = () => window.location.pathname.split('/').pop();

    const updateProceedState = () => {
        let disabled = false;
        if (currentSupervisorStatus === 'sup_review' || currentSupervisorStatus === 'approved') {
            disabled = true;
        } else if (currentSupervisorStatus === 'rejected') {
            disabled = !plansChanged;
        }
        if (proceedBtn) {
            proceedBtn.disabled = disabled;
            proceedBtn.classList.toggle('is-disabled', disabled);
            proceedBtn.setAttribute('aria-disabled', String(disabled));
            proceedBtn.title = disabled ? 'Disabled due to supervisor status' : '';
        }
    };

    const trackPlanChanges = () => {
        const planSection = document.querySelector('.plan-options-section');
        if(planSection){
            planSection.addEventListener('change', (e) => {
                if (e.target.matches('.plan-checkbox')) {
                    plansChanged = true;
                    updateProceedState();
                }
            });
        }
    };

    if (proceedBtn && modal && closeModalBtn && selectedPlansList) {
        proceedBtn.addEventListener('click', () => {
            if (proceedBtn.disabled) return;

            const selectedCheckboxes = document.querySelectorAll('.plan-checkbox:checked');
            const planNames = Array.from(selectedCheckboxes).map(cb => cb.dataset.planName);

            if (planNames.length === 0) {
                alert('Please select at least one plan to proceed.');
                return;
            }

            const uniqueId = getUniqueId();

            fetch(`/update_chosen_plans/${uniqueId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selected_plans: planNames }),
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    selectedPlansList.innerHTML = planNames.map(name => `<li>${name}</li>`).join('');
                    modal.classList.remove('is-hidden');

                    fetch(`/update_approval_status/${uniqueId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-User-Id': (localStorage.getItem('loggedInUserId') || 'Unknown')
                        },
                        body: JSON.stringify({ status: 'SUP_REVIEW' })
                    }).then(res => res.json())
                      .then(res => {
                        currentSupervisorStatus = 'sup_review';
                        plansChanged = false;
                        updateProceedState();
                        
                        // Update the status display section
                        const supSummary = document.getElementById('sup-summary');
                        if (supSummary && res) {
                            const statusDisp = 'SUP_REVIEW';
                            const comments = res.supervisor_comments || 'Submitted by agent; awaiting supervisor review.';
                            const by = res.supervisor_modified_by || localStorage.getItem('loggedInUserId') || 'Unknown';
                            
                            // Format current timestamp
                            const now = new Date();
                            const tsStr = now.toLocaleString('en-IN', {
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
                                timeZone: 'Asia/Kolkata'
                            });
                            
                            const summaryHtml = '<strong>Application Status:</strong> ' + statusDisp + '<br>' +
                                               '<strong>Comments:</strong> ' + comments + '<br>' +
                                               '<strong>Last Updated by:</strong> ' + by + ' <strong>Last Updated at:</strong> ' + tsStr;
                            supSummary.innerHTML = summaryHtml;
                        }
                        
                        // Update badge in header to reflect Pending status
                        const badge = document.getElementById('supervisor-status-badge');
                        if (badge) {
                            badge.textContent = 'SUP_REVIEW';
                            badge.classList.remove('success', 'danger', 'na');
                            badge.classList.add('warning');
                        }
                        // Show supervisor comments (backend supplies a default for pending if none provided)
                        renderSupervisorComments(res && res.supervisor_comments);
                      });
                } else {
                    alert('Failed to save selected plans. Please try again.');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('An error occurred while saving the selected plans.');
            });
        });

        closeModalBtn.addEventListener('click', () => modal.classList.add('is-hidden'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('is-hidden');
        });
    }

    // --- Initial Page Render ---
    if (typeof clientData !== 'undefined') {
        renderPersonalInfo(clientData);
    }

    if (typeof analysisData !== 'undefined') {
        const floaterPlans = (analysisData.best_floater && Array.isArray(analysisData.best_floater.plans))
            ? analysisData.best_floater.plans
            : [];
        renderFloaterPlans(floaterPlans, document.getElementById('floater-plans-container'));

        const combos = analysisData.combination_packages || {};
        renderCombinationPackages(combos, document.getElementById('combo-packages-container'));
    }

    initTabs();
    trackPlanChanges();
    updateProceedState();
    // Initial render for supervisor comments if present
    if (typeof supervisorComments !== 'undefined') {
        renderSupervisorComments(supervisorComments);
    }
});

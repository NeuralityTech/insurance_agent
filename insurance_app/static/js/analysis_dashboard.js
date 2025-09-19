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

// ----- Plan Rendering Logic -----
function createPlanCard(p, index) {
    const memberScores = Object.keys(p)
        .filter(key => key.startsWith('Score_') && key !== 'Score_MemberAware')
        .map(key => {
            const memberName = key.replace('Score_', '');
            const score = Number(p[key]).toFixed(2);
            return `<div class="k">${memberName} Score</div><div class="v">${score}</div>`;
        }).join('');

    return `
    <article class="plan-card" aria-label="${p['Plan Name']}">
      <div>
        <div class="plan-card-header">
          <input type="checkbox" class="plan-checkbox" data-plan-name="${p['Plan Name']}" aria-label="Select ${p['Plan Name']}">
        </div>
        <h3><span class="rank-pill">#${index + 1}</span>${p['Plan Name']}</h3>
        <div class="kv">
          <div class="k">Category</div><div class="v">${p.Category}</div>
          ${memberScores}
          <div class="k">Summary</div>
          <div class="v">
            <textarea class="plan-summary" placeholder="Add summary..."></textarea>
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
}

function renderCombinationPackages(combos, container) {
    if (!container) return;
    let html = '';

    // Option 2: Best Individual Combo
    const individualCombo = combos.best_individual_combo;
    if (individualCombo && individualCombo.plans && individualCombo.plans.length > 0) {
        html += `
        <div class="combo-package">
          <h3>Best Individual Plan Combination</h3>
          <div class="total-score">Total Score: ${individualCombo.total_score.toFixed(2)}</div>
          <ul class="plan-list">
            ${individualCombo.plans.map(p => `
              <li class="plan-list-item">
                <h4>${p.plan} (for ${p.member})</h4>
                <div class="kv">
                  <div class="k">Score</div><div class="v">${p.score.toFixed(2)}</div>
                </div>
              </li>`).join('')}
          </ul>
        </div>`;
    }

    // Option 3: Best Hybrid Combo
    const hybridCombo = combos.hybrid_combos && combos.hybrid_combos.length > 0 ? combos.hybrid_combos[0] : null;
    if (hybridCombo && hybridCombo.plans && hybridCombo.plans.length > 0) {
        html += `
        <div class="combo-package">
          <h3>Best Hybrid Combination</h3>
          <div class="total-score">Total Score: ${hybridCombo.total_score.toFixed(2)}</div>
          <ul class="plan-list">
            ${hybridCombo.package.map(p => `
              <li class="plan-list-item">
                <h4>${p.plan} (${p.type === 'Floater' ? 'Floater for ' + p.covered_members.join(', ') : 'Individual for ' + p.covered_members[0]})</h4>
                <div class="kv">
                  <div class="k">Score</div><div class="v">${p.score.toFixed(2)}</div>
                </div>
              </li>`).join('')}
          </ul>
        </div>`;
    }

    if (html === '') {
        html = '<p>No combination packages could be generated.</p>';
    }

    container.innerHTML = html;
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
        if (currentSupervisorStatus === 'pending' || currentSupervisorStatus === 'approved') {
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
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'pending' })
                    }).then(res => res.json())
                      .then(res => {
                        currentSupervisorStatus = 'pending';
                        plansChanged = false;
                        updateProceedState();
                        // Update badge in header to reflect Pending status
                        const badge = document.getElementById('supervisor-status-badge');
                        if (badge) {
                            badge.textContent = 'PENDING';
                            badge.classList.remove('success', 'danger', 'na');
                            badge.classList.add('warning');
                        }
                        // Show supervisor comments (backend supplies a default for pending if none provided)
                        renderSupervisorComments(res && res.supervisor_comments);
                      })
                      .catch(() => {
                        currentSupervisorStatus = 'pending';
                        plansChanged = false;
                        updateProceedState();
                        const badge = document.getElementById('supervisor-status-badge');
                        if (badge) {
                            badge.textContent = 'PENDING';
                            badge.classList.remove('success', 'danger', 'na');
                            badge.classList.add('warning');
                        }
                        renderSupervisorComments('Resubmitted by agent; awaiting supervisor review.');
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
        renderFloaterPlans(analysisData.option_1_full_family_plans.plans, document.getElementById('floater-plans-container'));
        renderCombinationPackages(analysisData.option_2_combination_plans, document.getElementById('combo-packages-container'));
    }

    initTabs();
    trackPlanChanges();
    updateProceedState();
    // Initial render for supervisor comments if present
    if (typeof supervisorComments !== 'undefined') {
        renderSupervisorComments(supervisorComments);
    }
});

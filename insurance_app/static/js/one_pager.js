// one_pager.js - Logic for Insurance Plan Summary & Comparison

(function (window) {
    'use strict';

    function renderOnePager(container, uniqueId) {
        if (!container) return;

        // Populate Proposer Information
        const proposerInfoContainer = document.getElementById('op-proposer-info');
        if (proposerInfoContainer) {
            proposerInfoContainer.innerHTML = generateProposerHTML();
        }

        // Populate Member Information
        const memberInfoContainer = document.getElementById('op-member-info');
        if (memberInfoContainer) {
            memberInfoContainer.innerHTML = generateMemberHTML();
        }

        // Initialize Plan Dropdowns - Moved to end of setTimeout to ensure disabled state wins
        // initializePlanDropdowns();

        // Note: The print button now has a complex inline onclick in HTML to handle title/filename
        // No JS event listeners needed for printing

        // FORCE UNLOCK ELEMENTS IN ONE PAGER (Bypass global form lock)
        setTimeout(() => {
            // Include BUTTON in the selector to ensure Updated/Print works
            const inputs = container.querySelectorAll('input, select, textarea, button');
            inputs.forEach(el => {
                el.removeAttribute('readonly');
                el.removeAttribute('disabled'); // Explicit remove
                el.disabled = false;
                el.style.pointerEvents = 'auto';
                el.style.opacity = '1';

                // Only change background for inputs/selects/textareas, not buttons (keep theme color)
                if (!el.tagName.toLowerCase().includes('button') && el.type !== 'button') {
                    el.style.backgroundColor = '#fff';
                }
            });

            // Initialize dropdowns HERE so that 'disabled' property applied by it is not removed by the loop above
            initializePlanDropdowns();
        }, 800); // Increased delay slightly to be safe
    }

    // Helper: Generate Proposer HTML
    function generateProposerHTML() {
        // Try to get data from current session or localStorage
        let data = {};
        if (typeof window.getSectionData === 'function') {
            data = window.getSectionData('primary-contact') || {};
        }
        if (!data || Object.keys(data).length === 0) {
            const summary = JSON.parse(localStorage.getItem('formSummary') || '{}');
            data = summary.primaryContact || {};
        }

        // Also get health history for Disease Name
        let healthData = {};
        if (typeof window.getSectionData === 'function') {
            healthData = window.getSectionData('health-history') || {};
        }
        if (!healthData || Object.keys(healthData).length === 0) {
            const summary = JSON.parse(localStorage.getItem('formSummary') || '{}');
            healthData = summary.healthHistory || {};
        }

        // Extract fields
        const fields = [
            { label: 'Full Name', value: data.applicant_name },
            { label: 'Date of Birth', value: data['self-dob'] },
            { label: 'Email', value: data.email },
            { label: 'Phone', value: data.phone },
            { label: 'Address', value: data.address || `${data.address_line1 || ''} ${data.city || ''} ${data.state || ''} ${data.pincode || ''}`.trim() },
            { label: 'Primary Occupation', value: data.occupation },
            // { label: 'Secondary Occupation', value: data.secondary_occupation || data['secondary-occupation'] },
        ];

        // Specific fields: Planned Surgeries & Disease Name
        const surgeries = healthData['planned-surgeries'] || healthData['plannedSurgeries'] || 'None';
        fields.push({ label: 'Planned Surgeries', value: surgeries });

        const diseaseName = healthData['disease_name'] || healthData['disease-name'] || 'None';
        // Always show Disease Name as requested
        fields.push({ label: 'Disease Name', value: diseaseName });


        let html = '';
        fields.forEach(f => {
            const displayVal = (f.value === undefined || f.value === null || f.value === '') ? 'None' : f.value;

            if (displayVal !== 'Select') {
                html += `
                    <div class="info-item">
                        <label>${f.label}</label>
                        <span>${displayVal}</span>
                    </div>
                `;
            }
        });

        return html || '<p class="text-muted">No proposer details available.</p>';
    }

    // Helper: Generate Member HTML
    function generateMemberHTML() {
        // Try getSectionData first for members
        let members = [];
        if (typeof window.getSectionData === 'function') {
            const memData = window.getSectionData('members-covered');
            if (memData && memData.members) members = memData.members;
        }

        if (!members || members.length === 0) {
            members = JSON.parse(localStorage.getItem('members') || '[]');
        }

        if (!members || members.length === 0) {
            return '<p class="text-muted">No members added.</p>';
        }

        let html = '';

        members.forEach((m, idx) => {
            // Create a section for each member with same format as proposer
            html += '<div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #e2e8f0;">';
            html += `<h5 style="margin-bottom: 10px; color: #475569; font-weight: 600;">Member ${idx + 1}</h5>`;
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px;">';

            const mFields = [
                { label: 'Full Name', value: m.name },
                { label: 'Relationship', value: m.relationship },
                { label: 'Age', value: m.age },
                { label: 'Occupation', value: m.occupation },
                { label: 'Date of Birth', value: m.dob || m.date_of_birth || m['date-of-birth'] },
                { label: 'Planned Surgeries', value: m.planned_surgeries || m['planned-surgeries'] || 'None' },
                { label: 'Disease Name', value: m.disease_name || m['disease-name'] || 'None' }
            ];

            mFields.forEach(f => {
                const displayVal = (f.value === undefined || f.value === null || f.value === '') ? 'None' : f.value;

                if (displayVal !== 'Select') {
                    html += `
                        <div class="info-item">
                            <label>${f.label}</label>
                            <span>${displayVal}</span>
                        </div>
                    `;
                }
            });

            html += '</div></div>';
        });

        return html;
    }

    async function initializePlanDropdowns() {
        // 1. Populate Box 1 (Client Agreed)
        const clientAgreedSelect = document.getElementById('op-plan1-select');

        if (clientAgreedSelect) {
            clientAgreedSelect.innerHTML = '<option value="">-- Select Client Agreed Plan --</option>';

            // Find client selected plans
            const clientCheckboxes = document.querySelectorAll('input.pss-client:checked');
            let planNames = new Set();

            if (clientCheckboxes.length > 0) {
                clientCheckboxes.forEach(cb => planNames.add(cb.getAttribute('data-plan-name')));
            }

            planNames.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                clientAgreedSelect.appendChild(opt);
            });

            // Auto-select if only 1
            if (planNames.size === 1) {
                clientAgreedSelect.selectedIndex = 1;
                triggerPlanSelection(clientAgreedSelect.value);
            }

            clientAgreedSelect.addEventListener('change', function () {
                triggerPlanSelection(this.value);
            });
        }

        function triggerPlanSelection(planName) {
            if (!planName) return;

            const escapedName = CSS.escape(planName);
            const planRow = document.querySelector(`.client-plan-row[data-plan="${escapedName}"]`);

            if (planRow) {
                const premiumInput = planRow.querySelector('.client-premium-input');
                const sumInsInput = planRow.querySelector('.client-sumins-input');
                const termSelect = planRow.querySelector('.client-term-select');

                if (premiumInput) {
                    document.getElementById('op-plan1-premium').value = premiumInput.value;
                }
                if (sumInsInput) {
                    document.getElementById('op-plan1-si').value = sumInsInput.value;
                }
                if (termSelect) {
                    const selectedTerm = termSelect.value;
                    const opTermSelect = document.getElementById('op-plan1-term');
                    if (opTermSelect) {
                        for (let i = 0; i < opTermSelect.options.length; i++) {
                            if (selectedTerm.includes(opTermSelect.options[i].value)) {
                                opTermSelect.selectedIndex = i;
                                break;
                            }
                        }
                    }
                }
            }
        }

        // 2. Populate Box 2 & 3 with ONLY CLIENT AGREED PLANS (Same as Box 1)
        const box2Select = document.getElementById('op-plan2-select');
        const box3Select = document.getElementById('op-plan3-select');

        if (box2Select || box3Select) {
            // reused logic from Box 1 to get plan names
            const clientCheckboxes = document.querySelectorAll('input.pss-client:checked');
            let planNames = new Set();
            if (clientCheckboxes.length > 0) {
                clientCheckboxes.forEach(cb => planNames.add(cb.getAttribute('data-plan-name')));
            }

            const optionsHtml = ['<option value="">-- Select Plan --</option>']
                .concat(Array.from(planNames).map(p => `<option value="${p}">${p}</option>`))
                .join('');

            if (box2Select) box2Select.innerHTML = optionsHtml;
            if (box3Select) box3Select.innerHTML = optionsHtml;

            // Sync and Lock logic
            if (clientAgreedSelect) {
                const sync = () => {
                    const val = clientAgreedSelect.value;
                    if (box2Select) { box2Select.value = val; box2Select.disabled = true; }
                    if (box3Select) { box3Select.value = val; box3Select.disabled = true; }
                };
                // Initial sync
                sync();
                // Add listener to Box 1
                clientAgreedSelect.addEventListener('change', sync);
            }
        }
    }

    // Print functionality with custom filename
    window.printOnePager = function () {
        const plan1Select = document.getElementById('op-plan1-select');
        let planName = 'Plan';
        if (plan1Select && plan1Select.value) {
            // Sanitize filename safe
            planName = plan1Select.value.replace(/[^a-zA-Z0-9_\-]/g, '_');
        }

        const originalTitle = document.title;
        const uid = new URLSearchParams(window.location.search).get('uid') || 'Summary';

        document.title = `${planName}_Comparison_${uid}`;

        window.print();

        document.title = originalTitle;
    };

    window.renderOnePager = renderOnePager;

})(window);

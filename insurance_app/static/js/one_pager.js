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

            // Setup PDF Download Button
            const downloadPdfBtn = document.getElementById('btn-download-pdf');
            if (downloadPdfBtn) {
                downloadPdfBtn.onclick = function () {
                    downloadOnePagerPDF();
                };
            }

            // Initialize dropdowns HERE so that 'disabled' property applied by it is not removed by the loop above
            initializePlanDropdowns();
        }, 800); // Increased delay slightly to be safe
    }

    // Function to download PDF
    function downloadOnePagerPDF() {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            alert('PDF Generator library not loaded. Please refresh the page.');
            return;
        }

        const notesContent = document.getElementById('op-comparison-notes')?.value || 'No content to download.';
        const planName = document.getElementById('op-plan1-select')?.value || 'Plan';

        const doc = new jsPDF();

        // Header
        doc.setFontSize(16);
        doc.setTextColor(40, 40, 40);
        doc.text("Insurance Plan Recommendation", 20, 20);

        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text(`Selected Plan: ${planName}`, 20, 30);
        doc.line(20, 35, 190, 35); // Horizontal line

        // Content
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);

        // Split text to fit page width
        const splitText = doc.splitTextToSize(notesContent, 170); // 170mm width

        let cursorY = 45;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;

        splitText.forEach(line => {
            if (cursorY + 10 > pageHeight - margin) {
                doc.addPage();
                cursorY = margin;
            }
            doc.text(line, margin, cursorY);
            cursorY += 7; // Line spacing
        });

        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text(`Page ${i} of ${pageCount}`, 105, pageHeight - 10, null, null, "center");
        }

        // Save
        const fileName = `Recommendation_${planName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        doc.save(fileName);
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

            clientAgreedSelect.addEventListener('change', async function () {
                const planName = this.value;
                triggerPlanSelection(planName);

                if (planName) {
                    await fetchAIJustification(planName);
                }
            });
        }

        async function fetchAIJustification(planName) {
            const notesBox = document.getElementById('op-comparison-notes');
            if (!notesBox) return;

            notesBox.value = "Generating AI justification based on health history and plan details...";
            notesBox.style.color = "#666";

            try {
                // 1. Collect Proposer Data
                let proposerData = {};
                if (typeof window.getSectionData === 'function') {
                    proposerData = window.getSectionData('primary-contact') || {};
                }
                let healthData = {};
                if (typeof window.getSectionData === 'function') {
                    healthData = window.getSectionData('health-history') || {};
                }

                // 2. Collect Member Data
                let members = [];
                try {
                    const storedMembers = localStorage.getItem('members');
                    if (storedMembers) {
                        members = JSON.parse(storedMembers);
                    }
                } catch (e) {
                    console.error("Error parsing members from localStorage:", e);
                }

                // 3. Collect Plan Form Details
                const si = document.getElementById('op-plan1-si')?.value || 'Not specified';
                const premium = document.getElementById('op-plan1-premium')?.value || 'Not specified';
                const term = document.getElementById('op-plan1-term')?.value || 'Not specified';

                // 4. Construct Prompt Content
                let promptContent = `Primary Applicant: ${proposerData.applicant_name || proposerData['pc_fname'] || 'N/A'} ${proposerData['pc_lname'] || ''}\n`;
                promptContent += `Age: ${proposerData['self-dob'] ? getAgeFromDate(proposerData['self-dob']) : 'N/A'}\n`;

                // Parse Primary Diseases
                let diseases = [];
                if (healthData['disease']) {
                    if (Array.isArray(healthData['disease'])) {
                        diseases = healthData['disease'];
                    } else {
                        diseases = [healthData['disease']];
                    }
                }

                if (diseases.length > 0) {
                    promptContent += `Primary Diseases:\n`;
                    diseases.forEach(d => {
                        const since = healthData[`${d}_since_years`] ? `${healthData[`${d}_since_years`]} years` : (healthData[`${d}_since_year`] || 'Unknown duration');
                        const details = healthData[`${d}_details`] ? `(${healthData[`${d}_details`]})` : '';
                        promptContent += `- ${d.charAt(0).toUpperCase() + d.slice(1)} (Since: ${since}) ${details}\n`;
                    });
                } else {
                    promptContent += `Primary Disease: None\n`;
                }

                promptContent += `Planned Surgeries: ${healthData['planned-surgeries'] || 'None'}\n\n`;

                // Calculate Age Helper
                function getAgeFromDate(dobString) {
                    if (!dobString) return 'N/A';
                    const dob = new Date(dobString);
                    const diff = Date.now() - dob.getTime();
                    const ageDt = new Date(diff);
                    return Math.abs(ageDt.getUTCFullYear() - 1970);
                }

                if (members && members.length > 0) {
                    promptContent += `Family Members Covered:\n`;
                    members.forEach((m, i) => {
                        // Parse member diseases
                        // Members in localStorage usually have a 'diseases' array or property
                        let mDiseases = [];
                        if (m.diseases && Array.isArray(m.diseases)) {
                            mDiseases = m.diseases.map(d => typeof d === 'string' ? d : d.name);
                        } else if (m.diseases) {
                            // Sometimes it might be a single string or object
                            mDiseases = [typeof m.diseases === 'string' ? m.diseases : m.diseases.name];
                        } else if (m.disease) {
                            // Fallback to singular 'disease'
                            mDiseases = Array.isArray(m.disease) ? m.disease : [m.disease];
                        }

                        let diseaseStr = 'None';
                        if (mDiseases.length > 0) {
                            diseaseStr = mDiseases.join(', ');
                        }

                        promptContent += `- ${m.name} (${m.relationship}, Age: ${m.age}): Disease: ${diseaseStr}\n`;
                    });
                    promptContent += `\n`;
                }

                promptContent += `Selected Plan Details:\n`;
                promptContent += `- Plan: ${planName}\n`;
                promptContent += `- Sum Insured: ${si}\n`;
                promptContent += `- Premium: ${premium}\n`;
                promptContent += `- Term: ${term}\n`;

                // 5. API Call
                const response = await fetch('/ai/get-justification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        plan_name: planName,
                        prompt_content: promptContent
                    })
                });

                if (!response.ok) throw new Error('AI Service unavailable');

                const result = await response.json();
                if (result.justification) {
                    notesBox.value = result.justification;
                    notesBox.style.color = "#334155";
                    // Auto-adjust height if possible or trigger reflow
                } else {
                    notesBox.value = "AI could not generate a justification for this plan.";
                }

            } catch (err) {
                console.error("AI Error:", err);
                notesBox.value = "Error generating AI justification. Please fill manually.";
                notesBox.style.color = "#dc2626";
            }
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

            // Sync and Lock logic - Removed to allow independent selection for comparison
            /*
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
            */
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

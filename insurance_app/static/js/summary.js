/*
 * This script generates the content for the form summary page (Summary.html).
 * It retrieves the form data from local storage and dynamically creates the HTML to display it.
 * It is used by: Summary.html and Preview.html
 */
document.addEventListener('DOMContentLoaded', function () {
    const summaryContainer = document.getElementById('summary-container');
    const summaryData = JSON.parse(localStorage.getItem('formSummary'));

    if (!summaryData) {
        summaryContainer.innerHTML = '<p>No summary data found. Please submit the form first.</p>';
        return;
    }

    // --- Fallback to derive healthHistory from submissionData if missing/empty ---
    try {
        const hasHealthHistory =
            summaryData.healthHistory &&
            typeof summaryData.healthHistory === 'object' &&
            Object.keys(summaryData.healthHistory).length > 0;

        if (!hasHealthHistory) {
            const submissionRaw = JSON.parse(localStorage.getItem('submissionData') || '{}');
            const derived = {};

            Object.entries(submissionRaw).forEach(([key, value]) => {
                if (!value || String(value).trim() === '') return;

                if (
                    key.startsWith('medical-') || key.startsWith('medical_') ||
                    key.startsWith('disease-') || key.startsWith('disease_') ||
                    key === 'self-details' || key === 'self_details'
                ) {
                    derived[key] = value;
                }
            });

            if (Object.keys(derived).length > 0) {
                summaryData.healthHistory = derived;
            }
        }
    } catch (e) {
        console.warn('Health history fallback failed:', e);
    }

    // Fallbacks to ensure Preview shows data even before final submission
    try {
        if (!summaryData.members || !Array.isArray(summaryData.members) || summaryData.members.length === 0) {
            const storedMembers = JSON.parse(localStorage.getItem('members') || '[]');
            if (Array.isArray(storedMembers) && storedMembers.length > 0) {
                summaryData.members = storedMembers;
            }
        }
    } catch (e) { }

    try {
        if (!summaryData.commentsNoted || !Array.isArray(summaryData.commentsNoted?.comments_noted) || summaryData.commentsNoted.comments_noted.length === 0) {
            const storedComments = JSON.parse(localStorage.getItem('comments_noted') || '[]');
            if (Array.isArray(storedComments) && storedComments.length > 0) {
                summaryData.commentsNoted = { comments_noted: storedComments };
            }
        }
    } catch (e) { }

    let html = '';

    /**
     * Helper to format keys into user-facing labels
     * Merged logic: Handles special mappings (S1) + generic formatting (S2)
     */
    function formatLabel(k) {
        if (!k) return '';
        if (k === 'occupation') return 'Primary Occupation';
        if (k === 'secondary_occupation' || k === 'secondary-occupation') return 'Secondary Occupation';
        return k.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Format checkbox array values into human-readable strings
     */
    function formatArrayValue(key, arr) {
        if (!Array.isArray(arr) || arr.length === 0) return null;

        // Filter out empty values
        const filtered = arr.filter(v => v && String(v).trim() !== '');
        if (filtered.length === 0) return null;

        // Special formatting for known checkbox fields
        const checkboxValueMappings = {
            'id-proof': { 'aadhaar': 'Aadhaar Card', 'pan': 'PAN Card' },
            'id_proof': { 'aadhaar': 'Aadhaar Card', 'pan': 'PAN Card' }
        };

        const mappings = checkboxValueMappings[key];
        if (mappings) {
            return filtered.map(v => mappings[v] || v).join(', ');
        }

        // Default: capitalize each value
        return filtered.map(v => String(v).replace(/\b\w/g, l => l.toUpperCase())).join(', ');
    }

    // Function to create summary section
    // Merged: Includes S2's hospital logic + S1's upload doc logic + merged field skip logic
    function createSection(title, data) {
        if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
            return ''; // nothing to render
        }

        // Define which fields are required and should show "Not Provided" when empty (from S1)
        const requiredFields = new Set([
            'policy-type', 'sum-insured', 'annual-budget', 'annual-income', 'room-preference',
            'payment-mode', 'policy-term', 'past-claims', 'service-expectations',
            'co-pay', 'ncb-importance', 'maternity-cover', 'opd-cover', 'top-up',
            'policy-type-category', 'port-policy', 'critical-illness', 'worldwide-cover',
            'tax-benefit', 'gst-number', 'gst_number',
            'id-proof', 'id_proof', 'address_proof_details'
        ]);

        // Define which fields are conditional and should only show when they have values (from S1 & S2)
        const conditionalFields = new Set([
            'secondary_occupation', 'secondary-occupation',
            'occupationalRiskDetails', 'occupational-risk-details',
            'disease', // Disease checkbox field - only show if diseases are selected
            // Disease-related fields
            'diabetes_since_year', 'diabetes_since_years', 'diabetes_details',
            'cardiac_since_year', 'cardiac_since_years', 'cardiac_details',
            'hypertension_since_year', 'hypertension_since_years', 'hypertension_details',
            'cancer_since_year', 'cancer_since_years', 'cancer_details',
            'critical_illness_since_year', 'critical_illness_since_years', 'critical_illness_details',
            'other_since_year', 'other_since_years', 'other_details',
            // Kebab-case
            'diabetes-since-year', 'diabetes-since-years', 'diabetes-details',
            'cardiac-since-year', 'cardiac-since-years', 'cardiac-details',
            'hypertension-since-year', 'hypertension-since-years', 'hypertension-details',
            'cancer-since-year', 'cancer-since-years', 'cancer-details',
            'critical-illness-since-year', 'critical-illness-since-years', 'critical-illness-details',
            'other-since-year', 'other-since-years', 'other-details'
        ]);

        // Fields to skip entirely (internal-only) (Merged S1 & S2)
        const skipFields = new Set([
            'occupation_value', 'occupationValue',
            'secondary_occupation_value', 'secondaryOccupationValue',
            'existing-policy-document' // Skip file input itself
        ]);

        let sectionHtml = `<fieldset><legend>${title}</legend><div class="summary-grid">`;

        // Special handling for hospital network preferences (from S2)
        const hospitalArgs = [];
        const hospitalFieldsToSkip = new Set([
            'network-hospital-1st', 'network_hospital_1st',
            'network-hospital-2nd', 'network_hospital_2nd',
            'network-hospital-3rd', 'network_hospital_3rd',
            'network-hospitals', 'network_hospitals'
        ]);

        // Check if any hospital preference fields exist
        const hasHospitalFields = Object.keys(data).some(k => hospitalFieldsToSkip.has(k));

        if (hasHospitalFields) {
            const val1 = data['network-hospital-1st'] || data['network_hospital_1st'] || '';
            const val2 = data['network-hospital-2nd'] || data['network_hospital_2nd'] || '';
            const val3 = data['network-hospital-3rd'] || data['network_hospital_3rd'] || '';

            if (val1 && val1 !== '-- Select --' && val1.trim() !== '') hospitalArgs.push(`1st: ${val1}`);
            if (val2 && val2 !== '-- Select --' && val2.trim() !== '') hospitalArgs.push(`2nd: ${val2}`);
            if (val3 && val3 !== '-- Select --' && val3.trim() !== '') hospitalArgs.push(`3rd: ${val3}`);

            if (hospitalArgs.length > 0) {
                sectionHtml += `<div class="summary-item"><strong>Preferred Hospital Network:</strong> ${hospitalArgs.join(', ')}</div>`;
            } else {
                sectionHtml += `<div class="summary-item"><strong>Preferred Hospital Network:</strong> None</div>`;
            }
        }

        // Process all fields
        for (const [key, value] of Object.entries(data)) {
            // Skip hospital fields handled above
            if (hospitalFieldsToSkip.has(key)) continue;

            // Skip internal keys
            if (skipFields.has(key)) continue;

            // Skip conditional fields if they are empty
            const isValueEmpty = !value || String(value).trim() === '' || value === '-- Select --';
            if (conditionalFields.has(key) && isValueEmpty) {
                continue;
            }

            // Special handling for disease checkbox itself
            if (key === 'disease') {
                if (Array.isArray(value) && value.length === 0) continue;
                if (isValueEmpty) continue;
            }

            let displayValue = value;

            // Handle array values (checkboxes)
            if (Array.isArray(value)) {
                const formattedArray = formatArrayValue(key, value);
                if (formattedArray) {
                    displayValue = formattedArray;
                } else {
                    displayValue = 'None Selected';
                }
            } else {
                // Handle empty values
                if (isValueEmpty) {
                    if (key === 'planned-surgeries' || key === 'plannedSurgeries') {
                        displayValue = 'None';
                    } else if (requiredFields.has(key)) {
                        displayValue = 'Not Provided';
                    } else {
                        displayValue = 'None';
                    }
                }
            }

            // Format date fields (from S2)
            if (isDateField(key) && displayValue && displayValue !== 'Not Provided' && displayValue !== 'None') {
                displayValue = formatDateToDDMMYYYY(displayValue);
            }

            // --- Special Handling for Uploaded Policy Document Checkbox (from S1) ---
            let formattedKey = formatLabel(key);
            if (key === 'upload-policy-doc-checkbox' || key === 'upload_policy_doc_checkbox') {
                formattedKey = 'Uploaded Policy Document';

                // Check if actual document exists in localStorage
                let hasDocument = false;
                try {
                    // Try to find uniqueId
                    let uniqueId = '';
                    const params = new URLSearchParams(window.location.search);
                    uniqueId = params.get('unique_id') || params.get('uid');

                    if (!uniqueId) {
                        try {
                            const formSummary = JSON.parse(localStorage.getItem('formSummary') || '{}');
                            uniqueId = formSummary?.primaryContact?.['unique_id'] || formSummary?.primaryContact?.['unique-id'];
                        } catch (e) { }
                    }

                    const POLICY_DOC_STORAGE_KEY = 'existing_policy_doc_';
                    // Check logic
                    if (uniqueId) {
                        const docData = localStorage.getItem(POLICY_DOC_STORAGE_KEY + uniqueId);
                        if (docData) hasDocument = !!JSON.parse(docData).fileName;
                    }
                    if (!hasDocument) {
                        const tempDoc = localStorage.getItem(POLICY_DOC_STORAGE_KEY + 'temp_draft');
                        if (tempDoc) hasDocument = !!JSON.parse(tempDoc).fileName;
                    }
                } catch (e) {
                    // Fallback to checkbox value
                    hasDocument = (value === 'on' || value === true || (Array.isArray(value) && value[0] === 'on'));
                }
                displayValue = hasDocument ? 'Yes' : 'No';
            }

            sectionHtml += `<div class="summary-item"><strong>${formattedKey}:</strong> ${displayValue}</div>`;
        }
        sectionHtml += `</div></fieldset>`;
        return sectionHtml;
    }

    /**
     * Render Primary Contact Section
     * Merged: S2's name logic + S1's specific field ordering and height logic
     */
    function renderPrimaryContactSection(primary) {
        let sectionHtml = `<fieldset><legend>Applicant Details</legend><div class="summary-grid">`;

        if (primary && typeof primary === 'object') {
            const cmRaw = primary['self-height'] || primary['height'] || primary['self_height'];
            let heightDisplay = '';
            const heightCm = parseFloat(cmRaw);
            if (!isNaN(heightCm) && heightCm > 0) {
                const parts = cmToFeetInches(heightCm);
                if (parts) heightDisplay = `${parts.feet} ft ${parts.inches} in`;
            }

            const excludedKeys = new Set([
                'self-height', 'self_height', 'self-height-ft', 'self-height-in',
                'height_ft', 'height_in', 'occupation_value', 'occupationValue',
                'first_name', 'middle_name', 'last_name', 'pc_fname', 'pc_mname', 'pc_lname'
            ]);

            const orderedFields = [
                'unique_id', 'applicant_name', 'gender', 'occupation', 'secondary_occupation', 'self-dob',
                'self-age', '__HEIGHT__', 'self-weight', 'self-bmi', 'email', 'phone', 'aadhaar_last5', 'address', 'hubs'
            ];

            // If applicant_name is missing, try to construct it (S2 logic)
            if (!primary['applicant_name']) {
                const fname = primary['pc_fname'] || primary['first_name'] || '';
                const mname = primary['pc_mname'] || primary['middle_name'] || '';
                const lname = primary['pc_lname'] || primary['last_name'] || '';
                primary['applicant_name'] = [fname, mname, lname].filter(p => p.trim()).join(' ');
            }

            for (const field of orderedFields) {
                if (field === '__HEIGHT__') {
                    if (heightDisplay) {
                        sectionHtml += `<div class="summary-item"><strong>Height:</strong> ${heightDisplay}</div>`;
                    } else {
                        sectionHtml += `<div class="summary-item"><strong>Height:</strong> Not Provided</div>`;
                    }
                    continue;
                }

                if (excludedKeys.has(field)) continue;

                let value = primary[field];

                // Skip secondary occupation if empty
                if ((field === 'secondary_occupation' || field === 'secondary-occupation') && (!value || String(value).trim() === '')) {
                    continue;
                }

                let displayValue = value;
                const isEmpty = !value || String(value).trim() === '' || value === '-- Select --';

                if (isEmpty) {
                    const requiredPrimaryFields = new Set(['unique_id', 'applicant_name', 'gender', 'occupation', 'email', 'phone']);
                    if (requiredPrimaryFields.has(field)) {
                        displayValue = 'Not Provided';
                    } else {
                        displayValue = 'None';
                    }
                } else if (isDateField(field)) {
                    displayValue = formatDateToDDMMYYYY(displayValue);
                }

                let formattedKey = (field === 'applicant_name') ? 'Full Name' : formatLabel(field);
                sectionHtml += `<div class="summary-item"><strong>${formattedKey}:</strong> ${displayValue}</div>`;
            }
        }
        sectionHtml += `</div></fieldset>`;
        return sectionHtml;
    }

    // Primary Contact
    if (summaryData.primaryContact) {
        html += renderPrimaryContactSection(summaryData.primaryContact);
    }

    /**
     * Render Proposer's Health History
     * Kept S1's dedicated function for cleaner "grouped" display, enhanced with S2's date formatting
     */
    if (summaryData.healthHistory && Object.keys(summaryData.healthHistory || {}).length > 0) {
        html += renderProposerHealthHistory(summaryData.healthHistory);
    }

    function renderProposerHealthHistory(healthData) {
        let sectionHtml = `<fieldset><legend>Proposer's Health Details</legend><div class="summary-grid">`;

        const diseases = ['cardiac', 'diabetes', 'hypertension', 'cancer', 'critical_illness', 'other'];
        const diseaseFields = new Set();

        diseases.forEach(disease => {
            diseaseFields.add(`${disease}_since_year`);
            diseaseFields.add(`${disease}_since_years`);
            diseaseFields.add(`${disease}_details`);
            diseaseFields.add(`${disease}-since-year`);
            diseaseFields.add(`${disease}-since-years`);
            diseaseFields.add(`${disease}-details`);
            diseaseFields.add(`${disease}-children`); // Handle any other potential variants
        });

        const plannedSurgeriesKeys = new Set(['planned-surgeries', 'planned_surgeries', 'plannedSurgeries']);

        // 1. Render non-disease fields
        for (const [key, value] of Object.entries(healthData)) {
            if (diseaseFields.has(key) || key === 'disease') continue; // handled separately
            if (plannedSurgeriesKeys.has(key)) continue; // handled explicitly at the end
            if (!value || String(value).trim() === '') continue;

            let displayValue = value;
            if (isDateField(key)) displayValue = formatDateToDDMMYYYY(value);

            const formattedKey = formatLabel(key);
            sectionHtml += `<div class="summary-item"><strong>${formattedKey}:</strong> ${displayValue}</div>`;
        }

        // 2. Render disease info grouped
        diseases.forEach(disease => {
            const sinceYear = healthData[`${disease}_since_year`] || healthData[`${disease}-since-year`];
            // Prefer _since_years if available
            const sinceYears = healthData[`${disease}_since_years`] || healthData[`${disease}-since-years`];
            const details = healthData[`${disease}_details`] || healthData[`${disease}-details`];

            if (sinceYear || sinceYears || details) {
                const diseaseName = disease.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                sectionHtml += `<div class="summary-item"><strong>Disease:</strong> ${diseaseName}</div>`;

                if (sinceYear && String(sinceYear).trim() !== '') {
                    sectionHtml += `<div class="summary-item"><strong>${diseaseName} Since Year:</strong> ${sinceYear}</div>`;
                }
                if (sinceYears && String(sinceYears).trim() !== '') {
                    sectionHtml += `<div class="summary-item"><strong>${diseaseName} Since Years:</strong> ${sinceYears}</div>`;
                }
                if (details && String(details).trim() !== '') {
                    sectionHtml += `<div class="summary-item"><strong>${diseaseName} Details:</strong> ${details}</div>`;
                }
            }
        });

        // FIXED: Show "No Disease" if none found
        const hasAnyDisease = diseases.some(disease => {
            return healthData[`${disease}_since_year`] || healthData[`${disease}-since-year`] ||
                healthData[`${disease}_since_years`] || healthData[`${disease}-since-years`] ||
                healthData[`${disease}_details`] || healthData[`${disease}-details`];
        });
        if (!hasAnyDisease) {
            sectionHtml += `<div class="summary-item"><strong>Disease:</strong> No Disease</div>`;
        }

        // Explicitly handle Planned Surgeries for Proposer
        let plannedVal = healthData['planned-surgeries'] || healthData['planned_surgeries'] || healthData['plannedSurgeries'];
        if (!plannedVal || String(plannedVal).trim() === '') plannedVal = 'None';

        sectionHtml += `<div class="summary-item"><strong>Planned Surgeries:</strong> ${plannedVal}</div>`;
        sectionHtml += `</div></fieldset>`;
        return sectionHtml;
    }

    /**
     * Members Section
     * Merged: S2's name loop + S1/S2 disease logic + Height calc
     */
    if (summaryData.members && summaryData.members.length > 0) {
        html += '<fieldset><legend>Members to be Covered</legend>';
        summaryData.members.forEach(member => {
            html += '<div class="summary-member-card">';

            // Construct name (S2 logic)
            if (!member.name && (member.mem_fname || member.first_name || member.last_name)) {
                member.name = [
                    member.mem_fname || member.first_name || '',
                    member.mem_mname || member.middle_name || '',
                    member.mem_lname || member.last_name || ''
                ].filter(p => p && p.trim()).join(' ');
            }

            // Height
            let heightDisplay = '';
            const heightCm = parseFloat(member.height || member['member-height'] || member.self_height);
            if (!isNaN(heightCm) && heightCm > 0) {
                const parts = cmToFeetInches(heightCm);
                if (parts) heightDisplay = `${parts.feet} ft ${parts.inches} in`;
            }

            const memberFieldsOrder = [
                'name', 'relationship', 'occupation', 'secondary_occupation', 'gender', 'dob', 'age', '__HEIGHT__', 'weight', 'bmi',
                'smoker', 'alcohol', 'riskyHobbies', 'occupationalRisk', 'occupationalRiskDetails'
            ];
            const skipMemberFields = ['first_name', 'middle_name', 'last_name', 'mem_fname', 'mem_mname', 'mem_lname', 'height', 'self_height', 'member-height'];

            memberFieldsOrder.forEach(field => {
                if (skipMemberFields.includes(field)) return;

                if (field === '__HEIGHT__') {
                    if (heightDisplay) {
                        html += `<div class="summary-item"><strong>Height:</strong> ${heightDisplay}</div>`;
                    } else {
                        html += `<div class="summary-item"><strong>Height:</strong> Not Provided</div>`;
                    }
                    return;
                }

                let fieldValue = member[field];

                // Conditional fields for members (S1 logic)
                const conditionalMemberFields = new Set(['secondary_occupation', 'secondary-occupation', 'occupationalRiskDetails', 'occupational-risk-details']);
                if (conditionalMemberFields.has(field) && (!fieldValue || String(fieldValue).trim() === '')) {
                    return;
                }

                const isEmpty = !fieldValue || String(fieldValue).trim() === '' || fieldValue === '-- Select --';
                let displayValue = fieldValue;

                if (isEmpty) {
                    const requiredMemberFields = new Set(['name', 'relationship', 'gender', 'dob', 'age']);
                    if (requiredMemberFields.has(field)) {
                        displayValue = 'Not Provided';
                    } else {
                        displayValue = 'None';
                    }
                } else if (isDateField(field)) {
                    displayValue = formatDateToDDMMYYYY(displayValue);
                }

                const formattedKey = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                html += `<div class="summary-item"><strong>${formattedKey}:</strong> ${displayValue}</div>`;
            });

            // Disease Display for Members
            // Check both S1's healthHistory object approach and S2's flat field approach
            const diseasesList = ['cardiac', 'diabetes', 'hypertension', 'cancer', 'critical_illness', 'other'];

            diseasesList.forEach(disease => {
                // Check flat strings
                const sinceYear = member[`${disease}_since_year`];
                const sinceYears = member[`${disease}_since_years`];
                const details = member[`${disease}_details`];
                // Check in nested object
                const hhDetails = (member.healthHistory && member.healthHistory[disease]);

                if (sinceYear || sinceYears || details || hhDetails) {
                    const diseaseName = disease.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    html += `<div class="summary-item"><strong>Disease:</strong> ${diseaseName}</div>`;

                    if (sinceYear && String(sinceYear).trim() !== '') {
                        html += `<div class="summary-item"><strong>${diseaseName} Since Year:</strong> ${sinceYear}</div>`;
                    }
                    if (sinceYears && String(sinceYears).trim() !== '') {
                        html += `<div class="summary-item"><strong>${diseaseName} Since Years:</strong> ${sinceYears}</div>`;
                    }

                    const finalDetails = details || hhDetails;
                    if (finalDetails && String(finalDetails).trim() !== '') {
                        html += `<div class="summary-item"><strong>${diseaseName} Details:</strong> ${finalDetails}</div>`;
                    }
                }
            });

            // FIXED: Show "No Disease" for members if none found
            const hasAnyMemberDisease = diseasesList.some(disease => {
                return member[`${disease}_since_year`] || member[`${disease}_since_years`] || member[`${disease}_details`] ||
                    (member.healthHistory && member.healthHistory[disease]);
            });
            if (!hasAnyMemberDisease) {
                html += `<div class="summary-item"><strong>Disease:</strong> No Disease</div>`;
            }

            // Planned Surgeries
            let planned = member.plannedSurgeries || member['planned-surgeries'] || member['planned_surgeries'];
            if (!planned || String(planned).trim() === '') {
                planned = 'None';
            }
            html += `<div class="summary-item"><strong>Planned Surgeries:</strong> ${planned}</div>`;
            html += '</div>';
        });
        html += '</fieldset>';
    }

    // Cover & Cost
    if (summaryData.coverAndCost) html += createSection('Cover & Cost Preferences', summaryData.coverAndCost);
    // Existing Coverage
    if (summaryData.existingCoverage) html += createSection('Existing Coverage & Portability', summaryData.existingCoverage);
    // Claims & Service
    if (summaryData.claimsAndService) html += createSection('Claims & Service History', summaryData.claimsAndService);
    // Finance & Doc
    if (summaryData.financeAndDocumentation) html += createSection('Finance & Documentation', summaryData.financeAndDocumentation);

    summaryContainer.innerHTML = html;
    renderNotesSectionIfAvailable();

    // Notes logic (kept same)
    async function renderNotesSectionIfAvailable() {
        let commentsArray = null;
        if (summaryData.commentsNoted && Array.isArray(summaryData.commentsNoted?.comments_noted) && summaryData.commentsNoted.comments_noted.length > 0) {
            commentsArray = summaryData.commentsNoted.comments_noted;
        }
        if (!commentsArray || commentsArray.length === 0) {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                let uid = urlParams.get('unique_id');
                if (!uid && summaryData && summaryData.primaryContact) {
                    uid = summaryData.primaryContact['unique_id'] || summaryData.primaryContact['Unique Id'];
                }
                if (uid) {
                    const resp = await fetch(`/submission/${encodeURIComponent(uid)}/comments`);
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data && Array.isArray(data.comments)) {
                            commentsArray = data.comments;
                        }
                    }
                }
            } catch (e) { }
        }

        if (commentsArray && commentsArray.length > 0) {
            let cHtml = '<fieldset><legend>Notes</legend>';
            cHtml += '<table class="comments-table"><thead><tr><th>Date/Time</th><th>Author</th><th>Note</th></tr></thead><tbody>';
            commentsArray.forEach(c => {
                const ts = formatTimestampSummary(c.created_at || c.timestamp);
                const author = escapeHtmlSummary(c.author || c.user || 'User');
                const text = escapeHtmlSummary(c.text || c.comment || '');
                cHtml += `<tr><td>${ts}</td><td>${author}</td><td>${text}</td></tr>`;
            });
            cHtml += '</tbody></table></fieldset>';
            summaryContainer.insertAdjacentHTML('beforeend', cHtml);
        }

        const proposedBtn = document.getElementById('proposed-plans-btn');
        if (proposedBtn) {
            let uniqueId = null;
            if (summaryData.primaryContact) uniqueId = summaryData.primaryContact['unique_id'] || summaryData.primaryContact['Unique Id'];
            if (uniqueId) {
                const targetUrl = `Proposed_Plans.html?unique_id=${encodeURIComponent(uniqueId)}`;
                fetch(targetUrl, { method: 'GET' }).then(resp => {
                    if (resp && resp.ok) {
                        proposedBtn.style.display = 'inline-block';
                        proposedBtn.disabled = false;
                        proposedBtn.onclick = () => { window.location.href = targetUrl; };
                    }
                }).catch(() => { });
            }
        }

        const backBtn = document.getElementById('back-btn');
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn) {
            nextBtn.disabled = true;
            let uniqueId = null;
            if (summaryData.primaryContact) uniqueId = summaryData.primaryContact['unique_id'] || summaryData.primaryContact['Unique Id'];
            if (uniqueId) {
                const targetUrl = `Proposed_Plans.html?unique_id=${encodeURIComponent(uniqueId)}`;
                fetch(targetUrl, { method: 'GET' }).then(resp => {
                    if (resp && resp.ok) {
                        nextBtn.disabled = false;
                        nextBtn.onclick = () => { window.location.href = targetUrl; };
                    } else { nextBtn.disabled = true; }
                }).catch(() => { nextBtn.disabled = true; });
            } else { nextBtn.disabled = true; }
        }
        if (backBtn) {
            backBtn.style.display = 'inline-block';
            backBtn.onclick = () => {
                try { sessionStorage.setItem('returningFromSummary', '1'); } catch (e) { }
                const summary = JSON.parse(localStorage.getItem('formSummary'));
                let uniqueId = null;
                if (summary && summary.primaryContact) uniqueId = summary.primaryContact['unique_id'] || summary.primaryContact['Unique Id'];
                if (uniqueId) {
                    window.location.href = `Existing_User_Request_Page.html?unique_id=${encodeURIComponent(uniqueId)}`;
                } else {
                    window.location.href = 'Existing_User_Request_Page.html';
                }
            };
        }
    }
});

// Helpers
function escapeHtmlSummary(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
}

function formatDateToDDMMYYYY(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return dateStr || '';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr.trim())) return dateStr.trim();
    try {
        let date;
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
            const parts = dateStr.split('T')[0].split('-');
            date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        } else {
            date = new Date(dateStr);
        }
        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
    } catch (e) { }
    return dateStr;
}

function isDateField(key) {
    const dateFieldPatterns = [
        'dob', 'self-dob', 'self_dob',
        'policy-since-date', 'policy_since_date',
        'start_date', 'start-date',
        'date_of_birth', 'date-of-birth',
        'birth_date', 'birth-date'
    ];
    const keyLower = key.toLowerCase();
    return dateFieldPatterns.some(pattern => keyLower.includes(pattern) || keyLower === pattern);
}

function cmToFeetInches(cm) {
    const n = parseFloat(cm);
    if (!n || n <= 0) return null;
    const totalInches = n / 2.54;
    let feet = Math.floor(totalInches / 12);
    let inches = Math.round(totalInches - feet * 12);
    if (inches === 12) { feet += 1; inches = 0; }
    return { feet, inches };
}

function formatTimestampSummary(ts) {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
            return d.toLocaleString('en-IN', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
            });
        }
    } catch { }
    return escapeHtmlSummary(ts);
}
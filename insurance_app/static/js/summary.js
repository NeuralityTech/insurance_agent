/*
 * This script generates the content for the form summary page (Summary.html).
 * It retrieves the form data from local storage and dynamically creates the HTML to display it.
 * It is used by: Summary.html and Preview.html
 * 
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
     * Simple label formatter - converts field keys to readable labels
     * Uses basic formatting: replaces underscores/hyphens with spaces, capitalizes words
     */
    function formatLabel(k) {
        if (!k) return '';
        return k.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Format checkbox array values into human-readable strings
     * e.g., ['aadhaar', 'pan'] -> "Aadhaar Card, PAN Card"
     */
    function formatArrayValue(key, arr) {
        if (!Array.isArray(arr) || arr.length === 0) return null;

        // Filter out empty values
        const filtered = arr.filter(v => v && String(v).trim() !== '');
        if (filtered.length === 0) return null;

        // Special formatting for known checkbox fields
        const checkboxValueMappings = {
            'id-proof': {
                'aadhaar': 'Aadhaar Card',
                'pan': 'PAN Card'
            },
            'id_proof': {
                'aadhaar': 'Aadhaar Card',
                'pan': 'PAN Card'
            }
        };

        const mappings = checkboxValueMappings[key];
        if (mappings) {
            return filtered.map(v => mappings[v] || v).join(', ');
        }

        // Default: capitalize each value
        return filtered.map(v => String(v).replace(/\b\w/g, l => l.toUpperCase())).join(', ');
    }

    /**
     * Creates an HTML fieldset section for a given part of the summary data.
     * @param {string} title - The title of the section.
     * @param {object} data - The data object for the section.
     * @returns {string} The HTML string for the section.
     */
    function createSection(title, data) {
        if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
            return ''; // nothing to render
        }

        // Define which fields are required and should show "Not Provided" when empty
        const requiredFields = new Set([
            'policy-type', 'sum-insured', 'annual-budget', 'annual-income', 'room-preference',
            'payment-mode', 'policy-term', 'past-claims', 'service-expectations',
            'co-pay', 'ncb-importance', 'maternity-cover', 'opd-cover', 'top-up',
            'policy-type-category', 'port-policy', 'critical-illness', 'worldwide-cover',
            'tax-benefit', 'gst-number',
            'id-proof', 'address_proof_details'
        ]);

        // Define which fields are conditional and should only show when they have values
        const conditionalFields = new Set([
            'secondary_occupation', 'secondary-occupation',
            'occupationalRiskDetails', 'occupational-risk-details',
            'disease', // Disease checkbox field - only show if diseases are selected
            // Disease-related fields - only show when they have values
            'diabetes_since_year', 'diabetes_since_years', 'diabetes_details',
            'cardiac_since_year', 'cardiac_since_years', 'cardiac_details',
            'hypertension_since_year', 'hypertension_since_years', 'hypertension_details',
            'cancer_since_year', 'cancer_since_years', 'cancer_details',
            'critical_illness_since_year', 'critical_illness_since_years', 'critical_illness_details',
            'other_since_year', 'other_since_years', 'other_details',
            // Also handle kebab-case versions
            'diabetes-since-year', 'diabetes-since-years', 'diabetes-details',
            'cardiac-since-year', 'cardiac-since-years', 'cardiac-details',
            'hypertension-since-year', 'hypertension-since-years', 'hypertension-details',
            'cancer-since-year', 'cancer-since-years', 'cancer-details',
            'critical-illness-since-year', 'critical-illness-since-years', 'critical-illness-details',
            'other-since-year', 'other-since-years', 'other-details'
        ]);

        let sectionHtml = `<fieldset><legend>${title}</legend><div class="summary-grid">`;

        // Special handling for hospital network preferences - combine into one display
        const hospitalPrefs = [];
        const hospitalFieldsToSkip = new Set([
            'network-hospital-1st', 'network_hospital_1st',
            'network-hospital-2nd', 'network_hospital_2nd',
            'network-hospital-3rd', 'network_hospital_3rd',
            'network-hospitals', 'network_hospitals'
        ]);

        // Check if any hospital preference fields exist in the data
        const hasHospitalFields = Object.keys(data).some(k => hospitalFieldsToSkip.has(k));

        if (hasHospitalFields) {
            const val1 = data['network-hospital-1st'] || data['network_hospital_1st'] || '';
            const val2 = data['network-hospital-2nd'] || data['network_hospital_2nd'] || '';
            const val3 = data['network-hospital-3rd'] || data['network_hospital_3rd'] || '';

            if (val1 && val1 !== '-- Select --' && val1.trim() !== '') hospitalPrefs.push(`1st: ${val1}`);
            if (val2 && val2 !== '-- Select --' && val2.trim() !== '') hospitalPrefs.push(`2nd: ${val2}`);
            if (val3 && val3 !== '-- Select --' && val3.trim() !== '') hospitalPrefs.push(`3rd: ${val3}`);

            // Always show the field - either with selections or "Not Selected"
            if (hospitalPrefs.length > 0) {
                sectionHtml += `<div class="summary-item"><strong>Preferred Hospital Network:</strong> ${hospitalPrefs.join(', ')}</div>`;
            } else {
                sectionHtml += `<div class="summary-item"><strong>Preferred Hospital Network:</strong> Not Selected</div>`;
            }
        }

        // --- Special handling for disease/health history fields ---
        // First, identify which diseases are selected (checked)
        const selectedDiseases = new Set();
        const diseaseCheckboxPatterns = /^(medical[-_]|disease[-_])?(.+)$/;

        for (const [key, value] of Object.entries(data)) {
            // Check if this is a disease checkbox field
            if (key.startsWith('medical-') || key.startsWith('medical_') ||
                key.startsWith('disease-') || key.startsWith('disease_') ||
                key === 'disease') {
                // Check if it's selected (truthy, "on", or array with values)
                const isSelected = value &&
                    (value === 'on' || value === true || value === 'true' ||
                        (Array.isArray(value) && value.length > 0) ||
                        (typeof value === 'string' && value.trim() !== ''));

                if (isSelected) {
                    // Extract disease name from key like "medical-diabetes" -> "diabetes"
                    let diseaseName = key
                        .replace(/^medical[-_]/, '')
                        .replace(/^disease[-_]/, '');
                    selectedDiseases.add(diseaseName.toLowerCase());

                    // Also handle if value contains the disease name (for checkbox arrays)
                    if (Array.isArray(value)) {
                        value.forEach(v => selectedDiseases.add(String(v).toLowerCase()));
                    } else if (typeof value === 'string' && value !== 'on' && value !== 'true') {
                        selectedDiseases.add(value.toLowerCase());
                    }
                }
            }
        }

        // Helper to check if a field is a disease-related detail field
        function isDiseaseDetailField(key) {
            return key.endsWith('_details') || key.endsWith('-details') ||
                key.endsWith('_since_year') || key.endsWith('-since-year') ||
                key.endsWith('_since_years') || key.endsWith('-since-years') ||
                key.endsWith('_start_date') || key.endsWith('-start-date');
        }

        // Helper to extract disease name from detail field
        function getDiseaseNameFromDetailField(key) {
            return key
                .replace(/_details$/, '').replace(/-details$/, '')
                .replace(/_since_year$/, '').replace(/-since-year$/, '')
                .replace(/_since_years$/, '').replace(/-since-years$/, '')
                .replace(/_start_date$/, '').replace(/-start-date$/, '')
                .toLowerCase();
        }

        for (const [key, value] of Object.entries(data)) {
            // Skip internal-only keys that should not be shown
            if (key === 'occupation_value' || key === 'occupationValue' ||
                key === 'secondary_occupation_value' || key === 'secondaryOccupationValue') continue;

            // Special handling for disease field - skip if it's an empty array or has no meaningful values
            if (key === 'disease') {
                if (Array.isArray(value) && value.length === 0) {
                    continue; // Skip empty disease array
                }
                if (!value || String(value).trim() === '') {
                    continue; // Skip empty disease field
                }
            }

            // Skip conditional fields if they're empty
            if (conditionalFields.has(key) && (!value || String(value).trim() === '')) {
                continue;
            }

            // Skip existing-policy-document field (file upload) - we don't want it in preview
            if (key === 'existing-policy-document') {
                continue;
            }

            // Skip hospital fields (already handled above)
            if (hospitalFieldsToSkip.has(key)) continue;

            // Skip internal-only keys
            if (skipFields.has(key)) continue;

            // Skip disease checkbox fields themselves (e.g., "medical-diabetes", "disease-hypertension")
            // We only want to show the details/duration for selected diseases
            if (key.startsWith('medical-') || key.startsWith('medical_') ||
                key.startsWith('disease-') || key.startsWith('disease_') ||
                key === 'disease') {
                continue;
            }

            // For disease detail fields, only show if the corresponding disease is selected
            if (isDiseaseDetailField(key)) {
                const diseaseName = getDiseaseNameFromDetailField(key);
                if (!selectedDiseases.has(diseaseName)) {
                    continue; // Skip - disease not selected
                }
            }

            let displayValue = value;

            // Handle empty values
            if (!value || String(value).trim() === '') {
                if (key === 'planned-surgeries' || key === 'plannedSurgeries') {
                    displayValue = 'None';
                } else if (requiredFields.has(key)) {
                    displayValue = 'Not Provided';
                } else {
                    displayValue = 'None';
                }
            }

            // Special handling for upload-policy-doc-checkbox
            let formattedKey = formatLabel(key);
            if (key === 'upload-policy-doc-checkbox' || key === 'upload_policy_doc_checkbox') {
                formattedKey = 'Uploaded Policy Document';

                // Check if actual document exists in localStorage
                let hasDocument = false;
                try {
                    // Get unique ID from URL or sessionStorage (not from section data)
                    let uniqueId = '';
                    try {
                        const params = new URLSearchParams(window.location.search);
                        uniqueId = params.get('unique_id') || params.get('uid') || '';
                    } catch (e) { }

                    if (!uniqueId) {
                        try {
                            uniqueId = sessionStorage.getItem('current_unique_id') || '';
                        } catch (e) { }
                    }

                    // Also try to get from formSummary in localStorage
                    if (!uniqueId) {
                        try {
                            const formSummary = JSON.parse(localStorage.getItem('formSummary') || '{}');
                            uniqueId = formSummary?.primaryContact?.['unique_id'] ||
                                formSummary?.primaryContact?.['unique-id'] || '';
                        } catch (e) { }
                    }

                    const POLICY_DOC_STORAGE_KEY = 'existing_policy_doc_';

                    // Check with unique ID
                    if (uniqueId) {
                        const storageKey = POLICY_DOC_STORAGE_KEY + uniqueId;
                        const docData = localStorage.getItem(storageKey);
                        if (docData) {
                            const parsed = JSON.parse(docData);
                            hasDocument = !!(parsed && parsed.fileName);
                        }
                    }

                    // Also check temp_draft key as fallback
                    if (!hasDocument) {
                        const tempDocData = localStorage.getItem(POLICY_DOC_STORAGE_KEY + 'temp_draft');
                        if (tempDocData) {
                            const parsed = JSON.parse(tempDocData);
                            hasDocument = !!(parsed && parsed.fileName);
                        }
                    }
                } catch (e) {
                    console.error('[Summary] Error checking document:', e);
                    // If error, fall back to checkbox value
                    if (Array.isArray(displayValue)) {
                        hasDocument = displayValue.length > 0 && displayValue[0] === 'on';
                    } else {
                        hasDocument = (displayValue === 'on' || displayValue === true || displayValue === 'true');
                    }
                }

                displayValue = hasDocument ? 'Yes' : 'No';
            }

            // Use formatLabel for nicer labels (handles Primary/Secondary occupation mapping)
            sectionHtml += `<div class="summary-item"><strong>${formattedKey}:</strong> ${displayValue}</div>`;
        }
        sectionHtml += `</div></fieldset>`;
        return sectionHtml;
    }

    function renderPrimaryContactSection(primary) {
        let sectionHtml = `<fieldset><legend>Applicant Details</legend><div class="summary-grid">`;

        if (primary && typeof primary === 'object') {

            const cmRaw = primary['self-height'] || primary['height'] || primary['self_height'];
            let heightDisplay = '';
            const heightCm = parseFloat(cmRaw);

            if (!isNaN(heightCm) && heightCm > 0) {
                const parts = cmToFeetInches(heightCm);
                if (parts) {
                    heightDisplay = `${parts.feet} ft ${parts.inches} in`;
                }
            }

            // Hide these internal-only keys
            const excludedKeys = new Set([
                'self-height', 'self_height', 'self-height-ft', 'self-height-in',
                'self_height_ft', 'self_height_in', 'height_ft', 'height_in',
                'occupation_value', 'occupationValue', 'secondary_occupation_value', 'secondaryOccupationValue',
                // Exclude individual name components from display (we'll show Full Name instead)
                'first_name', 'middle_name', 'last_name'
            ]);

            // Preferred order with height before weight
            // Note: We use 'applicant_name' for display (Full Name), not individual name components
            const orderedFields = [
                'unique_id', 'applicant_name', 'gender', 'occupation', 'secondary_occupation', 'self-dob',
                'self-age',
                '__HEIGHT__',
                'self-weight', 'self-bmi', 'email', 'phone', 'aadhaar_last5', 'address', 'hubs'
            ];

            // If applicant_name is not present but individual name fields are, construct it
            if (!primary['applicant_name'] && (primary['first_name'] || primary['last_name'])) {
                const nameParts = [
                    primary['first_name'] || '',
                    primary['middle_name'] || '',
                    primary['last_name'] || ''
                ].filter(p => p.trim());
                primary['applicant_name'] = nameParts.join(' ');
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

                const value = primary[field];

                // Skip secondary occupation if it's empty (conditional field)
                if ((field === 'secondary_occupation' || field === 'secondary-occupation') && (!value || String(value).trim() === '')) {
                    continue;
                }

                if (excludedKeys.has(field)) continue;

                let value = primary[field];

                // Check if value is empty or a placeholder
                const isEmptyOrPlaceholder = !value ||
                    String(value).trim() === '' ||
                    value === '-- Select --' ||
                    value === 'Select';

                if (isEmptyOrPlaceholder) {
                    value = 'Not Provided';
                }

                // Format date fields to dd/mm/yyyy (e.g., self-dob)
                if (isDateField(field) && value && value !== 'Not Provided') {
                    value = formatDateToDDMMYYYY(value);
                }

                // Use "Full Name" as the label for applicant_name
                let formattedKey;
                if (field === 'applicant_name') {
                    formattedKey = 'Full Name';
                } else {
                    formattedKey = formatLabel(field);
                }

                // Show "Not Provided" for required empty fields, "None" for optional
                const requiredPrimaryFields = new Set(['unique_id', 'applicant_name', 'gender', 'occupation', 'email', 'phone']);
                let displayValue = value;

                if (!value || String(value).trim() === '') {
                    if (requiredPrimaryFields.has(field)) {
                        displayValue = 'Not Provided';
                    } else {
                        displayValue = 'None';
                    }
                }

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

    // Self Health Details (Proposer) - Custom rendering for disease fields
    if (summaryData.healthHistory && Object.keys(summaryData.healthHistory || {}).length > 0) {
        html += renderProposerHealthHistory(summaryData.healthHistory);
    }

    // Helper function to render proposer's health history with proper disease display
    function renderProposerHealthHistory(healthData) {
        let sectionHtml = `<fieldset><legend>Proposer's Health Details</legend><div class="summary-grid">`;

        const diseases = ['cardiac', 'diabetes', 'hypertension', 'cancer', 'critical_illness', 'other'];
        const diseaseFields = new Set();

        // Collect all disease-related field names
        diseases.forEach(disease => {
            diseaseFields.add(`${disease}_since_year`);
            diseaseFields.add(`${disease}_since_years`);
            diseaseFields.add(`${disease}_details`);
            diseaseFields.add(`${disease}-since-year`);
            diseaseFields.add(`${disease}-since-years`);
            diseaseFields.add(`${disease}-details`);
        });

        // First, render non-disease fields
        for (const [key, value] of Object.entries(healthData)) {
            // Skip disease-specific fields - we'll handle them separately
            if (diseaseFields.has(key) || key === 'disease') {
                continue;
            }

            if (!value || String(value).trim() === '') {
                continue;
            }

            const formattedKey = formatLabel(key);
            sectionHtml += `<div class="summary-item"><strong>${formattedKey}:</strong> ${value}</div>`;
        }

        // Now render disease information grouped by disease
        diseases.forEach(disease => {
            const sinceYear = healthData[`${disease}_since_year`] || healthData[`${disease}-since-year`];
            const sinceYears = healthData[`${disease}_since_years`] || healthData[`${disease}-since-years`];
            const details = healthData[`${disease}_details`] || healthData[`${disease}-details`];

            // Only show disease if it has at least one field filled
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

        sectionHtml += `</div></fieldset>`;
        return sectionHtml;
    }

    // Members
    if (summaryData.members && summaryData.members.length > 0) {
        html += '<fieldset><legend>Members to be Covered</legend>';
        summaryData.members.forEach(member => {
            html += '<div class="summary-member-card">';

            // Construct member name from parts if not present
            // PATCH: Check for both old format (first_name) and new format (mem_fname)
            if (!member.name && (member.mem_fname || member.mem_lname || member.first_name || member.last_name)) {
                member.name = [
                    member.mem_fname || member.first_name || '',
                    member.mem_mname || member.middle_name || '',
                    member.mem_lname || member.last_name || ''
                ].filter(p => p && p.trim()).join(' ');
            }

            // Compute a combined Height display from stored cm, if available
            let heightDisplay = '';
            const heightCm = parseFloat(member.height || member['member-height'] || member.self_height);
            if (!isNaN(heightCm) && heightCm > 0 && typeof cmToFeetInches === 'function') {
                const parts = cmToFeetInches(heightCm);
                if (parts && (parts.feet || parts.inches === 0)) {
                    heightDisplay = `${parts.feet} ft ${parts.inches} in`;
                }
            }
            // Ordered display of member fields (excluding plannedSurgeries and raw height)
            // Note: first_name, middle_name, last_name are combined into 'name' above
            const memberFieldsOrder = [
                'name', 'relationship', 'occupation', 'secondary_occupation', 'gender', 'dob', 'age', '__HEIGHT__', 'weight', 'bmi',
                'smoker', 'alcohol', 'riskyHobbies', 'occupationalRisk', 'occupationalRiskDetails'
            ];

            // Fields to skip (they're handled separately or combined)
            // PATCH: Added new field names (mem_fname, mem_mname, mem_lname)
            const skipFields = ['first_name', 'middle_name', 'last_name', 'mem_fname', 'mem_mname', 'mem_lname', 'height', 'self_height', 'member-height'];

            memberFieldsOrder.forEach(field => {
                // Skip if this field should be excluded
                if (skipFields.includes(field)) return;
                if (field === '__HEIGHT__') {
                    if (heightDisplay) {
                        html += `<div class="summary-item"><strong>Height:</strong> ${heightDisplay}</div>`;
                    } else {
                        html += `<div class="summary-item"><strong>Height:</strong> Not Provided</div>`;
                    }
                    return;
                }

                let fieldValue = member[field];

                // Check if value is empty or a placeholder
                const isEmptyOrPlaceholder = !fieldValue ||
                    String(fieldValue).trim() === '' ||
                    fieldValue === '-- Select --' ||
                    fieldValue === 'Select' ||
                    fieldValue === 'Select Gender' ||
                    fieldValue === 'Select Relationship';

                if (isEmptyOrPlaceholder) {
                    fieldValue = 'Not Provided';
                }

                // Format date fields to dd/mm/yyyy (e.g., member dob)
                if (isDateField(field) && fieldValue && fieldValue !== 'Not Provided') {
                    fieldValue = formatDateToDDMMYYYY(fieldValue);
                }

                const formattedKey = field
                    .replace(/_/g, ' ')
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/\b\w/g, l => l.toUpperCase());

<<<<<<< HEAD
                let displayValue = fieldValue;
                if (!fieldValue || String(fieldValue).trim() === '') {
                    if (requiredMemberFields.has(field)) {
                        displayValue = 'Not Provided';
                    } else {
                        displayValue = 'None';
=======
                html += `<div class="summary-item"><strong>${formattedKey}:</strong> ${fieldValue}</div>`;
            });

            // Disease details for member - check both healthHistory and direct fields
            const diseases = ['cardiac', 'diabetes', 'hypertension', 'cancer', 'critical_illness', 'other'];
            const displayedDiseases = [];

            diseases.forEach(disease => {
                // Check if this disease has any data
                const sinceYear = member[`${disease}_since_year`];
                const sinceYears = member[`${disease}_since_years`];
                const details = member[`${disease}_details`];

                // Also check healthHistory object
                const healthHistoryDetails = member.healthHistory && member.healthHistory[disease];

                // Only show disease if it has at least one field filled
                if (sinceYear || sinceYears || details || healthHistoryDetails) {
                    // Display disease name
                    const diseaseName = disease.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    html += `<div class="summary-item"><strong>Disease:</strong> ${diseaseName}</div>`;

                    // Display Since Year if available
                    if (sinceYear && String(sinceYear).trim() !== '') {
                        html += `<div class="summary-item"><strong>${diseaseName} Since Year:</strong> ${sinceYear}</div>`;
                    }

                    // Display Since Years if available
                    if (sinceYears && String(sinceYears).trim() !== '') {
                        html += `<div class="summary-item"><strong>${diseaseName} Since Years:</strong> ${sinceYears}</div>`;
                    }

                    // Display Details if available
                    const detailsValue = details || healthHistoryDetails;
                    if (detailsValue && String(detailsValue).trim() !== '') {
                        html += `<div class="summary-item"><strong>${diseaseName} Details:</strong> ${detailsValue}</div>`;
                    }

                    displayedDiseases.push(disease);
                }
            });
            // Planned Surgeries for member (always after disease details)
            let planned = member.plannedSurgeries;
            if (!planned || planned.toString().trim() === '') {
                planned = 'None';
            }
            html += `<div class="summary-item"><strong>Planned Surgeries:</strong> ${planned}</div>`;
            html += '</div>';
        });
        html += '</fieldset>';
    }

    // Cover & Cost Preferences
    if (summaryData.coverAndCost) {
            html += createSection('Cover & Cost Preferences', summaryData.coverAndCost);
        }

        // Existing Coverage
        if (summaryData.existingCoverage) {
            html += createSection('Existing Coverage & Portability', summaryData.existingCoverage);
        }

        // Claims & Service
        if (summaryData.claimsAndService) {
            html += createSection('Claims & Service History', summaryData.claimsAndService);
        }

        // Finance & Documentation
        if (summaryData.financeAndDocumentation) {
            html += createSection('Finance & Documentation', summaryData.financeAndDocumentation);
        }

        summaryContainer.innerHTML = html;
        // Ensure notes are rendered even if not present in local cache
        renderNotesSectionIfAvailable();

        // Notes table (with fallback fetch by unique_id if missing)
        async function renderNotesSectionIfAvailable() {
            let commentsArray = null;
            if (summaryData.commentsNoted && Array.isArray(summaryData.commentsNoted?.comments_noted) && summaryData.commentsNoted.comments_noted.length > 0) {
                commentsArray = summaryData.commentsNoted.comments_noted;
            }
            // If not available, try localStorage mirror (already attempted above), then fetch from server using unique_id
            if (!commentsArray || commentsArray.length === 0) {
                try {
                    // Derive unique_id from URL or summary
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
                } catch (e) {
                    // Non-fatal if fetch fails; simply skip rendering
                }
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

            // Wire up Back and Next buttons for Preview/Summary navigation
            const proposedBtn = document.getElementById('proposed-plans-btn');

            if (proposedBtn) {
                let uniqueId = null;

                if (summaryData.primaryContact) {
                    uniqueId = summaryData.primaryContact['unique_id'] || summaryData.primaryContact['Unique Id'];
                }

                if (uniqueId) {
                    const targetUrl = `Proposed_Plans.html?unique_id=${encodeURIComponent(uniqueId)}`;

                    fetch(targetUrl, { method: 'GET' })
                        .then(resp => {
                            if (resp && resp.ok) {
                                proposedBtn.style.display = 'inline-block';
                                proposedBtn.disabled = false;
                                proposedBtn.onclick = () => { window.location.href = targetUrl; };
                            }
                        })
                        .catch(() => { });
                }
            }

            const backBtn = document.getElementById('back-btn');
            const nextBtn = document.getElementById('next-btn');
            if (nextBtn) {
                nextBtn.disabled = true;
                // For Preview.html, Next goes to Proposed_Plans.html with same unique_id (if available)
                let uniqueId = null;
                if (summaryData.primaryContact) {
                    uniqueId = summaryData.primaryContact['unique_id'] || summaryData.primaryContact['Unique Id'];
                }
                // Only enable Next if target page responds OK
                if (uniqueId) {
                    const targetUrl = `Proposed_Plans.html?unique_id=${encodeURIComponent(uniqueId)}`;
                    fetch(targetUrl, { method: 'GET' })
                        .then(resp => {
                            if (resp && resp.ok) {
                                nextBtn.disabled = false;
                                nextBtn.onclick = () => { window.location.href = targetUrl; };
                            } else {
                                nextBtn.disabled = true;
                            }
                        })
                        .catch(() => { nextBtn.disabled = true; });
                } else {
                    nextBtn.disabled = true;
                }
            }
            if (backBtn) {
                backBtn.style.display = 'inline-block';
                backBtn.onclick = () => {
                    try { sessionStorage.setItem('returningFromSummary', '1'); } catch (e) { }
                    // Compute unique_id as used elsewhere
                    const summary = JSON.parse(localStorage.getItem('formSummary'));
                    let uniqueId = null;
                    if (summary && summary.primaryContact) {
                        uniqueId = summary.primaryContact['unique_id'] || summary.primaryContact['Unique Id'];
                    }
                    if (uniqueId) {
                        window.location.href = `Existing_User_Request_Page.html?unique_id=${encodeURIComponent(uniqueId)}`;
                    } else {
                        window.location.href = 'Existing_User_Request_Page.html';
                    }
                };
            }
        }
    });

// Helper functions for Notes in summary
function escapeHtmlSummary(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
}

/**
 * Formats a date string to dd/mm/yyyy format (India standard)
 * Handles various input formats: yyyy-mm-dd, ISO strings, etc.
 * @param {string} dateStr - The date string to format
 * @returns {string} - Formatted date string in dd/mm/yyyy format, or original if invalid
 */
function formatDateToDDMMYYYY(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return dateStr || '';

    // If already in dd/mm/yyyy format, return as-is
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr.trim())) {
        return dateStr.trim();
    }

    try {
        let date;

        // Handle yyyy-mm-dd format (common from HTML date inputs)
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
            const parts = dateStr.split('T')[0].split('-');
            date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        } else {
            // Try parsing as a general date
            date = new Date(dateStr);
        }

        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
    } catch (e) {
        console.warn('Date parsing failed for:', dateStr);
    }

    // Return original if parsing fails
    return dateStr;
}

/**
 * Checks if a field key represents a date field that should be formatted
 * @param {string} key - The field key/name
 * @returns {boolean} - True if the field is a date field
 */
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
    if (!n || n <= 0) {
        return null;
    }
    const totalInches = n / 2.54;
    let feet = Math.floor(totalInches / 12);
    let inches = Math.round(totalInches - feet * 12);
    if (inches === 12) {
        feet += 1;
        inches = 0;
    }
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

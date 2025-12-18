/*
 * This script handles the Preview tab functionality in the insurance form.
 * It generates a live preview of the form data as the user fills it out.
 * Used by: New_Applicant_Request_Form.html, Existing_Applicant_Request_Form.html (Preview tab)
 */

/**
 * Initialize the Preview tab functionality
 */
function initializePreviewTab() {
    // Initial render when tab is loaded
    updatePreviewContent();

    // Listen for tab switches to refresh preview
    document.addEventListener('click', function(e) {
        if (e.target.matches('.tab-button') && e.target.textContent.trim() === 'Preview') {
            // Small delay to ensure DOM is ready
            setTimeout(updatePreviewContent, 50);
        }
    });

    // Set up observers for form changes
    setupFormChangeListeners();
}

/**
 * Set up listeners for form changes to trigger preview updates
 */
function setupFormChangeListeners() {
    // Listen for changes on form inputs
    const form = document.getElementById('insurance-form');
    if (form) {
        form.addEventListener('change', debounce(updatePreviewContent, 300));
        form.addEventListener('input', debounce(updatePreviewContent, 500));
    }

    // Listen for member list changes
    window.addEventListener('storage', function(e) {
        if (e.key === 'members' || e.key === 'comments_noted') {
            updatePreviewContent();
        }
    });

    // Also listen for custom member update events
    document.addEventListener('membersUpdated', updatePreviewContent);
    document.addEventListener('commentsUpdated', updatePreviewContent);
}

/**
 * Debounce helper to prevent too frequent updates
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Main function to update the preview content
 */
function updatePreviewContent() {
    const container = document.getElementById('preview-tab-content');
    if (!container) return;

    // Gather current form data
    const summaryData = gatherFormData();

    // Generate HTML - always show all sections
    const html = generatePreviewHTML(summaryData);

    // Update container
    container.innerHTML = html;
}

/**
 * Gather form data from all sections
 */
function gatherFormData() {
    const getSectionData = window.getSectionData || function(sectionId) {
        const container = document.getElementById(`${sectionId}-content`);
        if (!container) return {};
        const data = {};
        container.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.name) {
                if (el.type === 'radio') {
                    if (el.checked) data[el.name] = el.value;
                } else if (el.type === 'checkbox') {
                    if (!data[el.name]) data[el.name] = [];
                    if (el.checked) data[el.name].push(el.value);
                } else {
                    data[el.name] = el.value;
                }
            }
        });
        return data;
    };

    return {
        primaryContact: getSectionData('primary-contact') || {},
        healthHistory: getSectionData('health-history') || {},
        members: JSON.parse(localStorage.getItem('members')) || [],
        coverAndCost: getSectionData('cover-cost') || {},
        existingCoverage: getSectionData('existing-coverage') || {},
        claimsAndService: getSectionData('claims-service') || {},
        financeAndDocumentation: getSectionData('finance-documentation') || {},
        commentsNoted: window.getCommentsData ? window.getCommentsData() : { comments_noted: JSON.parse(localStorage.getItem('comments_noted') || '[]') }
    };
}

/**
 * Generate the preview HTML from form data - always shows all sections
 */
function generatePreviewHTML(summaryData) {
    let html = '';

    // Primary Contact - always show
    html += renderPrimaryContactSection(summaryData.primaryContact || {});

    // Health History - always show
    html += renderHealthHistorySection(summaryData.healthHistory || {});

    // Members - always show (even if empty)
    html += renderMembersSection(summaryData.members || []);

    // Cover & Cost - always show
    html += createSection('Cover & Cost Preferences', summaryData.coverAndCost || {}, COVER_COST_FIELDS);

    // Existing Coverage - always show
    html += createSection('Existing Coverage & Portability', summaryData.existingCoverage || {}, EXISTING_COVERAGE_FIELDS);

    // Claims & Service - always show
    html += createSection('Claims & Service History', summaryData.claimsAndService || {}, CLAIMS_SERVICE_FIELDS);

    // Finance & Documentation - always show
    html += createSection('Finance & Documentation', summaryData.financeAndDocumentation || {}, FINANCE_DOC_FIELDS);

    // Notes - always show
    const comments = summaryData.commentsNoted?.comments_noted || [];
    html += renderNotesSection(comments);

    return html;
}

// ============ Field Definitions ============

const PRIMARY_CONTACT_ORDERED_FIELDS = [
    'unique_id', 'applicant_name', 'gender', 'occupation', 'secondary_occupation', 'self-dob',
    'self-age', '__HEIGHT__', 'self-weight', 'self-bmi', 'email', 'phone', 'aadhaar_last5', 'address', 'hubs'
];

const PRIMARY_CONTACT_REQUIRED = new Set(['unique_id', 'applicant_name', 'gender', 'occupation', 'email', 'phone']);

const PRIMARY_CONTACT_EXCLUDED = new Set([
    'self-height', 'self_height', 'self-height-ft', 'self-height-in',
    'height_ft', 'height_in', 'occupation_value', 'occupationValue',
    'first_name', 'middle_name', 'last_name', 'pc_fname', 'pc_mname', 'pc_lname'
]);

const COVER_COST_FIELDS = [
    { key: 'policy-type', label: 'Policy Type', required: true },
    { key: 'sum-insured', label: 'Sum Insured', required: true },
    { key: 'annual-budget', label: 'Annual Budget', required: true },
    { key: 'annual-income', label: 'Annual Income', required: true },
    { key: 'room-preference', label: 'Room Preference', required: true },
    { key: 'payment-mode', label: 'Payment Mode', required: true },
    { key: 'policy-term', label: 'Policy Term', required: true },
    { key: 'co-pay', label: 'Co Pay', required: true },
    { key: 'ncb-importance', label: 'NCB Importance', required: true },
    { key: 'maternity-cover', label: 'Maternity Cover', required: true },
    { key: 'opd-cover', label: 'OPD Cover', required: true },
    { key: 'top-up', label: 'Top Up', required: true }
];

const EXISTING_COVERAGE_FIELDS = [
    { key: 'existing-policies', label: 'Existing Policies', required: true },
    { key: 'policy-type-category', label: 'Policy Type Category', required: true },
    { key: 'insurer-name', label: 'Insurer Name', required: false },
    { key: 'existing-policy-number', label: 'Existing Policy Number', required: false },
    { key: 'existing-sum-insured', label: 'Existing Sum Insured', required: false },
    { key: 'policy-since-date', label: 'Policy Since Date', required: false },
    { key: 'port-policy', label: 'Port Policy', required: true },
    { key: 'critical-illness', label: 'Critical Illness', required: true },
    { key: 'worldwide-cover', label: 'Worldwide Cover', required: true }
];

const CLAIMS_SERVICE_FIELDS = [
    { key: 'past-claims', label: 'Past Claims', required: true },
    { key: 'claim-issues', label: 'Claim Issues', required: true },
    { key: 'service-expectations', label: 'Service Expectations', required: true },
    { key: 'network-hospital-1st', label: 'Network Hospital 1st Preference', required: false },
    { key: 'network-hospital-2nd', label: 'Network Hospital 2nd Preference', required: false },
    { key: 'network-hospital-3rd', label: 'Network Hospital 3rd Preference', required: false }
];

const FINANCE_DOC_FIELDS = [
    { key: 'tax-benefit', label: 'Tax Benefit', required: true },
    { key: 'gst-number', label: 'GST Number', required: false },
    { key: 'id-proof', label: 'ID Proof', required: true },
    { key: 'address_proof_details', label: 'Address Proof Details', required: true }
];

const CONDITIONAL_FIELDS = new Set([
    'secondary_occupation', 'secondary-occupation',
    'occupationalRiskDetails', 'occupational-risk-details',
    'disease'
]);

const SKIP_FIELDS = new Set([
    'occupation_value', 'occupationValue',
    'secondary_occupation_value', 'secondaryOccupationValue',
    'existing-policy-document'
]);

// ============ Helper Functions ============

function formatLabel(k) {
    if (!k) return '';
    if (k === 'occupation') return 'Primary Occupation';
    if (k === 'secondary_occupation' || k === 'secondary-occupation') return 'Secondary Occupation';
    if (k === 'applicant_name') return 'Full Name';
    return k.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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

function isDateField(key) {
    const dateFieldPatterns = ['dob', 'self-dob', 'self_dob', 'policy-since-date', 'policy_since_date', 'start_date', 'start-date'];
    const keyLower = key.toLowerCase();
    return dateFieldPatterns.some(pattern => keyLower.includes(pattern) || keyLower === pattern);
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

function escapeHtmlPreview(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
}

function isValueEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' || trimmed === '-- Select --' || trimmed === 'Select';
    }
    if (Array.isArray(value)) {
        return value.length === 0 || value.every(v => !v || String(v).trim() === '');
    }
    return false;
}

function getDisplayValue(value, isRequired) {
    if (isValueEmpty(value)) {
        return isRequired ? 'Not Provided' : 'None';
    }
    if (Array.isArray(value)) {
        const filtered = value.filter(v => v && String(v).trim() !== '');
        if (filtered.length === 0) return 'None Selected';
        return filtered.map(v => String(v).replace(/\b\w/g, l => l.toUpperCase())).join(', ');
    }
    return value;
}

// ============ Section Renderers ============

function renderPrimaryContactSection(primary) {
    let sectionHtml = `<fieldset><legend>Applicant Details</legend><div class="summary-grid">`;

    // Calculate height display
    const cmRaw = primary['self-height'] || primary['height'] || primary['self_height'];
    let heightDisplay = '';
    const heightCm = parseFloat(cmRaw);
    if (!isNaN(heightCm) && heightCm > 0) {
        const parts = cmToFeetInches(heightCm);
        if (parts) heightDisplay = `${parts.feet} ft ${parts.inches} in`;
    }

    // Construct full name if missing
    if (!primary['applicant_name']) {
        const fname = primary['pc_fname'] || primary['first_name'] || '';
        const mname = primary['pc_mname'] || primary['middle_name'] || '';
        const lname = primary['pc_lname'] || primary['last_name'] || '';
        const fullName = [fname, mname, lname].filter(p => p && p.trim()).join(' ');
        if (fullName) primary['applicant_name'] = fullName;
    }

    for (const field of PRIMARY_CONTACT_ORDERED_FIELDS) {
        if (field === '__HEIGHT__') {
            const heightVal = heightDisplay || 'Not Provided';
            sectionHtml += `<div class="summary-item"><strong>Height:</strong> ${heightVal}</div>`;
            continue;
        }

        if (PRIMARY_CONTACT_EXCLUDED.has(field)) continue;

        // Skip secondary occupation only if empty (conditional field)
        if ((field === 'secondary_occupation' || field === 'secondary-occupation')) {
            const val = primary[field] || primary['secondary_occupation'] || primary['secondary-occupation'];
            if (isValueEmpty(val)) continue;
        }

        const value = primary[field];
        const isRequired = PRIMARY_CONTACT_REQUIRED.has(field);
        let displayValue = getDisplayValue(value, isRequired);

        if (!isValueEmpty(value) && isDateField(field)) {
            displayValue = formatDateToDDMMYYYY(displayValue);
        }

        const formattedKey = (field === 'applicant_name') ? 'Full Name' : formatLabel(field);
        sectionHtml += `<div class="summary-item"><strong>${formattedKey}:</strong> ${escapeHtmlPreview(displayValue)}</div>`;
    }

    sectionHtml += `</div></fieldset>`;
    return sectionHtml;
}

function renderHealthHistorySection(healthData) {
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
    });

    const plannedSurgeriesKeys = new Set(['planned-surgeries', 'planned_surgeries', 'plannedSurgeries']);

    // Render non-disease fields first
    for (const [key, value] of Object.entries(healthData)) {
        if (diseaseFields.has(key) || key === 'disease') continue;
        if (plannedSurgeriesKeys.has(key)) continue;
        if (SKIP_FIELDS.has(key)) continue;
        if (isValueEmpty(value)) continue;

        let displayValue = value;
        if (isDateField(key)) displayValue = formatDateToDDMMYYYY(value);

        const formattedKey = formatLabel(key);
        sectionHtml += `<div class="summary-item"><strong>${formattedKey}:</strong> ${escapeHtmlPreview(displayValue)}</div>`;
    }

    // Render disease info grouped
    let hasAnyDisease = false;
    diseases.forEach(disease => {
        const sinceYear = healthData[`${disease}_since_year`] || healthData[`${disease}-since-year`];
        const sinceYears = healthData[`${disease}_since_years`] || healthData[`${disease}-since-years`];
        const details = healthData[`${disease}_details`] || healthData[`${disease}-details`];

        if (sinceYear || sinceYears || details) {
            hasAnyDisease = true;
            const diseaseName = disease.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            sectionHtml += `<div class="summary-item"><strong>Disease:</strong> ${diseaseName}</div>`;

            if (sinceYear && String(sinceYear).trim() !== '') {
                sectionHtml += `<div class="summary-item"><strong>${diseaseName} Since Year:</strong> ${sinceYear}</div>`;
            }
            if (sinceYears && String(sinceYears).trim() !== '') {
                sectionHtml += `<div class="summary-item"><strong>${diseaseName} Since Years:</strong> ${sinceYears}</div>`;
            }
            if (details && String(details).trim() !== '') {
                sectionHtml += `<div class="summary-item"><strong>${diseaseName} Details:</strong> ${escapeHtmlPreview(details)}</div>`;
            }
        }
    });

    // Show "No Disease" if none found
    if (!hasAnyDisease) {
        sectionHtml += `<div class="summary-item"><strong>Disease:</strong> No Disease</div>`;
    }

    // Planned Surgeries - always show
    let plannedVal = healthData['planned-surgeries'] || healthData['planned_surgeries'] || healthData['plannedSurgeries'];
    if (isValueEmpty(plannedVal)) plannedVal = 'None';
    sectionHtml += `<div class="summary-item"><strong>Planned Surgeries:</strong> ${escapeHtmlPreview(plannedVal)}</div>`;

    sectionHtml += `</div></fieldset>`;
    return sectionHtml;
}

function renderMembersSection(members) {
    let html = '<fieldset><legend>Members to be Covered</legend>';

    if (!members || members.length === 0) {
        html += '<div class="summary-grid"><div class="summary-item"><em>No additional members added yet.</em></div></div>';
        html += '</fieldset>';
        return html;
    }

    members.forEach((member, index) => {
        html += '<div class="summary-member-card">';

        // Construct name if missing
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
        const requiredMemberFields = new Set(['name', 'relationship', 'gender', 'dob', 'age']);
        const conditionalMemberFields = new Set(['secondary_occupation', 'secondary-occupation', 'occupationalRiskDetails', 'occupational-risk-details']);

        memberFieldsOrder.forEach(field => {
            if (skipMemberFields.includes(field)) return;

            if (field === '__HEIGHT__') {
                const heightVal = heightDisplay || 'Not Provided';
                html += `<div class="summary-item"><strong>Height:</strong> ${heightVal}</div>`;
                return;
            }

            // Skip conditional fields if empty
            if (conditionalMemberFields.has(field)) {
                const val = member[field];
                if (isValueEmpty(val)) return;
            }

            const fieldValue = member[field];
            const isRequired = requiredMemberFields.has(field);
            let displayValue = getDisplayValue(fieldValue, isRequired);

            if (!isValueEmpty(fieldValue) && isDateField(field)) {
                displayValue = formatDateToDDMMYYYY(displayValue);
            }

            const formattedKey = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            html += `<div class="summary-item"><strong>${formattedKey}:</strong> ${escapeHtmlPreview(displayValue)}</div>`;
        });

        // Disease info for members
        const diseasesList = ['cardiac', 'diabetes', 'hypertension', 'cancer', 'critical_illness', 'other'];
        let hasAnyMemberDisease = false;

        diseasesList.forEach(disease => {
            const sinceYear = member[`${disease}_since_year`];
            const sinceYears = member[`${disease}_since_years`];
            const details = member[`${disease}_details`];
            const hhDetails = (member.healthHistory && member.healthHistory[disease]);

            if (sinceYear || sinceYears || details || hhDetails) {
                hasAnyMemberDisease = true;
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
                    html += `<div class="summary-item"><strong>${diseaseName} Details:</strong> ${escapeHtmlPreview(finalDetails)}</div>`;
                }
            }
        });

        // Show "No Disease" if none found
        if (!hasAnyMemberDisease) {
            html += `<div class="summary-item"><strong>Disease:</strong> No Disease</div>`;
        }

        // Planned Surgeries - always show
        let planned = member.plannedSurgeries || member['planned-surgeries'] || member['planned_surgeries'];
        if (isValueEmpty(planned)) planned = 'None';
        html += `<div class="summary-item"><strong>Planned Surgeries:</strong> ${escapeHtmlPreview(planned)}</div>`;

        html += '</div>';
    });

    html += '</fieldset>';
    return html;
}

/**
 * Create a generic section with predefined fields - always shows all fields
 */
function createSection(title, data, fieldDefinitions) {
    let sectionHtml = `<fieldset><legend>${title}</legend><div class="summary-grid">`;

    for (const fieldDef of fieldDefinitions) {
        const key = fieldDef.key;
        const label = fieldDef.label;
        const isRequired = fieldDef.required;

        // Try both kebab-case and snake_case versions
        let value = data[key];
        if (isValueEmpty(value)) {
            const altKey = key.replace(/-/g, '_');
            value = data[altKey];
        }
        if (isValueEmpty(value)) {
            const altKey = key.replace(/_/g, '-');
            value = data[altKey];
        }

        let displayValue = getDisplayValue(value, isRequired);

        // Format date fields
        if (!isValueEmpty(value) && isDateField(key)) {
            displayValue = formatDateToDDMMYYYY(displayValue);
        }

        sectionHtml += `<div class="summary-item"><strong>${label}:</strong> ${escapeHtmlPreview(displayValue)}</div>`;
    }

    sectionHtml += `</div></fieldset>`;
    return sectionHtml;
}

/**
 * Render Notes section - always shows even if empty
 */
function renderNotesSection(comments) {
    let html = '<fieldset><legend>Notes</legend><div style="padding: 1rem 1.25rem;">';

    if (!comments || comments.length === 0) {
        html += '<p style="color: #666; font-style: italic;">No notes have been added yet.</p>';
    } else {
        html += '<table class="comments-table"><thead><tr><th>Date/Time</th><th>Author</th><th>Note</th></tr></thead><tbody>';

        comments.forEach(c => {
            const ts = formatTimestamp(c.created_at || c.timestamp);
            const author = escapeHtmlPreview(c.author || c.user || 'User');
            const text = escapeHtmlPreview(c.text || c.comment || '');
            html += `<tr><td>${ts}</td><td>${author}</td><td>${text}</td></tr>`;
        });

        html += '</tbody></table>';
    }

    html += '</div></fieldset>';
    return html;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(ts) {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
            return d.toLocaleString('en-IN', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: true
            });
        }
    } catch { }
    return escapeHtmlPreview(ts);
}

// Make the init function globally available
window.initializePreviewTab = initializePreviewTab;
window.updatePreviewContent = updatePreviewContent;

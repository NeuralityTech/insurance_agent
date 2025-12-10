/*
 * This script generates the content for the form summary page (Summary.html).
 * It retrieves the form data from local storage and dynamically creates the HTML to display it.
 * It is used by: Summary.html and Preview.html
 * 
 */
document.addEventListener('DOMContentLoaded', function() {
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
    } catch (e) {}

    try {
        if (!summaryData.commentsNoted || !Array.isArray(summaryData.commentsNoted?.comments_noted) || summaryData.commentsNoted.comments_noted.length === 0) {
            const storedComments = JSON.parse(localStorage.getItem('comments_noted') || '[]');
            if (Array.isArray(storedComments) && storedComments.length > 0) {
                summaryData.commentsNoted = { comments_noted: storedComments };
            }
        }
    } catch (e) {}

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

        // Define fields that should show "None" or similar when empty
        const showWhenEmpty = {
            'planned-surgeries': 'None',
            'plannedSurgeries': 'None',
            'gst-number': 'Not Provided',
            'gst_number': 'Not Provided',
            'past-claims': 'None',
            'claim-issues': 'None',
            'service-expectations': 'None',
            'policy-term': 'Not Selected',
            'policy_term': 'Not Selected',
            'id-proof': 'None Selected',
            'id_proof': 'None Selected'
        };
        
        // Fields to skip entirely (internal-only)
        const skipFields = new Set([
            'occupation_value', 'occupationValue', 
            'secondary_occupation_value', 'secondaryOccupationValue'
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
            
            // Handle array values (from checkbox groups like id-proof)
            if (Array.isArray(value)) {
                const formattedArray = formatArrayValue(key, value);
                if (formattedArray) {
                    displayValue = formattedArray;
                } else {
                    // Empty array - show default
                    displayValue = showWhenEmpty[key] || 'None Selected';
                }
            } else {
                // Handle empty fields - check for various empty/placeholder values
                const isEmptyOrPlaceholder = !value || 
                    String(value).trim() === '' || 
                    value === '-- Select --' || 
                    value === 'Select' ||
                    value === 'Select Year';
                
                if (isEmptyOrPlaceholder) {
                    // Always show with "Not Provided" or specific default
                    displayValue = showWhenEmpty[key] || 'Not Provided';
                }
            }
            
            // Format date fields to dd/mm/yyyy
            if (isDateField(key) && displayValue && displayValue !== 'None' && displayValue !== 'Not Provided' && displayValue !== 'None Selected') {
                displayValue = formatDateToDDMMYYYY(displayValue);
            }
            
            // Use simple formatLabel (no verbose mappings)
            const formattedKey = formatLabel(key);
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

                sectionHtml += `<div class="summary-item"><strong>${formattedKey}:</strong> ${value}</div>`;
            }
        }

        sectionHtml += `</div></fieldset>`;
        return sectionHtml;
    }


    // Primary Contact
    if (summaryData.primaryContact) {
        html += renderPrimaryContactSection(summaryData.primaryContact);
    }

    // Self Health Details (Proposer)
    if (summaryData.healthHistory && Object.keys(summaryData.healthHistory || {}).length > 0) {
        html += createSection('Proposer\'s Health Details', summaryData.healthHistory);
    }

    // Members
    if (summaryData.members && summaryData.members.length > 0) {
        html += '<fieldset><legend>Members to be Covered</legend>';
        summaryData.members.forEach(member => {
            html += '<div class="summary-member-card">';
            
            // Construct member name from parts if not present
            if (!member.name && (member.first_name || member.last_name)) {
                member.name = [
                    member.first_name || '',
                    member.middle_name || '',
                    member.last_name || ''
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
            const skipFields = ['first_name', 'middle_name', 'last_name', 'height', 'self_height', 'member-height'];
            
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

                html += `<div class="summary-item"><strong>${formattedKey}:</strong> ${fieldValue}</div>`;
            });
            // Disease details for member
            if (member.healthHistory && typeof member.healthHistory === 'object') {
                Object.entries(member.healthHistory).forEach(([disease, detail]) => {
                    if (!disease || !detail) return;
                    
                    // Display disease details
                    const formattedDiseaseName = disease.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    html += `<div class="summary-item"><strong>${formattedDiseaseName} Details:</strong> ${detail}</div>`;
                    
                    // Display disease duration - check for since_year (specific year) or since_years (number of years)
                    const sinceYearKey = `${disease}_since_year`;
                    const sinceYearsKey = `${disease}_since_years`;
                    
                    if (member[sinceYearKey] && member[sinceYearKey] !== 'Select Year' && member[sinceYearKey] !== '') {
                        html += `<div class="summary-item"><strong>${formattedDiseaseName} Since Year:</strong> ${member[sinceYearKey]}</div>`;
                    } else if (member[sinceYearsKey] && member[sinceYearsKey] !== '' && member[sinceYearsKey] !== '0') {
                        html += `<div class="summary-item"><strong>${formattedDiseaseName} Duration:</strong> ${member[sinceYearsKey]} years</div>`;
                    }
                });
            }
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
                    .catch(() => {});
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
                try { sessionStorage.setItem('returningFromSummary', '1'); } catch (e) {}
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
    } catch {}
    return escapeHtmlSummary(ts);
}

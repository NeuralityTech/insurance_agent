/*
 * This file handles the user interface logic for the Health History section.
 * It is used by: New_Applicant_Request_Form.html, Existing_Applicant_Request_Form.html, member_details.html
 * The main function is called from script.js when the Health History section is loaded.
 * 
 * FIXED: validatePrimaryDiseaseDates now properly scoped to primary applicant only
 */ 

/**
 * Initializes the event listeners for disease checkboxes.
 * Behavior:
 *  - Checked: show details container, enable date input and textarea, make date required
 *  - Unchecked: hide details, clear values, disable fields, remove required
 */
function initializeDiseaseDetails(root) {
    const container = root || document.getElementById('disease-list')
        || document.getElementById('health-history-content')
        || document.getElementById('health-history-content');
    if (!container) return;

    // Get todays date in YYYY-MM-DD format for max attribute
    const today = new Date().toISOString().split('T')[0];

    function setEntryState(entry, checked) {
        const details = entry.querySelector('.disease-details-container');
        const dateInput = details && details.querySelector('.disease-date-input');
        const textarea = details && details.querySelector('textarea');
        const errorSpan = dateInput && document.getElementById(dateInput.id + '-error');

        if (!details || !dateInput || !textarea) return;

        // Set max date to today
        dateInput.setAttribute('max', today);

        // If textarea already has data, ensure checkbox is checked
        const txtRaw = textarea.value != null ? textarea.value.toString() : '';
        const dateRaw = dateInput.value != null ? dateInput.value.toString() : '';

        // Treat pure commas / whitespace as "no real data"
        const hasMeaningfulText = txtRaw.replace(/,/g, '').trim() !== '';
        const hasDateValue = dateRaw.trim() !== '';

        if (!checked && (hasMeaningfulText || hasDateValue)) {
            const cb = entry.querySelector('input[type="checkbox"][name="disease"]') ||
                    entry.querySelector('input[type="checkbox"]');
            if (cb) {
                cb.checked = true;
                checked = true;
            }
        }


        if (checked) {
            // Show and enable fields
            details.style.display = 'flex';
            dateInput.disabled = false;
            dateInput.required = true;
            textarea.disabled = false;
            
            // Add validation listener for date
            if (!dateInput.dataset.listenerAdded) {
                dateInput.addEventListener('change', function() {
                    validateDateField(dateInput, errorSpan);
                });
                dateInput.addEventListener('blur', function() {
                    validateDateField(dateInput, errorSpan);
                });
                dateInput.dataset.listenerAdded = 'true';
            }
            
            // Validate immediately if there's a value
            if (dateInput.value) {
                validateDateField(dateInput, errorSpan);
            }
        } else {
            // Hide and disable fields
            details.style.display = 'none';
            dateInput.value = '';
            dateInput.disabled = true;
            dateInput.required = false;
            textarea.value = '';
            textarea.disabled = true;
            textarea.required = false;
            
            // Clear error states
            if (dateInput.classList) dateInput.classList.remove('input-error');
            if (textarea.classList) textarea.classList.remove('error', 'is-invalid');
            if (errorSpan) {
                errorSpan.textContent = '';
                errorSpan.style.display = 'none';
            }
        }
    }

    function validateDateField(dateInput, errorSpan) {
        if (!dateInput || !errorSpan) return true;

        let isValid = true;
        let message = '';

        if (!dateInput.disabled && dateInput.required) {
            if (!dateInput.value || dateInput.value.trim() === '') {
                isValid = false;
                message = 'Disease start date is required';
            } else {
                const selectedDate = new Date(dateInput.value);
                const todayDate = new Date(today);
                
                if (selectedDate > todayDate) {
                    isValid = false;
                    message = 'Disease start date cannot be in the future';
                }
            }
        }

        errorSpan.textContent = message;
        errorSpan.style.display = isValid ? 'none' : 'block';
        dateInput.classList.toggle('input-error', !isValid);

        return isValid;
    }

    // Initialize all disease entries
    container.querySelectorAll('.disease-entry').forEach(entry => {
        const checkbox = entry.querySelector('input[type="checkbox"][name="disease"]')
            || entry.querySelector('input[type="checkbox"]');
        if (!checkbox) return;
        
        // Initialize state 
        setEntryState(entry, checkbox.checked);
        
        // Listen for changes
        checkbox.addEventListener('change', () => setEntryState(entry, checkbox.checked));
    });
}

// Auto-init when DOM is ready on pages that include this script directly
document.addEventListener('DOMContentLoaded', () => {
    initializeDiseaseDetails();
    if (typeof initializeOccupationalRisk === 'function') initializeOccupationalRisk();
});

// Expose for manual re-init 
window.initializeDiseaseDetails = initializeDiseaseDetails;

function initializeOccupationalRisk(root) {
    const container = root || document;
    const yes = container.querySelector('input[type="radio"][name="occupational-risk"][value="yes"]');
    const no = container.querySelector('input[type="radio"][name="occupational-risk"][value="no"]');
    const detailsGroup = container.getElementById ? container.getElementById('occupational-risk-details-group') : document.getElementById('occupational-risk-details-group');
    if (!detailsGroup || (!yes && !no)) return;

    function render() {
        const show = yes && yes.checked;
        detailsGroup.style.display = show ? 'block' : 'none';
        const ta = detailsGroup.querySelector('textarea');
        if (ta) ta.disabled = !show;
        if (!show && ta) ta.value = ta.value; // keep value but disabled
    }

    if (yes) yes.addEventListener('change', render);
    if (no) no.addEventListener('change', render);
    // Initial state
    render();
}

// ============================================================================
// FIXED: VALIDATE PRIMARY APPLICANT DISEASE DATES
// Now properly scoped to only validate diseases in health-history-content section
// This prevents validation from incorrectly including member disease entries
// ============================================================================
window.validatePrimaryDiseaseDates = function () {
    let isValid = true;

    // FIXED: Only validate disease entries in the primary applicant's health history section
    const healthHistoryContent = document.getElementById('health-history-content');
    if (!healthHistoryContent) {
        // If section not found, assume valid (might be on a different page)
        return true;
    }

    // Query only disease entries within health-history-content
    healthHistoryContent.querySelectorAll('.disease-entry').forEach(entry => {
        const checkbox = entry.querySelector('input[type="checkbox"]');
        const dateInput = entry.querySelector('.disease-date-input');
        const errorSpan = entry.querySelector('.error-message');

        if (checkbox && checkbox.checked) {
            // If selected but date missing
            if (!dateInput || !dateInput.value) {
                isValid = false;
                if (errorSpan) errorSpan.textContent = "Please enter a start date.";
                if (dateInput) dateInput.classList.add('input-error');
            } else {
                // Also validate date is not in the future
                const selectedDate = new Date(dateInput.value);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                if (selectedDate > today) {
                    isValid = false;
                    if (errorSpan) errorSpan.textContent = "Date cannot be in the future.";
                    dateInput.classList.add('input-error');
                } else {
                    if (errorSpan) errorSpan.textContent = "";
                    dateInput.classList.remove('input-error');
                }
            }
        } else {
            // disease unselected — clear errors
            if (errorSpan) errorSpan.textContent = "";
            if (dateInput) dateInput.classList.remove('input-error');
        }
    });

    return isValid;
};


window.initializeOccupationalRisk = initializeOccupationalRisk;

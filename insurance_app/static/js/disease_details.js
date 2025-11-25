/*
 * This file handles the user interface logic for the Health History section.
 * It is used by: Health_Insurance_Requirement_Form.html
 * The main function is called from script.js when the Health History section is loaded.
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

    // Get today's date in YYYY-MM-DD format for max attribute
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
        if (!checked && ((textarea.value && textarea.value.toString().trim() !== '') || 
                         (dateInput.value && dateInput.value.toString().trim() !== ''))) {
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

    /* Add global validation for form submission
    const form = document.getElementById('insurance-form');
    if (form && !form.dataset.diseaseValidationAdded) {
        form.addEventListener('submit', (e) => {
            let hasErrors = false;
            
            // Check all disease entries in the entire document (not just container)
            document.querySelectorAll('.disease-entry').forEach(entry => {
                const checkbox = entry.querySelector('input[type="checkbox"][name="disease"]');
                if (checkbox && checkbox.checked) {
                    const dateInput = entry.querySelector('.disease-date-input');
                    const errorSpan = dateInput && entry.querySelector('.error-message');
                    
                    if (dateInput && !validateDateField(dateInput, errorSpan)) {
                        hasErrors = true;
                    }
                }
            });
            
            if (hasErrors) {
                e.preventDefault();
                e.stopPropagation();
                alert('Please provide valid start dates for all selected diseases before continuing.');
                // Scroll to first error
                const firstError = document.querySelector('.input-error');
                if (firstError) {
                    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    firstError.focus();
                }
                return false;
            }
        });
        form.dataset.diseaseValidationAdded = 'true';
    }
    */
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

// VALIDATE PRIMARY APPLICANT DISEASE DATES
window.validatePrimaryDiseaseDates = function () {
    let isValid = true;

    // Every disease checkbox container
    document.querySelectorAll('.disease-entry').forEach(entry => {
        const checkbox = entry.querySelector('input[type="checkbox"]');
        const dateInput = entry.querySelector('.disease-date-input');
        const errorSpan = entry.querySelector('.error-message');

        if (checkbox && checkbox.checked) {
            // If selected but date missing
            if (!dateInput.value) {
                isValid = false;
                if (errorSpan) errorSpan.textContent = "Please enter a start date.";
                dateInput.classList.add('input-error');
            } else {
                if (errorSpan) errorSpan.textContent = "";
                dateInput.classList.remove('input-error');
            }
        } else {
            // disease unselected — clear errors
            if (errorSpan) errorSpan.textContent = "";
            dateInput.classList.remove('input-error');
        }
    });

    return isValid;
};


window.initializeOccupationalRisk = initializeOccupationalRisk;
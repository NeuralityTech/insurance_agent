/*
 * This file handles the user interface logic for the Health History section.
 * It is used by: Health_Insurance_Requirement_Form.html
 * The main function is called from script.js when the Health History section is loaded.
 */ 

/**
 * Initializes the event listeners for disease checkboxes.
 * Behavior:
 *  - Checked: show details container and enable textarea
 *  - Unchecked: hide details, clear textarea value, disable it
 */
function initializeDiseaseDetails(root) {
    const container = root || document.getElementById('disease-list')
        || document.getElementById('Health-History-placeholder')
        || document.getElementById('health-history-placeholder');
    if (!container) return;

    function setEntryState(entry, checked) {
        const details = entry.querySelector('.disease-details-container');
        const textarea = details && details.querySelector('textarea');
        if (!details || !textarea) return;

        if (checked) {
            details.style.display = 'flex';
            textarea.disabled = false;
        } else {
            details.style.display = 'none';
            textarea.value = '';
            textarea.disabled = true;
            textarea.required = false;
            if (textarea.classList) textarea.classList.remove('error', 'is-invalid');
            if (textarea.removeAttribute) textarea.removeAttribute('aria-invalid');
        }
    }

    container.querySelectorAll('.disease-entry').forEach(entry => {
        const checkbox = entry.querySelector('input[type="checkbox"][name="disease"]')
            || entry.querySelector('input[type="checkbox"]');
        if (!checkbox) return;
        // initialize
        setEntryState(entry, checkbox.checked);
        // listen for changes
        checkbox.addEventListener('change', () => setEntryState(entry, checkbox.checked));
    });
}

// Auto-init when DOM is ready on pages that include this script directly
document.addEventListener('DOMContentLoaded', () => {
    initializeDiseaseDetails();
});

// Expose for manual re-init (e.g., dynamic content)
window.initializeDiseaseDetails = initializeDiseaseDetails;

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
        || document.getElementById('health-history-content')
        || document.getElementById('health-history-content');
    if (!container) return;

    function setEntryState(entry, checked) {
        const details = entry.querySelector('.disease-details-container');
        const textarea = details && details.querySelector('textarea');
        if (!details || !textarea) return;

        // If textarea already has data (e.g., loaded from DB), ensure checkbox is checked
        if (!checked && textarea.value && textarea.value.toString().trim() !== '') {
            const cb = entry.querySelector('input[type="checkbox"][name="disease"]') || entry.querySelector('input[type="checkbox"]');
            if (cb) {
                cb.checked = true;
                checked = true;
            }
        }

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
        // initialize (also accounts for prefilled textarea values)
        setEntryState(entry, checkbox.checked);
        // listen for changes
        checkbox.addEventListener('change', () => setEntryState(entry, checkbox.checked));
    });
}

// Auto-init when DOM is ready on pages that include this script directly
document.addEventListener('DOMContentLoaded', () => {
    initializeDiseaseDetails();
    if (typeof initializeOccupationalRisk === 'function') initializeOccupationalRisk();
});

// Expose for manual re-init (e.g., dynamic content)
window.initializeDiseaseDetails = initializeDiseaseDetails;

/**
 * Initializes the Occupational Risk toggle behavior.
 * Shows the details textarea only when "occupational-risk" is Yes.
 */
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

window.initializeOccupationalRisk = initializeOccupationalRisk;

/**
 * This script handles fetching existing user data from the database and populating the form.
 * It is triggered when an existing user enters their UniqueID.
 */

// Debounce function to limit how often the fetch request is made
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Function to populate the form with fetched data
// Function to populate the form with fetched data
function populateForm(data) {
    for (const sectionKey in data) {
        if (!data.hasOwnProperty(sectionKey)) continue;
        const sectionData = data[sectionKey] || {};
        for (const fieldName in sectionData) {
            if (!sectionData.hasOwnProperty(fieldName)) continue;
            const elements = document.querySelectorAll(`[name="${fieldName}"]`);
            if (!elements || elements.length === 0) continue;
            const value = sectionData[fieldName];
            const firstEl = elements[0];
            const type = firstEl.type;
            if (type === 'radio') {
                elements.forEach(el => {
                    el.checked = (el.value === value);
                });
            } else if (type === 'checkbox') {
                if (Array.isArray(value)) {
                    elements.forEach(el => {
                        const shouldCheck = value.includes(el.value);
                        el.checked = shouldCheck;
                        // Ensure any UI that depends on checkbox state updates
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                } else {
                    elements.forEach(el => {
                        const shouldCheck = (el.value === value) || value === true;
                        el.checked = shouldCheck;
                        // Ensure any UI that depends on checkbox state updates
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                }
            } else {
                elements.forEach(el => {
                    el.value = value;
                });
            }
        }
    }
}

// Main function to initialize the data fetching logic
function initializeDataFetch() {
    const uniqueIdInput = document.getElementById('unique-id');
    const statusElement = document.getElementById('unique-id-status');
    if (!uniqueIdInput || !statusElement) return;

    const fetchData = debounce(async () => {
        const uniqueId = uniqueIdInput.value.trim();
        const isExistingUser = document.querySelector('input[name="user_type"]:checked').value === 'existing';

        if (uniqueId && isExistingUser) {
            statusElement.textContent = 'Fetching data...';
            statusElement.style.color = 'blue';
            try {
                const response = await fetch(`/submission/${uniqueId}`);
                if (response.ok) {
    const data = await response.json();
    // Cache fetched data globally so late-loaded sections can be populated
    window.__lastFetchedData = data;
    // Override stored user_type so the radio stays on Existing User
    if (data.primaryContact) { data.primaryContact.user_type = 'existing'; }
    // Switch to existing-user and unlock UniqueID field
    const existingRadio = document.getElementById('existing-user');
    if (existingRadio) existingRadio.checked = true;
    const uniqueIdInput = document.getElementById('unique-id');
    if (uniqueIdInput) {
        uniqueIdInput.removeAttribute('readonly');
        uniqueIdInput.classList.remove('readonly-field');
    }
                    // First populate the form fields so primary contact age (#self-age) is available
                    populateForm(data);

                    // Reinitialize disease visibility so checked states reflect in UI
                    if (window.initializeDiseaseDetails) {
                        window.initializeDiseaseDetails();
                    }

                    // Populate members list AFTER form fields so counters can include primary contact
                    if (data.members) {
                        localStorage.setItem('members', JSON.stringify(data.members));
                        if (window.loadMembersGlobal) window.loadMembersGlobal();
                    }

                    // Ensure people counter reflects both primary contact and members
                    if (window.updatePeopleCounter) window.updatePeopleCounter();
                    // Populate disease checkboxes and trigger UI updates via change event
                    if (data.healthHistory && Array.isArray(data.healthHistory.disease)) {
                        data.healthHistory.disease.forEach(val => {
                            const cb = document.querySelector(`input[name="disease"][value="${val}"]`);
                            if (!cb) return;
                            cb.checked = true;
                            // Fire change so initializeDiseaseDetails toggles visibility and enables textarea
                            cb.dispatchEvent(new Event('change', { bubbles: true }));
                            // Set textarea value if present
                            const txt = document.querySelector(`textarea[name="${val}_details"]`);
                            if (txt && typeof data.healthHistory[`${val}_details`] !== 'undefined') {
                                txt.value = data.healthHistory[`${val}_details`];
                            }
                        });
                    }
                    // Final safety sync: ensure all checked diseases show their details containers
                    (function syncDiseaseUI(){
                        document.querySelectorAll('.disease-entry').forEach(entry => {
                            const cb = entry.querySelector('input[type="checkbox"][name="disease"]');
                            const details = entry.querySelector('.disease-details-container');
                            const ta = details ? details.querySelector('textarea') : null;
                            if (!cb || !details || !ta) return;
                            if (cb.checked) {
                                details.style.display = 'flex';
                                ta.disabled = false;
                            }
                        });
                    })();
                    statusElement.textContent = 'Data loaded successfully!';
                    statusElement.style.color = 'green';
                } else if (response.status === 404) {
                    statusElement.textContent = 'Unique ID does not exist.';
                    statusElement.style.color = 'red';
                }
            } catch (error) {
                console.error('Failed to fetch submission data:', error);
                statusElement.textContent = 'Error fetching data.';
                statusElement.style.color = 'red';
            }
        }
    }, 500); // 500ms debounce delay

    uniqueIdInput.addEventListener('input', fetchData);
}

// Initialize the script once the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeDataFetch);

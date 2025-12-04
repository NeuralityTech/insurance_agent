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

// Function to populate form with fetched data
function populateForm(data) {
    console.log('Populating form with data:', data);
    
    // Prevent infinite loops
    if (window._populatingForm) {
        console.warn('Already populating form, skipping to prevent infinite loop');
        return;
    }
    window._populatingForm = true;
    
    try {
        // Handle direct field mapping first (flat structure)
        populateDirectFields(data);
        if (typeof window.updateHeightFeetInchesFromCm === "function") {
            window.updateHeightFeetInchesFromCm();
        }
        // Handle nested sections
        for (const sectionKey in data) {
            if (!data.hasOwnProperty(sectionKey)) continue;
            const sectionData = data[sectionKey];
            
            // Skip non-object values, arrays, and special sections
            if (!sectionData || typeof sectionData !== 'object' || Array.isArray(sectionData)) {
                continue;
            }
            
            // Skip sections that don't have form fields
            if (['commentsNoted', 'members'].includes(sectionKey)) {
                continue;
            }
            
            console.log(`Processing section: ${sectionKey}`, sectionData);
            
            for (const fieldName in sectionData) {
                if (!sectionData.hasOwnProperty(fieldName)) continue;
                const value = sectionData[fieldName];
                if (value === undefined || value === null || value === '') continue;
                
                // Skip invalid field names and blacklisted fields
                // Also skip disease-related fields - handled separately by handleDiseaseData
                if (!fieldName || typeof fieldName !== 'string' || /^\d+$/.test(fieldName) || 
                    FIELD_BLACKLIST.includes(fieldName) ||
                    fieldName === 'disease' || fieldName.endsWith('_details') || 
                    fieldName.endsWith('_start_date') || fieldName.endsWith('_since_year') || fieldName.endsWith('_since_years')) {
                    continue;
                }
                
                populateField(fieldName, value);
            }
        }
        
        // Handle special cases
        handleSpecialFields(data);
    } finally {
        window._populatingForm = false;
    }
}

// Blacklist of fields that should never be processed as form fields
const FIELD_BLACKLIST = [
    'comments_noted', 'user_type', 'members', 'timestamp', 'agent', 'form_summary',
    'supervisor_approval_status', 'supervisor_comments', 'plans_chosen',
    'created_at', 'created_by', 'modified_at', 'modified_by'
];

// Function to populate direct fields (top-level)
function populateDirectFields(data) {
    const directFieldMappings = {
        'unique_id': 'unique_id',
        'applicant_name': 'applicant_name', 
        'gender': 'gender',
        'occupation': 'occupation',
        'email': 'email',
        'phone': 'phone',
        'address': 'address',
        'hubs': 'hubs',
        'self-dob': 'self-dob',
        'self-age': 'self-age',
        'self-height': 'self-height',
        'self-weight': 'self-weight',
        'self-bmi': 'self-bmi'
    };
    
    for (const [dataKey, fieldName] of Object.entries(directFieldMappings)) {
        if (data[dataKey] !== undefined && data[dataKey] !== null && data[dataKey] !== '' && 
            !FIELD_BLACKLIST.includes(dataKey)) {
            populateField(fieldName, data[dataKey]);
        }
    }
}

// Function to populate a single field
function populateField(fieldName, value) {
    // Try multiple selectors to find the field
    let elements = document.querySelectorAll(`[name="${fieldName}"]`);
    
    // If not found, try common field name variations
    if (elements.length === 0) {
        const variations = [
            fieldName.replace(/_/g, '-'),
            fieldName.replace(/-/g, '_'),
            fieldName.replace(/([A-Z])/g, '-$1').toLowerCase(),
            fieldName.toLowerCase()
        ];
        
        for (const variation of variations) {
            elements = document.querySelectorAll(`[name="${variation}"]`);
            if (elements.length > 0) break;
        }
    }
    
    // Also try by ID if name selector didn't work
    if (elements.length === 0) {
        try {
            // Check if fieldName is a valid CSS identifier
            if (fieldName && /^[a-zA-Z_][\w-]*$/.test(fieldName)) {
                const byId = document.querySelector(`#${fieldName}`);
                if (byId) elements = [byId];
            } else if (fieldName) {
                // Use getElementById for invalid CSS selectors (like starting with numbers)
                const byId = document.getElementById(fieldName);
                if (byId) elements = [byId];
            }
        } catch (e) {
            // Fallback to getElementById if querySelector fails
            const byId = document.getElementById(fieldName);
            if (byId) elements = [byId];
        }
    }
    
    if (!elements || elements.length === 0) {
        // Only warn for actual field names, not numeric keys or blacklisted fields
        const skipWarning = /^\d+$/.test(fieldName) || 
                           FIELD_BLACKLIST.includes(fieldName) ||
                           fieldName.includes('_details') && !document.querySelector(`textarea[name="${fieldName}"]`);
        
        if (!skipWarning) {
            console.warn(`Field not found: ${fieldName}`);
        }
        return;
    }
    
    const firstEl = elements[0];
    const type = firstEl.type;
    
    try {
        if (type === 'radio') {
            elements.forEach(el => {
                if (String(el.value) === String(value)) {
                    el.checked = true;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
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
                    const shouldCheck = (String(el.value) === String(value)) || value === true;
                    el.checked = shouldCheck;
                    // Ensure any UI that depends on checkbox state updates
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }
        } else if (type === 'date') {
            elements.forEach(el => {
                el.value = value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
        } else {
            elements.forEach(el => {
                el.value = value;
                // Trigger change event for calculated fields
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }
    } catch (e) {
        console.warn(`Failed to populate field ${fieldName}:`, e);
    }
}

// Function to handle special fields that need custom processing
function handleSpecialFields(data) {
    // Handle comments (don't populate as form fields)
    if (data.commentsNoted && data.commentsNoted.comments_noted) {
        console.log('Comments data found, handled by comments_noted.js');
    }
    
    // Handle disease data
    handleDiseaseData(data);
}

// Function to handle disease checkbox data for PRIMARY APPLICANT ONLY
function handleDiseaseData(data) {
    // Only look for disease data in healthHistory to avoid accidentally
    // using member data as primary applicant data
    let diseaseData = null;
    let diseaseArray = null;
    
    // Check for disease data ONLY in healthHistory section
    if (data.healthHistory && data.healthHistory.disease) {
        diseaseArray = Array.isArray(data.healthHistory.disease) ? data.healthHistory.disease : [data.healthHistory.disease];
        diseaseData = data.healthHistory;
    } else if (data.health_history && data.health_history.disease) {
        diseaseArray = Array.isArray(data.health_history.disease) ? data.health_history.disease : [data.health_history.disease];
        diseaseData = data.health_history;
    }
    
    if (diseaseArray && diseaseArray.length > 0) {
        // Filter out empty values that might have accumulated from data corruption
        diseaseArray = diseaseArray.filter(v => v !== undefined && v !== null && String(v).trim() !== '');
        
        console.log('Processing PRIMARY APPLICANT disease data:', diseaseArray);
        
        diseaseArray.forEach(val => {
            if (!val || val === '') return;
            
            // This prevents accidentally checking member disease checkboxes
            const healthHistoryContent = document.getElementById('health-history-content');
            if (!healthHistoryContent) {
                console.warn('health-history-content not found for disease prefill');
                return;
            }
            
            const cb = healthHistoryContent.querySelector(`input[name="disease"][value="${val}"]`);
            if (!cb) {
                console.warn(`Disease checkbox not found in health-history-content for: ${val}`);
                return;
            }
            
            cb.checked = true;
            // Fire change so initializeDiseaseDetails toggles visibility and enables fields
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Set textarea value if present - only look in diseaseData, not entire data object
            const detailsKey = `${val}_details`;
            const txt = healthHistoryContent.querySelector(`textarea[name="${detailsKey}"]`);
            if (txt && diseaseData && diseaseData[detailsKey] !== undefined) {
                txt.disabled = false;
                txt.value = diseaseData[detailsKey];
                console.log(`Set ${detailsKey} to:`, diseaseData[detailsKey]);
            }
            
            // Set since year if present - only look in diseaseData
            const sinceYearKey = `${val}_since_year`;
            const sinceYearSelect = healthHistoryContent.querySelector(`select[name="${sinceYearKey}"]`);
            if (sinceYearSelect && diseaseData && diseaseData[sinceYearKey] !== undefined) {
                sinceYearSelect.disabled = false;
                sinceYearSelect.value = diseaseData[sinceYearKey];
                console.log(`Set ${sinceYearKey} to:`, diseaseData[sinceYearKey]);
            }
            
            // Set since years if present - only look in diseaseData
            const sinceYearsKey = `${val}_since_years`;
            const sinceYearsInput = healthHistoryContent.querySelector(`input[name="${sinceYearsKey}"]`);
            if (sinceYearsInput && diseaseData && diseaseData[sinceYearsKey] !== undefined) {
                sinceYearsInput.disabled = false;
                sinceYearsInput.value = diseaseData[sinceYearsKey];
                console.log(`Set ${sinceYearsKey} to:`, diseaseData[sinceYearsKey]);
            }
            
            // Backward compatibility: convert old start_date to since_year
            const dateKey = `${val}_start_date`;
            if (diseaseData && diseaseData[dateKey] !== undefined && !diseaseData[sinceYearKey]) {
                const dateValue = diseaseData[dateKey];
                if (dateValue) {
                    const dateObj = new Date(dateValue);
                    if (!isNaN(dateObj.getTime())) {
                        const year = dateObj.getFullYear();
                        if (sinceYearSelect) {
                            sinceYearSelect.disabled = false;
                            sinceYearSelect.value = year;
                            console.log(`Converted ${dateKey} (${dateValue}) to since_year ${year}`);
                        }
                        // Calculate years
                        const currentYear = new Date().getFullYear();
                        if (sinceYearsInput) {
                            sinceYearsInput.disabled = false;
                            sinceYearsInput.value = Math.max(0, currentYear - year);
                        }
                    }
                }
            }
        });
    }
}

// Main function to initialize the data fetching logic
function initializeDataFetch() {
    const uniqueIdInput = document.getElementById('unique-id');
    const statusElement = document.getElementById('unique-id-status');
    if (!uniqueIdInput || !statusElement) return;

    const fetchData = debounce(async () => {
        const uniqueId = uniqueIdInput.value.trim();
        // Check if we're on existing user page or if user_type radio exists
        const userTypeRadio = document.querySelector('input[name="user_type"]:checked');
        const isExistingUser = userTypeRadio ? userTypeRadio.value === 'existing' : true; // Default to true for existing user page

        if (uniqueId && isExistingUser) {
            statusElement.textContent = 'Fetching data...';
            statusElement.style.color = 'blue';
            try {
                const response = await fetch(`/submission/${uniqueId}`);
                if (response.ok) {
                    const data = await response.json();
                    
                    // Validate that we received valid data
                    if (!data || typeof data !== 'object') {
                        throw new Error('Invalid data format received from server');
                    }
                    
                    // Cache fetched data globally so late-loaded sections can be populated
                    window.__lastFetchedData = data;
                    
                    // Override stored user_type so the radio stays on Existing User
                    if (data.primaryContact) { 
                        data.primaryContact.user_type = 'existing'; 
                    }
                    
                    // Switch to existing-user and unlock UniqueID field
                    const existingRadio = document.getElementById('existing-user');
                    if (existingRadio) existingRadio.checked = true;
                    const uniqueIdInput = document.getElementById('unique-id');
                    if (uniqueIdInput) {
                        uniqueIdInput.removeAttribute('readonly');
                        uniqueIdInput.classList.remove('readonly-field');
                    }
                    
                    // First populate the form fields so primary contact age (#self-age) is available
                    try {
                        // Only populate if not already done to prevent loops
                        if (!window._dataPopulated || window._dataPopulated !== uniqueId) {
                            populateForm(data);
                            window._dataPopulated = uniqueId;
                        }
                    } catch (populateError) {
                        console.error('Error populating form:', populateError);
                        statusElement.textContent = 'Data loaded with some field errors. Check console for details.';
                        statusElement.style.color = 'orange';
                    }
                    
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
                    // Handle disease checkboxes specially
                    handleDiseaseData(data);
                    (function syncDiseaseUI(){
                        const healthHistoryContent = document.getElementById('health-history-content');
                        if (!healthHistoryContent) return;
                        
                        healthHistoryContent.querySelectorAll('.disease-entry').forEach(entry => {
                            const cb = entry.querySelector('input[type="checkbox"][name="disease"]');
                            const details = entry.querySelector('.disease-details-container');
                            const ta = details ? details.querySelector('textarea') : null;
                            const sinceYearSelect = details ? details.querySelector('.disease-since-year') : null;
                            const sinceYearsInput = details ? details.querySelector('.disease-since-years') : null;
                            if (!cb || !details || !ta) return;
                            if (cb.checked) {
                                details.style.display = 'flex';
                                ta.disabled = false;
                                if (sinceYearSelect) sinceYearSelect.disabled = false;
                                if (sinceYearsInput) sinceYearsInput.disabled = false;
                            }
                        });
                    })();
                    statusElement.textContent = 'Data loaded successfully!';
                    statusElement.style.color = 'green';
                } else if (response.status === 404) {
                    statusElement.textContent = 'Unique ID does not exist.';
                    statusElement.style.color = 'red';
                } else if (response.status === 422) {
                    // Corrupted data - show specific error message
                    const errorData = await response.json().catch(() => ({}));
                    statusElement.textContent = errorData.error || 'Data is corrupted. Please re-submit your information.';
                    statusElement.style.color = 'red';
                } else {
                    // Other server errors
                    const errorData = await response.json().catch(() => ({}));
                    statusElement.textContent = errorData.error || `Server error (${response.status}). Please try again.`;
                    statusElement.style.color = 'red';
                }
            } catch (error) {
                console.error('Failed to fetch submission data:', error);
                statusElement.textContent = 'Error fetching data.';
                statusElement.style.color = 'red';
            }
        }
    }, 500); // 500ms debounce delay

    // Remove input event listener to prevent repeated calls
    // uniqueIdInput.addEventListener('input', fetchData);
}

// Initialize the script once the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeDataFetch);

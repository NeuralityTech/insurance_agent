/**
 * This script handles fetching existing user data from the database and populating the form.
 * It is triggered when an existing user enters their UniqueID.
 * 
 * PATCHED: 
 * - Renamed first_name/middle_name/last_name to pc_fname/pc_mname/pc_lname
 *   to prevent Policy_Creation.html from catching these fields when searching for "name"
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
        // Note: applicant_name is now handled specially below to parse into first/middle/last
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
        'self-bmi': 'self-bmi',
        // PATCH: Renamed name fields to avoid "name" substring matching in Policy_Creation.html
        // Database key -> Form field name
        'pc_fname': 'pc_fname',
        'pc_mname': 'pc_mname',
        'pc_lname': 'pc_lname',
        // Backward compatibility: also map old field names to new form fields
        'first_name': 'pc_fname',
        'middle_name': 'pc_mname',
        'last_name': 'pc_lname'
    };
    
    for (const [dataKey, fieldName] of Object.entries(directFieldMappings)) {
        if (data[dataKey] !== undefined && data[dataKey] !== null && data[dataKey] !== '' && 
            !FIELD_BLACKLIST.includes(dataKey)) {
            populateField(fieldName, data[dataKey]);
        }
    }
    
    // Handle applicant_name specially - parse into first/middle/last name components
    // This maintains backward compatibility with existing records
    const fullName = data['applicant_name'];
    if (fullName && typeof fullName === 'string' && fullName.trim()) {
        // PATCH: Check for both old and new field names
        const hasNewFields = (data['pc_fname'] && data['pc_fname'].trim()) || 
                            (data['first_name'] && data['first_name'].trim());
        
        if (!hasNewFields) {
            // Parse full name into components using the helper function from validation.js
            if (typeof window.populateNameFieldsFromFullName === 'function') {
                window.populateNameFieldsFromFullName(fullName);
            } else {
                // Fallback: simple parsing if helper not available
                // PATCH: Use new field names (pc_fname, pc_mname, pc_lname)
                const parts = fullName.trim().split(/\s+/).filter(p => p);
                if (parts.length >= 1) {
                    populateField('pc_fname', parts[0]);
                }
                if (parts.length >= 3) {
                    populateField('pc_mname', parts.slice(1, -1).join(' '));
                    populateField('pc_lname', parts[parts.length - 1]);
                } else if (parts.length === 2) {
                    populateField('pc_lname', parts[1]);
                }
                // Also populate the hidden full name field
                populateField('applicant_name', fullName);
            }
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
            console.warn(`Could not query by ID for field: ${fieldName}`, e);
        }
    }
    
    if (elements.length === 0) {
        // Don't log warnings for expected missing fields
        return;
    }
    
    elements.forEach(element => {
        try {
            if (element.type === 'checkbox') {
                // Handle checkbox specially
                if (Array.isArray(value)) {
                    element.checked = value.includes(element.value);
                } else {
                    element.checked = Boolean(value) || value === element.value;
                }
                element.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (element.type === 'radio') {
                // Handle radio buttons
                if (element.value === String(value)) {
                    element.checked = true;
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else if (element.tagName === 'SELECT') {
                // Handle select dropdowns
                element.value = value;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // Handle text inputs, textareas, etc.
                element.value = value;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (e) {
            console.warn(`Error setting field ${fieldName}:`, e);
        }
    });
}

// Function to handle special fields that need custom processing
function handleSpecialFields(data) {
    // Handle secondary occupation checkbox
    const secondaryOccupation = data['secondary_occupation'] || 
                                (data.primaryContact && data.primaryContact['secondary_occupation']);
    if (secondaryOccupation) {
        const checkbox = document.getElementById('secondary-occupation-checkbox');
        const section = document.getElementById('secondary-occupation-section');
        if (checkbox && section) {
            checkbox.checked = true;
            section.style.display = 'block';
        }
    }
}

// Function to handle disease data from nested structure
function handleDiseaseData(data) {
    // Try to find disease data in various locations
    let diseaseData = null;
    
    if (data.healthHistory) {
        diseaseData = data.healthHistory;
    } else if (data.health_history) {
        diseaseData = data.health_history;
    }
    
    if (!diseaseData) return;
    
    const healthHistoryContent = document.getElementById('health-history-content');
    if (!healthHistoryContent) return;
    
    // Handle disease checkboxes
    const diseaseCheckboxes = healthHistoryContent.querySelectorAll('input[type="checkbox"][name="disease"]');
    const selectedDiseases = diseaseData.disease || [];
    
    if (Array.isArray(selectedDiseases)) {
        diseaseCheckboxes.forEach(cb => {
            if (selectedDiseases.includes(cb.value)) {
                cb.checked = true;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }
    
    // Handle disease details and since year fields
    const diseaseValues = ['cardiac', 'diabetes', 'hypertension', 'cancer', 'critical_illness', 'other'];
    
    diseaseValues.forEach(val => {
        // Set details textarea if present - only look in diseaseData
        const detailsKey = `${val}_details`;
        const detailsTextarea = healthHistoryContent.querySelector(`textarea[name="${detailsKey}"]`);
        if (detailsTextarea && diseaseData && diseaseData[detailsKey] !== undefined) {
            detailsTextarea.disabled = false;
            detailsTextarea.value = diseaseData[detailsKey];
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

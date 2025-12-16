/*
 * This file handles the user interface logic for the Health History section.
 * It is used by: New_Applicant_Request_Form.html, Existing_Applicant_Request_Form.html, member_details.html
 * The main function is called from script.js when the Health History section is loaded.
 * 
 * 
 */ 

/**
 * Get the current year
 */
function getCurrentYear() {
    return new Date().getFullYear();
}

/**
 * Populate a year dropdown with years from startYear to current year
 * PRESERVES existing value if valid
 * @param {HTMLSelectElement} selectEl - The select element to populate
 * @param {number} startYear - The starting year (default 1950)
 */
function populateYearDropdown(selectEl, startYear = 1950) {
    if (!selectEl) return;
    
    const currentYear = getCurrentYear();
    
    // Save current value BEFORE clearing options
    const savedValue = selectEl.value;
    
    // Clear existing options except the first placeholder
    while (selectEl.options.length > 1) {
        selectEl.remove(1);
    }
    
    // Add years in descending order (most recent first)
    for (let year = currentYear; year >= startYear; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        selectEl.appendChild(option);
    }
    
    if (savedValue && savedValue !== '' && savedValue !== 'Select Year') {
        selectEl.value = savedValue;
    }
}

/**
 * Calculate number of years from a given year to current year
 * @param {number} sinceYear - The year the disease started
 * @returns {number} Number of years
 */
function calculateYearsFromYear(sinceYear) {
    if (!sinceYear || isNaN(sinceYear)) return 0;
    const currentYear = getCurrentYear();
    return Math.max(0, currentYear - parseInt(sinceYear));
}

/**
 * Calculate the year from number of years ago
 * @param {number} yearsAgo - Number of years ago
 * @returns {number} The calculated year
 */
function calculateYearFromYears(yearsAgo) {
    if (!yearsAgo || isNaN(yearsAgo)) return null;
    const currentYear = getCurrentYear();
    return currentYear - parseInt(yearsAgo);
}

/**
 * Initializes the event listeners for disease checkboxes.
 * Behavior:
 *  - Checked: show details container, enable year/years inputs and textarea
 *  - Unchecked: hide details, clear values, disable fields
 *  - Auto-calculate between Since Year and Since X Years
 */
function initializeDiseaseDetails(root) {
    const container = root || document.getElementById('disease-list')
        || document.getElementById('health-history-content')
        || document.getElementById('health-history-content');
    if (!container) return;

    const currentYear = getCurrentYear();

    function setEntryState(entry, checked) {
        const details = entry.querySelector('.disease-details-container');
        const sinceYearSelect = details && details.querySelector('.disease-since-year');
        const sinceYearsInput = details && details.querySelector('.disease-since-years');
        const textarea = details && details.querySelector('textarea');
        const errorSpan = entry.querySelector('.error-message');

        if (!details) return;

        // Save current values before any operations that might clear them
        const savedYearValue = sinceYearSelect ? sinceYearSelect.value : '';
        const savedYearsValue = sinceYearsInput ? sinceYearsInput.value : '';
        const savedTextValue = textarea ? textarea.value : '';

        // Populate year dropdown if present (this now preserves the value internally)
        if (sinceYearSelect) {
            populateYearDropdown(sinceYearSelect);
            // restore value if populateYearDropdown didn't preserve it
            if (savedYearValue && savedYearValue !== '' && savedYearValue !== 'Select Year' && !sinceYearSelect.value) {
                sinceYearSelect.value = savedYearValue;
            }
        }

        // Check if there's existing data - if so, force checkbox to be checked
        const hasYearValue = savedYearValue && savedYearValue !== '' && savedYearValue !== 'Select Year';
        const hasYearsValue = savedYearsValue && savedYearsValue !== '' && savedYearsValue !== '0';
        const hasTextValue = savedTextValue && savedTextValue.trim() !== '';

        if (!checked && (hasYearValue || hasYearsValue || hasTextValue)) {
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
            
            if (sinceYearSelect) {
                sinceYearSelect.disabled = false;
                // Ensure value is still set
                if (savedYearValue && savedYearValue !== '' && savedYearValue !== 'Select Year') {
                    sinceYearSelect.value = savedYearValue;
                }
            }
            if (sinceYearsInput) {
                sinceYearsInput.disabled = false;
                // Ensure value is still set
                if (savedYearsValue && savedYearsValue !== '') {
                    sinceYearsInput.value = savedYearsValue;
                }
            }
            if (textarea) {
                textarea.disabled = false;
                // Ensure value is still set
                if (savedTextValue && savedTextValue.trim() !== '') {
                    textarea.value = savedTextValue;
                }
            }
            
            // Setup auto-calculation between year and years
            setupAutoCalculation(entry, sinceYearSelect, sinceYearsInput, errorSpan, savedYearValue, savedYearsValue);
            
        } else {
            // Hide and disable fields
            details.style.display = 'none';
            
            if (sinceYearSelect) {
                sinceYearSelect.value = '';
                sinceYearSelect.disabled = true;
            }
            if (sinceYearsInput) {
                sinceYearsInput.value = '';
                sinceYearsInput.disabled = true;
            }
            if (textarea) {
                textarea.value = '';
                textarea.disabled = true;
            }
            
            // Clear error states
            if (sinceYearSelect) sinceYearSelect.classList.remove('input-error');
            if (sinceYearsInput) sinceYearsInput.classList.remove('input-error');
            if (errorSpan) {
                errorSpan.textContent = '';
                errorSpan.style.display = 'none';
            }
        }
    }

    function setupAutoCalculation(entry, sinceYearSelect, sinceYearsInput, errorSpan, savedYearValue, savedYearsValue) {
        if (!sinceYearSelect || !sinceYearsInput) return;
        
        const yearToRestore = savedYearValue || sinceYearSelect.value || '';
        const yearsToRestore = savedYearsValue || sinceYearsInput.value || '';
        
        // Remove existing listeners to prevent duplicates by cloning
        const newYearSelect = sinceYearSelect.cloneNode(true);
        const newYearsInput = sinceYearsInput.cloneNode(true);
        
        sinceYearSelect.parentNode.replaceChild(newYearSelect, sinceYearSelect);
        sinceYearsInput.parentNode.replaceChild(newYearsInput, sinceYearsInput);
        
        // Repopulate year dropdown after cloning
        populateYearDropdown(newYearSelect);
        
        if (yearToRestore && yearToRestore !== '' && yearToRestore !== 'Select Year') {
            newYearSelect.value = yearToRestore;
        }
        if (yearsToRestore && yearsToRestore !== '') {
            newYearsInput.value = yearsToRestore;
        }
        
        // When year is selected, calculate number of years
        newYearSelect.addEventListener('change', function() {
            if (this.value && this.value !== '') {
                const years = calculateYearsFromYear(parseInt(this.value));
                newYearsInput.value = years;
                validateDiseaseFields(entry, newYearSelect, newYearsInput, errorSpan);
            }
        });
        
        // When years is entered, calculate the year
        newYearsInput.addEventListener('input', function() {
            if (this.value && this.value !== '' && !isNaN(this.value)) {
                const yearsAgo = parseInt(this.value);
                if (yearsAgo >= 0 && yearsAgo <= 100) {
                    const year = calculateYearFromYears(yearsAgo);
                    if (year >= 1950 && year <= currentYear) {
                        newYearSelect.value = year;
                    }
                }
                validateDiseaseFields(entry, newYearSelect, newYearsInput, errorSpan);
            }
        });
        
        // Also validate on blur
        newYearSelect.addEventListener('blur', function() {
            validateDiseaseFields(entry, newYearSelect, newYearsInput, errorSpan);
        });
        
        newYearsInput.addEventListener('blur', function() {
            validateDiseaseFields(entry, newYearSelect, newYearsInput, errorSpan);
        });
    }

    function validateDiseaseFields(entry, sinceYearSelect, sinceYearsInput, errorSpan) {
        const checkbox = entry.querySelector('input[type="checkbox"]');
        if (!checkbox || !checkbox.checked) {
            // Not checked, clear errors
            if (errorSpan) {
                errorSpan.textContent = '';
                errorSpan.style.display = 'none';
            }
            if (sinceYearSelect) sinceYearSelect.classList.remove('input-error');
            if (sinceYearsInput) sinceYearsInput.classList.remove('input-error');
            return true;
        }
        
        let isValid = true;
        let message = '';
        
        // Check if at least one of year or years is filled
        const hasYear = sinceYearSelect && sinceYearSelect.value && sinceYearSelect.value !== '';
        const hasYears = sinceYearsInput && sinceYearsInput.value && sinceYearsInput.value !== '' && sinceYearsInput.value !== '0';
        
        if (!hasYear && !hasYears) {
            isValid = false;
            message = 'Please enter Since Year or Since Years';
        } else if (sinceYearsInput && sinceYearsInput.value) {
            const yearsVal = parseInt(sinceYearsInput.value);
            if (yearsVal < 0) {
                isValid = false;
                message = 'Years cannot be negative';
            } else if (yearsVal > 100) {
                isValid = false;
                message = 'Years cannot exceed 100';
            }
        }
        
        if (errorSpan) {
            errorSpan.textContent = message;
            errorSpan.style.display = isValid ? 'none' : 'block';
        }
        
        if (sinceYearSelect) sinceYearSelect.classList.toggle('input-error', !isValid && !hasYear);
        if (sinceYearsInput) sinceYearsInput.classList.toggle('input-error', !isValid && !hasYears);
        
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
// VALIDATE PRIMARY APPLICANT DISEASE DURATION
// Now validates Since Year / Since Years instead of date
// ============================================================================
window.validatePrimaryDiseaseDates = function () {
    let isValid = true;

    // Only validate disease entries in the primary applicant's health history section
    const healthHistoryContent = document.getElementById('health-history-content');
    if (!healthHistoryContent) {
        // If section not found, assume valid (might be on a different page)
        return true;
    }

    // Query only disease entries within health-history-content
    healthHistoryContent.querySelectorAll('.disease-entry').forEach(entry => {
        const checkbox = entry.querySelector('input[type="checkbox"]');
        const sinceYearSelect = entry.querySelector('.disease-since-year');
        const sinceYearsInput = entry.querySelector('.disease-since-years');
        const errorSpan = entry.querySelector('.error-message');

        if (checkbox && checkbox.checked) {
            // Check if at least one of year or years is filled
            const hasYear = sinceYearSelect && sinceYearSelect.value && sinceYearSelect.value !== '';
            const hasYears = sinceYearsInput && sinceYearsInput.value && sinceYearsInput.value !== '' && parseInt(sinceYearsInput.value) > 0;
            
            if (!hasYear && !hasYears) {
                isValid = false;
                if (errorSpan) {
                    errorSpan.textContent = "Please enter Since Year or Since Years.";
                    errorSpan.style.display = 'block';
                }
                if (sinceYearSelect) sinceYearSelect.classList.add('input-error');
                if (sinceYearsInput) sinceYearsInput.classList.add('input-error');
            } else {
                // Validate years value if present
                if (sinceYearsInput && sinceYearsInput.value) {
                    const yearsVal = parseInt(sinceYearsInput.value);
                    if (yearsVal < 0 || yearsVal > 100) {
                        isValid = false;
                        if (errorSpan) {
                            errorSpan.textContent = "Years must be between 0 and 100.";
                            errorSpan.style.display = 'block';
                        }
                        sinceYearsInput.classList.add('input-error');
                    } else {
                        if (errorSpan) {
                            errorSpan.textContent = "";
                            errorSpan.style.display = 'none';
                        }
                        if (sinceYearSelect) sinceYearSelect.classList.remove('input-error');
                        if (sinceYearsInput) sinceYearsInput.classList.remove('input-error');
                    }
                } else {
                    if (errorSpan) {
                        errorSpan.textContent = "";
                        errorSpan.style.display = 'none';
                    }
                    if (sinceYearSelect) sinceYearSelect.classList.remove('input-error');
                    if (sinceYearsInput) sinceYearsInput.classList.remove('input-error');
                }
            }
        } else {
            // disease unselected — clear errors
            if (errorSpan) {
                errorSpan.textContent = "";
                errorSpan.style.display = 'none';
            }
            if (sinceYearSelect) sinceYearSelect.classList.remove('input-error');
            if (sinceYearsInput) sinceYearsInput.classList.remove('input-error');
        }
    });

    return isValid;
};

// Expose utility functions globally for other scripts
window.populateYearDropdown = populateYearDropdown;
window.calculateYearsFromYear = calculateYearsFromYear;
window.calculateYearFromYears = calculateYearFromYears;
window.initializeOccupationalRisk = initializeOccupationalRisk;

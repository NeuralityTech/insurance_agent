/*
 * This script provides validation logic for various sections of the insurance form.
 * It is used by: New_Applicant_Request_Form.html, Existing_Applicant_Request_Form.html
 * The functions are called dynamically from script.js when their respective sections are loaded.
 * 
 * PATCHED: 
 * - Renamed first-name/middle-name/last-name to pc-fname/pc-mname/pc-lname
 *   to prevent Policy_Creation.html from catching these fields when searching for "name"
 * - Added rangeUnderflow/rangeOverflow validation for weight and DOB fields
 */

/**
 * Initializes real-time and on-submit validation for the 'Applicant Details' section.
 * It checks for required fields and pattern mismatches.
 */

function initializePrimaryContactValidation() {
    const form = document.getElementById('primary-contact-content');
    if (!form) return;

    // --- UniqueID Generation Logic ---
    // PATCH: Renamed from first-name/middle-name/last-name to pc-fname/pc-mname/pc-lname
    const firstNameInput = form.querySelector('#pc-fname');
    const middleNameInput = form.querySelector('#pc-mname');
    const lastNameInput = form.querySelector('#pc-lname');
    // Hidden field for concatenated full name (for database compatibility)
    const fullNameInput = form.querySelector('#full-name');
    
    const aadhaarInput = form.querySelector('#aadhaar-last5');
    const uniqueIdInput = form.querySelector('#unique-id');
    const userTypeRadios = form.querySelectorAll('input[name="user_type"]');

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    /**
     * Generates the UniqueID from first name, last name, and aadhaar.
     * Format: 3 letters of FirstName + 3 letters of LastName + 5 digits of Aadhaar
     * Example: "JohSmi_12345" for John Smith with Aadhaar ending in 12345
     */
    function generateUniqueId() {
        if (!firstNameInput || !lastNameInput || !aadhaarInput || !uniqueIdInput) return;
        
        // Get first name: remove non-letters, take first 3 characters
        const firstName = firstNameInput.value.trim().replace(/[^a-zA-Z]/g, '');
        const firstPart = firstName.substring(0, 3);
        
        // Get last name: remove non-letters, take first 3 characters
        const lastName = lastNameInput.value.trim().replace(/[^a-zA-Z]/g, '');
        const lastPart = lastName.substring(0, 3);
        
        const aadhaar = aadhaarInput.value.trim();
        
        // Generate UniqueID only if we have valid inputs
        // First name needs at least 1 letter, last name needs at least 1 letter, aadhaar needs exactly 5 digits
        if (firstName.length >= 1 && lastName.length >= 1 && aadhaar.length === 5 && /^[0-9]{5}$/.test(aadhaar)) {
            // Capitalize first letter of each part for consistency
            const firstPartFormatted = firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();
            const lastPartFormatted = lastPart.charAt(0).toUpperCase() + lastPart.slice(1).toLowerCase();
            uniqueIdInput.value = `${firstPartFormatted}${lastPartFormatted}_${aadhaar}`;
        } else {
            uniqueIdInput.value = '';
        }
    }

    /**
     * Updates the hidden full name field by concatenating first, middle, and last names.
     * This maintains compatibility with the existing database schema.
     */
    function updateFullName() {
        if (!fullNameInput) return;
        
        const firstName = (firstNameInput ? firstNameInput.value.trim() : '');
        const middleName = (middleNameInput ? middleNameInput.value.trim() : '');
        const lastName = (lastNameInput ? lastNameInput.value.trim() : '');
        
        // Concatenate: First + Middle (if exists) + Last
        const parts = [firstName];
        if (middleName) {
            parts.push(middleName);
        }
        parts.push(lastName);
        
        fullNameInput.value = parts.filter(p => p).join(' ');
    }

    /**
     * Combined handler that updates both UniqueID and full name.
     */
    function handleNameChange() {
        generateUniqueId();
        updateFullName();
    }

    function handleUserTypeChange() {
        if (!uniqueIdInput) return;
        const selectedUserType = form.querySelector('input[name="user_type"]:checked');
        const isNewUser = !selectedUserType || selectedUserType.value === 'new';
        if (isNewUser) {
            uniqueIdInput.setAttribute('readonly', true);
            uniqueIdInput.classList.add('readonly-field');
            generateUniqueId();
        } else {
            uniqueIdInput.removeAttribute('readonly');
            uniqueIdInput.classList.remove('readonly-field');
            uniqueIdInput.focus();
        }
    }

    const debouncedHandleNameChange = debounce(handleNameChange, 300);
    const debouncedGenerateId = debounce(generateUniqueId, 300);

    userTypeRadios.forEach(radio => radio.addEventListener('change', handleUserTypeChange));
    
    // Listen to all name fields for changes
    if (firstNameInput) {
        firstNameInput.addEventListener('input', debouncedHandleNameChange);
    }
    if (middleNameInput) {
        middleNameInput.addEventListener('input', debouncedHandleNameChange);
    }
    if (lastNameInput) {
        lastNameInput.addEventListener('input', debouncedHandleNameChange);
    }
    if (aadhaarInput) {
        aadhaarInput.addEventListener('input', debouncedGenerateId);
    }

    // Set initial state for UniqueID field
    handleUserTypeChange();
    // Update full name on init if fields already have values
    updateFullName();
    // --- End of UniqueID Logic ---

    // --- Health Vitals Calculations ---
    const dobInput = form.querySelector('#self-dob');
    const ageInput = form.querySelector('#self-age');

    // Hidden cm field (internal storage used by calculations + backend)
    const heightInput = form.querySelector('#self-height');

    // New visible feet/inches dropdowns
    const heightFeetInput = form.querySelector('#self-height-ft');
    const heightInchesInput = form.querySelector('#self-height-in');

    const weightInput = form.querySelector('#self-weight');
    const bmiInput = form.querySelector('#self-bmi');

    // Set DOB constraints: max = today, min = 100 years ago
    if (dobInput) {
        const today = new Date();
        const maxDate = today.toISOString().split('T')[0]; // Today in YYYY-MM-DD
        const minDate = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate())
            .toISOString().split('T')[0]; // 100 years ago
        
        dobInput.setAttribute('max', maxDate);
        dobInput.setAttribute('min', minDate);
    }
    
    // PATCH: Set weight constraints (min already in HTML, adding max for safety)
    if (weightInput) {
        if (!weightInput.hasAttribute('max')) {
            weightInput.setAttribute('max', '500'); // Reasonable max weight in kg
        }
    }

    if (dobInput && ageInput) {
        dobInput.addEventListener('change', () => {
            // Convert from dd/mm/yyyy input to yyyy-mm-dd for calculation
            const inputValue = dobInput.value;
            let dateForCalculation = inputValue;
            
            // If the input is in dd/mm/yyyy format, convert it
            if (inputValue.includes('/')) {
                const parts = inputValue.split('/');
                if (parts.length === 3) {
                    // Convert dd/mm/yyyy to yyyy-mm-dd
                    dateForCalculation = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }
            
            // Validate DOB is not in the future and within 100 years
            const selectedDate = new Date(dateForCalculation);
            const today = new Date();
            const hundredYearsAgo = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
            const dobError = document.getElementById('self-dob-error');
            
            if (selectedDate > today) {
                if (dobError) {
                    dobError.textContent = 'Date of birth cannot be in the future';
                    dobError.style.display = 'block';
                }
                dobInput.classList.add('input-error');
                ageInput.value = '';
                return;
            }
            
            if (selectedDate < hundredYearsAgo) {
                if (dobError) {
                    dobError.textContent = 'Date of birth must be within the last 100 years';
                    dobError.style.display = 'block';
                }
                dobInput.classList.add('input-error');
                ageInput.value = '';
                return;
            }
            
            // Clear error if valid
            if (dobError) {
                dobError.textContent = '';
                dobError.style.display = 'none';
            }
            dobInput.classList.remove('input-error');
            
            const age = calculateAge(dateForCalculation);
            if (age !== null) {
                ageInput.value = age;
                if (window.updatePeopleCounter) window.updatePeopleCounter();
            }
        });
    }

    if (heightInput && weightInput && bmiInput) {
        const syncHeightAndBmi = () => {
            // If feet/inches inputs are not present, fall back to old behavior
            if (!heightFeetInput || !heightInchesInput) {
                const bmi = calculateBmi(parseFloat(heightInput.value), parseFloat(weightInput.value));
                if (bmi !== null) {
                    bmiInput.value = bmi;
                }
                return;
            }

            let feet = parseFloat(heightFeetInput.value);
            let inches = parseFloat(heightInchesInput.value);

            if (isNaN(feet)) feet = 0;
            if (isNaN(inches)) inches = 0;

            // If nothing entered, clear hidden height + BMI
            if (feet <= 0 && inches <= 0) {
                heightInput.value = '';
                bmiInput.value = '';
                return;
            }

            // Normalize inches >= 12 into feet
            if (inches >= 12) {
                feet += Math.floor(inches / 12);
                inches = inches % 12;

                // Reflect normalization back in the UI so what user sees matches what we store
                if (heightFeetInput) heightFeetInput.value = feet ? String(feet) : '';
                if (heightInchesInput) heightInchesInput.value = inches ? String(inches) : '';
            }

            // Convert to cm: cm = ft*30.48 + in*2.54
            const cm = feet * 30.48 + inches * 2.54;

            // Store internally with one decimal place
            heightInput.value = cm.toFixed(1);

            // calculateBmi from calculations.js expects height in **cm**
            const bmi = calculateBmi(cm, parseFloat(weightInput.value));
            if (bmi !== null) {
                bmiInput.value = bmi;
            }
        };

        // For selects, change event is appropriate
        if (heightFeetInput) {
            heightFeetInput.addEventListener('change', syncHeightAndBmi);
        }
        if (heightInchesInput) {
            heightInchesInput.addEventListener('change', syncHeightAndBmi);
        }
        if (weightInput) {
            weightInput.addEventListener('input', syncHeightAndBmi);
        }

        // On init, if cm already has a value, compute feet/inches for display.
        if (typeof window.updateHeightFeetInchesFromCm === 'function') {
            window.updateHeightFeetInchesFromCm();
        }
    }

    // --- End of Health Vitals Calculations ---

    // This is a critical fix. A faulty email pattern was causing a script-blocking error.
    const emailInput = form.querySelector('#email');
    if (emailInput) {
        emailInput.removeAttribute('pattern');
    }

    const inputsToValidate = form.querySelectorAll('[required], [pattern]');

    function validateField(input) {
        const errorMsgId = input.id + '-error';
        const errorElement = document.getElementById(errorMsgId);
        let isValid = true;
        let message = '';

        if (!errorElement) return true;

        // Determine a friendly label for this field
        let labelText = '';
        const labelEl = form.querySelector(`label[for="${input.id}"]`);
        if (labelEl && labelEl.textContent) {
            labelText = labelEl.textContent;
        } else if (input.previousElementSibling && input.previousElementSibling.textContent) {
            labelText = input.previousElementSibling.textContent;
        } else {
            labelText = input.id;
        }
        const fieldName = labelText.replace(':', '').replace('*', '').trim();

        // Check for validity
        if (input.validity.valueMissing) {
            isValid = false;
            message = `${fieldName} is required.`;
        } else if (input.validity.patternMismatch) {
            isValid = false;
            if (input.id === 'unique-id') {
                message = 'UniqueID format: 3 letters from first name + 3 letters from last name + underscore + 5 digits (e.g., JohSmi_12345).';
            } else if (input.id === 'aadhaar-last5') {
                message = 'Aadhaar must be exactly 5 digits.';
            // PATCH: Updated field IDs for renamed name fields
            } else if (input.id === 'pc-fname') {
                message = 'First name must start with a letter and contain only letters.';
            } else if (input.id === 'pc-lname') {
                message = 'Last name must start with a letter and contain only letters.';
            } else if (input.id === 'pc-mname') {
                message = 'Middle name can only contain letters.';
            } else {
                message = `Invalid format for ${fieldName}.`;
            }
        } else if (input.validity.tooShort || input.validity.tooLong) {
            isValid = false;
            if (input.id === 'aadhaar-last5') {
                message = 'Aadhaar must be exactly 5 digits.';
            } else {
                message = `Invalid length for ${fieldName}.`;
            }
        } 
        // PATCH: Added range validation for min/max constraints
        else if (input.validity.rangeUnderflow) {
            isValid = false;
            if (input.id === 'self-weight') {
                message = 'Weight must be at least 1 kg.';
            } else if (input.id === 'self-dob') {
                message = 'Date of birth must be within the last 100 years.';
            } else {
                const minVal = input.getAttribute('min');
                message = `${fieldName} must be at least ${minVal}.`;
            }
        } else if (input.validity.rangeOverflow) {
            isValid = false;
            if (input.id === 'self-weight') {
                message = 'Weight cannot exceed 500 kg.';
            } else if (input.id === 'self-dob') {
                message = 'Date of birth cannot be in the future.';
            } else {
                const maxVal = input.getAttribute('max');
                message = `${fieldName} cannot exceed ${maxVal}.`;
            }
        } 
        // PATCH: Added type mismatch validation (e.g., for email, number)
        else if (input.validity.typeMismatch) {
            isValid = false;
            if (input.type === 'email') {
                message = 'Please enter a valid email address.';
            } else if (input.type === 'number') {
                message = `Please enter a valid number for ${fieldName}.`;
            } else {
                message = `Invalid value for ${fieldName}.`;
            }
        }
        // PATCH: Added step mismatch validation (for decimal numbers)
        else if (input.validity.stepMismatch) {
            isValid = false;
            message = `Please enter a valid value for ${fieldName}.`;
        }
        // PATCH: Added bad input validation (e.g., letters in number field)
        else if (input.validity.badInput) {
            isValid = false;
            if (input.type === 'number') {
                message = `Please enter a valid number for ${fieldName}.`;
            } else {
                message = `Invalid input for ${fieldName}.`;
            }
        }
        else {
            isValid = true;
            message = '';
        }

        errorElement.textContent = message;
        errorElement.style.display = isValid ? 'none' : 'block';
        input.classList.toggle('input-error', !isValid);

        return isValid;
    }


    inputsToValidate.forEach(input => {
        input.addEventListener('blur', () => validateField(input));
        input.addEventListener('input', () => validateField(input));
    });

    const mainForm = document.getElementById('insurance-form');
    if (!mainForm) return;
    mainForm.addEventListener('submit', (e) => {
        let isFormValid = true;
        inputsToValidate.forEach(input => {
            if (!validateField(input)) {
                isFormValid = false;
            }
        });

        if (!isFormValid) {
            e.preventDefault();
            const firstError = form.querySelector('.input-error');
            if (firstError) {
                firstError.focus();
            }
        }
    });
}

// sync visible ft/in from the hidden cm field on the Primary Contact tab
/**
 * Sync visible height dropdowns (ft/in) from the hidden cm field on the Primary Contact tab.
 * This is used after prefill (existing user) and on initialization.
 */
window.updateHeightFeetInchesFromCm = function () {
    const form = document.getElementById('primary-contact-content');
    if (!form) return;

    const heightInput = form.querySelector('#self-height');      // cm (hidden)
    const heightFeetInput = form.querySelector('#self-height-ft');
    const heightInchesInput = form.querySelector('#self-height-in');

    if (!heightInput || !heightFeetInput || !heightInchesInput) return;

    const cm = parseFloat(heightInput.value);
    if (!cm || cm <= 0) return;

    // Convert cm back to total inches, then to ft + in
    let totalInches = cm / 2.54;
    let feet = Math.floor(totalInches / 12);
    let inches = Math.round(totalInches - feet * 12);

    // Handle rounding pushing inches to 12
    if (inches === 12) {
        feet += 1;
        inches = 0;
    }

    heightFeetInput.value = String(feet);
    heightInchesInput.value = String(inches);
};

/**
 * Parse a full name string into first, middle, and last name components.
 * Used when loading existing records that have applicant_name as a single field.
 * 
 * Strategy:
 * - Single word: First Name only
 * - Two words: First Name + Last Name
 * - Three+ words: First Name + Middle Name(s) + Last Name
 * 
 * @param {string} fullName - The complete name string
 * @returns {object} - { firstName, middleName, lastName }
 */
window.parseFullNameToComponents = function(fullName) {
    if (!fullName || typeof fullName !== 'string') {
        return { firstName: '', middleName: '', lastName: '' };
    }
    
    const parts = fullName.trim().split(/\s+/).filter(p => p);
    
    if (parts.length === 0) {
        return { firstName: '', middleName: '', lastName: '' };
    } else if (parts.length === 1) {
        // Single name - put in first name
        return { firstName: parts[0], middleName: '', lastName: '' };
    } else if (parts.length === 2) {
        // Two parts - first and last
        return { firstName: parts[0], middleName: '', lastName: parts[1] };
    } else {
        // Three or more - first, middle (everything in between), last
        return {
            firstName: parts[0],
            middleName: parts.slice(1, -1).join(' '),
            lastName: parts[parts.length - 1]
        };
    }
};

/**
 * Populate the name fields from a full name string.
 * Used when loading existing records.
 * 
 * PATCH: Updated to use new field IDs (pc-fname, pc-mname, pc-lname)
 * 
 * @param {string} fullName - The complete name string to parse and populate
 */
window.populateNameFieldsFromFullName = function(fullName) {
    const form = document.getElementById('primary-contact-content');
    if (!form) return;
    
    // PATCH: Updated selectors to use new field IDs
    const firstNameInput = form.querySelector('#pc-fname');
    const middleNameInput = form.querySelector('#pc-mname');
    const lastNameInput = form.querySelector('#pc-lname');
    const hiddenFullNameInput = form.querySelector('#full-name');
    
    const { firstName, middleName, lastName } = window.parseFullNameToComponents(fullName);
    
    if (firstNameInput) {
        firstNameInput.value = firstName;
        firstNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (middleNameInput) {
        middleNameInput.value = middleName;
        middleNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (lastNameInput) {
        lastNameInput.value = lastName;
        lastNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Also set the hidden full name field
    if (hiddenFullNameInput) {
        hiddenFullNameInput.value = fullName;
    }
};

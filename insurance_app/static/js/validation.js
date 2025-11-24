/*
 * This script provides validation logic for various sections of the insurance form.
 * It is used by: Health_Insurance_Requirement_Form.html
 * The functions are called dynamically from script.js when their respective sections are loaded.
 */

/**
 * Initializes real-time and on-submit validation for the 'Applicant Details' section.
 * It checks for required fields and pattern mismatches.
 */

function initializePrimaryContactValidation() {
    const form = document.getElementById('primary-contact-content');
    if (!form) return;

    // --- UniqueID Generation Logic ---
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

    function generateUniqueId() {
        if (!fullNameInput || !aadhaarInput || !uniqueIdInput) return;
        const fullName = fullNameInput.value.trim().replace(/[^a-zA-Z0-9']/g, '');
        const aadhaar = aadhaarInput.value.trim();
        if (fullName && aadhaar && aadhaar.length === 5) {
            uniqueIdInput.value = `${fullName}_${aadhaar}`;
        } else {
            uniqueIdInput.value = '';
        }
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

    const debouncedGenerateId = debounce(generateUniqueId, 300);

    userTypeRadios.forEach(radio => radio.addEventListener('change', handleUserTypeChange));
    if (fullNameInput) fullNameInput.addEventListener('input', debouncedGenerateId);
    if (aadhaarInput) aadhaarInput.addEventListener('input', debouncedGenerateId);

    // Set initial state for UniqueID field
    handleUserTypeChange();
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
        } else if (input.validity.patternMismatch) {
            isValid = false;
            if (input.id === 'unique-id') {
                message = 'UniqueID must be in the format: FullName_AadhaarLast5Digits.';
            } else if (input.id === 'aadhaar-last5') {
                message = 'Aadhaar must be exactly 5 digits.';
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
        } else {
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

    heightFeetInput.value = feet ? String(feet) : '';
    heightInchesInput.value = inches ? String(inches) : '';
};

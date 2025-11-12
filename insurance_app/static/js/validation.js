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
    const phoneInput = form.querySelector('#phone');
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
        if (!fullNameInput || !phoneInput || !uniqueIdInput) return;
        const fullName = fullNameInput.value.trim().replace(/[^a-zA-Z0-9']/g, '');
        const phone = phoneInput.value.trim();
        if (fullName && phone) {
            uniqueIdInput.value = `${fullName}_${phone}`;
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
    if (phoneInput) phoneInput.addEventListener('input', debouncedGenerateId);
    
    // Set initial state for UniqueID field
    handleUserTypeChange();
    // --- End of UniqueID Logic ---

    // --- Health Vitals Calculations (All fields now in Primary Contact) ---
    const dobInput = form.querySelector('#self-dob');
    const ageInput = form.querySelector('#self-age');
    const heightInput = form.querySelector('#self-height');
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
        const updateBmi = () => {
            const bmi = calculateBmi(heightInput.value, weightInput.value);
            if (bmi !== null) {
                bmiInput.value = bmi;
            }
        };
        heightInput.addEventListener('input', updateBmi);
        weightInput.addEventListener('input', updateBmi);
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

        // Check for validity
        if (input.validity.valueMissing) {
            isValid = false;
            message = `${input.previousElementSibling.textContent.replace(':', '')} is required.`;
        } else if (input.validity.patternMismatch) {
            isValid = false;
            if (input.id === 'unique-id') {
                message = 'UniqueID must be in the format: FullName_PhoneNumber.';
            } else {
                message = `Invalid format for ${input.previousElementSibling.textContent.replace(':', '')}.`;
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
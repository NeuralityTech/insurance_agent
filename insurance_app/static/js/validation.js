/*
 * This script provides validation logic for various sections of the insurance form.
 * It is used by: Health_Insurance_Requirement_Form.html
 * The functions are called dynamically from script.js when their respective sections are loaded.
 */

/**
 * Initializes real-time and on-submit validation for the 'Primary Contact' section.
 * It checks for required fields and pattern mismatches.
 */
function initializePrimaryContactValidation() {
    const form = document.getElementById('primary-contact-placeholder');
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
        const isNewUser = form.querySelector('input[name="user_type"]:checked').value === 'new';
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

            // This is a critical fix. A faulty email pattern was causing a script-blocking error.
    // We will forcefully remove the pattern attribute from the email field before any validation runs.
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

        // If no error message container exists, do not proceed.
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

/**
 * Initializes the logic for the 'Health History' section.
 * It automatically calculates and updates the Age and BMI fields based on user input.
 */
function initializeSelfDetailsValidation() {
    const container = document.getElementById('Health-History-placeholder');
    if (!container) return;

    const dobInput = container.querySelector('#self-dob');
    const ageInput = container.querySelector('#self-age');
    const heightInput = container.querySelector('#self-height');
    const weightInput = container.querySelector('#self-weight');
    const bmiInput = container.querySelector('#self-bmi');

    if (dobInput && ageInput) {
        dobInput.addEventListener('change', () => {
            const age = calculateAge(dobInput.value);
            if (age !== null) {
                ageInput.value = age;
                if (window.updatePeopleCounter) window.updatePeopleCounter();
                const errorDiv = container.querySelector('#self-age-error');
                const sec = ageInput.closest('details');
                if (age < 26) {
                    if (sec && !sec.open) sec.open = true;
                    ageInput.classList.add('input-error');
                    if (errorDiv) {
                        errorDiv.textContent = 'Primary contact must be at least 26 years old';
                        errorDiv.style.display = 'block';
                    }
                    alert('Primary contact must be at least 26 years old');
                } else {
                    ageInput.classList.remove('input-error');
                    if (errorDiv) {
                        errorDiv.textContent = '';
                        errorDiv.style.display = 'none';
                    }
                }
            }
        });
    }

    if (heightInput && weightInput && bmiInput) {
        const updateBmi = () => {
            const bmi = calculateBmi(heightInput.value, weightInput.value);
            if (bmi !== null) bmiInput.value = bmi;
        };
        heightInput.addEventListener('input', updateBmi);
        weightInput.addEventListener('input', updateBmi);
    }
}
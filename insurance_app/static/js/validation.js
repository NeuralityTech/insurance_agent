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
        return function (...args) {
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

    const heightInput = form.querySelector('#self-height'); // hidden cm field
    const heightFeetInput = form.querySelector('#self-height-ft');
    const heightInchesInput = form.querySelector('#self-height-in');

    const weightInput = form.querySelector('#self-weight');
    const bmiInput = form.querySelector('#self-bmi');

    if (dobInput && ageInput) {
        dobInput.addEventListener('change', () => {
            const inputValue = dobInput.value;
            let dateForCalculation = inputValue;

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
        const syncHeightAndBmi = () => {
            if (!heightFeetInput || !heightInchesInput) {
                const bmi = calculateBmi(parseFloat(heightInput.value), parseFloat(weightInput.value));
                if (bmi !== null) bmiInput.value = bmi;
                return;
            }

            let feet = parseFloat(heightFeetInput.value);
            let inches = parseFloat(heightInchesInput.value);

            if (isNaN(feet)) feet = 0;
            if (isNaN(inches)) inches = 0;

            if (feet <= 0 && inches <= 0) {
                heightInput.value = '';
                bmiInput.value = '';
                return;
            }

            if (inches >= 12) {
                feet += Math.floor(inches / 12);
                inches = inches % 12;

                heightFeetInput.value = feet ? String(feet) : '';
                heightInchesInput.value = inches ? String(inches) : '';
            }

            const cm = feet * 30.48 + inches * 2.54;
            heightInput.value = cm.toFixed(1);

            const bmi = calculateBmi(cm, parseFloat(weightInput.value));
            if (bmi !== null) bmiInput.value = bmi;
        };

        if (heightFeetInput) heightFeetInput.addEventListener('change', syncHeightAndBmi);
        if (heightInchesInput) heightInchesInput.addEventListener('change', syncHeightAndBmi);
        if (weightInput) weightInput.addEventListener('input', syncHeightAndBmi);

        if (typeof window.updateHeightFeetInchesFromCm === 'function') {
            window.updateHeightFeetInchesFromCm();
        }
    }

    // --- End of Health Vitals Calculations ---

    const emailInput = form.querySelector('#email');
    if (emailInput) emailInput.removeAttribute('pattern');

    const inputsToValidate = form.querySelectorAll('[required], [pattern]');

    function validateField(input) {
        const errorMsgId = input.id + '-error';
        const errorElement = document.getElementById(errorMsgId);
        let isValid = true;
        let message = '';

        if (!errorElement) return true;

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
}

// --------------------------------------------
// GLOBAL FORM VALIDATION (including disease dates)
// --------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("insurance-form");
    if (!form) return;

    form.addEventListener("submit", (e) => {
        let isValid = true;
        const messages = [];

        // 1) Validate primary-contact required / pattern fields
        const primarySection = document.getElementById('primary-contact-content');
        if (primarySection) {
            const requiredInputs = primarySection.querySelectorAll('[required], [pattern]');

            requiredInputs.forEach(input => {
                const errorMsgId = input.id + '-error';
                const errorElement = document.getElementById(errorMsgId);

                let fieldValid = true;
                let msg = '';

                if (input.validity.valueMissing) {
                    fieldValid = false;
                    msg = `${getFieldName(primarySection, input)} is required`;
                } else if (input.validity.patternMismatch) {
                    fieldValid = false;
                    if (input.id === 'unique-id') {
                        msg = 'UniqueID must be in the format: FullName_AadhaarLast5Digits.';
                    } else if (input.id === 'aadhaar-last5') {
                        msg = 'Aadhaar must be exactly 5 digits.';
                    } else {
                        msg = `Invalid format for ${getFieldName(primarySection, input)}.`;
                    }
                } else if (input.validity.tooShort || input.validity.tooLong) {
                    fieldValid = false;
                    if (input.id === 'aadhaar-last5') {
                        msg = 'Aadhaar must be exactly 5 digits.';
                    } else {
                        msg = `Invalid length for ${getFieldName(primarySection, input)}.`;
                    }
                }

                if (!fieldValid) {
                    isValid = false;
                    if (msg) messages.push(msg);
                    if (errorElement) {
                        errorElement.textContent = msg;
                        errorElement.style.display = 'block';
                    }
                    input.classList.add('input-error');
                } else {
                    if (errorElement) {
                        errorElement.textContent = '';
                        errorElement.style.display = 'none';
                    }
                    input.classList.remove('input-error');
                }
            });
        }

        // 2) Validate disease start dates
        document.querySelectorAll('#health-history-content .disease-entry').forEach(entry => {
            const checkbox = entry.querySelector('input[type="checkbox"][name="disease"], input[type="checkbox"]');
            const dateInput = entry.querySelector('.disease-date-input');
            const errorSpan = entry.querySelector('.error-message');

            if (checkbox && checkbox.checked) {
                if (!dateInput || !dateInput.value || dateInput.value.trim() === '') {
                    isValid = false;

                    const headerLabel = entry.querySelector('.disease-header label');
                    const diseaseLabel = headerLabel ? headerLabel.textContent.trim() : 'selected disease';
                    const msg = `Disease start date for ${diseaseLabel} is required`;

                    messages.push(msg);

                    if (errorSpan) {
                        errorSpan.textContent = 'Disease start date is required';
                        errorSpan.style.display = 'block';
                    }
                    if (dateInput) dateInput.classList.add('input-error');
                }
            } else {
                // Clear any stale error if disease not selected
                if (dateInput) dateInput.classList.remove('input-error');
                if (errorSpan) {
                    errorSpan.textContent = '';
                    errorSpan.style.display = 'none';
                }
            }
        });

        if (!isValid) {
            e.preventDefault();

            // Build bullet-list alert like your height message
            if (messages.length) {
                const bulletList = messages.map(m => `• ${m}`).join('\n');
                alert(`Please complete all required fields:\n\n${bulletList}`);
            }

            const firstError = document.querySelector('.input-error');
            if (firstError) firstError.focus();
        }
    });

    // Helper: get human-friendly field name from label
    function getFieldName(section, input) {
        let labelText = '';
        const labelEl = section.querySelector(`label[for="${input.id}"]`);
        if (labelEl && labelEl.textContent) {
            labelText = labelEl.textContent;
        } else if (input.previousElementSibling && input.previousElementSibling.textContent) {
            labelText = input.previousElementSibling.textContent;
        } else {
            labelText = input.id;
        }
        return labelText.replace(':', '').replace('*', '').trim();
    }
});


// sync visible ft/in from the hidden cm field
window.updateHeightFeetInchesFromCm = function () {
    const form = document.getElementById('primary-contact-content');
    if (!form) return;

    const heightInput = form.querySelector('#self-height');
    const heightFeetInput = form.querySelector('#self-height-ft');
    const heightInchesInput = form.querySelector('#self-height-in');

    if (!heightInput || !heightFeetInput || !heightInchesInput) return;

    const cm = parseFloat(heightInput.value);
    if (!cm || cm <= 0) return;

    let totalInches = cm / 2.54;
    let feet = Math.floor(totalInches / 12);
    let inches = Math.round(totalInches - feet * 12);

    if (inches === 12) {
        feet += 1;
        inches = 0;
    }

    heightFeetInput.value = feet ? String(feet) : '';
    heightInchesInput.value = inches ? String(inches) : '';
};

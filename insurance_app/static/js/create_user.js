document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('create-user-form');
    const messageContainer = document.getElementById('message-container');

    const nameInput = document.getElementById('name');
    const userIdInput = document.getElementById('user_id');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm_password');
    const phoneInput = document.getElementById('phone_number');
    const roleSelect = document.getElementById('role');
    const supervisorGroup = document.getElementById('supervisor-group');
    const supervisorSelect = document.getElementById('supervisor_id');
    const togglePasswordBtn = document.querySelector('.toggle-password');

            const showError = (input, message) => {
        const formGroup = input.closest('.form-group');
        const errorDiv = formGroup.querySelector('.error-message');
        input.classList.add('is-invalid');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.add('is-visible');
        }
    };

            const clearError = (input) => {
        const formGroup = input.closest('.form-group');
        const errorDiv = formGroup.querySelector('.error-message');
        input.classList.remove('is-invalid');
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.classList.remove('is-visible');
        }
    };

    const validateName = () => {
        if (!/^[a-zA-Z0-9]+$/.test(nameInput.value.trim())) {
            showError(nameInput, "Only letters, spaces, and apostrophes.");
            return false;
        } else {
            clearError(nameInput);
            return true;
        }
    };

    const validateUserId = () => {
        if (!/^[a-zA-Z0-9]+$/.test(userIdInput.value.trim())) {
            showError(userIdInput, "Only letters and numbers are allowed.");
            return false;
        } else {
            clearError(userIdInput);
            return true;
        }
    };

    const validatePhone = () => {
        // Corrected the regex by removing the extra backslash
        if (!/^[6789]\d{9}$/.test(phoneInput.value.trim())) {
            showError(phoneInput, "Must be a 10-digit number starting with 6, 7, 8, or 9.");
            return false;
        } else {
            clearError(phoneInput);
            return true;
        }
    };

    const validatePassword = () => {
        const password = passwordInput.value;
        if (password.length < 6 || password.length > 10) {
            showError(passwordInput, "Password must be between 6 and 10 characters long.");
            return false;
        } else {
            clearError(passwordInput);
            return true;
        }
    };

    const validateConfirmPassword = () => {
        if (passwordInput.value !== confirmPasswordInput.value) {
            showError(confirmPasswordInput, "Passwords do not match.");
            return false;
        } else {
            clearError(confirmPasswordInput);
            return true;
        }
    };

    nameInput.addEventListener('input', validateName);
    userIdInput.addEventListener('input', validateUserId);
    phoneInput.addEventListener('input', validatePhone);
    passwordInput.addEventListener('input', () => {
        validatePassword();
        if (confirmPasswordInput.value) validateConfirmPassword();
    });
    confirmPasswordInput.addEventListener('input', validateConfirmPassword);

        if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            togglePasswordBtn.textContent = isPassword ? 'Hide' : 'Show';
        });
    }

    roleSelect.addEventListener('change', () => {
        if (roleSelect.value === 'agent') {
            supervisorGroup.classList.remove('is-hidden');
            supervisorSelect.setAttribute('required', 'required');
            fetchSupervisors();
        } else {
            supervisorGroup.classList.add('is-hidden');
            supervisorSelect.removeAttribute('required');
        }
    });

    async function fetchSupervisors() {
        try {
            const response = await fetch('/api/supervisors');
            if (!response.ok) throw new Error('Failed to fetch supervisors.');
            const supervisors = await response.json();
            supervisorSelect.innerHTML = '<option value="" disabled selected>Select a Supervisor</option>';
            supervisors.forEach(supervisor => {
                const option = document.createElement('option');
                option.value = supervisor.user_id;
                option.textContent = `${supervisor.name} (${supervisor.user_id})`;
                supervisorSelect.appendChild(option);
            });
        } catch (error) {
            messageContainer.textContent = error.message;
            messageContainer.className = 'error';
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageContainer.textContent = '';
        messageContainer.className = '';

        const isValid = [validateName(), validateUserId(), validatePhone(), validatePassword(), validateConfirmPassword()].every(Boolean);

        if (!isValid) return;

        const formData = new FormData(form);
        formData.delete('confirm_password');
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/api/create_user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'An unknown error occurred.');

            messageContainer.textContent = result.message;
            messageContainer.className = 'success';
            form.reset();
            document.querySelectorAll('.is-invalid').forEach(clearError);
            supervisorGroup.classList.add('is-hidden');
        } catch (error) {
            messageContainer.textContent = error.message;
            messageContainer.className = 'error';
        }
    });
});

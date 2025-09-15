document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search_user_id');
    const userDetailsContainer = document.getElementById('user-details-container');
    const messageContainer = document.getElementById('message-container');

    searchBtn.addEventListener('click', async () => {
        const userId = searchInput.value.trim();
        if (!userId) {
            showMessage('Please enter a User ID to search.', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/get_user/${userId}`);
            const data = await response.json();

            if (response.ok) {
                renderUserDetails(data);
                userDetailsContainer.classList.remove('is-hidden');
                clearMessage();
            } else {
                showMessage(data.error || 'User not found.', 'error');
                userDetailsContainer.classList.add('is-hidden');
            }
        } catch (error) {
            showMessage('An error occurred while fetching user data.', 'error');
            userDetailsContainer.classList.add('is-hidden');
        }
    });

    function renderUserDetails(user) {
        const form = document.getElementById('user-update-form');
        let supervisorField = '';
        if (user.role === 'agent') {
            supervisorField = `
            <div class="form-group">
                <label for="supervisor_id">Assign Supervisor</label>
                <select id="supervisor_id" name="supervisor_id" required>
                    <!-- Options will be populated dynamically -->
                </select>
            </div>`;
        }

        form.innerHTML = `
            <input type="hidden" id="user_id" name="user_id" value="${user.user_id}">
            <div class="form-row">
                <div class="form-group">
                    <label for="name">Full Name</label>
                    <input type="text" id="name" name="name" value="${user.name}" required>
                </div>
                <div class="form-group">
                    <label for="user_id_display">User ID</label>
                    <input type="text" id="user_id_display" name="user_id_display" value="${user.user_id}" disabled>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="gender">Gender</label>
                    <select id="gender" name="gender" required>
                        <option value="male" ${user.gender === 'male' ? 'selected' : ''}>Male</option>
                        <option value="female" ${user.gender === 'female' ? 'selected' : ''}>Female</option>
                        <option value="other" ${user.gender === 'other' ? 'selected' : ''}>Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="phone_number">Phone Number</label>
                    <input type="text" id="phone_number" name="phone_number" value="${user.phone_number}" required>
                </div>
            </div>
            <div class="form-row">
                 <div class="form-group">
                    <label for="role">Role</label>
                    <select id="role" name="role" required>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="agent" ${user.role === 'agent' ? 'selected' : ''}>Agent</option>
                        <option value="supervisor" ${user.role === 'supervisor' ? 'selected' : ''}>Supervisor</option>
                    </select>
                </div>
                <div id="supervisor-group" class="form-group ${user.role !== 'agent' ? 'is-hidden' : ''}">
                    <label for="supervisor_id">Assign Supervisor</label>
                    <select id="supervisor_id" name="supervisor_id">
                        <!-- Options will be populated dynamically -->
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn">Update User</button>
            </div>
        `;

        if (user.role === 'agent') {
            populateSupervisors(user.supervisor_id);
        }

        // (moved) Initial role handling is done after roleSelect is defined below.

        // --- Password Reset Form Handling ---
        const resetPasswordForm = document.getElementById('reset-password-form');
        if (resetPasswordForm) {
            resetPasswordForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const newPassword = document.getElementById('new_password');
                const confirmPassword = document.getElementById('confirm_password');
                const userId = document.getElementById('user_id').value; // Get user_id from the hidden input

                // Clear previous errors
                clearError(newPassword);
                clearError(confirmPassword);

                // Validation
                let isValid = true;
                if (newPassword.value.length < 6) {
                    showError(newPassword, 'Password must be at least 6 characters long.');
                    isValid = false;
                }
                if (newPassword.value !== confirmPassword.value) {
                    showError(confirmPassword, 'Passwords do not match.');
                    isValid = false;
                }

                if (!isValid) return;

                try {
                    const response = await fetch('/api/reset_password', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ 
                            user_id: userId,
                            new_password: newPassword.value 
                        }),
                    });

                    const result = await response.json();

                    if (response.ok) {
                        showMessage(result.message, 'success');
                        resetPasswordForm.reset();
                    } else {
                        showMessage(result.error || 'An unknown error occurred.', 'error');
                    }
                } catch (error) {
                    console.error('Error resetting password:', error);
                    showMessage('Failed to reset password due to a network error.', 'error');
                }
            });
        }

        // Attach event listeners after the form is rendered
        const roleSelect = document.getElementById('role');
        const supervisorGroup = document.getElementById('supervisor-group');

        roleSelect.addEventListener('change', () => {
            if (roleSelect.value === 'agent') {
                supervisorGroup.classList.remove('is-hidden');
                populateSupervisors(); // Repopulate without a default selection
            } else {
                supervisorGroup.classList.add('is-hidden');
            }
        });

        // Initial toggle based on current role value
        if (roleSelect.value === 'agent') {
            supervisorGroup.classList.remove('is-hidden');
        } else {
            supervisorGroup.classList.add('is-hidden');
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const updatedData = Object.fromEntries(formData.entries());

            try {
                const response = await fetch('/api/update_user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updatedData)
                });

                const result = await response.json();
                if (response.ok) {
                    showMessage('User updated successfully!', 'success');
                } else {
                    showMessage(result.error || 'Failed to update user.', 'error');
                }
            } catch (error) {
                showMessage('An error occurred while updating the user.', 'error');
            }
        });
    }

    async function populateSupervisors(selectedSupervisorId) {
        try {
            const response = await fetch('/api/supervisors');
            const supervisors = await response.json();
            const supervisorSelect = document.getElementById('supervisor_id');
            supervisorSelect.innerHTML = '<option value="">Select a Supervisor</option>';
            supervisors.forEach(supervisor => {
                const option = document.createElement('option');
                option.value = supervisor.user_id;
                option.textContent = supervisor.name;
                if (supervisor.user_id === selectedSupervisorId) {
                    option.selected = true;
                }
                supervisorSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load supervisors:', error);
        }
    }

    function showMessage(message, type) {
        messageContainer.textContent = message;
        messageContainer.className = type;
    }

    function clearMessage() {
        messageContainer.textContent = '';
        messageContainer.className = '';
    }

    // Helpers for field-level error messages used by reset password form
    function showError(inputEl, message) {
        if (!inputEl) return;
        const msgEl = inputEl.nextElementSibling;
        if (msgEl && msgEl.classList && msgEl.classList.contains('error-message')) {
            msgEl.textContent = message || '';
            msgEl.style.display = 'block';
        }
        inputEl.classList && inputEl.classList.add('input-error');
    }

    function clearError(inputEl) {
        if (!inputEl) return;
        const msgEl = inputEl.nextElementSibling;
        if (msgEl && msgEl.classList && msgEl.classList.contains('error-message')) {
            msgEl.textContent = '';
            msgEl.style.display = 'none';
        }
        inputEl.classList && inputEl.classList.remove('input-error');
    }
});

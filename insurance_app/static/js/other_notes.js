/*
 * This script handles the functionality for the 'Other Notes' section.
 * It is responsible for displaying the logged-in agent's ID and the current timestamp.
 * It is used by: Health_Insurance_Requirement_Form.html
 * The main function is called from script.js when the 'Other Notes' section is loaded.
 */

/**
 * Initializes the 'Other Notes' section by populating the user ID and timestamp.
 * This function is called dynamically from script.js.
 */
function initializeOtherNotes() {
    const userInfoContainer = document.getElementById('user-timestamp-info');
    const userId = localStorage.getItem('loggedInUserId');

    if (userInfoContainer && userId) {
        const now = new Date();
        // Format timestamp for readability, e.g., 30/07/2025, 07:57:13 PM
        const timestamp = now.toLocaleString('en-IN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        
        userInfoContainer.textContent = `Agent: ${userId} | Timestamp: ${timestamp}`;
    }
}

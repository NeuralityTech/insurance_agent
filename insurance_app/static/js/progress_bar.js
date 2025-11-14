/**
 * Progress Bar Module
 * Displays application progress across different stages with date tooltips
 */

(function() {
    'use strict';
    
    // Create array for the progress bar labels with corresponding date field names
    const PROGRESS_STAGES = [
        { 
            id: 'proposal-filled', 
            label: 'Opened', 
            dateField: 'first_created_at',
            fallbackFields: []
        },
        { 
            id: 'plans-created', 
            label: 'Submitted', 
            dateField: 'application_modified_at',
            fallbackFields: []
        },
        { 
            id: 'supervisor-approval', 
            label: 'Supervisor Approved', 
            dateField: 'supervisor_modified_at',
            fallbackFields: []
        },
        { 
            id: 'client-agreed', 
            label: 'Client Agreed', 
            dateField: 'client_modified_at',
            fallbackFields: []
        },
        { 
            id: 'submit-underwriter', 
            label: 'Submitted to Underwriter', 
            dateField: 'underwriter_modified_at',
            fallbackFields: []
        },
        { 
            id: 'policy-created', 
            label: 'Policy Created', 
            dateField: 'policy_outcome_modified_at',
            fallbackFields: []
        }
    ];

    /**
     * Format timestamp for display
     * @param {string} timestampStr - Timestamp string from database
     * @returns {string} Formatted date string
     */
    function formatTimestamp(timestampStr) {
        if (!timestampStr) return null;
        
        try {
            let dt = null;
            
            // Try ISO format first
            try {
                dt = new Date(timestampStr.replace('Z', ''));
                if (isNaN(dt.getTime())) dt = null;
            } catch (e) {}
            
            // Try application format: YYYY-MM-DD_HH-MM-SS
            if (!dt && timestampStr.includes('_')) {
                try {
                    const parts = timestampStr.split('_');
                    if (parts.length === 2) {
                        const datePart = parts[0];
                        const timePart = parts[1].replace(/-/g, ':');
                        dt = new Date(`${datePart}T${timePart}`);
                    }
                } catch (e) {}
            }
            
            if (dt && !isNaN(dt.getTime())) {
                // Convert to IST timezone
                return dt.toLocaleString('en-IN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'Asia/Kolkata'
                });
            }
            
            return timestampStr;
        } catch (e) {
            console.warn('Error formatting timestamp:', e);
            return timestampStr;
        }
    }

    /**
     * Get date value with fallbacks
     * @param {Object} data - Submission data
     * @param {string} primaryField - Primary field name
     * @param {Array} fallbackFields - Array of fallback field names
     * @returns {string} Date value or null
     */
    function getDateWithFallback(data, primaryField, fallbackFields = []) {
        if (!data) return null;
        
        // Try primary field
        if (data[primaryField]) {
            return data[primaryField];
        }
        
        // Try fallback fields
        for (const field of fallbackFields) {
            if (data[field]) {
                return data[field];
            }
        }
        
        return null;
    }

    /**
     * Get date data from submission
     * @returns {Object|Promise} Object with date fields or Promise resolving to object
     */
    function getDateData() {
        // Try to get data from global variable (set when loading submission)
        if (window.currentSubmissionData) {
            return window.currentSubmissionData;
        }
        
        // Fallback: try to get from URL and fetch
        const urlParams = new URLSearchParams(window.location.search);
        const uid = urlParams.get('uid') || urlParams.get('unique_id');
        
        if (uid) {
            // Return a promise that will be resolved when data is fetched
            return fetch(`/api/agent/submission/${encodeURIComponent(uid)}`)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null);
        }
        
        return null;
    }

    /**
     * Create and render the progress bar
     * @param {number} currentStage - Index of current stage (0-based)
     * @param {number} fillPercentage - Percentage of line to fill (0-100)
     * @param {Object} dateData - Object containing date information
     */
    function createProgressBar(currentStage = -1, fillPercentage = 0, dateData = null) {
        const container = document.createElement('div');
        container.className = 'progress-bar-container';

        const wrapper = document.createElement('div');
        wrapper.className = 'progress-bar-wrapper';

        // Create progress line
        const line = document.createElement('div');
        line.className = 'progress-line';
        
        const lineFill = document.createElement('div');
        lineFill.className = 'progress-line-fill';
        lineFill.style.width = fillPercentage + '%';
        
        line.appendChild(lineFill);
        wrapper.appendChild(line);

        // Create progress steps
        PROGRESS_STAGES.forEach((stage, index) => {
            const step = document.createElement('div');
            step.className = 'progress-step';
            
            // Determine step state
            if (index < currentStage) {
                step.classList.add('completed');
            } else if (index === currentStage) {
                step.classList.add('active');
            }

            // Create dot
            const dot = document.createElement('div');
            dot.className = 'progress-dot';
            
            // Add tooltip if date data is available
            if (dateData) {
                const dateValue = getDateWithFallback(
                    dateData, 
                    stage.dateField, 
                    stage.fallbackFields || []
                );
                
                if (dateValue) {
                    const formattedDate = formatTimestamp(dateValue);
                    if (formattedDate) {
                        dot.setAttribute('title', formattedDate);
                        dot.style.cursor = 'help';
                        
                        // Add a data attribute for custom tooltip styling
                        dot.setAttribute('data-tooltip', formattedDate);
                    }
                }
            }
            
            step.appendChild(dot);

            // Create label
            const label = document.createElement('div');
            label.className = 'progress-label';
            label.textContent = stage.label;
            step.appendChild(label);

            wrapper.appendChild(step);
        });

        container.appendChild(wrapper);
        return container;
    }

    /**
     * Initialize progress bar on the page
     * @param {string} targetId - ID of element to insert progress bar before
     * @param {number} currentStage - Current stage index
     * @param {number} fillPercentage - Fill percentage
     */
    async function initializeProgressBar(targetId = 'insurance-form', currentStage = -1, fillPercentage = 0) {
        const targetElement = document.getElementById(targetId);
        if (!targetElement) {
            console.warn('Target element not found for progress bar');
            return;
        }

        // Get date data
        let dateData = getDateData();
        if (dateData instanceof Promise) {
            dateData = await dateData;
        }

        const progressBar = createProgressBar(currentStage, fillPercentage, dateData);
        targetElement.parentNode.insertBefore(progressBar, targetElement);
    }

    /**
     * Initialize progress bar for the new applicant request form
     */
    function initializeFormProgressBar() {
        initializeProgressBar('insurance-form', 0, 8.5);
    }

    // Make functions globally available
    window.initializeProgressBar = initializeProgressBar;
    window.initializeFormProgressBar = initializeFormProgressBar;

    // Always wait for DOM ready before initializing
    document.addEventListener('DOMContentLoaded', () => {
        const target = document.getElementById('insurance-form');
        if (target) initializeFormProgressBar();
    });


    // ==================================
    // UPDATE PROGRESS BAR BASED ON STATUS
    // ==================================
    window.updateProgressBar = function(status) {
        if (!status) return;

        const steps = document.querySelectorAll('.progress-step');
        const fill = document.querySelector('.progress-line-fill');
        if (!steps.length || !fill) return;

        const normalized = status.toString().trim().toUpperCase();

        // --- Stage order ---
        const stepOrder = [
            'OPEN',                // 0 - Opened
            'SUBMITTED',           // 1 - Submitted
            'SUP_APPROVED',        // 2 - Supervisor Approved
            'CLIENT_AGREED',       // 3 - Client Agreed
            'WITH_UW',             // 4 - Submitted to Underwriter
            'POLICY_CREATED'       // 5 - Policy Created
        ];

        // --- Aliases ---
        const aliases = {
            'APPLICATION_FILLED': 'OPEN',
            'SUP_REVIEW': 'SUBMITTED',
            'UW_APPROVED': 'WITH_UW',
            'UNDERWRITER_REVIEW': 'WITH_UW',
            'UW_REJECTED': 'WITH_UW',
            'CLIENT_APPROVED': 'CLIENT_AGREED',
            'CLOSED': 'POLICY_CREATED'
        };

        // Resolve status for index calculation
        let resolved = normalized;
        if (normalized === 'SUP_REJECTED') {
            resolved = 'SUBMITTED';
        } else if (normalized === 'POLICY_DENIED') {
            resolved = 'POLICY_CREATED';
        } else {
            resolved = aliases[normalized] || normalized;
        }

        const currentIndex = stepOrder.indexOf(resolved);

        // --- Reset all states ---
        steps.forEach(step => step.classList.remove('completed', 'active'));

        // Handle POLICY_DENIED - change last step label
        const lastStep = steps[steps.length - 1];
        const lastLabel = lastStep ? lastStep.querySelector('.progress-label') : null;
        if (lastLabel) {
            if (normalized === 'POLICY_DENIED') {
                lastLabel.textContent = 'Policy Denied';
            } else {
                lastLabel.textContent = 'Policy Created';
            }
        }

        // --- Apply new states ---
        if (currentIndex >= 0) {
            steps.forEach((step, index) => {
                if (index <= currentIndex) step.classList.add('completed'); // mark current as completed too
            });

            // Set 'next' stage as active
            if (currentIndex < steps.length - 1) {
                const nextIndex = currentIndex + 1;
                steps[nextIndex].classList.add('active');
            }

            // --- Custom percentage mapping ---
            const stagePercents = [0, 25, 42, 58.5, 75, 92, 100];

            // Use custom percent if available, otherwise fallback
            const pct = stagePercents[Math.min(currentIndex + 1, stagePercents.length - 1)] ?? 0;
            fill.style.width = pct + '%';
        } else {
            // Unknown status
            fill.style.width = '0%';
            steps[0].classList.add('active');
        }
    };

})();
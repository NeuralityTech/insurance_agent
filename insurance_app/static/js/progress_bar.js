(function() {
    'use strict';
    
    const PROGRESS_STAGES = [
        { id: 'proposal-filled', label: 'Opened', dateField: 'timestamp', fallbackFields: ['first_created_at', 'timestamp'] },
        { id: 'plans-created', label: 'Submitted', dateField: 'supervisor_modified_at', fallbackFields: ['timestamp'] },
        { id: 'supervisor-approval', label: 'Supervisor Approved', dateField: 'supervisor_modified_at', fallbackFields: [] },
        { id: 'client-agreed', label: 'Client Agreed', dateField: 'client_agreed_at', fallbackFields: ['close_status_modified_at'] },
        { id: 'submit-underwriter', label: 'Submitted to Underwriter', dateField: 'underwriter_modified_at', fallbackFields: [] },
        { id: 'policy-created', label: 'Policy Created', dateField: 'policy_outcome_modified_at', fallbackFields: ['close_status_modified_at'] }
    ];

    // Comprehensive status mapping - maps all known statuses to the step that is COMPLETED
    // The "active" step will be currentStep + 1 (unless we're at the final step)
    const STATUS_TO_STEP = {
        // Step 0: Opened/Draft - step 0 is completed, step 1 is active
        'OPEN': 0,
        '': 0,
        'APPLICATION_FILLED': 0,
        
        // Step 1: Submitted for review - steps 0-1 completed, step 2 is active
        'SUP_REVIEW': 1,
        'SUBMITTED': 1,
        
        // Step 2: Supervisor Approved - steps 0-2 completed, step 3 is active
        'SUP_APPROVED': 2,
        'SUPERVISOR_APPROVED': 2,
        
        // Step 3: Client Agreed - steps 0-3 completed, step 4 is active
        'CLIENT_AGREED': 3,
        'CLIENT_APPROVED': 3,
        
        // Step 4: With Underwriter - steps 0-4 completed, step 5 is active
        'WITH_UW': 4,
        'UW_REVIEW': 4,
        'UNDERWRITER_REVIEW': 4,
        'UW_APPROVED': 4,
        'UW_REJECTED': 4,
        
        // Step 5: Policy Created/Denied (final) - ALL steps completed, no active step
        'POLICY_CREATED': 5,
        'POLICY_DENIED': 5,
        'POLICY_REJECTED': 5,
        'CLOSED': 5
    };

    // Statuses that indicate rejection/denial (for special styling)
    const DENIED_STATUSES = ['POLICY_DENIED', 'POLICY_REJECTED', 'SUP_REJECTED'];

    function formatTimestampCompact(s) {
        if (!s) return '';
        try {
            if (/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(s)) {
                // Convert underscore format to readable
                const parts = s.split('_');
                const datePart = parts[0];
                const timePart = parts[1].replace(/-/g, ':');
                s = `${datePart}T${timePart}`;
            }
            
            let d = new Date(s.replace('Z', ''));
            if (isNaN(d.getTime())) {
                // Try alternate parsing
                if (s.includes('_')) {
                    const p = s.split('_');
                    d = new Date(p[0] + 'T' + p[1].replace(/-/g, ':'));
                }
            }
            
            if (d && !isNaN(d.getTime())) {
                return d.toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'Asia/Kolkata'
                }).replace(',', '');
            }
            return s;
        } catch (e) {
            console.warn('Error formatting timestamp:', e);
            return s;
        }
    }

    function getDateWithFallback(obj, field, fallbacks = []) {
        if (!obj) return null;
        if (obj[field]) return obj[field];
        for (const f of fallbacks) {
            if (obj[f]) return obj[f];
        }
        return null;
    }

    async function getClientAgreedTimestamp(uid) {
        if (!uid) return null;
        try {
            const r = await fetch('/api/agent/application_status_history/' + encodeURIComponent(uid));
            if (!r.ok) return null;
            const h = await r.json();
            if (!Array.isArray(h)) return null;
            const row = h.find(x => {
                const s = (x.application_status || '').toUpperCase().trim();
                return s === 'CLIENT_AGREED' || s === 'CLIENT_APPROVED';
            });
            return row ? (row.application_modified_at || row.created_at || null) : null;
        } catch (e) {
            console.warn('Error fetching client agreed timestamp:', e);
            return null;
        }
    }

    /**
     * Gets submission data from various sources
     * @returns {Promise<Object|null>} The submission data or null
     */
    async function getDateData() {
        // Try window.currentSubmissionData first
        let d = window.currentSubmissionData || null;
        let uid = d?.unique_id || d?.uniqueId || null;
        
        // Try to get uid from URL if not in data
        if (!uid) {
            const p = new URLSearchParams(location.search);
            uid = p.get('uid') || p.get('unique_id');
        }
        
        // Try to get uid from localStorage
        if (!uid) {
            uid = localStorage.getItem('currentUniqueId');
        }
        
        // Fetch data if we have uid but no data
        if (!d && uid) {
            try {
                const r = await fetch('/api/agent/submission/' + encodeURIComponent(uid));
                if (r.ok) {
                    d = await r.json();
                    // Cache for future use
                    window.currentSubmissionData = d;
                }
            } catch (e) {
                console.warn('Error fetching submission data:', e);
            }
        }
        
        if (!d) return null;

        // Get uid for client agreed timestamp lookup
        if (!uid) uid = d.unique_id || d.uniqueId;

        // Try to populate client_agreed_at if missing
        if (uid && !d.client_agreed_at) {
            const ts = await getClientAgreedTimestamp(uid);
            if (ts) {
                d.client_agreed_at = ts;
            } else if (d.close_status_modified_at) {
                const s = (d.close_status || '').toUpperCase().trim();
                if (s === 'CLIENT_AGREED' || s === 'CLIENT_APPROVED') {
                    d.client_agreed_at = d.close_status_modified_at;
                }
            }
        }
        
        return d;
    }

    /**
     * Normalizes a status string for comparison
     * @param {string} status - The status to normalize
     * @returns {string} The normalized status
     */
    function normalizeStatus(status) {
        if (!status) return '';
        return String(status).trim().toUpperCase().replace(/[\s-]+/g, '_');
    }

    /**
     * Gets the completed step index for a given status
     * This represents the last step that is COMPLETED for this status
     * @param {string} status - The status string
     * @returns {number} The step index (0-5), or -1 if unknown
     */
    function getStepForStatus(status) {
        const normalized = normalizeStatus(status);
        const step = STATUS_TO_STEP[normalized];
        return step !== undefined ? step : -1;
    }

    /**
     * Checks if a status represents a denied/rejected state
     * @param {string} status - The status to check
     * @returns {boolean} True if denied/rejected
     */
    function isDeniedStatus(status) {
        const normalized = normalizeStatus(status);
        return DENIED_STATUSES.includes(normalized);
    }

    /**
     * Calculates the fill percentage based on completed step
     * The fill should reach TO the active step (one ahead of completed)
     * @param {number} completedStep - The last completed step index
     * @param {boolean} isFinal - Whether this is the final step
     * @returns {number} Fill percentage
     */
    function calculateFillPercent(completedStep, isFinal = false) {
        const LAST_STEP = PROGRESS_STAGES.length - 1;
        
        // If final step is completed, fill to 100%
        if (isFinal || completedStep >= LAST_STEP) {
            return 100;
        }
        
        // Fill percentages that reach TO the next (active) step
        // Step 0 completed -> fill reaches to step 1 position
        // Step 1 completed -> fill reaches to step 2 position
        // etc.
        const fillPercentages = {
            0: 25,   // Opened completed, Submitted is active
            1: 40,   // Submitted completed, Supervisor Approved is active
            2: 60,   // Supervisor Approved completed, Client Agreed is active
            3: 75,   // Client Agreed completed, Submitted to UW is active
            4: 90,   // With UW completed, Policy Created is active
            5: 100   // All completed
        };
        
        return fillPercentages[completedStep] || 0;
    }

    /**
     * Creates the progress bar HTML element
     * @param {number} completedStep - Last completed step index (0-5)
     * @param {number} fillPercent - Fill percentage for the progress line
     * @param {Object|null} data - Submission data for timestamps
     * @param {boolean} isDenied - Whether the final status is denied
     * @returns {HTMLElement} The progress bar container element
     */
    function createProgressBar(completedStep = -1, fillPercent = 0, data = null, isDenied = false) {
        const box = document.createElement('div');
        box.className = 'progress-bar-container';
        
        const wrap = document.createElement('div');
        wrap.className = 'progress-bar-wrapper';

        const line = document.createElement('div');
        line.className = 'progress-line';
        const fill = document.createElement('div');
        fill.className = 'progress-line-fill';
        fill.style.width = fillPercent + '%';
        line.appendChild(fill);
        wrap.appendChild(line);

        const LAST_STEP = PROGRESS_STAGES.length - 1;
        const isFinalCompleted = completedStep >= LAST_STEP;
        // Active step is one ahead of completed, unless final is completed
        const activeStepIndex = isFinalCompleted ? -1 : completedStep + 1;

        PROGRESS_STAGES.forEach((stage, index) => {
            const step = document.createElement('div');
            step.className = 'progress-step';
            step.dataset.stepIndex = index;

            // Determine step state:
            // - Completed: index <= completedStep
            // - Active: index === completedStep + 1 (and not past final)
            if (index <= completedStep) {
                step.classList.add('completed');
                if (index === LAST_STEP && isDenied) {
                    step.classList.add('denied');
                }
            } else if (index === activeStepIndex) {
                step.classList.add('active');
            }

            const dot = document.createElement('div');
            dot.className = 'progress-dot';
            step.appendChild(dot);

            const meta = document.createElement('div');
            meta.className = 'progress-meta';

            const label = document.createElement('div');
            label.className = 'progress-label';
            
            // Update label for final step if denied
            if (index === LAST_STEP && isDenied) {
                label.textContent = 'Policy Denied';
            } else {
                label.textContent = stage.label;
            }
            meta.appendChild(label);

            // Add timestamp only for COMPLETED steps (not active)
            const ts = document.createElement('div');
            ts.className = 'progress-timestamp';

            if (data && index <= completedStep) {
                let raw = getDateWithFallback(data, stage.dateField, stage.fallbackFields);
                
                // For final step, use policy outcome timestamp
                if (index === LAST_STEP) {
                    raw = data.policy_outcome_modified_at || data.close_status_modified_at || raw;
                    // Don't show timestamp for denied policies
                    if (isDenied) {
                        raw = null;
                    }
                }
                
                if (raw) {
                    ts.textContent = formatTimestampCompact(raw);
                    ts.title = raw;
                }
            }

            meta.appendChild(ts);
            step.appendChild(meta);
            wrap.appendChild(step);
        });

        box.appendChild(wrap);
        return box;
    }

    /**
     * Initializes the progress bar for a form
     * @param {string} formId - ID of the form element to attach progress bar to
     * @param {number} initialStep - Initial completed step index
     * @param {number} initialPercent - Initial fill percentage
     */
    async function initializeProgressBar(formId = 'insurance-form', initialStep = 0, initialPercent = 8.5) {
        const el = document.getElementById(formId);
        if (!el) {
            console.warn('Progress bar: Form element not found:', formId);
            return;
        }

        // Remove existing progress bar if any
        const existing = document.querySelector('.progress-bar-container');
        if (existing) {
            existing.remove();
        }

        let data = await getDateData();
        const bar = createProgressBar(initialStep, initialPercent, data, false);
        el.parentNode.insertBefore(bar, el);
        
        console.log('Progress bar initialized with completed step:', initialStep);
    }

    function initializeFormProgressBar() {
        // For new forms, step 0 (Opened) is completed, step 1 (Submitted) active
        initializeProgressBar('insurance-form', 0, 25);
    }

    /**
     * Updates the progress bar based on a status string
     * 
     * Logic:
     * - completedStep = the step index that corresponds to the current status
     * - All steps up to and including completedStep are marked "completed"
     * - The step AFTER completedStep (completedStep + 1) is marked "active"
     * - Exception: If completedStep is the final step, ALL steps are completed (no active)
     * 
     * @param {string} status - The application status
     */
    async function updateProgressBar(status) {
        if (!status && status !== '') {
            console.warn('updateProgressBar called without status');
            return;
        }

        console.log('Updating progress bar with status:', status);

        // Ensure progress bar exists, create if not
        let container = document.querySelector('.progress-bar-container');
        if (!container) {
            const form = document.getElementById('insurance-form');
            if (form) {
                await initializeProgressBar('insurance-form', 0, 0);
                container = document.querySelector('.progress-bar-container');
            }
            if (!container) {
                console.warn('Could not create progress bar container');
                return;
            }
        }

        const steps = container.querySelectorAll('.progress-step');
        const fill = container.querySelector('.progress-line-fill');
        
        if (!steps.length || !fill) {
            console.warn('Progress bar elements not found');
            return;
        }

        const LAST_STEP = steps.length - 1;
        const normalized = normalizeStatus(status);
        const completedStep = getStepForStatus(normalized);
        const isDenied = isDeniedStatus(normalized);
        const isFinalCompleted = completedStep >= LAST_STEP;
        
        // Active step is one ahead of completed, unless we're at the final step
        const activeStepIndex = isFinalCompleted ? -1 : completedStep + 1;

        console.log('Normalized status:', normalized, 
                    'Completed step:', completedStep, 
                    'Active step:', activeStepIndex,
                    'Denied:', isDenied);

        // Get data for timestamps
        let data = await getDateData();

        // Clear all states
        steps.forEach(step => {
            step.classList.remove('completed', 'active', 'denied');
            const ts = step.querySelector('.progress-timestamp');
            if (ts) ts.remove();
        });

        // Update final step label
        const lastStepEl = steps[LAST_STEP];
        const label = lastStepEl?.querySelector('.progress-label');
        if (label) {
            label.textContent = isDenied ? 'Policy Denied' : 'Policy Created';
        }

        if (completedStep >= 0) {
            steps.forEach((step, index) => {
                // Mark completed steps (all steps up to and including completedStep)
                if (index <= completedStep) {
                    step.classList.add('completed');
                    
                    // Add denied class to final step if policy was denied
                    if (index === LAST_STEP && isDenied) {
                        step.classList.add('denied');
                    }

                    // Add timestamps for completed steps
                    if (data) {
                        const stage = PROGRESS_STAGES[index];
                        let raw = getDateWithFallback(data, stage.dateField, stage.fallbackFields || []);

                        // Special handling for final step
                        if (index === LAST_STEP) {
                            if (isDenied) {
                                raw = null; // Don't show timestamp for denied
                            } else {
                                raw = data.policy_outcome_modified_at || data.close_status_modified_at || raw;
                            }
                        }

                        if (raw) {
                            const ts = document.createElement('div');
                            ts.className = 'progress-timestamp';
                            ts.textContent = formatTimestampCompact(raw);
                            ts.title = raw;
                            step.appendChild(ts);
                        }
                    }
                }
                // Mark the active step (one ahead of completed, if not at final)
                else if (index === activeStepIndex) {
                    step.classList.add('active');
                }
            });

            // Update fill percentage
            fill.style.width = calculateFillPercent(completedStep, isFinalCompleted) + '%';
        } else {
            // Unknown status - show first step as active (nothing completed yet)
            steps[0]?.classList.add('active');
            fill.style.width = '0%';
            console.warn('Unknown status:', status);
        }
    }

    // Expose functions globally
    window.initializeProgressBar = initializeProgressBar;
    window.initializeFormProgressBar = initializeFormProgressBar;
    window.updateProgressBar = updateProgressBar;
    
    // Also expose utility functions for debugging
    window._progressBarUtils = {
        normalizeStatus,
        getStepForStatus,
        isDeniedStatus,
        STATUS_TO_STEP,
        getDateData,
        calculateFillPercent
    };

    // Auto-initialize on DOMContentLoaded for new applicant forms
    document.addEventListener('DOMContentLoaded', () => {
        // Only auto-init for new applicant form, not existing applicant form
        const isExistingForm = window.location.pathname.includes('Existing_Applicant');
        if (!isExistingForm && document.getElementById('insurance-form')) {
            initializeFormProgressBar();
        }
    });

})();

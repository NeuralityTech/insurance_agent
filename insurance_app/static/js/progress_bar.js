(function() {
    'use strict';
    
    const PROGRESS_STAGES = [
        { id: 'proposal-filled', label: 'Opened', dateField: 'timestamp', fallbackFields: ['timestamp'] },
        { id: 'plans-created', label: 'Submitted', dateField: 'timestamp', fallbackFields: ['timestamp'] },
        { id: 'supervisor-approval', label: 'Supervisor Approved', dateField: 'supervisor_modified_at', fallbackFields: [] },
        { id: 'client-agreed', label: 'Client Agreed', dateField: 'client_agreed_at', fallbackFields: [] },
        { id: 'submit-underwriter', label: 'Submitted to Underwriter', dateField: 'underwriter_modified_at', fallbackFields: [] },
        { id: 'policy-created', label: 'Policy Created', dateField: 'policy_outcome_modified_at', fallbackFields: ['close_status_modified_at'] }
    ];

    function formatTimestampCompact(s) {
        if (!s) return '';
        try {
            if (/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(s)) return s;
            let d = null;
            try { d = new Date(s.replace('Z','')); if (isNaN(d)) d = null; } catch(e){}
            if (!d && s.includes('_')) {
                try {
                    const p = s.split('_');
                    d = new Date(p[0] + 'T' + p[1].replace(/-/g, ':'));
                } catch(e){}
            }
            if (d && !isNaN(d)) {
                return d.toLocaleString('en-IN',{
                    day:'2-digit',month:'short',year:'numeric',
                    hour:'2-digit',minute:'2-digit',hour12:true,
                    timeZone:'Asia/Kolkata'
                }).replace(',','');
            }
            return s;
        } catch(e){ return s; }
    }

    function getDateWithFallback(obj, field, fallbacks=[]) {
        if (!obj) return null;
        if (obj[field]) return obj[field];
        for (const f of fallbacks) if (obj[f]) return obj[f];
        return null;
    }

    async function getClientAgreedTimestamp(uid) {
        try {
            const r = await fetch('/api/agent/application_status_history/' + encodeURIComponent(uid));
            if (!r.ok) return null;
            const h = await r.json();
            if (!Array.isArray(h)) return null;
            const row = h.find(x => {
                const s = (x.application_status||'').toUpperCase().trim();
                return s==='CLIENT_AGREED' || s==='CLIENT_APPROVED';
            });
            return row ? (row.application_modified_at || row.created_at || null) : null;
        } catch(e){ return null; }
    }

    async function getDateData() {
        let d = window.currentSubmissionData || null;
        let uid = d?.unique_id || d?.uniqueId || null;
        if (!uid) {
            const p = new URLSearchParams(location.search);
            uid = p.get('uid') || p.get('unique_id');
        }
        if (!d && uid) {
            try {
                const r = await fetch('/api/agent/submission/' + encodeURIComponent(uid));
                if (r.ok) d = await r.json();
            } catch(e){}
        }
        if (!d) return null;

        if (!uid) uid = d.unique_id || d.uniqueId;

        if (uid && !d.client_agreed_at) {
            const ts = await getClientAgreedTimestamp(uid);
            if (ts) d.client_agreed_at = ts;
            else if (d.close_status_modified_at) {
                const s = (d.close_status||'').toUpperCase().trim();
                if (s==='CLIENT_AGREED' || s==='CLIENT_APPROVED') d.client_agreed_at = d.close_status_modified_at;
            }
        }
        return d;
    }

    function createProgressBar(stage=-1, pct=0, data=null) {
        const box = document.createElement('div');
        box.className = 'progress-bar-container';
        const wrap = document.createElement('div');
        wrap.className = 'progress-bar-wrapper';

        const line = document.createElement('div');
        line.className = 'progress-line';
        const fill = document.createElement('div');
        fill.className = 'progress-line-fill';
        fill.style.width = pct + '%';
        line.appendChild(fill);
        wrap.appendChild(line);

        const LAST = PROGRESS_STAGES.length - 1;

        PROGRESS_STAGES.forEach((st, i) => {
            const step = document.createElement('div');
            step.className = 'progress-step';

            if (i < stage) step.classList.add('completed');
            if (i === stage && i !== LAST) step.classList.add('active');
            if (i === LAST && stage === LAST) step.classList.add('completed');

            const dot = document.createElement('div');
            dot.className = 'progress-dot';
            step.appendChild(dot);

            const meta = document.createElement('div');
            meta.className = 'progress-meta';

            const label = document.createElement('div');
            label.className = 'progress-label';
            label.textContent = st.label;
            meta.appendChild(label);

            const ts = document.createElement('div');
            ts.className = 'progress-timestamp';

            if (data) {
                let raw = null;
                if (i <= stage) raw = getDateWithFallback(data, st.dateField, st.fallbackFields);
                if (i === LAST && stage === LAST) {
                    raw = data.policy_outcome_modified_at || data.close_status_modified_at || raw;
                } else if (i === LAST && stage < LAST) {
                    raw = null;
                }
                ts.textContent = raw ? formatTimestampCompact(raw) : '';
                ts.title = raw || '';
            }

            meta.appendChild(ts);
            step.appendChild(meta);
            wrap.appendChild(step);
        });

        box.appendChild(wrap);
        return box;
    }

    async function initializeProgressBar(id='insurance-form', stage=0, pct=8.5) {
        const el = document.getElementById(id);
        if (!el) return;
        let d = getDateData();
        if (d instanceof Promise) d = await d;
        const bar = createProgressBar(stage, pct, d);
        el.parentNode.insertBefore(bar, el);
    }

    function initializeFormProgressBar() {
        initializeProgressBar('insurance-form', 0, 8.5);
    }

    window.initializeProgressBar = initializeProgressBar;
    window.initializeFormProgressBar = initializeFormProgressBar;

    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('insurance-form')) initializeFormProgressBar();
    });

    window.updateProgressBar = async function(status) {
        if (!status) return;

        const steps = document.querySelectorAll('.progress-step');
        const fill = document.querySelector('.progress-line-fill');
        if (!steps.length || !fill) return;

        const normalized = status.toString().trim().toUpperCase();
        const isDenied = (normalized === 'POLICY_DENIED' || normalized === 'POLICY_REJECTED');

        const stepOrder = [
            'OPEN',
            'SUBMITTED',
            'SUP_APPROVED',
            'CLIENT_AGREED',
            'WITH_UW',
            'POLICY_CREATED'
        ];

        const aliases = {
            'APPLICATION_FILLED': 'OPEN',
            'SUP_REVIEW': 'SUBMITTED',
            'UW_APPROVED': 'WITH_UW',
            'UNDERWRITER_REVIEW': 'WITH_UW',
            'UW_REJECTED': 'WITH_UW',
            'CLIENT_APPROVED': 'CLIENT_AGREED',
            'CLOSED': 'POLICY_CREATED',
            'POLICY_DENIED': 'POLICY_CREATED',  
            'POLICY_REJECTED': 'POLICY_CREATED'
        };

        const resolved = aliases[normalized] || normalized;
        const currentIndex = stepOrder.indexOf(resolved);

        let data = getDateData();
        if (data instanceof Promise) data = await data;

        steps.forEach(step => {
            step.classList.remove('completed', 'active');
            const ts = step.querySelector('.progress-timestamp');
            if (ts) ts.remove();
        });

        const lastStep = steps[steps.length - 1];
        const label = lastStep.querySelector('.progress-label');
        if (label) {
            label.textContent = isDenied ? 'Policy Denied' : 'Policy Created';
        }

        if (currentIndex >= 0) {
            steps.forEach((step, index) => {
                if (index <= currentIndex) {
                    // COMPLETED STEPS
                    step.classList.add('completed');

                    const st = PROGRESS_STAGES[index];
                    let raw = getDateWithFallback(data, st.dateField, st.fallbackFields || []);

                    // FINAL STEP 
                    if (index === steps.length - 1) {

                        // If policy is denied, DO NOT SHOW ANY TIMESTAMP
                        if (isDenied) {
                            raw = null;
                        } else {
                            raw =
                                data.policy_outcome_modified_at ||
                                data.close_status_modified_at ||
                                raw;
                        }
                    }


                    if (raw) {
                        const f = formatTimestampCompact(raw);
                        const ts = document.createElement('div');
                        ts.className = 'progress-timestamp';
                        ts.textContent = f;
                        step.appendChild(ts);
                    }
                }
            });

            // ACTIVE STEP = currentIndex + 1 (unless final step)
            if (currentIndex < steps.length - 1) {
                steps[currentIndex + 1].classList.add('active');
            }

            const pctMap = [0, 42, 58.5, 75, 90, 100];
            let activeIndex;
            if (currentIndex >= 0) {
                activeIndex = currentIndex; 
            } else {
                activeIndex = 0; // Fallback for unknown status
            }

            fill.style.width = pctMap[activeIndex] + '%';

        } else {
            // Unknown status
            steps[0].classList.add('active');
            fill.style.width = '0%';
        }
    };

})();

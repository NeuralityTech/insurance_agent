/*
 * Comments Noted functionality for insurance forms
 * Handles adding, displaying, and managing comments for submissions
 */

(function() {
    let commentsData = [];
    let currentUniqueId = null;

    function ensureElements() {
        return {
            addCommentBtn: document.getElementById('add-comment-btn'),
            textarea: document.getElementById('new-comment'),
            countEl: document.getElementById('comments-count'),
            noMsg: document.getElementById('no-comments-message'),
            table: document.getElementById('comments-table'),
            tbody: document.getElementById('comments-tbody'),
            lastModifiedFooter: document.getElementById('last-modified-footer'),
            lastModifiedBy: document.getElementById('last-modified-by'),
            lastModifiedDate: document.getElementById('last-modified-date')
        };
    }

    function initializeCommentsNoted() {
        console.log('Initializing Comments Noted...');
        
        // Clear any stale session data on initialization
        clearStaleSessionData();
        
        const els = ensureElements();
        if (els.addCommentBtn) {
            els.addCommentBtn.removeEventListener('click', addNewComment);
            els.addCommentBtn.addEventListener('click', addNewComment);
            console.log('Add Comment button event listener attached');
        } else {
            console.log('Add Comment button not found!');
        }
        loadExistingComments();
    }

    function clearStaleSessionData() {
        // Only clear if there's no current unique_id from URL or form inputs
        const urlUniqueId = new URLSearchParams(window.location.search).get('uid');
        const loadInput = document.getElementById('load-unique-id');
        const uniqueIdInput = document.querySelector('input[name="unique_id"]');
        
        const hasCurrentContext = urlUniqueId || 
                                 (loadInput && loadInput.value.trim()) || 
                                 (uniqueIdInput && uniqueIdInput.value.trim());
        
        if (!hasCurrentContext) {
            sessionStorage.removeItem('currentUniqueId');
            currentUniqueId = null;
            commentsData = [];
            console.log('Cleared stale session data');
        }
    }

    async function loadExistingComments(uidOptional) {
        let uid = uidOptional || null;
        if (!uid) {
            const urlUniqueId = new URLSearchParams(window.location.search).get('uid');
            const loadInput = document.getElementById('load-unique-id');
            const uniqueIdInput = document.querySelector('input[name="unique_id"]');
            uid = urlUniqueId || 
                 (loadInput ? loadInput.value.trim() : '') || 
                 (uniqueIdInput ? uniqueIdInput.value.trim() : '') ||
                 sessionStorage.getItem('currentUniqueId');
        }

        currentUniqueId = uid;
        if (uid) {
            sessionStorage.setItem('currentUniqueId', uid);
        }

        if (!uid) {
            commentsData = [];
            try { localStorage.setItem('comments_noted', JSON.stringify([])); } catch(e) {} // Clear localStorage too
            renderCommentsTable();
            return;
        }

        try {
            const response = await fetch(`/submission/${encodeURIComponent(uid)}/comments`);
            if (response.ok) {
                const data = await response.json();
                commentsData = Array.isArray(data.comments) ? data.comments : [];
                try { localStorage.setItem('comments_noted', JSON.stringify(commentsData)); } catch(e) {}
                renderCommentsTable();
                updateLastModifiedFooter();
            } else {
                commentsData = [];
                try { localStorage.setItem('comments_noted', JSON.stringify([])); } catch(e) {} 
                renderCommentsTable();
            }
        } catch (e) {
            console.warn('Failed to load existing comments', e);
            commentsData = [];
            try { localStorage.setItem('comments_noted', JSON.stringify([])); } catch(e) {} 
            renderCommentsTable();
        }
    }

    async function addNewComment() {
        console.log('Add comment button clicked');
        const els = ensureElements();
        if (!els.textarea) {
            console.log('Textarea not found');
            return;
        }

        const commentText = (els.textarea.value || '').trim();
        console.log('Comment text:', commentText);
        if (!commentText) { 
            alert('Please enter a comment.'); 
            return; 
        }

        const userId = sessionStorage.getItem('loggedInUserId') || localStorage.getItem('loggedInUserId') || 'Unknown Agent';

        if (!currentUniqueId) {
            // Try multiple ways to get the unique_id
            const loadInput = document.getElementById('load-unique-id');
            const uniqueIdInput = document.querySelector('input[name="unique_id"]');
            const urlParams = new URLSearchParams(window.location.search);
            
            currentUniqueId = urlParams.get('uid') || 
                            (loadInput ? loadInput.value.trim() : '') || 
                            (uniqueIdInput ? uniqueIdInput.value.trim() : '') || 
                            sessionStorage.getItem('currentUniqueId') ||
                            currentUniqueId;
            
            console.log('Detected unique_id:', currentUniqueId);
            console.log('URL uid:', urlParams.get('uid'));
            console.log('Load input value:', loadInput ? loadInput.value : 'not found');
            console.log('Unique ID input value:', uniqueIdInput ? uniqueIdInput.value : 'not found');
            console.log('sessionStorage currentUniqueId:', sessionStorage.getItem('currentUniqueId'));
        }

        if (!currentUniqueId || currentUniqueId.trim() === '') { 
            alert('Please load a submission first or enter a Unique ID.'); 
            return; 
        }

        // Store the unique_id for current session only
        sessionStorage.setItem('currentUniqueId', currentUniqueId);

        const newCommentLocal = {
            modifier: userId,
            comment: commentText,
            timestamp: new Date().toISOString()
        };

        if (els.addCommentBtn) { 
            els.addCommentBtn.disabled = true; 
            els.addCommentBtn.textContent = 'Adding...'; 
        }

        try {
            const resp = await fetch(`/submission/${encodeURIComponent(currentUniqueId)}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment: commentText, modifier: userId })
            });

            if (resp.ok) {
                try {
                    const result = await resp.json();
                    if (result && result.comment) {
                        commentsData.unshift(result.comment);
                    } else {
                        commentsData.unshift(newCommentLocal);
                    }
                } catch {
                    commentsData.unshift(newCommentLocal);
                }
                els.textarea.value = '';
                // Mirror to localStorage for Preview consumption
                try { localStorage.setItem('comments_noted', JSON.stringify(commentsData)); } catch(e) {}
                renderCommentsTable();
                updateLastModifiedFooter();
                updateMainPageLastModified(userId, newCommentLocal.timestamp);
            } else {
                alert('Failed to save comment. Please try again.');
            }
        } catch (e) {
            console.error('Error saving comment', e);
            alert('Error saving comment. Please try again.');
        } finally {
            if (els.addCommentBtn) { 
                els.addCommentBtn.disabled = false; 
                els.addCommentBtn.textContent = 'Add Comment'; 
            }
        }
    }

    function renderCommentsTable() {
        const els = ensureElements();
        if (!els.countEl || !els.noMsg || !els.table || !els.tbody) return;

        const count = commentsData.length;
        els.countEl.textContent = count === 0 ? 'No comments yet' : (count === 1 ? '1 comment' : `${count} comments`);

        if (count === 0) {
            els.noMsg.style.display = 'block';
            els.table.style.display = 'none';
            els.tbody.innerHTML = '';
            return;
        }

        els.noMsg.style.display = 'none';
        els.table.style.display = 'table';
        els.tbody.innerHTML = '';

        commentsData.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(c.modifier || '')}</td>
                <td class="comment-text">${escapeHtml(c.comment || '')}</td>
                <td>${formatTimestamp(c.timestamp)}</td>
            `;
            els.tbody.appendChild(tr);
        });
    }

    function updateLastModifiedFooter() {
        const els = ensureElements();
        if (!els.lastModifiedFooter || !els.lastModifiedBy || !els.lastModifiedDate) return;

        if (commentsData.length > 0) {
            const latestComment = commentsData[0]; // First item is latest due to DESC order
            els.lastModifiedBy.textContent = latestComment.modifier || '—';
            els.lastModifiedDate.textContent = formatTimestamp(latestComment.timestamp);
            els.lastModifiedFooter.style.display = 'block';
        } else {
            els.lastModifiedFooter.style.display = 'none';
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text || '');
        return div.innerHTML;
    }

    function formatTimestamp(ts) {
        if (!ts) return '';
        try {
            const d = new Date(ts);
            if (!isNaN(d.getTime())) {
                return d.toLocaleString('en-IN', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                });
            }
        } catch {}
        return escapeHtml(ts);
    }

    function getCommentsData() {
        return { comments_noted: commentsData };
    }

    function updateMainPageLastModified(modifiedBy, timestamp) {
        // Prefer updating the new footer if present
        const footer = document.getElementById('last-modified-footer');
        const footerBy = document.getElementById('last-modified-by');
        const footerDate = document.getElementById('last-modified-date');

        if (footer && footerBy && footerDate) {
            footerBy.textContent = modifiedBy;
            footerDate.textContent = formatTimestamp(timestamp);
            footer.style.display = 'block';
            return;
        }

        // Fallback to legacy inline span if footer not available
        const mainLastModifiedDisplay = document.getElementById('last-modified-display');
        const mainLastModifiedBy = document.getElementById('last-modified-by-main');
        const mainLastModifiedDate = document.getElementById('last-modified-date-main');
        if (mainLastModifiedDisplay && mainLastModifiedBy && mainLastModifiedDate) {
            mainLastModifiedBy.textContent = modifiedBy;
            mainLastModifiedDate.textContent = formatTimestamp(timestamp);
            mainLastModifiedDisplay.style.display = 'block';
        }
    }

    // Export functions to global scope
    window.initializeCommentsNoted = initializeCommentsNoted;
    window.loadExistingComments = loadExistingComments;
    window.getCommentsData = getCommentsData;
    window.clearCommentsSession = function() {
        sessionStorage.removeItem('currentUniqueId');
        currentUniqueId = null;
        commentsData = [];
        renderCommentsTable();
        console.log('Comments session cleared manually');
        try { localStorage.setItem('comments_noted', JSON.stringify(commentsData)); } catch(e) {}
    };

    // Test function to manually trigger comment addition
    window.testAddComment = function() {
        alert('Test function called');
        addNewComment();
    };

    // Auto-initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        console.log('Comments_Noted.js DOMContentLoaded fired');
        initializeCommentsNoted();
    });
})();

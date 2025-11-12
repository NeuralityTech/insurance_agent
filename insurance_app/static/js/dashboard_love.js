// ========================================
// NEURALITY DASHBOARD JAVASCRIPT
// ========================================

// Mock data for proposals
const mockProposals = [
    { name: "John Smith", uniqueId: "INS-2024-001", agent: "Sarah Johnson", status: "pending" },
    { name: "Emily Davis", uniqueId: "INS-2024-002", agent: "Michael Brown", status: "approved" },
    { name: "Robert Wilson", uniqueId: "INS-2024-003", agent: "Sarah Johnson", status: "approved" },
    { name: "Maria Garcia", uniqueId: "INS-2024-004", agent: "David Lee", status: "pending" },
    { name: "James Martinez", uniqueId: "INS-2024-005", agent: "Michael Brown", status: "denied" },
    { name: "Patricia Taylor", uniqueId: "INS-2024-006", agent: "Sarah Johnson", status: "approved" },
    { name: "Christopher Anderson", uniqueId: "INS-2024-007", agent: "David Lee", status: "pending" },
    { name: "Lisa Thomas", uniqueId: "INS-2024-008", agent: "Michael Brown", status: "approved" },
    { name: "Daniel Jackson", uniqueId: "INS-2024-009", agent: "Sarah Johnson", status: "denied" },
    { name: "Nancy White", uniqueId: "INS-2024-010", agent: "David Lee", status: "pending" },
];

// State
let allProposals = [...mockProposals];
let filteredProposals = [...mockProposals];

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    initializeAuth();
    initializeSidebar();
    initializeQuickActions();
    initializeTable();
    renderProposalsTable();
});

// ========================================
// AUTHENTICATION
// ========================================

function initializeAuth() {
    const userId = localStorage.getItem('loggedInUserId');
    const userRole = localStorage.getItem('userRole');
    
    // Redirect to login if not authenticated
    if (!userId) {
        window.location.href = './Main_login.html';
        return;
    }
    
    // Set user role in header and sidebar
    const role = userRole ? capitalizeFirstLetter(userRole) : 'Administrator';
    document.getElementById('userRole').textContent = role;
    document.getElementById('headerRole').textContent = role;
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// ========================================
// SIDEBAR
// ========================================

function initializeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mainContent = document.getElementById('mainContent');
    
    sidebarToggle.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
    });
    
    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', function() {
        localStorage.removeItem('loggedInUserId');
        localStorage.removeItem('userRole');
        window.location.href = './Main_login.html';
    });
}

// ========================================
// QUICK ACTIONS
// ========================================

function initializeQuickActions() {
    // New Applicant
    document.getElementById('btnNewApplicant').addEventListener('click', function() {
        window.location.href = '/html/New_Applicant_Request_Form.html';
    });
    
    // Existing Applicant
    document.getElementById('btnExistingApplicant').addEventListener('click', function() {
        window.location.href = '/html/Existing_Applicant_Request_Form.html';
    });
    
    // Client Directory
    document.getElementById('btnClientDirectory').addEventListener('click', function() {
        window.location.href = '/html/Client_Directory.html';
    });
    
    // Approvals
    document.getElementById('btnApprovals').addEventListener('click', function() {
        window.location.href = '/html/Approvals.html';
    });
}

// ========================================
// PROPOSALS TABLE
// ========================================

function initializeTable() {
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    
    // Search functionality
    searchInput.addEventListener('input', function() {
        filterProposals();
    });
    
    // Status filter functionality
    statusFilter.addEventListener('change', function() {
        filterProposals();
    });
}

function filterProposals() {
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value.toLowerCase();
    
    filteredProposals = allProposals.filter(proposal => {
        const matchesSearch = 
            proposal.name.toLowerCase().includes(searchQuery) ||
            proposal.uniqueId.toLowerCase().includes(searchQuery) ||
            proposal.agent.toLowerCase().includes(searchQuery);
        
        const matchesStatus = 
            !statusFilter || proposal.status.toLowerCase() === statusFilter;
        
        return matchesSearch && matchesStatus;
    });
    
    renderProposalsTable();
}

function renderProposalsTable() {
    const tbody = document.getElementById('proposalsTableBody');
    
    if (filteredProposals.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    No proposals found matching your criteria
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filteredProposals.map(proposal => `
        <tr>
            <td><strong>${proposal.name}</strong></td>
            <td>${proposal.uniqueId}</td>
            <td>${proposal.agent}</td>
            <td>
                <span class="status-badge status-${proposal.status}">
                    ${capitalizeFirstLetter(proposal.status)}
                </span>
            </td>
        </tr>
    `).join('');
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

// Update stats (can be called when data changes)
function updateStats() {
    const total = allProposals.length;
    const pending = allProposals.filter(p => p.status === 'pending').length;
    const approved = allProposals.filter(p => p.status === 'approved').length;
    const denied = allProposals.filter(p => p.status === 'denied').length;
    
    document.getElementById('totalProposals').textContent = total;
    document.getElementById('pendingProposals').textContent = pending;
    document.getElementById('approvedProposals').textContent = approved;
    document.getElementById('deniedProposals').textContent = denied;
}

// Dashboard JavaScript

document.addEventListener('DOMContentLoaded', function() {
  // Initialize sidebar for dashboard
  if (window.initializeSidebar) {
    window.initializeSidebar('dashboard');
  }

  // Check if user is logged in
  const userId = localStorage.getItem('loggedInUserId');
  const userRole = localStorage.getItem('userRole');
  
  if (!userId) {
    window.location.href = '/html/Main_login.html';
    return;
  }

  // Set user info in the dashboard
  const loggedInUserElement = document.getElementById('loggedInUser');
  const userRoleElement = document.getElementById('sidebarUserRole');
  
  if (loggedInUserElement) {
    loggedInUserElement.textContent = userId;
  }
  
  if (userRoleElement) {
    userRoleElement.textContent = userRole || 'Agent';
  }

  // ===================================
  // SIDEBAR FUNCTIONALITY (handled by sidebar.js)
  // ===================================
  // Sidebar is now managed by the reusable sidebar component

  // ===================================
  // NAVIGATION FUNCTIONALITY
  // ===================================
  const proposalsNav = document.getElementById('proposalsNav');
  if (proposalsNav) {
    proposalsNav.addEventListener('click', function(e) {
      e.preventDefault();
      const proposalsSection = document.querySelector('.proposals-section');
      if (proposalsSection) {
        proposalsSection.scrollIntoView({ 
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  }
  // ===================================
  // DATA LOADING AND TABLE POPULATION
  // ===================================
  let proposalsData = [];
  let currentAgentFilter = ''; // Will be set to logged-in user by default

  // Status mapping configuration - maps backend values to display values
  const STATUS_MAP = {
    // Database status -> Display status
    'OPEN': 'Open/Draft',
    'SUP_REVIEW': 'Submitted for Review',
    'SUP_APPROVED': 'Pending Client Agreement',
    'SUP_REJECTED': 'Supervisor Rejected',
    'With_UW': 'With Underwriter',
    'UW_Rejected': 'Policy Denied',
    'Policy_Created': 'Completed',
    'Completed': 'Completed',
    'Closed': 'Closed',
    'Client_Agreed': 'Client Agreed',
    'Client Approved': 'Client Agreed',
    'Client_Approved': 'Client Agreed'
  };

  // Status display configuration for stat cards
  const STATUS_CONFIG = {
    'Open/Draft': { icon: 'fa-file', color: 'open-draft' },
    'Submitted for Review': { icon: 'fa-clock', color: 'submitted-for-review' },
    'Supervisor Rejected': { icon: 'fa-times-circle', color: 'supervisor-rejected' },
    'Supervisor Approved': { icon: 'fa-user-check', color: 'supervisor-approved' },
    'Pending Client Agreement': { icon: 'fa-user-check', color: 'pending-client-agreement' },
    'Client Agreed': { icon: 'fa-handshake', color: 'client-agreed' },
    'With Underwriter': { icon: 'fa-file-contract', color: 'with-underwriter' },
    'Completed': { icon: 'fa-check-circle', color: 'completed' },
    'Policy Denied': { icon: 'fa-times-circle', color: 'policy-denied' },
    'Closed': { icon: 'fa-archive', color: 'closed' }
  };

  // Normalize status from backend to display format
  function normalizeStatus(status) {
    if (!status) return 'Open/Draft';
    
    // Check if it's already in the map
    if (STATUS_MAP[status]) {
      return STATUS_MAP[status];
    }
    
    // Try case-insensitive match
    const upperStatus = status.toUpperCase().trim();
    for (const [key, value] of Object.entries(STATUS_MAP)) {
      if (key.toUpperCase() === upperStatus) {
        return value;
      }
    }
    
    // Return as-is if no match (capitalizing each word)
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }

  // Load proposals data from backend
  async function loadProposalsData() {
    try {
      // Show loading state
      const tableBody = document.getElementById('proposalsTableBody');
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">Loading proposals...</td></tr>';

      // Fetch clients data from backend
      const response = await fetch('/clients');
      if (!response.ok) {
        throw new Error('Failed to fetch proposals data');
      }

      const clients = await response.json();
            console.log(clients);
      // Transform backend data to match table structure
      proposalsData = clients.map(client => {
        // Get the most recent status (prefer application_status, fallback to supervisor_approval_status)
        let rawStatus = (client.application_status != null && client.application_status !== '') 
          ? client.application_status 
          : (client.supervisor_approval_status || client.supervisor_status || 'OPEN');
        
        return {
          name: client.name || 'N/A',
          uniqueId: client.unique_id || 'N/A',
          agent: client.agent || 'N/A',
          status: normalizeStatus(rawStatus),
          supervisor_modified_by: client.supervisor_modified_by || null  // Store who approved it
        };
      });

      // Set default agent filter based on role
      if (userRole && userRole.toLowerCase() === 'supervisor') {
        // Supervisors see all proposals by default
        currentAgentFilter = '';
      } else {
        // Agents see ONLY their own proposals - never all proposals
        const agentName = `${userId}`;
        
        // Check if user has proposals
        const userHasProposals = proposalsData.some(p => 
          p.agent && p.agent.toLowerCase().includes(userId.toLowerCase())
        );
        
        if (userHasProposals) {
          currentAgentFilter = agentName;
        } else {
          // If exact match not found, try partial match
          const partialMatch = proposalsData.find(p => 
            p.agent && (
              p.agent.toLowerCase().includes(userId.toLowerCase()) ||
              userId.toLowerCase().includes(p.agent.toLowerCase())
            )
          );
          
          if (partialMatch) {
            currentAgentFilter = partialMatch.agent;
          } else {
            // IMPORTANT: Agents should NOT see all applications if they have none
            // Keep their filter set to their userId so they see 0 results instead of all
            currentAgentFilter = agentName;
          }
        }
      }
      
      populateTable();
      initializeAgentFilter();
    } catch (error) {
      console.error('Error loading proposals:', error);
      const tableBody = document.getElementById('proposalsTableBody');
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: #dc3545;">Failed to load proposals. Please try again later.</td></tr>';
      
      // Still initialize with empty data
      proposalsData = [];
      initializeAgentFilter();
    }
  }

  // Get status class for styling
  function getStatusClass(status) {
    return 'status-' + status.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');
  }

  // Get initials from name
  function getInitials(name) {
    if (!name || name === 'N/A') return '?';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2); // Limit to 2 characters
  }

  function createTableRow(proposal) {
    const row = document.createElement('tr');

    const initials = getInitials(proposal.name);
    const statusClass = getStatusClass(proposal.status);

    // Escape HTML to prevent XSS
    const escapeHtml = (str) => {
      const div = document.createElement('div');
      div.textContent = str ?? '';
      return div.innerHTML;
    };

    // Determine if current user is a supervisor
    const isSupervisor = userRole && userRole.toLowerCase() === 'supervisor';

    // Normalize the proposal status to a canonical display string
    const normalizedStatus = (typeof normalizeStatus === 'function')
      ? normalizeStatus(proposal.status)
      : (proposal.status || 'Open/Draft');

    // Only show Supervisor Approve when status is exactly "Submitted for Review"
    const shouldShowSupervisorAction =
      isSupervisor &&
      (String(normalizedStatus).trim().toLowerCase() === 'submitted for review');

    // Supervisors can reassign agents at any time
    const shouldShowReassign = isSupervisor;

    // Build row HTML
    row.innerHTML = `
      <td>
        <div class="client-info">
          <div class="client-avatar">${escapeHtml(initials)}</div>
          <div>
            <div class="client-name">${escapeHtml(proposal.name)}</div>
          </div>
        </div>
      </td>
      <td><span class="unique-id">${escapeHtml(proposal.uniqueId)}</span></td>
      <td>${escapeHtml(proposal.agent)}</td>
      <td><span class="status-badge ${statusClass}">${escapeHtml(proposal.status)}</span></td>
      <td>
        <div class="action-buttons">
          <button class="btn-icon" title="View Details" onclick="viewProposal('${escapeHtml(proposal.uniqueId)}')">
            <i class="fas fa-eye"></i>
          </button>
          ${shouldShowSupervisorAction ? `
            <button class="btn-icon btn-approve" title="Supervisor Approve" onclick="goToSupervisorForm('${escapeHtml(proposal.uniqueId)}')">
              <i class="fas fa-user-shield"></i>
            </button>
          ` : ''}
          ${shouldShowReassign ? `
            <button class="btn-icon btn-reassign" title="Reassign Agent" onclick="openReassignModal('${escapeHtml(proposal.uniqueId)}', '${escapeHtml(proposal.agent)}')">
              <i class="fas fa-user-edit"></i>
            </button>
          ` : ''}
        </div>
      </td>
    `;

    return row;
  }



  // Populate table with all proposals
  function populateTable() {
    const tableBody = document.getElementById('proposalsTableBody');
    tableBody.innerHTML = '';
    
    if (proposalsData.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No proposals found.</td></tr>';
      return;
    }
    
    proposalsData.forEach(proposal => {
      const row = createTableRow(proposal);
      tableBody.appendChild(row);
    });

    // Initialize pagination after populating
    initializeRows();
    renderTable();
    updateProposalCounts();
  }

  // ===================================
  // AGENT FILTER (SEARCHABLE DROPDOWN)
  // ===================================
  const agentFilterInput = document.getElementById('agentFilterInput');
  const agentDropdownList = document.getElementById('agentDropdownList');
  let allAgents = [];
  let selectedAgent = '';

  function initializeAgentFilter() {
    // Get unique agents from proposals data
    const uniqueAgents = new Set();
    proposalsData.forEach(p => {
      if (p.agent && p.agent !== 'N/A') {
        uniqueAgents.add(p.agent);
      }
    });
    
    allAgents = ['All Agents', ...Array.from(uniqueAgents).sort()];
    
    // Check if user is a supervisor
    const isSupervisor = userRole && userRole.toLowerCase() === 'supervisor';
    
    // For non-supervisors (agents), hide the agent filter dropdown
    // They can only see their own applications
    if (!isSupervisor) {
      if (agentFilterInput) {
        agentFilterInput.style.display = 'none';
        // Also hide the parent wrapper if it exists
        const wrapper = agentFilterInput.closest('.searchable-dropdown-wrapper');
        if (wrapper) {
          wrapper.style.display = 'none';
        }
      }
      // Set to their own agent filter and don't allow changes
      selectedAgent = currentAgentFilter || userId;
    } else {
      // Supervisors can see all agents
      // Set default value based on currentAgentFilter
      if (currentAgentFilter && allAgents.includes(currentAgentFilter)) {
        selectedAgent = currentAgentFilter;
        agentFilterInput.value = currentAgentFilter;
      } else {
        selectedAgent = 'All Agents';
        agentFilterInput.value = 'All Agents';
      }
      
      populateAgentDropdown(allAgents);
    }
    
    // Apply initial filter
    filterTable();
  }

  function populateAgentDropdown(agents) {
    agentDropdownList.innerHTML = '';
    agents.forEach(agent => {
      const li = document.createElement('li');
      li.textContent = agent;
      if (agent === selectedAgent) {
        li.classList.add('selected');
      }
      li.addEventListener('click', function() {
        selectAgent(agent);
      });
      agentDropdownList.appendChild(li);
    });
  }

  function selectAgent(agent) {
    selectedAgent = agent;
    agentFilterInput.value = agent;
    agentDropdownList.classList.remove('show');
    filterTable();
  }

  // Show dropdown on focus or click
  if (agentFilterInput) {
    agentFilterInput.addEventListener('focus', function() {
      populateAgentDropdown(allAgents);
      agentDropdownList.classList.add('show');
    });

    agentFilterInput.addEventListener('click', function(e) {
      e.stopPropagation();
      populateAgentDropdown(allAgents);
      agentDropdownList.classList.add('show');
    });

    // Filter dropdown as user types
    agentFilterInput.addEventListener('input', function() {
      const searchTerm = this.value.toLowerCase();
      const filteredAgents = allAgents.filter(agent => 
        agent.toLowerCase().includes(searchTerm)
      );
      populateAgentDropdown(filteredAgents);
      agentDropdownList.classList.add('show');
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', function(event) {
    if (agentFilterInput && agentDropdownList &&
        !agentFilterInput.contains(event.target) && 
        !agentDropdownList.contains(event.target)) {
      agentDropdownList.classList.remove('show');
      
      // Restore selected value if user didn't select anything
      if (selectedAgent) {
        agentFilterInput.value = selectedAgent;
      }
    }
  });

  // Keyboard navigation for dropdown
  let highlightedIndex = -1;

  if (agentFilterInput) {
    agentFilterInput.addEventListener('keydown', function(e) {
      const items = agentDropdownList.getElementsByTagName('li');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
        updateHighlight(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightedIndex = Math.max(highlightedIndex - 1, 0);
        updateHighlight(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < items.length) {
          items[highlightedIndex].click();
        }
      } else if (e.key === 'Escape') {
        agentDropdownList.classList.remove('show');
        agentFilterInput.value = selectedAgent;
      }
    });
  }

  function updateHighlight(items) {
    Array.from(items).forEach((item, index) => {
      item.classList.toggle('highlighted', index === highlightedIndex);
    });
    
    if (highlightedIndex >= 0 && highlightedIndex < items.length) {
      items[highlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // ===================================
  // PAGINATION FUNCTIONALITY
  // ===================================
  let currentPage = 1;
  let rowsPerPage = 10;
  let allRows = [];
  let filteredRows = [];

  const tableBody = document.getElementById('proposalsTableBody');
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const pageSize = document.getElementById('pageSize');
  
  // Pagination controls
  const firstPageBtn = document.getElementById('firstPage');
  const prevPageBtn = document.getElementById('prevPage');
  const nextPageBtn = document.getElementById('nextPage');
  const lastPageBtn = document.getElementById('lastPage');
  const paginationNumbers = document.getElementById('paginationNumbers');
  
  // Pagination info
  const showingStart = document.getElementById('showingStart');
  const showingEnd = document.getElementById('showingEnd');
  const totalEntries = document.getElementById('totalEntries');

  // Initialize - get all rows
  function initializeRows() {
    allRows = Array.from(tableBody.getElementsByTagName('tr'));
    filteredRows = [...allRows];
  }

  // Filter table based on search, status, and agent
  function filterTable() {
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const statusValue = statusFilter ? statusFilter.value.toLowerCase() : 'all';
    const agentValue = selectedAgent === 'All Agents' ? '' : selectedAgent.toLowerCase();

    filteredRows = allRows.filter(row => {
      const name = row.querySelector('.client-name')?.textContent.toLowerCase() || '';
      const statusBadge = row.querySelector('.status-badge');
      const status = statusBadge?.textContent.toLowerCase() || '';
      const agentCell = row.cells[2]?.textContent.toLowerCase() || '';

      const matchesSearch = name.includes(searchTerm);
      const matchesStatus = statusValue === 'all' || status.includes(statusValue);
      const matchesAgent = !agentValue || agentCell.includes(agentValue);

      return matchesSearch && matchesStatus && matchesAgent;
    });

    currentPage = 1;
    renderTable();
    updateProposalCounts();
  }

  // Render table with pagination
  function renderTable() {
    // Hide all rows first
    allRows.forEach(row => row.style.display = 'none');

    // Calculate pagination
    const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, filteredRows.length);

    // Show only current page rows
    for (let i = startIndex; i < endIndex; i++) {
      filteredRows[i].style.display = '';
    }

    // Update pagination info
    if (filteredRows.length > 0) {
      showingStart.textContent = startIndex + 1;
      showingEnd.textContent = endIndex;
    } else {
      showingStart.textContent = 0;
      showingEnd.textContent = 0;
    }
    totalEntries.textContent = filteredRows.length;

    // Update pagination controls
    updatePaginationControls(totalPages);
  }

  // Update pagination controls (buttons and page numbers)
  function updatePaginationControls(totalPages) {
    // Enable/disable navigation buttons
    firstPageBtn.disabled = currentPage === 1;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    lastPageBtn.disabled = currentPage === totalPages || totalPages === 0;

    // Generate page numbers
    paginationNumbers.innerHTML = '';
    
    if (totalPages <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= totalPages; i++) {
        paginationNumbers.appendChild(createPageButton(i));
      }
    } else {
      // Show first page
      paginationNumbers.appendChild(createPageButton(1));

      if (currentPage > 3) {
        paginationNumbers.appendChild(createEllipsis());
      }

      // Show pages around current page
      const startPage = Math.max(2, currentPage - 1);
      const endPage = Math.min(totalPages - 1, currentPage + 1);

      for (let i = startPage; i <= endPage; i++) {
        paginationNumbers.appendChild(createPageButton(i));
      }

      if (currentPage < totalPages - 2) {
        paginationNumbers.appendChild(createEllipsis());
      }

      // Show last page
      paginationNumbers.appendChild(createPageButton(totalPages));
    }
  }

  // Create page number button
  function createPageButton(pageNum) {
    const button = document.createElement('button');
    button.className = 'page-number';
    button.textContent = pageNum;
    
    if (pageNum === currentPage) {
      button.classList.add('active');
    }

    button.addEventListener('click', function() {
      currentPage = pageNum;
      renderTable();
    });

    return button;
  }

  // Create ellipsis for pagination
  function createEllipsis() {
    const span = document.createElement('span');
    span.className = 'page-ellipsis';
    span.textContent = '...';
    return span;
  }

  // Pagination button event listeners
  if (firstPageBtn) {
    firstPageBtn.addEventListener('click', function() {
      currentPage = 1;
      renderTable();
    });
  }

  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', function() {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', function() {
      const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        renderTable();
      }
    });
  }

  if (lastPageBtn) {
    lastPageBtn.addEventListener('click', function() {
      const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
      currentPage = totalPages;
      renderTable();
    });
  }

  // Page size change
  if (pageSize) {
    pageSize.addEventListener('change', function() {
      rowsPerPage = parseInt(this.value);
      currentPage = 1;
      renderTable();
    });
  }

  // Search and filter event listeners
  if (searchInput) {
    searchInput.addEventListener('input', filterTable);
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', filterTable);
  }

// ===================================
// PROPOSAL COUNTS & STAT CARDS
// ===================================
let activeStatFilter = null; // Track which stat card is active

function updateStatCards() {
  const statsSection = document.getElementById('statsSection');
  if (!statsSection) return;

  // Clear existing stats
  statsSection.innerHTML = '';

  // Check if user is a supervisor
  const isSupervisor = userRole && userRole.toLowerCase() === 'supervisor';

  if (isSupervisor) {
    // supervisor view
    
    // Count all proposals by status
    const statusCounts = {};
    let totalCount = proposalsData.length;

    proposalsData.forEach(p => {
      const status = p.status || 'Open/Draft';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    // Count proposals approved by this specific supervisor
    const userIdLower = userId.toLowerCase();
    const supervisorApprovedCount = proposalsData.filter(p => {
      const approvedBy = p.supervisor_modified_by;
      return approvedBy && 
             approvedBy.toLowerCase().includes(userIdLower);
    }).length;

    // Add Total Proposals card 
    const totalCard = createStatCard('Total Proposals', totalCount, 'fa-folder', 'total', 'all');
    statsSection.appendChild(totalCard);

    // Add With Open/Draft card 
    const openCount = statusCounts['Open/Draft'] || 0;
    const openCard = createStatCard('Open/Draft', openCount, 'fa-file-contract', 'open', 'Open/Draft');
    statsSection.appendChild(openCard);

    // Add With Underwriter card 
    const withUWCount = statusCounts['With Underwriter'] || 0;
    const uwCard = createStatCard('With Underwriter', withUWCount, 'fa-file-contract', 'with-underwriter', 'With Underwriter');
    statsSection.appendChild(uwCard);

    // Add Completed card, includes Policy Created
    const completedCount = (statusCounts['Completed'] || 0) + (statusCounts['Policy Created'] || 0);
    const completedCard = createStatCard('Completed', completedCount, 'fa-check-circle', 'completed', 'completed-or-policy-created');
    statsSection.appendChild(completedCard);

    // Add My Approvals card (personal count) 
    const supApprovedCard = createStatCard(
      'My Approvals', 
      supervisorApprovedCount, 
      'fa-user-check', 
      'supervisor-approved',
      'my-approvals'
    );
    statsSection.appendChild(supApprovedCard);

  } else {
    // agent view
    const userIdLower = userId.toLowerCase();
    const userProposals = proposalsData.filter(p =>
      p.agent && p.agent.toLowerCase().includes(userIdLower)
    );

    // Count proposals by status
    const statusCounts = {};
    let totalCount = 0;

    userProposals.forEach(p => {
      const status = p.status || 'Open/Draft';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      totalCount++;
    });

    // Add total card first
    const totalCard = createStatCard('Total Proposals', totalCount, 'fa-folder', 'total', 'all');
    statsSection.appendChild(totalCard);

    // Always show all standard status cards, even with 0 count
    // Define the standard statuses we want to always display for agents
    const standardStatuses = [
      { status: 'Open/Draft', icon: 'fa-file', color: 'open-draft' },
      { status: 'Submitted for Review', icon: 'fa-clock', color: 'submitted-for-review' },
      { status: 'Supervisor Rejected', icon: 'fa-times-circle', color: 'supervisor-rejected' },
      { status: 'Pending Client Agreement', icon: 'fa-user-check', color: 'pending-client-agreement' },
      { status: 'Client Agreed', icon: 'fa-handshake', color: 'client-agreed' },
      { status: 'With Underwriter', icon: 'fa-file-contract', color: 'with-underwriter' },
      { status: 'Completed', icon: 'fa-check-circle', color: 'completed' },
      { status: 'Policy Denied', icon: 'fa-times-circle', color: 'policy-denied' }
    ];
    
    // Create cards for all standard statuses
    standardStatuses.forEach(({ status, icon, color }) => {
      const count = statusCounts[status] || 0;
      const card = createStatCard(status, count, icon, color, status);
      statsSection.appendChild(card);
    });
    
    // Add any other statuses that exist in the data but aren't in our standard list
    Object.keys(statusCounts).forEach(status => {
      // Skip if already handled in standard statuses
      if (standardStatuses.some(s => s.status === status)) {
        return;
      }
      
      // Add this non-standard status
      const config = STATUS_CONFIG[status];
      if (config) {
        const card = createStatCard(status, statusCounts[status], config.icon, config.color, status);
        statsSection.appendChild(card);
      }
    });
  }

  // Re-apply active filter styling if there is one
  if (activeStatFilter) {
    const activeCard = statsSection.querySelector(`[data-filter="${activeStatFilter}"]`);
    if (activeCard) {
      activeCard.classList.add('active-filter');
    }
  }
}

function createStatCard(label, value, icon, colorClass, filterValue) {
  const card = document.createElement('div');
  card.className = `stat-card stat-${colorClass}`;
  card.style.cursor = 'pointer';
  card.setAttribute('data-filter', filterValue);
  
  card.innerHTML = `
    <div class="stat-icon">
      <i class="fas ${icon}"></i>
    </div>
    <div class="stat-content">
      <h3 class="stat-value">${value}</h3>
      <p class="stat-label">${label}</p>
    </div>
  `;
  
  // Add click handler
  card.addEventListener('click', function() {
    handleStatCardClick(filterValue, card);
  });
  
  return card;
}

function handleStatCardClick(filterValue, clickedCard) {
  const statsSection = document.getElementById('statsSection');
  
  // If clicking the same card, deactivate filter
  if (activeStatFilter === filterValue) {
    activeStatFilter = null;
    clickedCard.classList.remove('active-filter');
    filterTable(); // Reset to show all (respecting other filters)
    return;
  }
  
  // Remove active class from all cards
  statsSection.querySelectorAll('.stat-card').forEach(card => {
    card.classList.remove('active-filter');
  });
  
  // Set new active filter
  activeStatFilter = filterValue;
  clickedCard.classList.add('active-filter');
  
  // Apply the filter
  filterTable();
}

function filterTable() {
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  const statusValue = statusFilter ? statusFilter.value.toLowerCase() : 'all';
  const agentValue = selectedAgent === 'All Agents' ? '' : selectedAgent.toLowerCase();
  
  const userIdLower = userId.toLowerCase();
  const isSupervisor = userRole && userRole.toLowerCase() === 'supervisor';

  filteredRows = allRows.filter(row => {
    const name = row.querySelector('.client-name')?.textContent.toLowerCase() || '';
    const statusBadge = row.querySelector('.status-badge');
    const status = statusBadge?.textContent.toLowerCase() || '';
    const agentCell = row.cells[2]?.textContent.toLowerCase() || '';

    const matchesSearch = name.includes(searchTerm);
    const matchesStatus = statusValue === 'all' || status.includes(statusValue);
    const matchesAgent = !agentValue || agentCell.includes(agentValue);
    
    // Apply stat card filter
    let matchesStatFilter = true;
    if (activeStatFilter && activeStatFilter !== 'all') {
      if (activeStatFilter === 'my-approvals') {
        // Special filter: show proposals approved by this supervisor
        const proposal = proposalsData.find(p => {
          const rowUniqueId = row.querySelector('.unique-id')?.textContent || '';
          return p.uniqueId === rowUniqueId;
        });
        if (proposal) {
          const approvedBy = proposal.supervisor_modified_by;
          matchesStatFilter = approvedBy && approvedBy.toLowerCase().includes(userIdLower);
        } else {
          matchesStatFilter = false;
        }
      } else if (activeStatFilter === 'completed-or-policy-created') {
        // Special filter: match both "Completed" and "Policy Created"
        matchesStatFilter = status.includes('completed') || status.includes('policy created');
      } else {
        // Standard status filter
        matchesStatFilter = status.includes(activeStatFilter.toLowerCase());
      }
    }

    return matchesSearch && matchesStatus && matchesAgent && matchesStatFilter;
  });

  currentPage = 1;
  renderTable();
  updateProposalCounts();
}

  // Update the old updateProposalCounts to use the new system
  function updateProposalCounts() {
    updateStatCards();
  }

  // ===================================
  // ACTION HANDLERS
  // ===================================
  window.viewProposal = function(uniqueId) {
    console.log('View proposal:', uniqueId);
    // Navigate to existing applicant form with the unique ID
    window.location.href = `/html/Existing_Applicant_Request_Form.html?uid=${encodeURIComponent(uniqueId)}`;
  };
  window.goToSupervisorForm = function(uniqueId) {
    // Redirect to the Supervisor_Form.html page with the unique ID as a query parameter
    window.location.href = `/html/Supervisor_Form.html?uid=${encodeURIComponent(uniqueId)}`;
  };

  // ===================================
  // AGENT REASSIGNMENT (Supervisor Only)
  // ===================================
  let reassignModal = null;
  let currentReassignUid = null;
  let currentReassignAgent = null;

  // Create the reassign modal dynamically
  function createReassignModal() {
    if (document.getElementById('reassignModal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'reassignModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3><i class="fas fa-user-edit"></i> Reassign Application</h3>
          <button class="modal-close" onclick="closeReassignModal()">&times;</button>
        </div>
        <div class="modal-body">
          <p>Reassign application <strong id="reassignUidDisplay"></strong></p>
          <p>Current Agent: <strong id="currentAgentDisplay"></strong></p>
          <div class="form-group" style="margin-top: 1rem;">
            <label for="newAgentSelect">Select New Agent:</label>
            <select id="newAgentSelect" class="form-control">
              <option value="">-- Select Agent --</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeReassignModal()">Cancel</button>
          <button class="btn btn-primary" onclick="confirmReassign()">Reassign</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Add modal styles if not already present
    if (!document.getElementById('reassignModalStyles')) {
      const styles = document.createElement('style');
      styles.id = 'reassignModalStyles';
      styles.textContent = `
        .modal-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
          justify-content: center;
          align-items: center;
        }
        .modal-overlay.show {
          display: flex;
        }
        .modal-content {
          background: white;
          border-radius: 8px;
          width: 90%;
          max-width: 450px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e9ecef;
        }
        .modal-header h3 {
          margin: 0;
          font-size: 1.1rem;
          color: #333;
        }
        .modal-header h3 i {
          margin-right: 0.5rem;
          color: #007bff;
        }
        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #666;
        }
        .modal-close:hover {
          color: #333;
        }
        .modal-body {
          padding: 1.5rem;
        }
        .modal-body p {
          margin: 0.5rem 0;
          color: #555;
        }
        .modal-body .form-group {
          margin-top: 1rem;
        }
        .modal-body label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #333;
        }
        .modal-body .form-control {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #ced4da;
          border-radius: 4px;
          font-size: 1rem;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          border-top: 1px solid #e9ecef;
        }
        .modal-footer .btn {
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .modal-footer .btn-secondary {
          background: #6c757d;
          color: white;
          border: none;
        }
        .modal-footer .btn-secondary:hover {
          background: #5a6268;
        }
        .modal-footer .btn-primary {
          background: #007bff;
          color: white;
          border: none;
        }
        .modal-footer .btn-primary:hover {
          background: #0056b3;
        }
        .btn-reassign {
          color: #17a2b8 !important;
        }
        .btn-reassign:hover {
          background: rgba(23, 162, 184, 0.1);
        }
      `;
      document.head.appendChild(styles);
    }
  }

  // Open the reassign modal
  window.openReassignModal = function(uniqueId, currentAgent) {
    createReassignModal();
    
    currentReassignUid = uniqueId;
    currentReassignAgent = currentAgent;
    
    document.getElementById('reassignUidDisplay').textContent = uniqueId;
    document.getElementById('currentAgentDisplay').textContent = currentAgent || 'N/A';
    
    // Populate agent dropdown
    const select = document.getElementById('newAgentSelect');
    select.innerHTML = '<option value="">-- Select Agent --</option>';
    
    // Get unique agents from proposals data (excluding 'All Agents' and current agent)
    const uniqueAgents = new Set();
    proposalsData.forEach(p => {
      if (p.agent && p.agent !== 'N/A') {
        uniqueAgents.add(p.agent);
      }
    });
    
    Array.from(uniqueAgents).sort().forEach(agent => {
      if (agent !== currentAgent) {
        const option = document.createElement('option');
        option.value = agent;
        option.textContent = agent;
        select.appendChild(option);
      }
    });
    
    document.getElementById('reassignModal').classList.add('show');
  };

  // Close the reassign modal
  window.closeReassignModal = function() {
    const modal = document.getElementById('reassignModal');
    if (modal) {
      modal.classList.remove('show');
    }
    currentReassignUid = null;
    currentReassignAgent = null;
  };

  // Confirm and execute the reassignment
  window.confirmReassign = async function() {
    const newAgent = document.getElementById('newAgentSelect').value;
    
    if (!newAgent) {
      alert('Please select a new agent.');
      return;
    }
    
    if (!currentReassignUid) {
      alert('No application selected for reassignment.');
      return;
    }
    
    try {
      const response = await fetch('/api/supervisor/reassign_agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          unique_id: currentReassignUid,
          new_agent: newAgent,
          reassigned_by: userId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to reassign agent');
      }
      
      const result = await response.json();
      alert(`Application ${currentReassignUid} has been reassigned from ${currentReassignAgent} to ${newAgent}`);
      
      closeReassignModal();
      
      // Reload the proposals data to reflect the change
      loadProposalsData();
      
    } catch (error) {
      console.error('Error reassigning agent:', error);
      alert('Failed to reassign agent: ' + error.message);
    }
  };

  // ===================================
  // INITIALIZE
  // ===================================
  loadProposalsData();
});
// Reusable Sidebar Component
// Include this script in any page that needs the sidebar

(function() {
  'use strict';

  // Create and inject sidebar HTML
  function createSidebar(activePage = 'dashboard') {
    const userRole = localStorage.getItem('userRole') || 'agent';
    const isAdmin = userRole.toLowerCase() === 'admin';
    const isSuperAdmin = userRole.toLowerCase() === 'superadmin';
    
    const sidebarHTML = `
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <div class="logo-container">
            <div class="logo-placeholder">
              <img src="../static/img/dashboard_logo.png" class="logo">
            </div>
          </div>
          <button class="sidebar-toggle" id="sidebarToggle">
            <i class="fas fa-bars"></i>
          </button>
        </div>

        <nav class="sidebar-nav">
          ${isSuperAdmin ? `
          <a href="/superadmin/dashboard" class="nav-item ${activePage === 'superadmin-dashboard' ? 'active' : ''}">
            <i class="fas fa-crown"></i>
            <span>Super Admin Dashboard</span>
          </a>
          <a href="/superadmin/profile" class="nav-item ${activePage === 'superadmin-profile' ? 'active' : ''}">
            <i class="fas fa-user-circle"></i>
            <span>Profile</span>
          </a>
          ` : isAdmin ? `
          <a href="/admin/dashboard" class="nav-item ${activePage === 'admin-dashboard' ? 'active' : ''}">
            <i class="fas fa-tools"></i>
            <span>Admin Dashboard</span>
          </a>
          ` : `
          <a href="/html/dashboard.html" class="nav-item ${activePage === 'dashboard' ? 'active' : ''}">
            <i class="fas fa-home"></i>
            <span>Dashboard</span>
          </a>
          
          <div class="nav-divider"></div>
          <div class="nav-section-title"><span>Quick Actions</span></div>
          
          <a href="/html/New_Applicant_Request_Form.html" class="nav-item quick-action ${activePage === 'new-applicant' ? 'active' : ''}">
            <i class="fas fa-plus-circle"></i>
            <span>New Applicant</span>
          </a>
          <a href="/html/Existing_Applicant_Request_Form.html" class="nav-item quick-action ${activePage === 'existing-applicant' ? 'active' : ''}">
            <i class="fas fa-edit"></i>
            <span>Existing Applicant</span>
          </a>
          `}
        </nav>

        <div class="sidebar-footer">
          <div class="user-role">
            <i class="fas fa-user-circle"></i>
            <div class="role-info">
              <span class="role-label">Role</span>
              <span class="role-value" id="sidebarUserRole">Agent</span>
            </div>
          </div>
          <button class="btn-logout" id="sidebarLogoutBtn">
            <i class="fas fa-sign-out-alt"></i>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <button class="mobile-menu-btn" id="sidebarMobileMenuBtn">
        <i class="fas fa-bars"></i>
      </button>
    `;

    // Insert sidebar at the beginning of body
    document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
    
    // Add main-content class to container
    const container = document.querySelector('.container');
    if (container) {
      container.classList.add('main-content');
    }
    document.body.setAttribute('data-active-page', activePage);
  }

  // Initialize sidebar functionality
  function initializeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileMenuBtn = document.getElementById('sidebarMobileMenuBtn');
    const logoutBtn = document.getElementById('sidebarLogoutBtn');
    const userRoleElement = document.getElementById('sidebarUserRole');

    // Set user info
    const userId = localStorage.getItem('loggedInUserId');
    const userRole = localStorage.getItem('userRole');

    if (!userId) {
      window.location.href = '/html/Main_login.html';
      return;
    }

    if (userRoleElement && userRole) {
      userRoleElement.textContent = userRole;
    }

    // Add Supervisor Form link if role is supervisor (only for non-admin/non-superadmin users)
    const isAdmin = userRole && userRole.toLowerCase() === 'admin';
    const isSuperAdmin = userRole && userRole.toLowerCase() === 'superadmin';
    if (userRole && userRole.toLowerCase() === 'supervisor' && !isAdmin && !isSuperAdmin) {
      const sidebarNav = document.querySelector('.sidebar-nav');
      if (sidebarNav) {
        const existingApplicantLink = sidebarNav.querySelector('a[href="/html/Existing_Applicant_Request_Form.html"]');

        // Use the globally stored page name
        const isActive = window.sidebarActivePage === 'supervisor-form';

        const supervisorLinkHTML = `
          <a href="/html/Supervisor_Form.html" class="nav-item quick-action ${isActive ? 'active' : ''}">
            <i class="fas fa-user-shield"></i>
            <span>Supervisor Approve</span>
          </a>
        `;

        // Insert below Existing Applicant Request Form
        if (existingApplicantLink) {
          existingApplicantLink.insertAdjacentHTML('afterend', supervisorLinkHTML);
        } else {
          sidebarNav.insertAdjacentHTML('beforeend', supervisorLinkHTML);
        }
      }
    }

    // Desktop sidebar collapse/expand
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.innerWidth > 1024) {
          sidebar.classList.toggle('collapsed');
        } else {
          sidebar.classList.toggle('active');
        }
      });
    }

    // Mobile menu toggle
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        sidebar.classList.toggle('active');
      });
    }

    // Close sidebar on mobile when clicking outside
    document.addEventListener('click', function(event) {
      if (window.innerWidth <= 1024) {
        if (!sidebar.contains(event.target) && 
            !mobileMenuBtn.contains(event.target) && 
            sidebar.classList.contains('active')) {
          sidebar.classList.remove('active');
        }
      }
    });

    // Logout functionality
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        localStorage.removeItem('loggedInUserId');
        localStorage.removeItem('userRole');
        window.location.href = '/html/Main_login.html';
      });
    }

    // Window resize handler
    let resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        if (window.innerWidth > 1024) {
          sidebar.classList.remove('active');
        }
      }, 250);
    });
  }

  // Public API
  window.initializeSidebar = function(activePage = 'dashboard') {
    window.sidebarActivePage = activePage;
    createSidebar(activePage);
    initializeSidebar();
  };

  // Auto-initialize on DOMContentLoaded if data-sidebar attribute exists
  document.addEventListener('DOMContentLoaded', function() {
    const body = document.body;
    const autoInit = body.getAttribute('data-sidebar');
    if (autoInit) {
      window.initializeSidebar(autoInit);
    }
  });
})();
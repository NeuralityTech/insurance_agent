document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('proposed-container');
    if (!container) {
        console.error('Error: The container element with ID "proposed-container" was not found.');
        return;
    }

    // Clear any existing content
    container.innerHTML = '';

    // Retrieve and parse the plans data from localStorage
    const plansData = localStorage.getItem('plans');
    if (!plansData) {
        container.innerHTML = '<p>No proposed plans found. Please go back and submit the form first.</p>';
        return;
    }

    try {
        const plansByMember = JSON.parse(plansData);
        const memberKeys = Object.keys(plansByMember);

        if (memberKeys.length === 0) {
            container.innerHTML = '<p>No suitable plans were found based on the provided details.</p>';
            return;
        }

        // Loop through each member and display their plans
        for (const memberKey in plansByMember) {
            const memberInfo = plansByMember[memberKey];
            
            // Create a container for this member's section
            const memberSection = document.createElement('div');
            memberSection.className = 'member-plan-section';

            // Add the member's name as a heading
            const memberName = document.createElement('h2');
            memberName.textContent = memberInfo.name || 'Unnamed Member';
            memberSection.appendChild(memberName);

            // Create a list for the plans
            const planList = document.createElement('ul');
            
            if (memberInfo.plans && memberInfo.plans.length > 0) {
                memberInfo.plans.forEach(planName => {
                    const listItem = document.createElement('li');
                    listItem.textContent = planName;
                    planList.appendChild(listItem);
                });
            } else {
                const listItem = document.createElement('li');
                listItem.textContent = 'No specific plans found for this member.';
                planList.appendChild(listItem);
            }
            
            memberSection.appendChild(planList);
            container.appendChild(memberSection);
        }
    } catch (error) {
        console.error('Error parsing plans data from localStorage:', error);
        container.innerHTML = '<p>There was an error loading the proposed plans. Please try again.</p>';
    }
});

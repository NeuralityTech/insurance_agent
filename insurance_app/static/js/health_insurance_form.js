/*
 * This script is intended to display a list of members from local 
storage on the 'Members to be Covered' page.
 * It targets the 'members-list' element in 'Members_to_be_Covered.html'.
 * WARNING: This script is currently not included in any HTML file and is
 * therefore UNUSED.
 */
document.addEventListener('DOMContentLoaded', () => {
    const membersList = document.getElementById('members-list');

    if (membersList) {
        const members = JSON.parse(localStorage.getItem('members')) || [];

        if (members.length > 0) {
            members.forEach(member => {
                const memberEntry = document.createElement('div');
                memberEntry.classList.add('member-entry');
                memberEntry.setAttribute('data-tooltip', `DOB: ${member.dob} | Height: ${member.height}cm | Weight: ${member.weight}kg | Smoker: ${member.isSmoker ? 'Yes' : 'No'}`);

                const memberSummary = document.createElement('span');
                memberSummary.textContent = `${member.name} - ${member.relationship} - BMI: ${member.bmi}`;
                
                memberEntry.appendChild(memberSummary);
                membersList.appendChild(memberEntry);
            });
        }
    }
});

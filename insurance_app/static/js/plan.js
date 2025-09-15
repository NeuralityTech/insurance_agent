// plan.js - dynamically display primary contact and member-specific plans using dummy JSON

document.addEventListener('DOMContentLoaded', () => {
    const data = {
        primaryContact: {
            fullName: "John Doe",
            age: 35,
            uniqueId: "JohnDoe_9876543210"
        },
        memberPlans: {
            "member1": {
                "name": "John Doe",
                "details": { "age": 35, "relationship": "Self", "bmi": 24.2 },
                "plans": [
                    {
                        planName: "Basic Plan",
                        description: "Affordable coverage for individuals.",
                        price: "$150/month",
                        sumInsured: "$100,000",
                        features: ["Hospitalization", "Doctor Consult"]
                    },
                    {
                        planName: "Standard Plan",
                        description: "Balanced coverage for small families.",
                        price: "$250/month",
                        sumInsured: "$250,000",
                        features: ["OPD", "Pharmacy Cover"]
                    }
                ]
            },
            "member2": {
                "name": "Jane Doe",
                "details": { "age": 32, "relationship": "Spouse", "bmi": 22.8 },
                "plans": [
                    {
                        planName: "Premium Plan",
                        description: "Comprehensive coverage for families.",
                        price: "$400/month",
                        sumInsured: "$500,000",
                        features: ["Maternity", "Dental", "Wellness"]
                    }
                ]
            }
        }
    };

    // Display primary contact info
    const pcDiv = document.getElementById('primary-contact-info');
    if (pcDiv) {
        pcDiv.innerHTML = 
            `<p><strong>Name:</strong> ${data.primaryContact.fullName} | 
            <strong>Age:</strong> ${data.primaryContact.age} | 
            <strong>ID:</strong> ${data.primaryContact.uniqueId}</p>`;
    }

    // Render plans per member
    const container = document.getElementById('member-plans-container');
    if (container) {
        Object.entries(data.memberPlans).forEach(([memberKey, member], idx) => {
            // Member group as fieldset with legend
            const group = document.createElement('fieldset');
            group.className = 'member-group';

            const legend = document.createElement('legend');
            legend.textContent = member.name;
            group.appendChild(legend);

            // Member details shown as label chips
            const detailsWrap = document.createElement('div');
            detailsWrap.className = 'member-details';
            const detailEntries = [
                { label: 'Name', value: member.name },
                { label: 'Age', value: member.details?.age ?? 'N/A' },
                { label: 'Relationship', value: member.details?.relationship ?? 'N/A' },
                { label: 'BMI', value: member.details?.bmi ?? 'N/A' }
            ];
            detailEntries.forEach(d => {
                const lab = document.createElement('label');
                lab.className = 'detail-chip';
                lab.innerHTML = `<span class="chip-key">${d.label}:</span> <span class="chip-val">${d.value}</span>`;
                detailsWrap.appendChild(lab);
            });
            group.appendChild(detailsWrap);

            // Plans container (scrollable)
            const plansWrap = document.createElement('div');
            plansWrap.className = 'member-plan-cards';

            member.plans.forEach(plan => {
                const card = document.createElement('label');
                card.className = 'plan-card';
                card.innerHTML = `
                    <input type="radio" name="plan-${idx}" value="${plan.planName}">
                    <div class="plan-content">
                        <h2 class="plan-title">${plan.planName}</h2>
                        <p class="plan-description">${plan.description}</p>
                        <ul class="plan-details">
                            <li><strong>Premium:</strong> ${plan.premium}</li>
                            <li><strong>Sum Insured:</strong> ${plan.sumInsured}</li>
                            <li><strong>Features:</strong> ${plan.features.join(', ')}</li>
                        </ul>
                    </div>
                `;
                plansWrap.appendChild(card);
            });

            group.appendChild(plansWrap);
            container.appendChild(group);
        });
    }
});

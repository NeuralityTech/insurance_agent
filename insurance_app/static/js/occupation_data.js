/**
 * Occupation data with hazard classification
 * Used by occupation_dropdown.js for searchable dropdown functionality
 */

const OCCUPATION_DATA = {
    // Hazardous Occupations
    hazardous: [
        'Mining Engineer',
        'Coal Miner',
        'Oil Rig Worker',
        'Construction Worker',
        'Demolition Expert',
        'Explosive Handler',
        'Firefighter',
        'Chemical Plant Operator',
        'Nuclear Plant Worker',
        'High-Altitude Worker',
        'Deep Sea Diver',
        'Aircraft Pilot (Commercial)',
        'Helicopter Pilot',
        'Stunt Performer',
        'Logger/Lumberjack',
        'Pesticide Applicator',
        'Hazardous Waste Handler',
        'Heavy Machinery Operator',
        'Crane Operator',
        'Scaffolding Erector',
        'Roofing Contractor',
        'Welder (Industrial)',
        'Electrician (High Voltage)',
        'Power Line Worker',
        'Underwater Welder',
        'Blast Furnace Operator',
        'Asbestos Removal Specialist',
        'Radiation Technician',
        'Military Personnel (Active Duty)',
        'Police Officer',
        'Security Guard (Armed)',
        'Prison Guard'
    ],
    
    // Non-Hazardous Occupations
    nonHazardous: [
        'Software Engineer',
        'Teacher',
        'Professor',
        'Doctor',
        'Nurse',
        'Accountant',
        'Financial Analyst',
        'Business Analyst',
        'Marketing Manager',
        'Sales Executive',
        'Lawyer',
        'Architect',
        'Designer',
        'Writer',
        'Journalist',
        'Editor',
        'Librarian',
        'Pharmacist',
        'Dentist',
        'Psychologist',
        'Social Worker',
        'Human Resources Manager',
        'Administrative Assistant',
        'Office Manager',
        'Consultant',
        'Banker',
        'Insurance Agent',
        'Real Estate Agent',
        'Retail Manager',
        'Customer Service Representative',
        'Data Analyst',
        'Research Scientist',
        'Laboratory Technician',
        'Engineer (Civil)',
        'Engineer (Mechanical)',
        'Engineer (Electrical)',
        'Project Manager',
        'Product Manager',
        'Chef',
        'Restaurant Manager',
        'Hotel Manager',
        'Event Planner',
        'Photographer',
        'Graphic Designer',
        'Web Developer',
        'IT Support Specialist',
        'System Administrator',
        'Network Administrator',
        'Database Administrator',
        'Auditor',
        'Tax Consultant',
        'Investment Advisor',
        'Actuary',
        'Statistician',
        'Economist',
        'Urban Planner',
        'Interior Designer',
        'Fashion Designer',
        'Musician',
        'Artist',
        'Art Director',
        'Content Creator',
        'Translator',
        'Interpreter',
        'Receptionist',
        'Secretary',
        'Personal Assistant',
        'Executive Assistant',
        'Operations Manager',
        'Quality Assurance Analyst',
        'Training Manager',
        'Student',
        'Retired',
        'Homemaker',
        'Self-Employed (Non-Hazardous)'
    ]
};

// Flatten all occupations for search functionality
const ALL_OCCUPATIONS = [
    ...OCCUPATION_DATA.hazardous,
    ...OCCUPATION_DATA.nonHazardous
].sort();

// Function to check if an occupation is hazardous
function isHazardousOccupation(occupation) {
    if (!occupation || occupation.toLowerCase() === 'other') {
        return null; // Return null for 'Other' or empty values
    }
    return OCCUPATION_DATA.hazardous.some(
        hazOcc => hazOcc.toLowerCase() === occupation.toLowerCase()
    );
}
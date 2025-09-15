/*
 * This file contains reusable calculation functions for the application.
 * It is used by: Health_Insurance_Requirement_Form.html
 * NOTE: The functions in this file are also declared in member_details.js. This is redundant and should be refactored.
 */

/**
 * Calculates Body Mass Index (BMI) from height and weight.
 * This function is used in validation.js and member_details.js.
 * @param {number} height - Height in centimeters.
 * @param {number} weight - Weight in kilograms.
 * @returns {string|null} The calculated BMI, or null if inputs are invalid.
 */
function calculateBmi(height, weight) {
    if (height > 0 && weight > 0) {
        return (weight / Math.pow(height / 100, 2)).toFixed(2);
    }
    return null;
}

/**
 * Calculates the age from a given date of birth.
 * This function is used in validation.js and member_details.js.
 * @param {string} dobString - The date of birth in 'YYYY-MM-DD' format.
 * @returns {number|null} The calculated age, or null if the input is invalid.
 */
function calculateAge(dobString) {
    const dob = new Date(dobString);
    if (!dobString || isNaN(dob.getTime())) {
        return null;
    }
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age >= 0 ? age : null;
}
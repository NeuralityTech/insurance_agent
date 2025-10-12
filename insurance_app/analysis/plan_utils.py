import pandas as pd

def get_plan_capacity(policy_code):
    """Parses a Policy_Code to extract the number of adults and children it supports."""
    if pd.isna(policy_code) or not isinstance(policy_code, str):
        return (1, 0) # Default to a single adult plan
    parts = policy_code.strip().upper().split('_')
    if len(parts) != 3 or not parts[1].isdigit() or not parts[2].isdigit():
        return (1, 0) # Default for non-standard codes
    
    adults = int(parts[1])
    children = int(parts[2])
    return (adults, children)

def is_plan_valid_for_family(policy_code, num_adults, num_children, logger):
    if pd.isna(policy_code) or not isinstance(policy_code, str) or not policy_code.strip():
        return True  # Assume valid if no code is specified

    code = policy_code.strip().upper()

    if code == 'ADN_NA_0':
        return True  # Add-on plan, always valid as it depends on a base plan

    # Total members in the family
    total_members = num_adults + num_children
    if total_members == 0:
        return False  # No plan is valid for an empty family

    # New Rule: Floater plans are only valid for families with more than one member.
    if 'FLO' in code and total_members <= 1:
        return False

    # Handle special case MIX_1_1: One adult OR one child
    if code == 'MIX_1_1':
        return (num_adults == 1 and num_children == 0) or (num_adults == 0 and num_children == 1)

    parts = code.split('_')
    if len(parts) != 3:
        logger.warning(f"Unrecognized Policy_Code format '{policy_code}'. Assuming it's a flexible plan to avoid incorrect filtering.")
        return True

    plan_type, adult_part, child_part = parts

    try:
        # --- Parse Adult Limit ---
        if adult_part.isdigit():
            max_adults = int(adult_part)
        elif adult_part == 'SR' and plan_type == 'FLO': # FLO_Sr_2_0
            # Senior-specific logic can be added here if age definitions are provided.
            # For now, we treat it as a standard 2-adult plan.
            max_adults = 2
        else:
            raise ValueError(f"Invalid adult part: {adult_part}")

        # --- Parse Child Limit ---
        if child_part.isdigit():
            max_children = int(child_part)
            min_children = 0
        elif child_part == 'GT0':
            max_children = 6  # Cap at a realistic number
            min_children = 1
        else:
            raise ValueError(f"Invalid child part: {child_part}")

        # --- Validate against family structure ---
        if num_adults > max_adults:
            return False
        if num_children > max_children:
            return False
        if num_children < min_children:
            return False
        
        # An individual plan should only be proposed for a single person.
        if plan_type == 'IND' and total_members > 1:
            return False

        return True

    except (ValueError, IndexError) as e:
        logger.error(f"Error parsing Policy_Code '{policy_code}': {e}")
        return True  # Assume valid on parsing error to avoid incorrectly filtering

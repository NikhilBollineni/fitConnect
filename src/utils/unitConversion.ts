export type WeightUnit = 'kg' | 'lbs' | 'bw';

export const KG_TO_LBS = 2.20462;
export const LBS_TO_KG = 0.453592;

/**
 * Converts a weight value from one unit to another.
 * @param value The numerical value to convert
 * @param from The current unit
 * @param to The target unit
 * @returns The converted value, rounded to 1 decimal place if converted, or the original value if units match.
 */
export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
    if (from === to) return value;
    if (from === 'bw' || to === 'bw') return value; // Bodyweight doesn't convert simply

    let converted = value;
    if (from === 'kg' && to === 'lbs') {
        converted = value * KG_TO_LBS;
    } else if (from === 'lbs' && to === 'kg') {
        converted = value * LBS_TO_KG;
    }

    // Round to 1 decimal place for precision, or integer if close
    return Math.round(converted * 10) / 10;
}

/**
 * Parses a weight string (e.g., "100lbs" or "60kg") and converts it to the preferred unit.
 * @param raw The raw string or number from Firestore/Plan
 * @param preferredUnit The user's preferred unit ('kg' or 'lbs')
 * @returns The numerical value converted to the preferred unit.
 */
export function getConvertedWeight(raw: string | number | undefined, preferredUnit: WeightUnit): number {
    if (raw === undefined || raw === null) return 0;

    // 1. Parse the raw value and its implicit unit
    const str = raw.toString().trim().toLowerCase();
    if (str === 'bw' || str === 'bodyweight') return 0;

    const value = parseFloat(str.replace(/[^0-9.]/g, ''));
    if (isNaN(value)) return 0;

    // Detect unit from string, default to kg if not specified (legacy fallback)
    let originalUnit: WeightUnit = 'kg';
    if (str.includes('lbs') || str.includes('lb')) {
        originalUnit = 'lbs';
    } else if (str.includes('kg')) {
        originalUnit = 'kg';
    } else {
        // If no unit is in the string, we might assume it's in a specific base unit.
        // For FitConnect, we'll assume the number ALREADY matches the preferred unit 
        // IF there's no suffix, to avoid double conversion on user input.
        return value;
    }

    return convertWeight(value, originalUnit, preferredUnit);
}

import { Timestamp } from 'firebase/firestore';
import { getConvertedWeight, WeightUnit } from './unitConversion';

// Types
export interface WorkoutLog {
    id: string;
    completedAt?: Timestamp;
    createdAt?: Timestamp;
    exercises?: {
        name: string;
        sets?: {
            weight: number | string;
            reps: number | string;
            weightUnit?: WeightUnit; // Optional unit from some logs
            actualWeight?: number | string; // Some logs use this
        }[];
    }[];
}

export interface AnalyticsStats {
    totalWorkouts: number;
    totalVolume: number; // in preferred unit
    workoutDuration: number; // minutes
    streak: number;
    lastWorkoutDate: Date | null;
    avgWeightPerSet: number; // in preferred unit
}

export const calculateStats = (logs: WorkoutLog[], preferredUnit: WeightUnit = 'kg'): AnalyticsStats => {
    let totalVolume = 0;
    let streak = 0;
    let lastDate: Date | null = null;
    let globalWeightSum = 0;
    let totalSets = 0;

    // Helper to get date
    const getDate = (log: WorkoutLog) => (log.completedAt || log.createdAt)?.toDate() || new Date();

    // Sort logs by date descending
    const sortedLogs = [...logs].sort((a, b) => getDate(b).getTime() - getDate(a).getTime());

    if (sortedLogs.length > 0) {
        lastDate = getDate(sortedLogs[0]);

        // Calculate Streak
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const lastWorkoutDay = new Date(lastDate);
        lastWorkoutDay.setHours(0, 0, 0, 0);

        // If last workout was today or yesterday, streak is alive
        const diffDays = Math.floor((today.getTime() - lastWorkoutDay.getTime()) / (1000 * 3600 * 24));

        if (diffDays <= 1) {
            streak = 1;
            for (let i = 0; i < sortedLogs.length - 1; i++) {
                const current = getDate(sortedLogs[i]);
                const prev = getDate(sortedLogs[i + 1]);

                current.setHours(0, 0, 0, 0);
                prev.setHours(0, 0, 0, 0);

                const gap = Math.floor((current.getTime() - prev.getTime()) / (1000 * 3600 * 24));
                if (gap === 1) {
                    streak++;
                } else if (gap > 1) {
                    break;
                }
            }
        }
    }

    // Calculate total volume and avg weight
    logs.forEach(log => {
        log.exercises?.forEach(ex => {
            ex.sets?.forEach(set => {
                // Use helper to get weight in correct unit
                // Prefer actualWeight if available, else weight
                const rawWeight = set.weight !== undefined ? set.weight : set.actualWeight;
                const weight = getConvertedWeight(rawWeight, preferredUnit);

                const reps = parseFloat(String(set.reps)) || 0;

                totalVolume += weight * reps;
                totalSets += 1;

                if (weight > 0) {
                    globalWeightSum += weight;
                }
            });
        });
    });

    const avgWeightPerSet = totalSets > 0 ? Math.round(globalWeightSum / totalSets) : 0;

    return {
        totalWorkouts: logs.length,
        totalVolume: Math.round(totalVolume),
        workoutDuration: logs.length * 45, // Placeholder
        streak,
        lastWorkoutDate: lastDate,
        avgWeightPerSet
    };
};

export const getMuscleSplit = (logs: WorkoutLog[]) => {
    const split: Record<string, number> = {};
    let totalSets = 0;

    logs.forEach(log => {
        log.exercises?.forEach(ex => {
            const name = ex.name.toLowerCase();
            let group = 'Other';

            // Enhanced categorization with specific overrides first
            if (name.includes('lateral raise') || name.includes('rear delt') || name.includes('face pull') || name.includes('upright row')) group = 'Shoulders';
            else if (name.includes('calf') || name.includes('glute') || name.includes('hamstring') || name.includes('quad')) group = 'Legs';
            else if (name.includes('bench') || name.includes('chest') || name.includes('push up') || name.includes('fly') || name.includes('dip') || name.includes('pec')) group = 'Chest';
            else if (name.includes('squat') || name.includes('leg') || name.includes('lunge') || name.includes('deadlift')) group = 'Legs';
            else if (name.includes('row') || name.includes('pull') || name.includes('back') || name.includes('lat')) group = 'Back';
            else if (name.includes('curl') || name.includes('bicep') || name.includes('hammer')) group = 'Biceps';
            else if (name.includes('tricep') || name.includes('extension') || name.includes('skullcrusher')) group = 'Triceps';
            else if (name.includes('shoulder') || name.includes('press') || name.includes('military') || name.includes('overhead') || name.includes('raise')) group = 'Shoulders';
            else if (name.includes('ab') || name.includes('crunch') || name.includes('plank')) group = 'Abs';

            const sets = ex.sets?.length || 0;
            split[group] = (split[group] || 0) + sets;
            totalSets += sets;
        });
    });

    return Object.entries(split).map(([name, count]) => ({
        name,
        count,
        percentage: totalSets > 0 ? Math.round((count / totalSets) * 100) : 0
    })).sort((a, b) => b.count - a.count);
};

// NEW: For Analytics Chart
export const getExercisesByMuscle = (logs: WorkoutLog[]) => {
    const grouped: Record<string, string[]> = {};

    logs.forEach(log => {
        log.exercises?.forEach(ex => {
            const name = ex.name.trim(); // Keep original case for display
            const lowerName = name.toLowerCase();

            let group = 'Other';

            // Enhanced categorization with specific overrides first (matches getMuscleSplit)
            if (lowerName.includes('lateral raise') || lowerName.includes('rear delt') || lowerName.includes('face pull') || lowerName.includes('upright row')) group = 'Shoulders';
            else if (lowerName.includes('calf') || lowerName.includes('glute') || lowerName.includes('hamstring') || lowerName.includes('quad')) group = 'Legs';
            else if (lowerName.includes('bench') || lowerName.includes('chest') || lowerName.includes('push up') || lowerName.includes('fly') || lowerName.includes('dip') || lowerName.includes('pec')) group = 'Chest';
            else if (lowerName.includes('squat') || lowerName.includes('leg') || lowerName.includes('lunge') || lowerName.includes('deadlift')) group = 'Legs';
            else if (lowerName.includes('row') || lowerName.includes('pull') || lowerName.includes('back') || lowerName.includes('lat')) group = 'Back';
            else if (lowerName.includes('curl') || lowerName.includes('bicep') || lowerName.includes('hammer')) group = 'Biceps';
            else if (lowerName.includes('tricep') || lowerName.includes('extension') || lowerName.includes('skullcrusher')) group = 'Triceps';
            else if (lowerName.includes('shoulder') || lowerName.includes('press') || lowerName.includes('military') || lowerName.includes('overhead') || lowerName.includes('raise')) group = 'Shoulders';
            else if (lowerName.includes('ab') || lowerName.includes('crunch') || lowerName.includes('plank')) group = 'Abs';

            if (!grouped[group]) grouped[group] = [];
            if (!grouped[group].includes(name)) grouped[group].push(name);
        });
    });

    return grouped;
};

export const getExerciseHistory = (logs: WorkoutLog[], exerciseName: string, preferredUnit: WeightUnit = 'kg') => {
    const history: { date: string; weight: number; originalDate: Date }[] = [];
    const getDate = (log: WorkoutLog) => (log.completedAt || log.createdAt)?.toDate() || new Date();

    // Sort logs by date ASC for chart
    const sortedLogs = [...logs].sort((a, b) => getDate(a).getTime() - getDate(b).getTime());

    sortedLogs.forEach(log => {
        log.exercises?.forEach(ex => {
            if (ex.name.toLowerCase() === exerciseName.toLowerCase()) {
                // Find MAX weight for this session
                let maxWeight = 0;
                ex.sets?.forEach(s => {
                    const rawWeight = s.weight !== undefined ? s.weight : s.actualWeight;
                    const w = getConvertedWeight(rawWeight, preferredUnit);
                    if (w > maxWeight) maxWeight = w;
                });

                if (maxWeight > 0) {
                    history.push({
                        date: getDate(log).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        weight: maxWeight,
                        originalDate: getDate(log)
                    });
                }
            }
        });
    });

    return history;
};

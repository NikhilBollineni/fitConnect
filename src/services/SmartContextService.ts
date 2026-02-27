import { db } from '../lib/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

export interface LastWeekMetrics {
    totalExercises: number;
    totalSets: number;
    avgWeightPerSet: number;
    totalVolume: number;
    date: string; // e.g. "Feb 6"
}

export interface SmartContext {
    type: 'PLAN' | 'HISTORY' | 'EMPTY' | 'COMPLETED';
    title: string;
    subtitle: string;
    data: any;
    contextMessage?: string;
    lastWeekMetrics?: LastWeekMetrics | null;
}

/**
 * Calculates metrics from a workout log document.
 */
function calculateMetrics(logData: any): LastWeekMetrics {
    const exercises = logData.exercises || [];
    let totalSets = 0;
    let totalWeight = 0;
    let weightedSetCount = 0;
    let totalVolume = 0;

    exercises.forEach((ex: any) => {
        const sets = ex.sets || [];
        totalSets += sets.length;
        sets.forEach((s: any) => {
            const w = parseFloat(s.weight || s.targetWeight || '0') || 0;
            const r = parseFloat(s.reps || s.targetReps || '0') || 0;
            if (w > 0) {
                totalWeight += w;
                weightedSetCount++;
            }
            totalVolume += w * r;
        });
    });

    // Format the date
    let dateStr = 'Last week';
    try {
        const d = logData.createdAt?.toDate?.() || logData.date?.toDate?.();
        if (d) {
            dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
    } catch { /* ignore */ }

    return {
        totalExercises: exercises.length,
        totalSets,
        avgWeightPerSet: weightedSetCount > 0 ? Math.round(totalWeight / weightedSetCount) : 0,
        totalVolume: Math.round(totalVolume),
        date: dateStr,
    };
}

/**
 * Transforms a Firestore plan document into the WorkoutData shape
 * that WorkoutView expects (with proper set IDs, completed flags, etc.)
 */
function transformPlanToWorkoutData(plan: any): any {
    const exercises = (plan.exercises || []).map((ex: any, exIdx: number) => ({
        id: `e_${Date.now()}_${exIdx}`,
        name: ex.name,
        sets: (ex.sets || []).map((s: any, sIdx: number) => ({
            id: `s_${Date.now()}_${exIdx}_${sIdx}`,
            targetReps: (s.targetReps || '10').toString(),
            targetWeight: (s.targetWeight || '0').toString(),
            completed: false,
            actualReps: '',
            actualWeight: '',
        })),
        feedback: '',
    }));

    return {
        id: plan.id || `plan_${Date.now()}`,
        title: plan.name || 'Workout',
        duration: plan.duration || '45 min',
        exercises,
    };
}

export const SmartContextService = {
    async getNextWorkout(userId: string, userRole: 'client' | 'trainer' | 'solo'): Promise<SmartContext> {
        const today = new Date();
        const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });

        // ─── Fetch recent logs (single query, no composite index needed) ───
        let todayLog: any = null;
        let lastWeekMetrics: LastWeekMetrics | null = null;

        try {
            const logsRef = collection(db, 'workoutLogs');
            // Simple single-field query — no composite index required
            const q = query(
                logsRef,
                where('clientId', '==', userId),
                limit(30)
            );
            const snapshot = await getDocs(q);

            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                const logDate = data.createdAt?.toDate?.();
                if (!logDate) continue;

                // Check if this log is from TODAY
                if (!todayLog && logDate >= startOfDay) {
                    todayLog = { id: docSnap.id, ...data };
                }

                // Check if this log is from the same weekday but NOT today (last week's metrics)
                if (!lastWeekMetrics &&
                    logDate.getDay() === today.getDay() &&
                    logDate.toDateString() !== today.toDateString()) {
                    lastWeekMetrics = calculateMetrics(data);
                }

                // Early exit if we found both
                if (todayLog && lastWeekMetrics) break;
            }
        } catch (e) {
            ("SmartContext: Could not fetch logs (ok for new users)", e);
        }

        // ─── 0. COMPLETED: Already worked out today ───
        if (todayLog) {
            const metrics = calculateMetrics(todayLog);
            return {
                type: 'COMPLETED',
                title: "Great Job today!",
                subtitle: "Workout Complete",
                contextMessage: "Time to recover! Eat some protein. 🍗",
                data: todayLog,
                lastWeekMetrics: metrics,
            };
        }

        // ─── 1. CLIENT: Check for Trainer-Assigned Plan for TODAY ───
        if (userRole === 'client') {
            try {
                const plansRef = collection(db, 'plans');
                const q = query(
                    plansRef,
                    where('clientId', '==', userId),
                    where('scheduledDay', '==', dayName),
                    limit(1)
                );
                const snapshot = await getDocs(q);

                if (!snapshot.empty) {
                    const planDoc = snapshot.docs[0];
                    const plan = { id: planDoc.id, ...planDoc.data() };
                    const workoutData = transformPlanToWorkoutData(plan);

                    return {
                        type: 'PLAN',
                        title: `It's ${dayName}`,
                        subtitle: (plan as any).name || 'Assigned Workout',
                        contextMessage: "Your coach programmed this for you. Trust the process! 💪",
                        data: workoutData,
                        lastWeekMetrics,
                    };
                }
            } catch (e) {
                console.error("SmartContext: Error fetching plan", e);
            }
        }

        // ─── 2. SOLO / No Plan: Check History ───
        try {
            const logsRef = collection(db, 'workoutLogs');
            const q = query(
                logsRef,
                where('clientId', '==', userId),
                limit(20)
            );
            const snapshot = await getDocs(q);
            // Sort client-side to avoid composite index requirement
            const sortedDocs = snapshot.docs.sort((a, b) =>
                (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0)
            );

            const lastSameDayLog = sortedDocs.find(doc => {
                const data = doc.data();
                const logDate = data.createdAt?.toDate?.();
                if (!logDate) return false;
                return logDate.getDay() === today.getDay();
            });

            if (lastSameDayLog) {
                const log = { id: lastSameDayLog.id, ...lastSameDayLog.data() };
                return {
                    type: 'HISTORY',
                    title: `It's ${dayName}`,
                    subtitle: "Repeat Last Session?",
                    contextMessage: "You crushed it last time. Let's go again! 🔥",
                    data: log,
                    lastWeekMetrics,
                };
            }
        } catch (e) {
            console.error("SmartContext: Error fetching history", e);
        }

        // ─── 3. FALLBACK: Starter Workout ───
        const STARTER_WORKOUT = {
            id: 'starter_' + Date.now(),
            title: 'Full Body Starter',
            duration: '45 min',
            exercises: [
                {
                    id: 'e1', name: 'Barbell Squat',
                    sets: [
                        { id: 's1', targetReps: '10', targetWeight: '20', completed: false, actualReps: '', actualWeight: '' },
                        { id: 's2', targetReps: '10', targetWeight: '20', completed: false, actualReps: '', actualWeight: '' },
                        { id: 's3', targetReps: '10', targetWeight: '20', completed: false, actualReps: '', actualWeight: '' },
                    ],
                    feedback: ''
                },
                {
                    id: 'e2', name: 'Bench Press',
                    sets: [
                        { id: 's4', targetReps: '10', targetWeight: '20', completed: false, actualReps: '', actualWeight: '' },
                        { id: 's5', targetReps: '10', targetWeight: '20', completed: false, actualReps: '', actualWeight: '' },
                        { id: 's6', targetReps: '10', targetWeight: '20', completed: false, actualReps: '', actualWeight: '' },
                    ],
                    feedback: ''
                },
                {
                    id: 'e3', name: 'Dumbbell Row',
                    sets: [
                        { id: 's7', targetReps: '12', targetWeight: '10', completed: false, actualReps: '', actualWeight: '' },
                        { id: 's8', targetReps: '12', targetWeight: '10', completed: false, actualReps: '', actualWeight: '' },
                        { id: 's9', targetReps: '12', targetWeight: '10', completed: false, actualReps: '', actualWeight: '' },
                    ],
                    feedback: ''
                }
            ]
        };

        return {
            type: 'PLAN',
            title: "Ready to Train?",
            subtitle: "Try this Starter Routine",
            contextMessage: "A perfect full-body session to get you moving. 🚀",
            data: STARTER_WORKOUT,
            lastWeekMetrics: null,
        };
    }
};

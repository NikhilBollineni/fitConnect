import { Timestamp } from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────────
//  Canonical Firestore Document Types for FitConnect
//  All Firestore reads/writes should use these types.
// ─────────────────────────────────────────────────────────────────

// ─── Weight Unit ───
export type WeightUnit = 'kg' | 'lbs' | 'bw';

export type UserRole = 'client' | 'trainer';

// ─── users/{authUid} — now consolidated into clientProfiles ───
export interface UserProfile {
    id: string;                          // Firebase Auth UID (= doc ID)
    name: string;
    email: string;
    role: UserRole | null;
    photoURL?: string | null;
    trainerId?: string | null;           // Auth UID of assigned trainer (clients only)
    // Client-specific onboarding fields
    age?: number;
    height?: string;
    weight?: string;
    goal?: string;
    experience?: string;
    bio?: string;
    location?: string;
    isVisibleToTrainers?: boolean;
    preferredWeightUnit?: WeightUnit;

    // Trainer-assigned plans
    dietPlan?: Record<string, DietMeal>;        // key: "Monday", etc.
    exercisePlan?: Record<string, ExercisePlanItem[]>; // key: "Monday", etc.

    // Invite code system
    inviteCode?: string;
    isClaimed?: boolean;
    claimedAt?: Timestamp | null;
    status?: 'pending_claim' | 'active';
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface DietMeal {
    breakfast: string;
    lunch: string;
    dinner: string;
    snacks: string;
}

export interface ExercisePlanItem {
    name: string;
    sets: number;
    reps: number;
    weight: string;
    notes: string;
}

// ─── workoutLogs/{autoId} ───
export interface WorkoutLogSet {
    weight: number;                      // ALWAYS a number
    weightUnit: WeightUnit;
    reps: number;                        // ALWAYS a number
    completed: boolean;
}

export interface WorkoutLogExercise {
    name: string;
    sets: WorkoutLogSet[];
    notes: string;
}

export interface WorkoutLog {
    clientId: string;                    // Auth UID
    trainerId: string | null;            // Auth UID of assigned trainer
    planId?: string | null;              // Reference to the plan doc used
    title: string;
    duration: number;                    // MINUTES as number (not "45 min")
    status: 'in_progress' | 'completed';
    exercises: WorkoutLogExercise[];
    totalVolume: number;                 // Pre-calculated: Σ(weight × reps)
    createdAt: Timestamp;
    completedAt: Timestamp | null;
}

// ─── plans/{autoId} — one doc per scheduled day ───
export interface PlanExerciseSet {
    targetWeight: number;
    targetReps: number;
    weightUnit: WeightUnit;
}

export interface PlanExercise {
    name: string;
    sets: PlanExerciseSet[];
}

export interface Plan {
    clientId: string;                    // Auth UID
    trainerId: string;                   // Auth UID
    scheduledDay: string;                // "Monday" | "Tuesday" | ...
    programName: string;                 // "Hypertrophy Phase 1"
    name: string;                        // "Upper Power"
    exercises: PlanExercise[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

// ─── trainerRequests/{autoId} ───
export interface TrainerRequest {
    trainerId: string;
    trainerName: string;
    clientId: string;
    clientName: string;
    status: 'pending' | 'accepted' | 'declined';
    message: string;
    createdAt: Timestamp;
}

// ─── chats/{autoId} ───
export interface Chat {
    participants: string[];              // [trainerId, clientId]
    participantNames: Record<string, string>;
    lastMessage: string;
    unreadCount?: Record<string, number>;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

// ─── chats/{chatId}/messages/{autoId} ───
export interface WorkoutSummaryMetadata {
    type: 'workout_summary';
    workoutLogId: string;
    workoutTitle: string;
    duration: number;
    exercisesCount: number;
    totalVolume: number;
}

export interface ChatMessage {
    text: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string;
    metadata?: WorkoutSummaryMetadata | null;
    createdAt: Timestamp;
}

// ─── Helper: Parse weight string → number ───
export function parseWeight(raw: string | number | undefined): { value: number; unit: WeightUnit } {
    if (typeof raw === 'number') return { value: raw, unit: 'kg' };
    if (!raw) return { value: 0, unit: 'kg' };

    const str = raw.toString().trim().toLowerCase();
    if (str === 'bw' || str === 'bodyweight') return { value: 0, unit: 'bw' };

    const num = parseFloat(str.replace(/[^0-9.]/g, ''));
    const unit: WeightUnit = str.includes('lbs') || str.includes('lb') ? 'lbs' : 'kg';
    return { value: isNaN(num) ? 0 : num, unit };
}

// ─── Helper: Parse reps string → number ───
export function parseReps(raw: string | number | undefined): number {
    if (typeof raw === 'number') return raw;
    if (!raw) return 0;
    // Handle ranges like "10-12" — take the first number
    const num = parseFloat(raw.toString());
    return isNaN(num) ? 0 : num;
}

// ─── Helper: Calculate total volume from exercises ───
export function calculateTotalVolume(exercises: WorkoutLogExercise[]): number {
    if (!exercises || !Array.isArray(exercises)) return 0;
    return exercises.reduce((total, ex) => {
        if (!ex.sets || !Array.isArray(ex.sets)) return total;
        return total + ex.sets
            .filter(s => s.completed)
            .reduce((setTotal, s) => {
                const weight = s.weightUnit === 'bw' ? 0 : s.weight;
                return setTotal + (weight * s.reps);
            }, 0);
    }, 0);
}

// ─── Helper: Parse duration string → minutes ───
export function parseDuration(raw: string | number): number {
    if (typeof raw === 'number') return raw;
    const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : Math.round(num);
}

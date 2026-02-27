import { auth, db } from '../lib/firebase';
import { Alert } from 'react-native';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
} from 'firebase/auth';
import {
    doc, setDoc, addDoc, collection, serverTimestamp,
    Timestamp, getDocs, deleteDoc,
} from 'firebase/firestore';

// ─── Test Account Credentials ───────────────────────────────────────────────
export const TEST_ACCOUNTS = {
    trainer: { email: 'trainer@fitconnect.test', password: 'Test1234!', name: 'Coach Marcus Rivera' },
    client1: { email: 'client1@fitconnect.test', password: 'Test1234!', name: 'Sarah Chen' },
    client2: { email: 'client2@fitconnect.test', password: 'Test1234!', name: 'James Wilson' },
    client3: { email: 'client3@fitconnect.test', password: 'Test1234!', name: 'Priya Patel' },
    solo:    { email: 'solo@fitconnect.test',    password: 'Test1234!', name: 'Alex Kim' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function daysAgo(n: number): Timestamp {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));
    return Timestamp.fromDate(d);
}

function randomBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function ensureUser(email: string, password: string, displayName: string): Promise<string> {
    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        return cred.user.uid;
    } catch {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName });
        return cred.user.uid;
    }
}

// ─── Realistic Data ─────────────────────────────────────────────────────────

const DIET_PLANS: Record<string, { breakfast: string; lunch: string; dinner: string; snacks: string }> = {
    Monday:    { breakfast: 'Overnight oats with blueberries, chia seeds & honey', lunch: 'Grilled chicken breast, brown rice & steamed broccoli', dinner: 'Baked salmon fillet with roasted sweet potato & asparagus', snacks: 'Greek yogurt parfait, handful of almonds' },
    Tuesday:   { breakfast: 'Scrambled eggs (3) with avocado on sourdough toast', lunch: 'Turkey & quinoa stuffed bell peppers', dinner: 'Lean beef stir-fry with mixed vegetables & jasmine rice', snacks: 'Protein shake, apple slices with almond butter' },
    Wednesday: { breakfast: 'Protein smoothie bowl — banana, spinach, whey, granola', lunch: 'Tuna poke bowl with edamame & cucumber', dinner: 'Chicken fajitas with whole-wheat tortillas & guacamole', snacks: 'Cottage cheese with pineapple, rice cakes' },
    Thursday:  { breakfast: 'Greek yogurt with mixed berries & flaxseed', lunch: 'Grilled shrimp salad with avocado & lemon vinaigrette', dinner: 'Herb-crusted pork tenderloin with roasted vegetables', snacks: 'Trail mix, protein bar' },
    Friday:    { breakfast: 'Whole-wheat pancakes with banana & a drizzle of maple', lunch: 'Chicken Caesar wrap with side salad', dinner: 'Homemade turkey meatballs with whole-wheat pasta & marinara', snacks: 'Hummus with carrot & celery sticks' },
    Saturday:  { breakfast: 'Veggie omelette (mushroom, spinach, feta) & toast', lunch: 'Grilled fish tacos with mango salsa', dinner: 'Slow-cooked chicken curry with basmati rice', snacks: 'Dark chocolate square, mixed nuts' },
    Sunday:    { breakfast: 'Acai bowl with coconut flakes & sliced strawberries', lunch: 'Light minestrone soup with crusty bread', dinner: 'Grilled steak (6 oz) with baked potato & green beans', snacks: 'Smoothie, handful of cashews' },
};

interface SeedExercise {
    name: string;
    sets: { targetWeight: number | string; targetReps: number; weightUnit: 'kg' | 'lbs' | 'bw' }[];
    notes?: string;
}

const WORKOUT_TEMPLATES: Record<string, { name: string; programName: string; exercises: SeedExercise[] }> = {
    Monday: {
        name: 'Upper Power', programName: 'Hypertrophy Phase 1',
        exercises: [
            { name: 'Barbell Bench Press', sets: [{ targetWeight: 70, targetReps: 6, weightUnit: 'kg' }, { targetWeight: 75, targetReps: 5, weightUnit: 'kg' }, { targetWeight: 80, targetReps: 4, weightUnit: 'kg' }, { targetWeight: 75, targetReps: 6, weightUnit: 'kg' }], notes: 'Arch back, retract scapulae' },
            { name: 'Barbell Bent-Over Row', sets: [{ targetWeight: 60, targetReps: 8, weightUnit: 'kg' }, { targetWeight: 60, targetReps: 8, weightUnit: 'kg' }, { targetWeight: 65, targetReps: 6, weightUnit: 'kg' }] },
            { name: 'Overhead Press', sets: [{ targetWeight: 40, targetReps: 8, weightUnit: 'kg' }, { targetWeight: 40, targetReps: 8, weightUnit: 'kg' }, { targetWeight: 42.5, targetReps: 6, weightUnit: 'kg' }] },
            { name: 'Weighted Pull-Ups', sets: [{ targetWeight: 10, targetReps: 8, weightUnit: 'kg' }, { targetWeight: 10, targetReps: 8, weightUnit: 'kg' }, { targetWeight: 12.5, targetReps: 6, weightUnit: 'kg' }] },
        ],
    },
    Tuesday: {
        name: 'Lower Power', programName: 'Hypertrophy Phase 1',
        exercises: [
            { name: 'Barbell Back Squat', sets: [{ targetWeight: 90, targetReps: 5, weightUnit: 'kg' }, { targetWeight: 95, targetReps: 5, weightUnit: 'kg' }, { targetWeight: 100, targetReps: 3, weightUnit: 'kg' }, { targetWeight: 90, targetReps: 5, weightUnit: 'kg' }], notes: 'Below parallel, brace core' },
            { name: 'Romanian Deadlift', sets: [{ targetWeight: 80, targetReps: 8, weightUnit: 'kg' }, { targetWeight: 80, targetReps: 8, weightUnit: 'kg' }, { targetWeight: 85, targetReps: 6, weightUnit: 'kg' }], notes: 'Slow eccentric' },
            { name: 'Leg Press', sets: [{ targetWeight: 140, targetReps: 10, weightUnit: 'kg' }, { targetWeight: 160, targetReps: 8, weightUnit: 'kg' }, { targetWeight: 180, targetReps: 6, weightUnit: 'kg' }] },
            { name: 'Calf Raises', sets: [{ targetWeight: 60, targetReps: 15, weightUnit: 'kg' }, { targetWeight: 60, targetReps: 15, weightUnit: 'kg' }, { targetWeight: 60, targetReps: 15, weightUnit: 'kg' }] },
        ],
    },
    Thursday: {
        name: 'Upper Hypertrophy', programName: 'Hypertrophy Phase 1',
        exercises: [
            { name: 'Incline Dumbbell Press', sets: [{ targetWeight: 28, targetReps: 10, weightUnit: 'kg' }, { targetWeight: 30, targetReps: 10, weightUnit: 'kg' }, { targetWeight: 30, targetReps: 8, weightUnit: 'kg' }] },
            { name: 'Cable Row', sets: [{ targetWeight: 55, targetReps: 12, weightUnit: 'kg' }, { targetWeight: 55, targetReps: 12, weightUnit: 'kg' }, { targetWeight: 60, targetReps: 10, weightUnit: 'kg' }] },
            { name: 'Lateral Raises', sets: [{ targetWeight: 10, targetReps: 15, weightUnit: 'kg' }, { targetWeight: 10, targetReps: 15, weightUnit: 'kg' }, { targetWeight: 12, targetReps: 12, weightUnit: 'kg' }] },
            { name: 'Face Pulls', sets: [{ targetWeight: 15, targetReps: 15, weightUnit: 'kg' }, { targetWeight: 15, targetReps: 15, weightUnit: 'kg' }], notes: 'External rotate at top' },
            { name: 'Hammer Curls', sets: [{ targetWeight: 14, targetReps: 12, weightUnit: 'kg' }, { targetWeight: 14, targetReps: 12, weightUnit: 'kg' }] },
        ],
    },
    Friday: {
        name: 'Lower Hypertrophy', programName: 'Hypertrophy Phase 1',
        exercises: [
            { name: 'Front Squat', sets: [{ targetWeight: 60, targetReps: 8, weightUnit: 'kg' }, { targetWeight: 65, targetReps: 8, weightUnit: 'kg' }, { targetWeight: 70, targetReps: 6, weightUnit: 'kg' }], notes: 'Elbows high, upright torso' },
            { name: 'Hip Thrust', sets: [{ targetWeight: 80, targetReps: 10, weightUnit: 'kg' }, { targetWeight: 90, targetReps: 10, weightUnit: 'kg' }, { targetWeight: 100, targetReps: 8, weightUnit: 'kg' }] },
            { name: 'Bulgarian Split Squat', sets: [{ targetWeight: 16, targetReps: 10, weightUnit: 'kg' }, { targetWeight: 16, targetReps: 10, weightUnit: 'kg' }], notes: 'Each leg, DBs' },
            { name: 'Leg Curl', sets: [{ targetWeight: 40, targetReps: 12, weightUnit: 'kg' }, { targetWeight: 40, targetReps: 12, weightUnit: 'kg' }, { targetWeight: 45, targetReps: 10, weightUnit: 'kg' }] },
        ],
    },
    Saturday: {
        name: 'Full Body Conditioning', programName: 'Hypertrophy Phase 1',
        exercises: [
            { name: 'Deadlift', sets: [{ targetWeight: 100, targetReps: 5, weightUnit: 'kg' }, { targetWeight: 110, targetReps: 3, weightUnit: 'kg' }, { targetWeight: 120, targetReps: 2, weightUnit: 'kg' }], notes: 'Belt on for top set' },
            { name: 'Dumbbell Bench Press', sets: [{ targetWeight: 30, targetReps: 10, weightUnit: 'kg' }, { targetWeight: 30, targetReps: 10, weightUnit: 'kg' }] },
            { name: 'Chin-Ups', sets: [{ targetWeight: 0, targetReps: 10, weightUnit: 'bw' }, { targetWeight: 0, targetReps: 8, weightUnit: 'bw' }, { targetWeight: 0, targetReps: 8, weightUnit: 'bw' }] },
        ],
    },
};

const CHAT_MESSAGES = [
    { fromTrainer: true, text: 'Hey Sarah! Welcome aboard. I just finished setting up your program — Hypertrophy Phase 1.' },
    { fromTrainer: false, text: 'Hi Coach! Looks great. Quick question — for bench press, should I use a spotter?' },
    { fromTrainer: true, text: 'Always free barbell if possible. Ask someone at the gym to spot on heavier sets.' },
    { fromTrainer: false, text: 'Got it! Upper Power session was solid. Bench felt good at 65kg but pull-ups were tough.' },
    { fromTrainer: true, text: 'That\'s normal. Use a band for assistance if needed. Strength will come. How\'s the nutrition?' },
    { fromTrainer: false, text: 'Sticking to the meal plan mostly. Feeling good about this!' },
    { fromTrainer: true, text: 'Love the consistency. I\'ll review your first week of logs and adjust weights. Keep pushing!' },
];

// ─── Public API ─────────────────────────────────────────────────────────────

export const SeedService = {
    TEST_ACCOUNTS,

    async seedAll(onProgress?: (step: string) => void) {
        const log = (msg: string) => { onProgress?.(msg); };

        try {
            log('Creating test accounts...');
            const trainerUid = await ensureUser(TEST_ACCOUNTS.trainer.email, TEST_ACCOUNTS.trainer.password, TEST_ACCOUNTS.trainer.name);
            await signOut(auth);
            const client1Uid = await ensureUser(TEST_ACCOUNTS.client1.email, TEST_ACCOUNTS.client1.password, TEST_ACCOUNTS.client1.name);
            await signOut(auth);
            const client2Uid = await ensureUser(TEST_ACCOUNTS.client2.email, TEST_ACCOUNTS.client2.password, TEST_ACCOUNTS.client2.name);
            await signOut(auth);
            const client3Uid = await ensureUser(TEST_ACCOUNTS.client3.email, TEST_ACCOUNTS.client3.password, TEST_ACCOUNTS.client3.name);
            await signOut(auth);
            const soloUid = await ensureUser(TEST_ACCOUNTS.solo.email, TEST_ACCOUNTS.solo.password, TEST_ACCOUNTS.solo.name);
            await signOut(auth);

            // Sign in as trainer for the rest
            await signInWithEmailAndPassword(auth, TEST_ACCOUNTS.trainer.email, TEST_ACCOUNTS.trainer.password);

            log('Setting up profiles...');
            // Trainer profiles
            await setDoc(doc(db, 'trainerProfiles', trainerUid), {
                name: TEST_ACCOUNTS.trainer.name, email: TEST_ACCOUNTS.trainer.email,
                bio: 'NSCA-CSCS certified. 8+ years in hypertrophy & strength programming.',
                specialization: 'Strength & Hypertrophy', createdAt: serverTimestamp(),
            }, { merge: true });
            await setDoc(doc(db, 'clientProfiles', trainerUid), {
                id: trainerUid, email: TEST_ACCOUNTS.trainer.email, name: TEST_ACCOUNTS.trainer.name,
                displayName: TEST_ACCOUNTS.trainer.name, role: 'trainer',
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            }, { merge: true });

            // Client profiles
            const clientConfigs = [
                { uid: client1Uid, acct: TEST_ACCOUNTS.client1, age: 28, gender: 'Female', height: '165 cm', weight: '62 kg', goal: 'Build lean muscle & improve strength', experience: 'Intermediate' },
                { uid: client2Uid, acct: TEST_ACCOUNTS.client2, age: 34, gender: 'Male', height: '180 cm', weight: '88 kg', goal: 'Lose fat, maintain muscle mass', experience: 'Advanced' },
                { uid: client3Uid, acct: TEST_ACCOUNTS.client3, age: 24, gender: 'Female', height: '158 cm', weight: '54 kg', goal: 'General fitness & flexibility', experience: 'Beginner' },
            ];
            for (const c of clientConfigs) {
                await setDoc(doc(db, 'clientProfiles', c.uid), {
                    id: c.uid, email: c.acct.email, name: c.acct.name, displayName: c.acct.name,
                    role: 'client', trainerId: trainerUid,
                    age: c.age, gender: c.gender, height: c.height, weight: c.weight,
                    goal: c.goal, experience: c.experience, preferredWeightUnit: 'kg',
                    status: 'active', isClaimed: true,
                    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                }, { merge: true });
            }
            // Solo user
            await setDoc(doc(db, 'clientProfiles', soloUid), {
                id: soloUid, email: TEST_ACCOUNTS.solo.email, name: TEST_ACCOUNTS.solo.name,
                displayName: TEST_ACCOUNTS.solo.name, role: 'client',
                age: 30, gender: 'Male', height: '175 cm', weight: '78 kg',
                goal: 'Stay active and healthy', experience: 'Intermediate',
                preferredWeightUnit: 'lbs', status: 'active', isClaimed: true,
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            }, { merge: true });

            log('Writing diet & exercise plans...');
            for (const uid of [client1Uid, client2Uid, client3Uid]) {
                const exercisePlan: Record<string, { name: string; sets: number; reps: number; weight: string; notes: string }[]> = {};
                for (const [day, tmpl] of Object.entries(WORKOUT_TEMPLATES)) {
                    exercisePlan[day] = tmpl.exercises.map(e => ({
                        name: e.name, sets: e.sets.length, reps: e.sets[0].targetReps,
                        weight: e.sets[0].weightUnit === 'bw' ? 'BW' : `${e.sets[0].targetWeight}kg`,
                        notes: e.notes || '',
                    }));
                }
                await setDoc(doc(db, 'clientProfiles', uid), { dietPlan: DIET_PLANS, exercisePlan }, { merge: true });
            }

            log('Creating scheduled plans...');
            for (const uid of [client1Uid, client2Uid]) {
                for (const [day, tmpl] of Object.entries(WORKOUT_TEMPLATES)) {
                    await addDoc(collection(db, 'plans'), {
                        clientId: uid, trainerId: trainerUid, scheduledDay: day,
                        name: tmpl.name, programName: tmpl.programName,
                        exercises: tmpl.exercises.map(e => ({
                            name: e.name,
                            sets: e.sets.map(s => ({ targetWeight: s.targetWeight, targetReps: s.targetReps, weightUnit: s.weightUnit })),
                            notes: e.notes || '',
                        })),
                        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                    });
                }
            }

            log('Generating workout logs...');
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            for (const { uid, days } of [{ uid: client1Uid, days: 14 }, { uid: client2Uid, days: 10 }]) {
                for (let d = 1; d <= days; d++) {
                    const date = new Date(); date.setDate(date.getDate() - d);
                    const dayName = dayNames[date.getDay()];
                    const tmpl = WORKOUT_TEMPLATES[dayName];
                    if (!tmpl) continue;

                    const exercises = tmpl.exercises.map(e => ({
                        name: e.name,
                        sets: e.sets.map(s => {
                            const w = typeof s.targetWeight === 'number' ? s.targetWeight + randomBetween(-5, 5) : 0;
                            return { weight: Math.max(0, w), weightUnit: s.weightUnit, reps: s.targetReps + randomBetween(-2, 1), completed: Math.random() > 0.1 };
                        }),
                    }));
                    const totalVolume = exercises.reduce((sum, ex) =>
                        sum + ex.sets.reduce((s, set) => s + (set.completed ? set.weight * set.reps : 0), 0), 0);
                    const completedAt = daysAgo(d);

                    await addDoc(collection(db, 'workoutLogs'), {
                        clientId: uid, trainerId: trainerUid, title: tmpl.name, workoutName: tmpl.name,
                        exercises, duration: randomBetween(45, 75), totalVolume: Math.round(totalVolume),
                        status: 'completed', intensity: randomBetween(6, 9),
                        mood: ['energized', 'good', 'tired', 'okay'][randomBetween(0, 3)],
                        reviewed: d > 3, trainerFeedback: d > 3 ? 'Good work — volume is on track.' : '',
                        createdAt: completedAt, completedAt,
                    });
                }
            }

            log('Creating chat conversations...');
            const chatRef = await addDoc(collection(db, 'chats'), {
                participants: [trainerUid, client1Uid],
                participantNames: { [trainerUid]: TEST_ACCOUNTS.trainer.name, [client1Uid]: TEST_ACCOUNTS.client1.name },
                lastMessage: CHAT_MESSAGES[CHAT_MESSAGES.length - 1].text,
                lastMessageSenderId: CHAT_MESSAGES[CHAT_MESSAGES.length - 1].fromTrainer ? trainerUid : client1Uid,
                lastMessageTimestamp: serverTimestamp(),
                unreadCount: { [trainerUid]: 0, [client1Uid]: 1 },
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            });
            for (let i = 0; i < CHAT_MESSAGES.length; i++) {
                const msg = CHAT_MESSAGES[i];
                const senderId = msg.fromTrainer ? trainerUid : client1Uid;
                const senderName = msg.fromTrainer ? TEST_ACCOUNTS.trainer.name : TEST_ACCOUNTS.client1.name;
                await addDoc(collection(chatRef, 'messages'), {
                    text: msg.text, senderId, senderName, createdAt: daysAgo(CHAT_MESSAGES.length - i), readBy: [senderId],
                });
            }

            log('Done!');
            Alert.alert('Seed Complete', 'Test data created. Sign out and log in as any test account to explore.');
        } catch (error: any) {
            console.error('Seed error:', error);
            Alert.alert('Seed Error', error.message);
        }
    },

    /** Seeds just the diet + exercise plan onto the current user's profile */
    async seedClientPlan(userId: string) {
        if (!userId) { Alert.alert('Error', 'No userId provided.'); return; }

        const exercisePlan: Record<string, { name: string; sets: number; reps: number; weight: string; notes: string }[]> = {};
        for (const [day, tmpl] of Object.entries(WORKOUT_TEMPLATES)) {
            exercisePlan[day] = tmpl.exercises.map(e => ({
                name: e.name, sets: e.sets.length, reps: e.sets[0].targetReps,
                weight: e.sets[0].weightUnit === 'bw' ? 'BW' : `${e.sets[0].targetWeight}kg`,
                notes: e.notes || '',
            }));
        }

        try {
            await setDoc(doc(db, 'clientProfiles', userId), { dietPlan: DIET_PLANS, exercisePlan }, { merge: true });
            Alert.alert('Done', 'Diet & exercise plan seeded. Pull to refresh your dashboard.');
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    },
};

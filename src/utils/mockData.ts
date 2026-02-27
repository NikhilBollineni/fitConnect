import { db } from '../lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

export const seedMockData = async () => {
    const clientId = 'client_1';
    const logsCollection = collection(db, 'workoutLogs');

    // Dates: Generate for past 3 months
    const today = new Date();
    const workouts = [];

    // Exercises
    const exercises = [
        { name: 'Barbell Bench Press', muscle: 'Chest', baseWeight: 60, increment: 2.5 },
        { name: 'Squat', muscle: 'Legs', baseWeight: 80, increment: 5 },
        { name: 'Deadlift', muscle: 'Back', baseWeight: 100, increment: 5 },
        { name: 'Pull Up', muscle: 'Back', baseWeight: 0, increment: 0 }, // Bodyweight
        { name: 'Dumbbell Shoulder Press', muscle: 'Shoulders', baseWeight: 15, increment: 2 },
        { name: 'Bicep Curl', muscle: 'Arms', baseWeight: 10, increment: 1 },
        { name: 'Tricep Pushdown', muscle: 'Arms', baseWeight: 20, increment: 2.5 },
    ];

    // Create 30 workouts over 90 days (approx every 3 days)
    for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - (30 - i) * 3); // Spread out over 90 days

        // Randomize exercises for this session (3-5 exercises)
        const sessionExercises = [];
        const numExercises = Math.floor(Math.random() * 3) + 3;

        // Shuffle and pick
        const shuffled = [...exercises].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, numExercises);

        for (const ex of selected) {
            // Progressive overload simulation
            // Weight increases slightly over time (i is index)
            // Add some noise (+/-)
            const noise = (Math.random() - 0.5) * 5;
            let weight = ex.baseWeight + (i * ex.increment * 0.5) + noise;
            weight = Math.round(weight * 2) / 2; // Round to nearest 0.5
            if (weight < 0) weight = 0;

            sessionExercises.push({
                name: ex.name,
                sets: [
                    { weight: weight, reps: 10 },
                    { weight: weight, reps: 8 },
                    { weight: weight * 0.9, reps: 12 } // Drop set
                ]
            });
        }

        workouts.push({
            clientId,
            name: `Workout ${i + 1}`,
            createdAt: Timestamp.fromDate(date),
            completedAt: Timestamp.fromDate(date),
            exercises: sessionExercises,
            duration: 45 + Math.floor(Math.random() * 30) // 45-75 mins
        });
    }

    console.log(`Seeding ${workouts.length} workouts...`);

    // Batch write or loop
    // Firestore batch limit is 500, we have 30.
    const promises = workouts.map(w => addDoc(logsCollection, w));
    await Promise.all(promises);

    console.log('Seeding complete!');
    return workouts.length;
};

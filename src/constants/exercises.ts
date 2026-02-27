import { Dumbbell, ArrowDown, Footprints, Flame } from 'lucide-react-native';

export const SUB_CATEGORIES: Record<string, { id: string; label: string; exercises: string[] }[]> = {
    PUSH: [
        { id: 'CHEST', label: 'Chest', exercises: ['Bench Press', 'Incline Dumbbell Press', 'Push Up', 'Cable Flys', 'Dumbbell Pullover', 'Dips (Chest)'] },
        { id: 'SHOULDERS', label: 'Shoulders', exercises: ['Overhead Press', 'Lateral Raise', 'Face Pulls', 'Front Raise', 'Rear Delt Fly'] },
        { id: 'TRICEPS', label: 'Triceps', exercises: ['Tricep Dips', 'Skullcrushers', 'Triceps Pushdown', 'Overhead Extension', 'Close Grip Bench'] }
    ],
    PULL: [
        { id: 'BACK', label: 'Back', exercises: ['Pull Up', 'Deadlift', 'Barbell Row', 'Lat Pulldown', 'Seated Cable Row', 'T-Bar Row'] },
        { id: 'BICEPS', label: 'Biceps', exercises: ['Bicep Curl', 'Hammer Curl', 'Preacher Curl', 'Concentration Curl', 'Chin Up'] },
        { id: 'TRAPS', label: 'Traps', exercises: ['Shrugs', 'Upright Row'] }
    ],
    LEGS: [
        { id: 'QUADS', label: 'Quads', exercises: ['Barbell Squat', 'Leg Press', 'Lunges', 'Step Ups', 'Goblet Squat', 'Leg Extension'] },
        { id: 'HAMSTRINGS', label: 'Hamstrings', exercises: ['Romanian Deadlift', 'Lying Leg Curl', 'Seated Leg Curl', 'Good Mornings'] },
        { id: 'GLUTES', label: 'Glutes', exercises: ['Hip Thrust', 'Glute Bridge', 'Cable Kickbacks'] },
        { id: 'CALVES', label: 'Calves', exercises: ['Standing Calf Raise', 'Seated Calf Raise'] }
    ],
    CORE: [
        { id: 'ABS', label: 'Abs', exercises: ['Crunches', 'Leg Raise', 'Plank', 'Ab Wheel', 'Russian Twist', 'Cable Woodchoppers'] },
        { id: 'CARDIO', label: 'Cardio', exercises: ['Treadmill', 'Elliptical', 'Cycling', 'Rowing', 'Jump Rope', 'Stairmaster'] }
    ]
};

export const CATEGORIES = [
    { id: 'PUSH', label: 'Push', sub: 'Chest, Shoulders, Tris', icon: Dumbbell, color: '#f87171' },
    { id: 'PULL', label: 'Pull', sub: 'Back, Biceps', icon: ArrowDown, color: '#60a5fa' },
    { id: 'LEGS', label: 'Legs', sub: 'Quads, Hams, Glutes', icon: Footprints, color: '#4ade80' },
    { id: 'CORE', label: 'Core', sub: 'Abs, Cardio', icon: Flame, color: '#facc15' },
];

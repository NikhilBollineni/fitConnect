import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
    Welcome: undefined;
    Login: undefined;
    SignUp: undefined;
    RoleSelect: undefined;

    // Trainer Flow
    TrainerHome: undefined;
    AddClient: undefined;
    ClientDetail: { client: { id: string; name?: string; displayName?: string; [key: string]: any }; initialTab?: string; selectedDay?: string };
    WorkoutView: {
        workoutData?: { id: string; name?: string; exercises?: any[]; [key: string]: any };
        workoutId?: string;
        mode?: 'log' | 'review' | 'view';
        clientId?: string;
    };
    ClientProfile: undefined;
    TrainerProfile: undefined;
    TrainerReviews: undefined;

    // Shared / Member Flow
    MemberTabs: undefined;
    MemberSetup: undefined;
    ChatList: undefined;
    Chat: { chatId?: string; clientName?: string; clientId?: string };
    WorkoutSummary: { summary: { workoutName?: string; duration?: string; exercises?: any[]; totalVolume?: number; [key: string]: any } };
    Program: undefined;
    AIGenerator: undefined;
    EditPlan: { clientId: string; clientName: string; selectedDay?: string; isSolo?: boolean };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

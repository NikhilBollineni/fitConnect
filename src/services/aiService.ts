const API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

async function callOpenAI(messages: AIMessage[], options: { maxTokens?: number, jsonMode?: boolean } = {}): Promise<string | null> {
    if (!API_KEY || API_KEY.includes('your-key')) {
        console.warn("OpenAI API Key is missing or invalid.");
        return null;
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: messages,
                temperature: 0.7,
                max_tokens: options.maxTokens || 250, // Bump default
                response_format: options.jsonMode ? { type: "json_object" } : { type: "text" }
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("OpenAI Error:", data);
            return null;
        }

        return data.choices[0]?.message?.content || null;
    } catch (error) {
        console.error("AI Service Error:", error);
        return null;
    }
}

export const aiService = {
    /**
     * Generates a quick pre-set tip based on context
     */
    async getCoachingTip(exerciseName: string, lastWeight: number, lastReps: number, unit: string = 'lbs'): Promise<string> {
        const prompt = `
        You are an elite gym coach. The user is about to do ${exerciseName}.
        Last time they did ${lastWeight}${unit} for ${lastReps} reps.
        Give a ONE-SENTENCE specific tip to motivate them or simple technical cue. 
        Keep it under 15 words. energetic but professional.
        `;

        const result = await callOpenAI([{ role: 'user', content: prompt }]);
        return result || "Crush this set! Focus on form.";
    },

    /**
     * Generates encouragement when user tries to quit early
     */
    async getEarlyExitNudge(completedPercent: number, remainingExercises: string[]): Promise<string> {
        const prompt = `
        The user is trying to quit their workout early.
        They have completed ${Math.round(completedPercent)}% of it.
        Remaining exercises: ${remainingExercises.join(', ')}.
        
        Give a short, persuasive reason to finish. 
        Tone: Empathetic but pushing. Max 2 sentences.
        `;

        const result = await callOpenAI([{ role: 'user', content: prompt }]);
        return result || "You're so close! Don't leave gains on the table.";
    },



    /**
     * Suggests 3 exercises based on recent history
     */
    async getExerciseSuggestions(recentHistory: string[]): Promise<string[]> {
        const prompt = `
        User's recent exercises: ${recentHistory.join(', ')}.
        Suggest 3 exercises they should do next. 
        Return ONLY a comma-separated list of 3 names. No numbering.
        Example: "Incline Press, Tricep Dips, Pec Fly"
        `;

        const result = await callOpenAI([{ role: 'user', content: prompt }]);
        if (!result) return [];
        return result.split(',').map(s => s.trim()).slice(0, 3);
    },

    /**
     * Generates a full workout routine
     */
    async generateWorkout(muscle: string, duration: string, equipment: string): Promise<any[]> {
        const prompt = `
        Create a ${duration} workout for ${muscle} using ${equipment}.
        Return a JSON object with a "workout" key containing an array of exercises.
        Each exercise must have: "name", "sets" (as number), "reps" (as string), "notes" (as string).
        Format:
        {
          "workout": [
            { "name": "Bench Press", "sets": 3, "reps": "8-12", "notes": "Control the descent" }
          ]
        }
        Max 6 exercises.
        `;

        const result = await callOpenAI([{ role: 'user', content: prompt }], { maxTokens: 800, jsonMode: true });

        if (!result) {
            console.error("AI Workout Generation failed: No result from OpenAI");
            return [];
        }

        try {
            console.log("Raw AI Response:", result);
            const parsed = JSON.parse(result);
            return parsed.workout || [];
        } catch (e) {
            console.error("AI Workout Parse Error. Raw Result:", result);
            console.error("Error Detail:", e);
            return [];
        }
    },

    async getPostWorkoutHype(stats: { exercises: number, sets: number, volume: number }, unit: string = 'lbs'): Promise<string> {
        const prompt = `
        User just finished a workout!
        Stats: ${stats.exercises} exercises, ${stats.sets} sets, ${stats.volume}${unit} total volume.
        
        Write a SHORT, HYPE, ONE-SENTENCE celebration. Use emojis.
        Example: "Crushed it! 💪 ${stats.volume}${unit} moved is no joke!"
        `;

        const result = await callOpenAI([{ role: 'user', content: prompt }]);
        return result || "Amazing workout! Legend status achievable. 🏆";
    }
};

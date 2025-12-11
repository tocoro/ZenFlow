import { GoogleGenAI, Type } from "@google/genai";
import { BreakdownResponse } from "../types";
import { Language } from "../translations";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const breakDownTask = async (taskLabel: string, currentContext: string[], lang: Language = 'ja'): Promise<BreakdownResponse> => {
  if (!apiKey) {
    console.warn("No API Key found");
    return { subtasks: [], dependencies: [] };
  }

  const model = "gemini-2.5-flash";
  
  const prompt = `
    The user has a task: "${taskLabel}".
    Context of other tasks: ${currentContext.join(', ')}.
    
    Please break this task down into 2 to 4 smaller, actionable sub-tasks.
    The goal is to gamify the process, making big scary tasks look like small easy nodes.
    Keep labels short (max 5 words).

    CRITICAL: Determine the logical order of these subtasks.
    If subtask A must happen before subtask B, create a dependency.
    Return dependencies as indices in the subtasks array (0-based).
    
    IMPORTANT: The output JSON must be in ${lang === 'ja' ? 'Japanese (日本語)' : 'English'}.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subtasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["label", "description"],
              },
            },
            dependencies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  fromIndex: { type: Type.INTEGER },
                  toIndex: { type: Type.INTEGER },
                },
                required: ["fromIndex", "toIndex"],
              }
            }
          },
        },
      },
    });

    const text = response.text;
    if (!text) return { subtasks: [], dependencies: [] };
    
    return JSON.parse(text) as BreakdownResponse;
  } catch (error) {
    console.error("Gemini breakdown error:", error);
    return { subtasks: [], dependencies: [] };
  }
};

import { GoogleGenAI, Type } from "@google/genai";
import { BreakdownResponse } from "../types";
import { Language } from "../translations";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const breakDownTask = async (
  taskLabel: string, 
  currentContext: string[], 
  lang: Language = 'ja',
  mode: 'vertical' | 'horizontal' = 'vertical'
): Promise<BreakdownResponse> => {
  if (!apiKey) {
    console.warn("No API Key found");
    return { subtasks: [], dependencies: [] };
  }

  const model = "gemini-2.5-flash";
  
  let promptInstructions = "";

  if (mode === 'vertical') {
    promptInstructions = `
      Please break this task down into 2 to 4 smaller, actionable SUB-TASKS.
      The goal is to drill down into details.
      If subtask A must happen before subtask B, create a dependency.
    `;
  } else {
    promptInstructions = `
      The user has a task: "${taskLabel}".
      Please generate 2 to 3 logical NEXT STEPS or RELATED TASKS that should happen sequentially AFTER this task, at the SAME abstraction level.
      Do NOT break it down into smaller parts. Think "What comes next in the workflow?".
      Example: If task is "Draft Email", next steps might be "Review Email", "Send Email".
      Ensure they are sequentially dependent (0->1->2).
    `;
  }
  
  const prompt = `
    Task: "${taskLabel}".
    Context of siblings/related tasks: ${currentContext.join(', ')}.
    
    ${promptInstructions}

    Keep labels short (max 5 words).
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
